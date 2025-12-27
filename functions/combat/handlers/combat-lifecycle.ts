/**
 * Combat Lifecycle Handler
 *
 * Handles: START_COMBAT, END_COMBAT, GM overrides
 */

import type { CombatDurableObject, WebSocketMetadata, ClientMessageType } from "../CombatDurableObject";
import { sortAndStartCombat } from "./turn-management";

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
  const payloadEntities = Array.isArray(payload.entities)
    ? (payload.entities as Array<Record<string, unknown>>)
    : [];
  const existingState = combat.getCombatState();

  if (!existingState && payloadEntities.length === 0) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Add at least one entity before starting combat" },
      timestamp,
      requestId,
    });
    return;
  }

  const combatId = (payload.combatId as string) || (existingState?.combat_id as string) || crypto.randomUUID();
  const campaignId = (payload.campaignId as string) || (existingState?.campaign_id as string) || "";

  if (payloadEntities.length > 0 || !existingState) {
    // Clear existing state for a fresh start
    sql.exec("DELETE FROM combat_state");
    sql.exec("DELETE FROM entities");
    sql.exec("DELETE FROM initiative");
    sql.exec("DELETE FROM hex_positions");
    sql.exec("DELETE FROM channeling");
    sql.exec("DELETE FROM combat_log");
    sql.exec("DELETE FROM pending_actions");

    sql.exec(
      `INSERT INTO combat_state (id, combat_id, campaign_id, phase, round, turn_index, version, started_at, last_updated_at)
       VALUES ('current', ?, ?, 'initiative', 0, 0, 1, ?, ?)`,
      combatId, campaignId, timestamp, timestamp
    );

    for (const entity of payloadEntities) {
      sql.exec(
        "INSERT INTO entities (id, data, created_at) VALUES (?, ?, ?)",
        entity.id as string,
        JSON.stringify(entity),
        timestamp
      );
    }
  } else {
    sql.exec(
      "UPDATE combat_state SET phase = 'initiative', last_updated_at = ? WHERE id = 'current'",
      timestamp
    );
  }

  const entityCount = queryOneOrNull<{ count: number }>(sql, "SELECT COUNT(*) as count FROM entities")?.count ?? 0;
  const initiativeCount = queryOneOrNull<{ count: number }>(sql, "SELECT COUNT(*) as count FROM initiative")?.count ?? 0;

  if (entityCount === 0) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Add at least one entity before starting combat" },
      timestamp,
      requestId,
    });
    return;
  }

  combat.addLogEntry("combat_started", { combatId, entityCount });

  combat.broadcast({
    type: "COMBAT_STARTED",
    payload: { combatId, campaignId, entities: payloadEntities, phase: "initiative" },
    timestamp,
    requestId,
  });

  if (initiativeCount === entityCount && entityCount > 0) {
    sortAndStartCombat(combat);
  } else {
    combat.incrementVersion();
  }

  combat.broadcastStateSync();
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
    const initiativeRoll = (payload.initiativeRoll as number) ?? (entity.initiativeRoll as number) ?? 10;
    const initiativeTiebreaker = (payload.initiativeTiebreaker as number) ?? (entity.initiativeTiebreaker as number) ?? 0;
    const initiativeTiming = (payload.initiativeTiming as string) ?? "end";
    if (!entity?.id) {
      combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Invalid entity" }, timestamp, requestId });
      return;
    }

    const existingState = combat.getCombatState() as Record<string, unknown> | null;
    if (!existingState) {
      const combatId = (payload.combatId as string) || (payload.campaignId as string) || crypto.randomUUID();
      const campaignId = (payload.campaignId as string) || "";
      sql.exec(
        `INSERT INTO combat_state (id, combat_id, campaign_id, phase, round, turn_index, version, started_at, last_updated_at)
         VALUES ('current', ?, ?, 'setup', 0, 0, 1, ?, ?)`,
        combatId, campaignId, timestamp, timestamp
      );
    }

    const state = combat.getCombatState() as Record<string, unknown> | null;
    const campaignId = (state?.campaign_id as string) || (payload.campaignId as string) || "";

    if (!entity.controller && entity.characterId && campaignId) {
      const members = await combat.fetchFromSupabase(
        "campaign_members",
        `campaign_id=eq.${encodeURIComponent(campaignId)}&character_id=eq.${encodeURIComponent(entity.characterId as string)}&select=player_user_id`
      );
      const playerUserId = (members?.[0] as { player_user_id?: string } | undefined)?.player_user_id;
      if (playerUserId) {
        entity.controller = `player:${playerUserId}`;
      }
    }

    if (!entity.controller) {
      entity.controller = "gm";
    }

    sql.exec("INSERT OR REPLACE INTO entities (id, data, created_at) VALUES (?, ?, ?)",
      entity.id as string, JSON.stringify(entity), timestamp);

    const phase = (state?.phase as string) ?? "setup";
    const turnIndex = (state?.turn_index as number) ?? -1;

    const maxRow = queryOneOrNull<{ max_position: number }>(sql, "SELECT COALESCE(MAX(position), -1) as max_position FROM initiative");
    const maxPosition = maxRow?.max_position ?? -1;

    let insertPosition = maxPosition + 1;
    if ((phase === "active" || phase === "active-turn") && initiativeTiming === "immediate") {
      insertPosition = Math.min(Math.max(turnIndex + 1, 0), maxPosition + 1);
      sql.exec("UPDATE initiative SET position = position + 1 WHERE position >= ?", insertPosition);
    }

    const currentEnergy = (entity as any)?.energy?.current ?? (entity as any)?.energy?.max ?? 100;
    sql.exec(
      "INSERT OR REPLACE INTO initiative (entity_id, roll, skill_value, current_energy, position) VALUES (?, ?, ?, ?, ?)",
      entity.id as string,
      initiativeRoll,
      initiativeTiebreaker,
      currentEnergy,
      insertPosition
    );
    combat.incrementVersion();

    const initiativeRows = sql.exec("SELECT * FROM initiative ORDER BY position").toArray() as Array<Record<string, unknown>>;
    const initiative = initiativeRows.map((row) => ({
      entityId: row.entity_id as string,
      roll: row.roll as number,
      tiebreaker: (row.skill_value as number) ?? 0,
      delayed: false,
      readied: false,
    }));

    combat.broadcast({ type: "ENTITY_UPDATED", payload: { action: "added", entity }, timestamp, requestId });
    combat.broadcast({ type: "INITIATIVE_UPDATED", payload: { initiative }, timestamp, requestId });
  }

  if (type === "GM_REMOVE_ENTITY") {
    const entityId = payload.entityId as string;
    sql.exec("DELETE FROM entities WHERE id = ?", entityId);
    sql.exec("DELETE FROM initiative WHERE entity_id = ?", entityId);
    combat.incrementVersion();
    const initiativeRows = sql.exec("SELECT * FROM initiative ORDER BY position").toArray() as Array<Record<string, unknown>>;
    const initiative = initiativeRows.map((row) => ({
      entityId: row.entity_id as string,
      roll: row.roll as number,
      tiebreaker: (row.skill_value as number) ?? 0,
      delayed: false,
      readied: false,
    }));
    combat.broadcast({ type: "ENTITY_UPDATED", payload: { action: "removed", entityId }, timestamp, requestId });
    combat.broadcast({ type: "INITIATIVE_UPDATED", payload: { initiative }, timestamp, requestId });
  }

  if (type === "GM_APPLY_DAMAGE") {
    const entityId = payload.entityId as string;
    // Client sends "damage" not "amount"
    const amount = (payload.damage as number) ?? (payload.amount as number) ?? 0;
    const damageType = payload.damageType as string;

    const row = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", entityId);
    if (!row) return;

    const entity = JSON.parse(row.data);
    entity.energy = entity.energy || { current: 100, max: 100 };
    entity.energy.current = entity.energy.current ?? 100;
    entity.energy.max = entity.energy.max ?? 100;

    if (amount > 0) {
      // Damage: reduce current energy (min 0)
      entity.energy.current = Math.max(0, entity.energy.current - amount);
    } else if (amount < 0) {
      // Healing: increase current energy (max is entity's max)
      entity.energy.current = Math.min(entity.energy.max, entity.energy.current + Math.abs(amount));
    }

    sql.exec("UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(entity), entityId);
    combat.incrementVersion();

    // Broadcast ENTITY_UPDATED so client updates state properly
    combat.broadcast({
      type: "ENTITY_UPDATED",
      payload: {
        entity: { id: entityId, energy: entity.energy, wounds: entity.wounds },
      },
      timestamp,
      requestId,
    });
  }

  if (type === "GM_MODIFY_RESOURCES") {
    const entityId = payload.entityId as string;
    // Client sends ap and energy directly, not in a changes object
    // These values should ADD to both current and max
    const apChange = (payload.ap as number | undefined) ?? 0;
    const energyChange = (payload.energy as number | undefined) ?? 0;

    const row = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", entityId);
    if (!row) return;

    const entity = JSON.parse(row.data);

    // Initialize defaults if needed
    entity.ap = entity.ap || { current: 6, max: 6 };
    entity.energy = entity.energy || { current: 100, max: 100 };

    // Add to both current and max for AP
    if (apChange !== 0) {
      entity.ap.current = Math.max(0, (entity.ap.current ?? 6) + apChange);
      entity.ap.max = Math.max(1, (entity.ap.max ?? 6) + apChange);
    }

    // Add to both current and max for Energy
    if (energyChange !== 0) {
      entity.energy.current = Math.max(0, (entity.energy.current ?? 100) + energyChange);
      entity.energy.max = Math.max(1, (entity.energy.max ?? 100) + energyChange);
    }

    sql.exec("UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(entity), entityId);
    combat.incrementVersion();
    combat.broadcast({
      type: "ENTITY_UPDATED",
      payload: {
        entity: { id: entityId, ap: entity.ap, energy: entity.energy },
      },
      timestamp,
      requestId,
    });
  }

  if (type === "GM_OVERRIDE") {
    const overrideType = payload.overrideType as string | undefined;
    const entityId = payload.entityId as string | undefined;
    const updates = payload.updates as Record<string, unknown> | undefined;

    if (overrideType === "set_phase") {
      sql.exec("UPDATE combat_state SET phase = ?, last_updated_at = ? WHERE id = 'current'", payload.phase, timestamp);
      combat.incrementVersion();
      combat.broadcast({ type: "GM_OVERRIDE_APPLIED", payload: { overrideType, phase: payload.phase }, timestamp, requestId });
      return;
    }

    if (entityId && updates) {
      const row = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", entityId);
      if (!row) return;
      const entity = JSON.parse(row.data);
      const updatedEntity = { ...entity, ...updates };
      sql.exec("UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(updatedEntity), entityId);
      combat.incrementVersion();
      combat.broadcast({ type: "ENTITY_UPDATED", payload: { action: "updated", entity: updatedEntity }, timestamp, requestId });
    }
  }
}
