/**
 * Combat Lifecycle Handler
 *
 * Handles: START_COMBAT, END_COMBAT, GM overrides
 */

import type { CombatDurableObject, WebSocketMetadata, ClientMessageType } from "../CombatDurableObject";

// Helper for optional single-row queries (since .one() throws on empty)
function queryOneOrNull<T>(sql: SqlStorage, query: string, ...params: unknown[]): T | null {
  const rows = sql["exec"](query, ...params).toArray();
  return rows.length > 0 ? (rows[0] as T) : null;
}

export async function handleCombatLifecycle(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  type: ClientMessageType,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const timestamp = new Date().toISOString();

  switch (type) {
    case "START_COMBAT":
      await handleStartCombat(combat, ws, session, payload, requestId);
      break;

    case "END_COMBAT":
      await handleEndCombat(combat, ws, session, payload, requestId);
      break;

    case "GM_ADD_ENTITY":
    case "GM_REMOVE_ENTITY":
    case "GM_APPLY_DAMAGE":
    case "GM_MODIFY_RESOURCES":
    case "GM_OVERRIDE":
      await handleGMAction(combat, ws, session, type, payload, requestId);
      break;

    default:
      combat.sendToSocket(ws, {
        type: "ACTION_REJECTED",
        payload: { reason: "Unknown lifecycle action" },
        timestamp,
        requestId,
      });
  }
}

async function handleStartCombat(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  if (!session.isGM) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Only GM can start combat" },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const sql = combat.getSql();
  const timestamp = new Date().toISOString();
  const combatId = (payload.combatId as string) || crypto.randomUUID();
  const campaignId = (payload.campaignId as string) || "";
  const entities = (payload.entities as Array<Record<string, unknown>>) || [];

  // Clear existing state
  sql.exec("DELETE FROM combat_state");
  sql.exec("DELETE FROM entities");
  sql.exec("DELETE FROM initiative");
  sql.exec("DELETE FROM hex_positions");
  sql.exec("DELETE FROM channeling");
  sql.exec("DELETE FROM combat_log");
  sql.exec("DELETE FROM pending_actions");

  // Create new combat
  sql.exec(
    `INSERT INTO combat_state (id, combat_id, campaign_id, phase, round, turn_index, version, started_at, last_updated_at)
     VALUES ('current', ?, ?, 'setup', 0, 0, 1, ?, ?)`,
    combatId, campaignId, timestamp, timestamp
  );

  // Add entities
  for (const entity of entities) {
    sql.exec(
      "INSERT INTO entities (id, data, created_at) VALUES (?, ?, ?)",
      entity.id as string,
      JSON.stringify(entity),
      timestamp
    );
  }

  combat.addLogEntry("combat_started", { combatId, entityCount: entities.length });

  combat.broadcast({
    type: "COMBAT_STARTED",
    payload: { combatId, campaignId, entities, phase: "setup" },
    timestamp,
    requestId,
  });
}

async function handleEndCombat(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  if (!session.isGM) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Only GM can end combat" },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const sql = combat.getSql();
  const timestamp = new Date().toISOString();
  const state = combat.getCombatState();

  if (!state) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "No active combat" },
      timestamp,
      requestId,
    });
    return;
  }

  // Get final entity states
  const entities = sql.exec("SELECT * FROM entities").toArray();
  const finalEntities = entities.map((e: any) => ({
    id: e.id,
    ...JSON.parse(e.data),
  }));

  // Sync to Supabase
  for (const entity of finalEntities) {
    if (entity.characterId) {
      await combat.syncToSupabase("characters", {
        id: entity.characterId,
        wounds: entity.wounds,
        energy_current: entity.energy?.current,
      });
    }
  }

  combat.addLogEntry("combat_ended", { combatId: state.combat_id, finalRound: state.round });

  // Clear state
  sql.exec("DELETE FROM combat_state");
  sql.exec("DELETE FROM entities");
  sql.exec("DELETE FROM initiative");

  combat.broadcast({
    type: "COMBAT_ENDED",
    payload: { combatId: state.combat_id, finalRound: state.round, entities: finalEntities },
    timestamp,
    requestId,
  });
}

async function handleGMAction(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  type: ClientMessageType,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  if (type === "GM_ADD_ENTITY") {
    const entity = payload.entity as Record<string, unknown>;
    if (!entity?.id) {
      combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Invalid entity" }, timestamp, requestId });
      return;
    }
    sql.exec("INSERT OR REPLACE INTO entities (id, data, created_at) VALUES (?, ?, ?)",
      entity.id as string, JSON.stringify(entity), timestamp);
    combat.incrementVersion();
    combat.broadcast({ type: "ENTITY_UPDATED", payload: { action: "added", entity }, timestamp, requestId });
  }

  if (type === "GM_REMOVE_ENTITY") {
    const entityId = payload.entityId as string;
    sql.exec("DELETE FROM entities WHERE id = ?", entityId);
    sql.exec("DELETE FROM initiative WHERE entity_id = ?", entityId);
    combat.incrementVersion();
    combat.broadcast({ type: "ENTITY_UPDATED", payload: { action: "removed", entityId }, timestamp, requestId });
  }

  if (type === "GM_APPLY_DAMAGE") {
    const entityId = payload.entityId as string;
    const amount = payload.amount as number;
    const damageType = payload.damageType as string;

    const row = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", entityId);
    if (!row) return;

    const entity = JSON.parse(row.data);
    entity.energy = entity.energy || { current: 100, max: 100 };
    entity.energy.current = Math.max(0, entity.energy.current - amount);

    if (damageType) {
      entity.wounds = entity.wounds || {};
      entity.wounds[damageType] = (entity.wounds[damageType] || 0) + Math.ceil(amount / 20);
    }

    sql.exec("UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(entity), entityId);
    combat.incrementVersion();
    combat.broadcast({ type: "DAMAGE_APPLIED", payload: { entityId, amount, newEnergy: entity.energy.current }, timestamp, requestId });
  }

  if (type === "GM_MODIFY_RESOURCES") {
    const entityId = payload.entityId as string;
    const changes = payload.changes as Record<string, number>;

    const row = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", entityId);
    if (!row) return;

    const entity = JSON.parse(row.data);
    if (changes.energy !== undefined) entity.energy = { ...entity.energy, current: changes.energy };
    if (changes.ap !== undefined) entity.ap = { ...entity.ap, current: changes.ap };

    sql.exec("UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(entity), entityId);
    combat.incrementVersion();
    combat.broadcast({ type: "ENTITY_UPDATED", payload: { entityId, energy: entity.energy, ap: entity.ap }, timestamp, requestId });
  }

  if (type === "GM_OVERRIDE") {
    const overrideType = payload.overrideType as string;
    if (overrideType === "set_phase") {
      sql.exec("UPDATE combat_state SET phase = ?, last_updated_at = ? WHERE id = 'current'", payload.phase, timestamp);
      combat.incrementVersion();
      combat.broadcast({ type: "GM_OVERRIDE_APPLIED", payload: { overrideType, phase: payload.phase }, timestamp, requestId });
    }
  }
}
