/**
 * Channeling Handler
 *
 * Handles: START_CHANNELING, CONTINUE_CHANNELING, RELEASE_SPELL, ABORT_CHANNELING
 */

import type { CombatDurableObject, WebSocketMetadata, ClientMessageType } from "../CombatDurableObject";
import { canControlEntity } from "./permissions";

// Wrapper to call SQL storage methods
function runQuery(sql: SqlStorage, query: string, ...params: unknown[]) {
  return sql["exec"](query, ...params);
}

// Helper for optional single-row queries (since .one() throws on empty)
function queryOneOrNull<T>(sql: SqlStorage, query: string, ...params: unknown[]): T | null {
  const rows = sql["exec"](query, ...params).toArray();
  return rows.length > 0 ? (rows[0] as T) : null;
}

export async function handleChanneling(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  type: ClientMessageType,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const timestamp = new Date().toISOString();

  switch (type) {
    case "START_CHANNELING":
      await handleStartChanneling(combat, ws, session, payload, requestId);
      break;

    case "CONTINUE_CHANNELING":
      await handleContinueChanneling(combat, ws, session, payload, requestId);
      break;

    case "RELEASE_SPELL":
      await handleReleaseSpell(combat, ws, session, payload, requestId);
      break;

    case "ABORT_CHANNELING":
      await handleAbortChanneling(combat, ws, session, payload, requestId);
      break;

    default:
      combat.sendToSocket(ws, {
        type: "ACTION_REJECTED",
        payload: { reason: "Unknown channeling action" },
        timestamp,
        requestId,
      });
  }
}

async function handleStartChanneling(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  const entityId = payload.entityId as string;
  const spellName = payload.spellName as string;
  const totalCost = payload.totalCost as number;
  const damageType = payload.damageType as string || "mental";
  const intensity = payload.intensity as number || 1;
  const initialEnergy = payload.initialEnergy as number || 0;
  const initialAP = payload.initialAP as number || 0;

  // Check if already channeling
  const existing = queryOneOrNull<{ entity_id: string }>(sql, "SELECT entity_id FROM channeling WHERE entity_id = ?", entityId);

  if (existing) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Already channeling a spell" },
      timestamp,
      requestId,
    });
    return;
  }

  // Get entity and verify resources
  const entityRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", entityId);

  if (!entityRow) return;

  const entity = JSON.parse(entityRow.data);

  if (!canControlEntity(session, entityId, entity)) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "You do not control this entity" },
      timestamp,
      requestId,
    });
    return;
  }

  if ((entity.energy?.current ?? 0) < initialEnergy) {
    combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Insufficient energy" }, timestamp, requestId });
    return;
  }

  if ((entity.ap?.current ?? 0) < initialAP) {
    combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Insufficient AP" }, timestamp, requestId });
    return;
  }

  // Spend resources
  entity.energy.current -= initialEnergy;
  entity.ap.current -= initialAP;
  runQuery(sql, "UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(entity), entityId);

  // Create channeling state
  const spellData = {
    spellName,
    totalCost,
    damageType,
    intensity,
    energyChanneled: initialEnergy,
    apChanneled: initialAP,
    turnsChanneled: 1,
  };

  runQuery(sql,
    "INSERT INTO channeling (entity_id, spell_data, started_at) VALUES (?, ?, ?)",
    entityId, JSON.stringify(spellData), timestamp
  );

  combat.incrementVersion();
  combat.addLogEntry("channeling_started", { entityId, spellName, initialEnergy, initialAP });

  combat.broadcast({
    type: "CHANNELING_STARTED",
    payload: {
      entityId,
      spellName,
      totalCost,
      energyChanneled: initialEnergy,
      apChanneled: initialAP,
      progress: Math.min(initialEnergy, initialAP) / totalCost,
    },
    timestamp,
    requestId,
  });
}

async function handleContinueChanneling(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  const entityId = payload.entityId as string;
  const additionalEnergy = payload.additionalEnergy as number || 0;
  const additionalAP = payload.additionalAP as number || 0;

  // Get channeling state
  const channelingRow = queryOneOrNull<{ spell_data: string }>(sql, "SELECT spell_data FROM channeling WHERE entity_id = ?", entityId);

  if (!channelingRow) {
    combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Not channeling" }, timestamp, requestId });
    return;
  }

  // Get entity and verify resources
  const entityRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", entityId);

  if (!entityRow) return;

  const entity = JSON.parse(entityRow.data);

  if (!canControlEntity(session, entityId, entity)) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "You do not control this entity" },
      timestamp,
      requestId,
    });
    return;
  }

  if ((entity.energy?.current ?? 0) < additionalEnergy || (entity.ap?.current ?? 0) < additionalAP) {
    combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Insufficient resources" }, timestamp, requestId });
    return;
  }

  // Spend resources
  entity.energy.current -= additionalEnergy;
  entity.ap.current -= additionalAP;
  runQuery(sql, "UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(entity), entityId);

  // Update channeling state
  const spellData = JSON.parse(channelingRow.spell_data);
  spellData.energyChanneled += additionalEnergy;
  spellData.apChanneled += additionalAP;
  spellData.turnsChanneled += 1;

  runQuery(sql, "UPDATE channeling SET spell_data = ? WHERE entity_id = ?", JSON.stringify(spellData), entityId);

  combat.incrementVersion();

  const progress = Math.min(spellData.energyChanneled, spellData.apChanneled) / spellData.totalCost;
  const isReady = spellData.energyChanneled >= spellData.totalCost && spellData.apChanneled >= spellData.totalCost;

  combat.broadcast({
    type: "CHANNELING_CONTINUED",
    payload: {
      entityId,
      spellName: spellData.spellName,
      energyChanneled: spellData.energyChanneled,
      apChanneled: spellData.apChanneled,
      turnsChanneled: spellData.turnsChanneled,
      progress,
      isReady,
    },
    timestamp,
    requestId,
  });
}

