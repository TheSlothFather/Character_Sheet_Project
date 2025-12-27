/**
 * Turn Management Handler
 *
 * Handles: SUBMIT_INITIATIVE_ROLL, END_TURN, DELAY_TURN, READY_ACTION
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

export async function handleTurnManagement(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  type: ClientMessageType,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const timestamp = new Date().toISOString();

  switch (type) {
    case "SUBMIT_INITIATIVE_ROLL":
      await handleInitiativeRoll(combat, ws, session, payload, requestId);
      break;

    case "END_TURN":
      await handleEndTurn(combat, ws, session, payload, requestId);
      break;

    case "DELAY_TURN":
      await handleDelayTurn(combat, ws, session, payload, requestId);
      break;

    case "READY_ACTION":
      await handleReadyAction(combat, ws, session, payload, requestId);
      break;

    default:
      combat.sendToSocket(ws, {
        type: "ACTION_REJECTED",
        payload: { reason: "Unknown turn action" },
        timestamp,
        requestId,
      });
  }
}

async function handleInitiativeRoll(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  const entityId = payload.entityId as string;
  const roll = payload.roll as number;
  const skillValue = (payload.skillValue as number) ?? (payload.tiebreaker as number) ?? 0;

  // Get entity's current energy
  const entityRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", entityId);

  if (!entityRow) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Entity not found" },
      timestamp,
      requestId,
    });
    return;
  }

  const entity = JSON.parse(entityRow.data);
  const currentEnergy = entity.energy?.current ?? 100;

  // Verify player controls this entity or is GM
  if (!canControlEntity(session, entityId, entity)) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "You do not control this entity" },
      timestamp,
      requestId,
    });
    return;
  }

  // Insert or update initiative
  runQuery(sql,
    `INSERT OR REPLACE INTO initiative (entity_id, roll, skill_value, current_energy, position)
     VALUES (?, ?, ?, ?, COALESCE((SELECT position FROM initiative WHERE entity_id = ?),
       (SELECT COALESCE(MAX(position), -1) + 1 FROM initiative)))`,
    entityId, roll, skillValue, currentEnergy, entityId
  );

  // Check if all entities have rolled
  const entityCount = runQuery(sql, "SELECT COUNT(*) as count FROM entities").one() as { count: number };
  const initiativeCount = runQuery(sql, "SELECT COUNT(*) as count FROM initiative").one() as { count: number };

  const initiativeRows = runQuery(sql, "SELECT * FROM initiative ORDER BY position").toArray() as Array<Record<string, unknown>>;
  const initiative = initiativeRows.map((row) => ({
    entityId: row.entity_id as string,
    roll: row.roll as number,
    tiebreaker: (row.skill_value as number) ?? 0,
    delayed: false,
    readied: false,
  }));

  combat.broadcast({
    type: "INITIATIVE_UPDATED",
    payload: {
      initiative,
      allRolled: entityCount.count === initiativeCount.count,
    },
    timestamp,
    requestId,
  });

  // If all rolled, sort and start combat
  if (entityCount.count === initiativeCount.count) {
    sortAndStartCombat(combat);
  }
}

export function sortAndStartCombat(combat: CombatDurableObject): void {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  // Sort by: roll DESC, skill_value DESC, current_energy DESC
  const sorted = runQuery(sql, `
    SELECT entity_id, roll, skill_value, current_energy
    FROM initiative
    ORDER BY roll DESC, skill_value DESC, current_energy DESC
  `).toArray();

  // Update positions
  sorted.forEach((entry: any, index: number) => {
    runQuery(sql, "UPDATE initiative SET position = ? WHERE entity_id = ?", index, entry.entity_id);
  });

  const initiative = sorted.map((entry: any) => ({
    entityId: entry.entity_id as string,
    roll: entry.roll as number,
    tiebreaker: (entry.skill_value as number) ?? 0,
    delayed: false,
    readied: false,
  }));

  combat.broadcast({
    type: "INITIATIVE_UPDATED",
    payload: { initiative },
    timestamp,
  });

  // Update combat state
  const firstEntityId = sorted.length > 0 ? (sorted[0] as any).entity_id : null;
  runQuery(sql,
    `UPDATE combat_state
     SET phase = 'active-turn', round = 1, turn_index = 0, active_entity_id = ?, last_updated_at = ?
     WHERE id = 'current'`,
    firstEntityId, timestamp
  );

  combat.incrementVersion();

  combat.broadcast({
    type: "ROUND_STARTED",
    payload: { round: 1, initiativeOrder: sorted.map((e: any) => e.entity_id) },
    timestamp,
  });

  if (firstEntityId) {
    combat.broadcast({
      type: "TURN_STARTED",
      payload: { entityId: firstEntityId, turnIndex: 0 },
      timestamp,
    });
  }
}

async function handleEndTurn(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
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

  const activeEntityId = state.active_entity_id as string;

  // Process AP to Energy conversion
  const entityRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", activeEntityId);

  if (entityRow) {
    const entity = JSON.parse(entityRow.data);

    // Verify it's the player's turn or they're GM
    if (!canControlEntity(session, activeEntityId, entity)) {
      combat.sendToSocket(ws, {
        type: "ACTION_REJECTED",
        payload: { reason: "Not your turn" },
        timestamp,
        requestId,
      });
      return;
    }

    // Ensure entity has valid AP and energy objects with defaults
    entity.ap = entity.ap || { current: 6, max: 6 };
    entity.ap.current = entity.ap.current ?? entity.ap.max ?? 6;
    entity.ap.max = entity.ap.max ?? 6;

    entity.energy = entity.energy || { current: 100, max: 100 };
    entity.energy.current = entity.energy.current ?? 100;
    entity.energy.max = entity.energy.max ?? 100;

    const unspentAP = entity.ap.current;
    const tier = Math.ceil((entity.level ?? 1) / 5);
    const factor = 3 + (entity.staminaPotionBonus ?? 0);
    const energyGain = tier * factor * unspentAP;

    if (energyGain > 0) {
      entity.energy.current = Math.min(entity.energy.max, entity.energy.current + energyGain);
    }

    // Reset AP for next turn
    entity.ap.current = entity.ap.max;

    runQuery(sql, "UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(entity), activeEntityId);
  }

  // Advance to next turn
  const initiative = runQuery(sql, "SELECT entity_id FROM initiative ORDER BY position").toArray();
  const currentIndex = state.turn_index as number;
  const nextIndex = (currentIndex + 1) % initiative.length;
  const nextEntityId = (initiative[nextIndex] as any).entity_id;
  const isNewRound = nextIndex === 0;

  let newRound = state.round as number;
  if (isNewRound) {
    newRound += 1;
  }

  runQuery(sql,
    `UPDATE combat_state
     SET turn_index = ?, active_entity_id = ?, round = ?, last_updated_at = ?
     WHERE id = 'current'`,
    nextIndex, nextEntityId, newRound, timestamp
  );

  combat.incrementVersion();

  combat.broadcast({
    type: "TURN_ENDED",
    payload: { entityId: activeEntityId },
    timestamp,
    requestId,
  });

  if (isNewRound) {
    combat.broadcast({
      type: "ROUND_STARTED",
      payload: { round: newRound },
      timestamp,
    });
  }

  combat.broadcast({
    type: "TURN_STARTED",
    payload: { entityId: nextEntityId, turnIndex: nextIndex },
    timestamp,
  });
}

async function handleDelayTurn(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  const state = combat.getCombatState();
  if (!state) return;

  const activeEntityId = state.active_entity_id as string;

  const entityRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", activeEntityId);
  if (!entityRow) return;
  const entity = JSON.parse(entityRow.data);

  // Verify permissions
  if (!canControlEntity(session, activeEntityId, entity)) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Not your turn" },
      timestamp,
      requestId,
    });
    return;
  }

  // Move to end of initiative
  const maxPos = runQuery(sql, "SELECT MAX(position) as m FROM initiative").one() as { m: number };
  runQuery(sql, "UPDATE initiative SET position = ? WHERE entity_id = ?", maxPos.m + 1, activeEntityId);

  // Advance to next turn
  const initiative = runQuery(sql, "SELECT entity_id FROM initiative ORDER BY position").toArray();
  const nextEntityId = (initiative[0] as any).entity_id;

  runQuery(sql,
    "UPDATE combat_state SET active_entity_id = ?, turn_index = 0, last_updated_at = ? WHERE id = 'current'",
    nextEntityId, timestamp
  );

  combat.incrementVersion();

  combat.broadcast({
    type: "TURN_ENDED",
    payload: { entityId: activeEntityId, delayed: true },
    timestamp,
    requestId,
  });

  combat.broadcast({
    type: "TURN_STARTED",
    payload: { entityId: nextEntityId, turnIndex: 0 },
    timestamp,
  });
}

async function handleReadyAction(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  const state = combat.getCombatState();
  if (!state) return;

  const entityId = payload.entityId as string || state.active_entity_id as string;
  const trigger = payload.trigger as string;
  const actionType = payload.actionType as string;

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

  // Store readied action
  runQuery(sql,
    "INSERT INTO pending_actions (id, type, data, created_at) VALUES (?, 'readied', ?, ?)",
    crypto.randomUUID(),
    JSON.stringify({ entityId, trigger, actionType }),
    timestamp
  );

  combat.broadcast({
    type: "ENTITY_UPDATED",
    payload: { entityId, readiedAction: { trigger, actionType } },
    timestamp,
    requestId,
  });
}
