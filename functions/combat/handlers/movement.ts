/**
 * Movement Handler
 *
 * Handles: DECLARE_MOVEMENT
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

export async function handleMovement(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  type: ClientMessageType,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const timestamp = new Date().toISOString();

  switch (type) {
    case "DECLARE_MOVEMENT":
      await handleMoveEntity(combat, ws, session, payload, requestId, {
        force: false,
        ignoreApCost: false,
      });
      break;
    case "GM_MOVE_ENTITY":
      await handleGmMoveEntity(combat, ws, session, payload, requestId);
      break;
    default:
      combat.sendToSocket(ws, {
        type: "ACTION_REJECTED",
        payload: { reason: "Unknown movement action" },
        timestamp,
        requestId,
      });
  }
}

async function handleMoveEntity(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string,
  options?: { force: boolean; ignoreApCost: boolean }
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  const entityId = payload.entityId as string;
  const targetRow = payload.targetRow as number;
  const targetCol = payload.targetCol as number;
  const path = payload.path as Array<{ row: number; col: number }> | undefined;
  const force = options?.force ?? false;
  const ignoreApCost = options?.ignoreApCost ?? false;

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

  // Get current position
  const positionRow = queryOneOrNull<{ row: number; col: number }>(sql, "SELECT row, col FROM grid_positions WHERE entity_id = ?", entityId);

  const startRow = positionRow?.row ?? targetRow;
  const startCol = positionRow?.col ?? targetCol;

  // Calculate distance (Manhattan distance for square grid)
  const distance = gridDistance(startRow, startCol, targetRow, targetCol);

  // Calculate movement cost
  // Movement = max(Physical Attr, 3) squares per 1 AP
  const physicalAttr = entity.skills?.Physical ?? 3;
  const squaresPerAP = Math.max(physicalAttr, 3);
  const apCost = Math.ceil(distance / squaresPerAP);

  const state = combat.getCombatState() as { phase?: string } | null;
  const isActive = state?.phase === "active" || state?.phase === "active-turn";
  const shouldChargeAp = !force && isActive && !ignoreApCost;

  // Check AP
  if (shouldChargeAp && (entity.ap?.current ?? 0) < apCost) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Insufficient AP for movement", required: apCost, available: entity.ap?.current },
      timestamp,
      requestId,
    });
    return;
  }

  // Check if target cell is occupied
  const occupiedRow = force
    ? null
    : queryOneOrNull<{ entity_id: string }>(sql, "SELECT entity_id FROM grid_positions WHERE row = ? AND col = ?", targetRow, targetCol);

  if (occupiedRow) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Target cell is occupied" },
      timestamp,
      requestId,
    });
    return;
  }

  // Spend AP
  if (shouldChargeAp) {
    entity.ap = entity.ap || { current: 0, max: 6 };
    entity.ap.current = Math.max(0, entity.ap.current - apCost);
    runQuery(sql, "UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(entity), entityId);
  }

  // Update position
  if (positionRow) {
    runQuery(sql, "UPDATE grid_positions SET row = ?, col = ? WHERE entity_id = ?", targetRow, targetCol, entityId);
  } else {
    runQuery(sql, "INSERT INTO grid_positions (entity_id, row, col) VALUES (?, ?, ?)", entityId, targetRow, targetCol);
  }

  combat.incrementVersion();

  combat.addLogEntry("movement", {
    entityId,
    from: { row: startRow, col: startCol },
    to: { row: targetRow, col: targetCol },
    distance,
    apCost,
  });

  combat.broadcast({
    type: "MOVEMENT_EXECUTED",
    payload: {
      entityId,
      from: { row: startRow, col: startCol },
      to: { row: targetRow, col: targetCol },
      path,
      distance,
      apCost: shouldChargeAp ? apCost : 0,
      remainingAP: entity.ap?.current ?? 0,
    },
    timestamp,
    requestId,
  });
}

async function handleGmMoveEntity(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const timestamp = new Date().toISOString();

  if (!session.isGM) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "GM privileges required" },
      timestamp,
      requestId,
    });
    return;
  }

  await handleMoveEntity(combat, ws, session, payload, requestId, {
    force: Boolean(payload.force),
    ignoreApCost: Boolean(payload.ignoreApCost),
  });
}

/**
 * Calculate Manhattan distance for square grid
 */
function gridDistance(row1: number, col1: number, row2: number, col2: number): number {
  return Math.abs(row1 - row2) + Math.abs(col1 - col2);
}
