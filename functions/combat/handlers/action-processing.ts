/**
 * Action Processing Handler
 *
 * Handles: DECLARE_ATTACK, DECLARE_ABILITY, DECLARE_REACTION
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

export async function handleActionProcessing(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  type: ClientMessageType,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const timestamp = new Date().toISOString();

  switch (type) {
    case "DECLARE_ATTACK":
      await handleAttack(combat, ws, session, payload, requestId);
      break;

    case "DECLARE_ABILITY":
      await handleAbility(combat, ws, session, payload, requestId);
      break;

    case "DECLARE_REACTION":
      await handleReaction(combat, ws, session, payload, requestId);
      break;

    default:
      combat.sendToSocket(ws, {
        type: "ACTION_REJECTED",
        payload: { reason: "Unknown action type" },
        timestamp,
        requestId,
      });
  }
}

async function handleAttack(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  const attackerId = payload.attackerId as string;
  const targetId = payload.targetId as string;
  const weaponCategory = payload.weaponCategory as string;
  const apCost = payload.apCost as number || 1;
  const energyCost = payload.energyCost as number || 1;
  const baseDamage = payload.baseDamage as number || 5;
  const damageType = payload.damageType as string || "laceration";
  const attackRoll = payload.attackRoll as number;

  // Validate attacker
  const state = combat.getCombatState();
  if (!state) return;

  // Get attacker entity
  const attackerRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", attackerId);

  if (!attackerRow) {
    combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Attacker not found" }, timestamp, requestId });
    return;
  }

  const attacker = JSON.parse(attackerRow.data);

  if (!canControlEntity(session, attackerId, attacker)) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "You do not control this entity" },
      timestamp,
      requestId,
    });
    return;
  }

  // Ensure attacker has valid AP and energy with defaults
  attacker.ap = attacker.ap || { current: 6, max: 6 };
  attacker.ap.current = attacker.ap.current ?? attacker.ap.max ?? 6;
  attacker.energy = attacker.energy || { current: 100, max: 100 };
  attacker.energy.current = attacker.energy.current ?? 100;

  // Check resources
  if (attacker.ap.current < apCost) {
    combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Insufficient AP" }, timestamp, requestId });
    return;
  }

  if (attacker.energy.current < energyCost) {
    combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Insufficient Energy" }, timestamp, requestId });
    return;
  }

  // Spend resources
  attacker.ap.current -= apCost;
  attacker.energy.current -= energyCost;
  runQuery(sql, "UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(attacker), attackerId);

  // Get target
  const targetRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", targetId);

  if (!targetRow) {
    combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Target not found" }, timestamp, requestId });
    return;
  }

  const target = JSON.parse(targetRow.data);

  // Calculate damage with modifiers
  let finalDamage = baseDamage;

  // Check target immunities/resistances/weaknesses
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

  // Apply damage - ensure target has valid energy with defaults
  target.energy = target.energy || { current: 100, max: 100 };
  target.energy.current = target.energy.current ?? 100;
  target.energy.max = target.energy.max ?? 100;
  const oldEnergy = target.energy.current;
  target.energy.current = Math.max(0, target.energy.current - finalDamage);

  // Apply wounds
  if (finalDamage > 0) {
    target.wounds = target.wounds || {};
    const woundCount = Math.ceil(finalDamage / 20);
    target.wounds[damageType] = (target.wounds[damageType] || 0) + woundCount;
  }

  runQuery(sql, "UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(target), targetId);
  combat.incrementVersion();

  combat.broadcast({
    type: "ATTACK_RESOLVED",
    payload: {
      attackerId,
      targetId,
      weaponCategory,
      attackRoll,
      baseDamage,
      finalDamage,
      damageType,
      targetEnergy: target.energy.current,
      targetWounds: target.wounds,
      attackerAp: attacker.ap.current,
      attackerEnergy: attacker.energy.current,
    },
    timestamp,
    requestId,
  });

  // Check for death
  if (target.energy.current <= 0 && !target.unconscious) {
    combat.broadcast({
      type: "ENDURE_ROLL_REQUIRED",
      payload: { entityId: targetId, triggeringDamage: finalDamage },
      timestamp,
    });
  }
}

async function handleAbility(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  const entityId = payload.entityId as string;
  const abilityName = payload.abilityName as string;
  const apCost = payload.apCost as number || 1;
  const energyCost = payload.energyCost as number || 1;
  const effects = payload.effects as Record<string, unknown>;

  // Get entity
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

  // Check and spend resources
  if ((entity.ap?.current ?? 0) < apCost || (entity.energy?.current ?? 0) < energyCost) {
    combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Insufficient resources" }, timestamp, requestId });
    return;
  }

  entity.ap.current -= apCost;
  entity.energy.current -= energyCost;
  runQuery(sql, "UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(entity), entityId);
  combat.incrementVersion();

  combat.broadcast({
    type: "ABILITY_RESOLVED",
    payload: { entityId, abilityName, apCost, energyCost, effects },
    timestamp,
    requestId,
  });
}

async function handleReaction(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  const entityId = payload.entityId as string;
  const reactionType = payload.reactionType as string;
  const apCost = payload.apCost as number || 1;
  const triggerActionId = payload.triggerActionId as string;

  // Get entity
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

  // Check AP for reaction
  if ((entity.ap?.current ?? 0) < apCost) {
    combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Insufficient AP for reaction" }, timestamp, requestId });
    return;
  }

  entity.ap.current -= apCost;
  runQuery(sql, "UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(entity), entityId);
  combat.incrementVersion();

  combat.broadcast({
    type: "REACTION_RESOLVED",
    payload: { entityId, reactionType, apCost, triggerActionId },
    timestamp,
    requestId,
  });
}
