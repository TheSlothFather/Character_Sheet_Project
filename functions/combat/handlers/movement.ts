/**
 * Movement Handler
 *
 * Handles: DECLARE_MOVEMENT
 */

import type { CombatDurableObject, WebSocketMetadata, ClientMessageType } from "../CombatDurableObject";

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

  if (type !== "DECLARE_MOVEMENT") {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Unknown movement action" },
      timestamp,
      requestId,
    });
    return;
  }

  await handleMoveEntity(combat, ws, session, payload, requestId);
}

async function handleMoveEntity(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  const entityId = payload.entityId as string;
  const targetQ = payload.targetQ as number;
  const targetR = payload.targetR as number;
  const path = payload.path as Array<{ q: number; r: number }> | undefined;

  // Validate entity control
  if (!session.isGM && !session.controlledEntityIds.includes(entityId)) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "You do not control this entity" },
      timestamp,
      requestId,
    });
    return;
  }

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

  // Get current position
  const positionRow = queryOneOrNull<{ q: number; r: number }>(sql, "SELECT q, r FROM hex_positions WHERE entity_id = ?", entityId);

  const startQ = positionRow?.q ?? 0;
  const startR = positionRow?.r ?? 0;

  // Calculate distance (axial hex distance)
  const distance = hexDistance(startQ, startR, targetQ, targetR);

  // Calculate movement cost
  // Movement = max(Physical Attr, 3) hexes per 1 AP
  const physicalAttr = entity.skills?.Physical ?? 3;
  const hexesPerAP = Math.max(physicalAttr, 3);
  const apCost = Math.ceil(distance / hexesPerAP);

  // Check AP
  if ((entity.ap?.current ?? 0) < apCost) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Insufficient AP for movement", required: apCost, available: entity.ap?.current },
      timestamp,
      requestId,
    });
    return;
  }

  // Check if target hex is occupied
  const occupiedRow = queryOneOrNull<{ entity_id: string }>(sql, "SELECT entity_id FROM hex_positions WHERE q = ? AND r = ?", targetQ, targetR);

  if (occupiedRow) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Target hex is occupied" },
      timestamp,
      requestId,
    });
    return;
  }

  // Spend AP
  entity.ap.current -= apCost;
  runQuery(sql, "UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(entity), entityId);

  // Update position
  if (positionRow) {
    runQuery(sql, "UPDATE hex_positions SET q = ?, r = ? WHERE entity_id = ?", targetQ, targetR, entityId);
  } else {
    runQuery(sql, "INSERT INTO hex_positions (entity_id, q, r) VALUES (?, ?, ?)", entityId, targetQ, targetR);
  }

  combat.incrementVersion();

  combat.addLogEntry("movement", {
    entityId,
    from: { q: startQ, r: startR },
    to: { q: targetQ, r: targetR },
    distance,
    apCost,
  });

  combat.broadcast({
    type: "MOVEMENT_EXECUTED",
    payload: {
      entityId,
      from: { q: startQ, r: startR },
      to: { q: targetQ, r: targetR },
      path,
      distance,
      apCost,
      remainingAP: entity.ap.current,
    },
    timestamp,
    requestId,
  });
}

/**
 * Calculate axial hex distance
 */
function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}