async function handleReleaseSpell(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  const entityId = payload.entityId as string;
  const targetId = payload.targetId as string;

  // Get channeling state
  const channelingRow = queryOneOrNull<{ spell_data: string }>(sql, "SELECT spell_data FROM channeling WHERE entity_id = ?", entityId);

  if (!channelingRow) {
    combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Not channeling" }, timestamp, requestId });
    return;
  }

  const spellData = JSON.parse(channelingRow.spell_data);

  const entityRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", entityId);
  if (!entityRow) return;
  const entity = JSON.parse(entityRow.data);

  if (!canControlEntity(session, entityId, entity)) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "You do not control this entity" },
      timestamp,
      requestId,
    });
    return;
  }

  // Check if fully charged
  if (spellData.energyChanneled < spellData.totalCost || spellData.apChanneled < spellData.totalCost) {
    combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Spell not fully charged" }, timestamp, requestId });
    return;
  }

  // Calculate spell damage (energy channeled * intensity)
  const spellDamage = spellData.energyChanneled * spellData.intensity;

  // Apply damage to target if provided
  if (targetId) {
    const targetRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", targetId);

    if (targetRow) {
      const target = JSON.parse(targetRow.data);

      // Apply damage modifiers
      let finalDamage = spellDamage;
      const damageType = spellData.damageType;
      const immunities = target.immunities || [];
      const resistances = target.resistances || [];
      const weaknesses = target.weaknesses || [];

      if (immunities.includes(damageType)) {
        finalDamage = 0;
      } else if (resistances.includes(damageType)) {
        finalDamage = Math.floor(finalDamage / 2);
      } else if (weaknesses.includes(damageType)) {
        finalDamage = finalDamage * 2;
      }

      target.energy = target.energy || { current: 100, max: 100 };
      target.energy.current = Math.max(0, target.energy.current - finalDamage);

      if (finalDamage > 0) {
        target.wounds = target.wounds || {};
        const woundCount = Math.ceil(finalDamage / 20);
        target.wounds[damageType] = (target.wounds[damageType] || 0) + woundCount;
      }

      runQuery(sql, "UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(target), targetId);
    }
  }

  // Clear channeling state
  runQuery(sql, "DELETE FROM channeling WHERE entity_id = ?", entityId);
  combat.incrementVersion();

  combat.addLogEntry("spell_released", { entityId, spellName: spellData.spellName, damage: spellDamage, targetId });

  combat.broadcast({
    type: "CHANNELING_RELEASED",
    payload: {
      entityId,
      targetId,
      spellName: spellData.spellName,
      spellDamage,
      damageType: spellData.damageType,
      intensity: spellData.intensity,
      turnsChanneled: spellData.turnsChanneled,
    },
    timestamp,
    requestId,
  });
}

async function handleAbortChanneling(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  const entityId = payload.entityId as string;

  // Get channeling state
  const channelingRow = queryOneOrNull<{ spell_data: string }>(sql, "SELECT spell_data FROM channeling WHERE entity_id = ?", entityId);

  if (!channelingRow) {
    combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Not channeling" }, timestamp, requestId });
    return;
  }

  const spellData = JSON.parse(channelingRow.spell_data);

  const entityRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", entityId);
  if (!entityRow) return;
  const entity = JSON.parse(entityRow.data);

  if (!canControlEntity(session, entityId, entity)) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "You do not control this entity" },
      timestamp,
      requestId,
    });
    return;
  }

  // Clear channeling state (no blowback on voluntary abort)
  runQuery(sql, "DELETE FROM channeling WHERE entity_id = ?", entityId);
  combat.incrementVersion();

  combat.addLogEntry("channeling_aborted", {
    entityId,
    spellName: spellData.spellName,
    energyLost: spellData.energyChanneled,
    apLost: spellData.apChanneled,
  });

  combat.broadcast({
    type: "CHANNELING_INTERRUPTED",
    payload: {
      entityId,
      spellName: spellData.spellName,
      voluntary: true,
      energyLost: spellData.energyChanneled,
      apLost: spellData.apChanneled,
    },
    timestamp,
    requestId,
  });
}
