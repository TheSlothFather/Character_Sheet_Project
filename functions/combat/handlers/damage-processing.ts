/**
 * Damage Processing Handler
 *
 * Handles: SUBMIT_ENDURE_ROLL, SUBMIT_DEATH_CHECK
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

export async function handleDamageProcessing(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  type: ClientMessageType,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const timestamp = new Date().toISOString();

  switch (type) {
    case "SUBMIT_ENDURE_ROLL":
      await handleEndureRoll(combat, ws, session, payload, requestId);
      break;

    case "SUBMIT_DEATH_CHECK":
      await handleDeathCheck(combat, ws, session, payload, requestId);
      break;

    default:
      combat.sendToSocket(ws, {
        type: "ACTION_REJECTED",
        payload: { reason: "Unknown damage action" },
        timestamp,
        requestId,
      });
  }
}

async function handleEndureRoll(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  const entityId = payload.entityId as string;
  const rollTotal = payload.rollTotal as number;
  const success = payload.success as boolean;

  // Get entity
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

  // Validate entity control
  if (!canControlEntity(session, entityId, entity)) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "You do not control this entity" },
      timestamp,
      requestId,
    });
    return;
  }

  if (success) {
    // Entity stays conscious at 0 energy
    combat.addLogEntry("endure_success", { entityId, rollTotal });

    combat.broadcast({
      type: "ENTITY_UPDATED",
      payload: {
        entityId,
        endureResult: "success",
        rollTotal,
        message: `${entity.displayName || entity.name} endures the pain!`,
      },
      timestamp,
      requestId,
    });
  } else {
    // Entity falls unconscious
    entity.unconscious = true;
    runQuery(sql, "UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(entity), entityId);
    combat.incrementVersion();

    combat.addLogEntry("endure_failure", { entityId, rollTotal });

    combat.broadcast({
      type: "ENTITY_UNCONSCIOUS",
      payload: {
        entityId,
        endureResult: "failure",
        rollTotal,
        message: `${entity.displayName || entity.name} falls unconscious!`,
      },
      timestamp,
      requestId,
    });
  }
}

async function handleDeathCheck(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  const entityId = payload.entityId as string;
  const rollTotal = payload.rollTotal as number;
  const success = payload.success as boolean;

  // Get entity
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

  // Validate entity control
  if (!canControlEntity(session, entityId, entity)) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "You do not control this entity" },
      timestamp,
      requestId,
    });
    return;
  }

  if (success) {
    // Feat of Defiance succeeds - entity survives (still unconscious)
    combat.addLogEntry("feat_of_defiance_success", { entityId, rollTotal });

    combat.broadcast({
      type: "ENTITY_UPDATED",
      payload: {
        entityId,
        deathCheckResult: "success",
        rollTotal,
        message: `${entity.displayName || entity.name} defies death!`,
      },
      timestamp,
      requestId,
    });
  } else {
    // Entity dies
    entity.alive = false;
    entity.unconscious = false;
    runQuery(sql, "UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(entity), entityId);

    // Remove from initiative
    runQuery(sql, "DELETE FROM initiative WHERE entity_id = ?", entityId);
    combat.incrementVersion();

    combat.addLogEntry("entity_death", { entityId, rollTotal });

    // Sync death to Supabase
    if (entity.characterId) {
      await combat.syncToSupabase("characters", {
        id: entity.characterId,
        is_alive: false,
        death_timestamp: timestamp,
      });
    }

    combat.broadcast({
      type: "ENTITY_DIED",
      payload: {
        entityId,
        deathCheckResult: "failure",
        rollTotal,
        message: `${entity.displayName || entity.name} has died!`,
      },
      timestamp,
      requestId,
    });
  }
}
