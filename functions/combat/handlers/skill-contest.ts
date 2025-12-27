/**
 * Skill Contest Handler
 *
 * Handles: INITIATE_SKILL_CONTEST, RESPOND_SKILL_CONTEST
 *
 * Skill contests allow players and GMs to roll skill checks against each other.
 * The initiator rolls d100 dice (taking highest or lowest based on circumstance),
 * then the target responds with their own roll. Winner is determined by total.
 *
 * ATTACK CONTESTS:
 * Attacks are a special type of skill contest. When resolved:
 * - If attacker wins: damage = baseDamage + physicalAttribute
 * - Critical hits based on margin (% above loser's total):
 *   - Wicked (50%+): Normal damage + 1 wound
 *   - Vicious (100%+): 1.5x damage + 1 wound
 *   - Brutal (200%+): 2x damage + 2 wounds
 */

import type { CombatDurableObject, WebSocketMetadata, ClientMessageType } from "../CombatDurableObject";
import { canControlEntity } from "./permissions";

// Helper for optional single-row queries
function queryOneOrNull<T>(sql: SqlStorage, query: string, ...params: unknown[]): T | null {
  const rows = sql["exec"](query, ...params).toArray();
  return rows.length > 0 ? (rows[0] as T) : null;
}

// Wrapper to call SQL storage methods
function runQuery(sql: SqlStorage, query: string, ...params: unknown[]) {
  return sql["exec"](query, ...params);
}

// Ensure the skill_contests table exists
function ensureSkillContestsTable(sql: SqlStorage): void {
  sql["exec"](`
    CREATE TABLE IF NOT EXISTS skill_contests (
      id TEXT PRIMARY KEY,
      contest_type TEXT NOT NULL DEFAULT 'skill',
      initiator_entity_id TEXT NOT NULL,
      initiator_player_id TEXT NOT NULL,
      target_entity_id TEXT,
      target_player_id TEXT,
      initiator_skill TEXT NOT NULL,
      initiator_dice_count INTEGER NOT NULL DEFAULT 1,
      initiator_keep_highest INTEGER NOT NULL DEFAULT 1,
      initiator_raw_rolls TEXT NOT NULL,
      initiator_selected_roll INTEGER NOT NULL,
      initiator_skill_modifier INTEGER NOT NULL DEFAULT 0,
      initiator_total INTEGER NOT NULL,
      defender_skill TEXT,
      defender_dice_count INTEGER,
      defender_keep_highest INTEGER,
      defender_raw_rolls TEXT,
      defender_selected_roll INTEGER,
      defender_skill_modifier INTEGER,
      defender_total INTEGER,
      status TEXT NOT NULL DEFAULT 'awaiting_response',
      winner_entity_id TEXT,
      margin INTEGER,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      -- Attack contest fields
      attack_base_damage INTEGER,
      attack_damage_type TEXT,
      attack_physical_attribute INTEGER,
      attack_ap_cost INTEGER,
      attack_energy_cost INTEGER
    )
  `);

  // Migration: Add contest_type column if it doesn't exist (for tables created before this column was added)
  try {
    sql["exec"](`ALTER TABLE skill_contests ADD COLUMN contest_type TEXT NOT NULL DEFAULT 'skill'`);
  } catch {
    // Column already exists, ignore the error
  }

  // Migration: Add attack contest fields if they don't exist
  const attackColumns = [
    "attack_base_damage INTEGER",
    "attack_damage_type TEXT",
    "attack_physical_attribute INTEGER",
    "attack_ap_cost INTEGER",
    "attack_energy_cost INTEGER",
  ];
  for (const col of attackColumns) {
    try {
      sql["exec"](`ALTER TABLE skill_contests ADD COLUMN ${col}`);
    } catch {
      // Column already exists, ignore the error
    }
  }
}

/**
 * Roll multiple d100 dice and select the highest or lowest
 */
function rollD100Dice(diceCount: number, keepHighest: boolean): { rawRolls: number[]; selectedRoll: number } {
  const rawRolls: number[] = [];
  for (let i = 0; i < diceCount; i++) {
    rawRolls.push(Math.floor(Math.random() * 100) + 1);
  }
  const selectedRoll = keepHighest ? Math.max(...rawRolls) : Math.min(...rawRolls);
  return { rawRolls, selectedRoll };
}

export async function handleSkillContest(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  type: ClientMessageType,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const timestamp = new Date().toISOString();

  switch (type) {
    case "INITIATE_SKILL_CONTEST":
      await handleInitiateContest(combat, ws, session, payload, requestId, "skill");
      break;

    case "INITIATE_ATTACK_CONTEST":
      await handleInitiateContest(combat, ws, session, payload, requestId, "attack");
      break;

    case "RESPOND_SKILL_CONTEST":
      await handleRespondContest(combat, ws, session, payload, requestId);
      break;

    default:
      combat.sendToSocket(ws, {
        type: "ACTION_REJECTED",
        payload: { reason: "Unknown skill contest action" },
        timestamp,
        requestId,
      });
  }
}

async function handleInitiateContest(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string,
  contestType: "skill" | "attack" = "skill"
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  // Ensure table exists
  ensureSkillContestsTable(sql);

  const initiatorEntityId = payload.initiatorEntityId as string;
  const targetEntityId = payload.targetEntityId as string | undefined;
  const targetPlayerId = payload.targetPlayerId as string | undefined;
  const skill = payload.skill as string;
  const skillModifier = (payload.skillModifier as number) ?? 0;
  const diceCount = (payload.diceCount as number) ?? 1;
  const keepHighest = payload.keepHighest !== false; // default true

  // Attack-specific fields
  const baseDamage = (payload.baseDamage as number) ?? 0;
  const damageType = (payload.damageType as string) ?? "physical";
  const physicalAttribute = (payload.physicalAttribute as number) ?? 0;
  const apCost = (payload.apCost as number) ?? (contestType === "attack" ? 1 : 0);
  const energyCost = (payload.energyCost as number) ?? (contestType === "attack" ? 1 : 0);

  // If preRolled values are provided (client-side roll), use them
  const preRolledRawRolls = payload.rawRolls as number[] | undefined;
  const preRolledSelectedRoll = payload.selectedRoll as number | undefined;

  // Get initiator entity
  const initiatorRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", initiatorEntityId);

  if (!initiatorRow) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Initiator entity not found" },
      timestamp,
      requestId,
    });
    return;
  }

  const initiator = JSON.parse(initiatorRow.data);

  // Verify player controls this entity or is GM
  if (!canControlEntity(session, initiatorEntityId, initiator)) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "You do not control this entity" },
      timestamp,
      requestId,
    });
    return;
  }

  // For attack contests, check and spend resources
  if (contestType === "attack") {
    // Ensure initiator has valid AP and energy with defaults
    initiator.ap = initiator.ap || { current: 6, max: 6 };
    initiator.ap.current = initiator.ap.current ?? initiator.ap.max ?? 6;
    initiator.energy = initiator.energy || { current: 100, max: 100 };
    initiator.energy.current = initiator.energy.current ?? 100;

    if (initiator.ap.current < apCost) {
      combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Insufficient AP" }, timestamp, requestId });
      return;
    }

    if (initiator.energy.current < energyCost) {
      combat.sendToSocket(ws, { type: "ACTION_REJECTED", payload: { reason: "Insufficient Energy" }, timestamp, requestId });
      return;
    }

    // Spend resources
    initiator.ap.current -= apCost;
    initiator.energy.current -= energyCost;
    runQuery(sql, "UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(initiator), initiatorEntityId);
  }

  // Roll dice (use pre-rolled values if provided, otherwise roll server-side)
  let rawRolls: number[];
  let selectedRoll: number;

  if (preRolledRawRolls && preRolledSelectedRoll !== undefined) {
    rawRolls = preRolledRawRolls;
    selectedRoll = preRolledSelectedRoll;
  } else {
    const rollResult = rollD100Dice(diceCount, keepHighest);
    rawRolls = rollResult.rawRolls;
    selectedRoll = rollResult.selectedRoll;
  }

  const initiatorTotal = selectedRoll + skillModifier;

  // Create contest record
  const contestId = crypto.randomUUID();

  sql["exec"](
    `INSERT INTO skill_contests (
      id, contest_type, initiator_entity_id, initiator_player_id, target_entity_id, target_player_id,
      initiator_skill, initiator_dice_count, initiator_keep_highest,
      initiator_raw_rolls, initiator_selected_roll, initiator_skill_modifier, initiator_total,
      status, created_at,
      attack_base_damage, attack_damage_type, attack_physical_attribute, attack_ap_cost, attack_energy_cost
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    contestId,
    contestType,
    initiatorEntityId,
    session.playerId,
    targetEntityId || null,
    targetPlayerId || null,
    skill,
    diceCount,
    keepHighest ? 1 : 0,
    JSON.stringify(rawRolls),
    selectedRoll,
    skillModifier,
    initiatorTotal,
    "awaiting_response",
    timestamp,
    contestType === "attack" ? baseDamage : null,
    contestType === "attack" ? damageType : null,
    contestType === "attack" ? physicalAttribute : null,
    contestType === "attack" ? apCost : null,
    contestType === "attack" ? energyCost : null
  );

  // Get entity names for display
  const initiatorName = initiator.displayName || initiator.name || "Unknown";

  let targetName = "Unknown";
  if (targetEntityId) {
    const targetRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", targetEntityId);
    if (targetRow) {
      const target = JSON.parse(targetRow.data);
      targetName = target.displayName || target.name || "Unknown";
    }
  }

  // Broadcast contest initiated to all
  combat.broadcast({
    type: contestType === "attack" ? "ATTACK_CONTEST_INITIATED" : "SKILL_CONTEST_INITIATED",
    payload: {
      contestId,
      contestType,
      initiatorEntityId,
      initiatorName,
      initiatorSkill: skill,
      initiatorRawRolls: rawRolls,
      initiatorSelectedRoll: selectedRoll,
      initiatorSkillModifier: skillModifier,
      initiatorTotal,
      targetEntityId,
      targetName,
      targetPlayerId,
      diceCount,
      keepHighest,
      // Attack-specific data
      ...(contestType === "attack" && {
        baseDamage,
        damageType,
        physicalAttribute,
        apCost,
        energyCost,
        attackerAp: initiator.ap?.current,
        attackerEnergy: initiator.energy?.current,
      }),
    },
    timestamp,
    requestId,
  });

  // If there's a target, send them a response request
  if (targetEntityId) {
    const responsePayload = {
      type: "SKILL_CONTEST_RESPONSE_REQUESTED" as const,
      payload: {
        contestId,
        contestType,
        initiatorEntityId,
        initiatorName,
        initiatorSkill: skill,
        initiatorTotal,
        targetEntityId,
        // Include attack info so defender knows this is an attack
        ...(contestType === "attack" && { isAttack: true }),
      },
      timestamp,
    };

    if (targetPlayerId) {
      // Target is player-controlled
      combat.broadcastToPlayer(targetPlayerId, responsePayload);
    } else {
      // Target is GM-controlled (controller === "gm" or undefined)
      // Get target entity to check controller
      const targetRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", targetEntityId);
      if (targetRow) {
        const targetEntity = JSON.parse(targetRow.data);
        if (targetEntity.controller === "gm" || !targetEntity.controller) {
          combat.broadcastToGMs(responsePayload);
        }
      }
    }
  }
}

/**
 * Determine critical hit type based on margin percentage
 * - Wicked Critical: 50%+ margin (normal damage + 1 wound)
 * - Vicious Critical: 100%+ margin (1.5x damage + 1 wound)
 * - Brutal Critical: 200%+ margin (2x damage + 2 wounds)
 */
function determineCriticalType(winnerTotal: number, loserTotal: number): {
  type: "normal" | "wicked" | "vicious" | "brutal";
  damageMultiplier: number;
  woundCount: number;
} {
  if (loserTotal <= 0) {
    // Avoid division by zero - treat as brutal critical
    return { type: "brutal", damageMultiplier: 2, woundCount: 2 };
  }

  const marginPercent = ((winnerTotal - loserTotal) / loserTotal) * 100;

  if (marginPercent >= 200) {
    return { type: "brutal", damageMultiplier: 2, woundCount: 2 };
  } else if (marginPercent >= 100) {
    return { type: "vicious", damageMultiplier: 1.5, woundCount: 1 };
  } else if (marginPercent >= 50) {
    return { type: "wicked", damageMultiplier: 1, woundCount: 1 };
  }

  return { type: "normal", damageMultiplier: 1, woundCount: 0 };
}

async function handleRespondContest(
  combat: CombatDurableObject,
  ws: WebSocket,
  session: WebSocketMetadata,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const sql = combat.getSql();
  const timestamp = new Date().toISOString();

  ensureSkillContestsTable(sql);

  const contestId = payload.contestId as string;
  const defenderEntityId = payload.entityId as string;
  const defenderSkill = payload.skill as string;
  const skillModifier = (payload.skillModifier as number) ?? 0;
  const diceCount = (payload.diceCount as number) ?? 1;
  const keepHighest = payload.keepHighest !== false;

  // If preRolled values are provided, use them
  const preRolledRawRolls = payload.rawRolls as number[] | undefined;
  const preRolledSelectedRoll = payload.selectedRoll as number | undefined;

  // Find the contest - include attack fields
  const contestRow = queryOneOrNull<{
    id: string;
    contest_type: string;
    initiator_entity_id: string;
    initiator_player_id: string;
    target_entity_id: string;
    initiator_skill: string;
    initiator_total: number;
    initiator_raw_rolls: string;
    initiator_selected_roll: number;
    initiator_skill_modifier: number;
    status: string;
    attack_base_damage: number | null;
    attack_damage_type: string | null;
    attack_physical_attribute: number | null;
  }>(sql, "SELECT * FROM skill_contests WHERE id = ?", contestId);

  if (!contestRow) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Contest not found" },
      timestamp,
      requestId,
    });
    return;
  }

  if (contestRow.status !== "awaiting_response") {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Contest already resolved" },
      timestamp,
      requestId,
    });
    return;
  }

  // Get defender entity
  const defenderRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", defenderEntityId);

  if (!defenderRow) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "Defender entity not found" },
      timestamp,
      requestId,
    });
    return;
  }

  const defender = JSON.parse(defenderRow.data);

  // Verify player controls this entity or is GM
  if (!canControlEntity(session, defenderEntityId, defender)) {
    combat.sendToSocket(ws, {
      type: "ACTION_REJECTED",
      payload: { reason: "You do not control this entity" },
      timestamp,
      requestId,
    });
    return;
  }

  // Roll dice
  let rawRolls: number[];
  let selectedRoll: number;

  if (preRolledRawRolls && preRolledSelectedRoll !== undefined) {
    rawRolls = preRolledRawRolls;
    selectedRoll = preRolledSelectedRoll;
  } else {
    const rollResult = rollD100Dice(diceCount, keepHighest);
    rawRolls = rollResult.rawRolls;
    selectedRoll = rollResult.selectedRoll;
  }

  const defenderTotal = selectedRoll + skillModifier;

  // Determine winner
  const initiatorTotal = contestRow.initiator_total;
  const margin = Math.abs(initiatorTotal - defenderTotal);
  let winnerEntityId: string | null = null;

  if (initiatorTotal > defenderTotal) {
    winnerEntityId = contestRow.initiator_entity_id;
  } else if (defenderTotal > initiatorTotal) {
    winnerEntityId = defenderEntityId;
  }
  // If equal, it's a tie (winnerEntityId remains null)

  // Update contest record
  sql["exec"](
    `UPDATE skill_contests SET
      defender_skill = ?,
      defender_dice_count = ?,
      defender_keep_highest = ?,
      defender_raw_rolls = ?,
      defender_selected_roll = ?,
      defender_skill_modifier = ?,
      defender_total = ?,
      status = 'resolved',
      winner_entity_id = ?,
      margin = ?,
      resolved_at = ?
    WHERE id = ?`,
    defenderSkill,
    diceCount,
    keepHighest ? 1 : 0,
    JSON.stringify(rawRolls),
    selectedRoll,
    skillModifier,
    defenderTotal,
    winnerEntityId,
    margin,
    timestamp,
    contestId
  );

  // Get entity names
  const initiatorRow = queryOneOrNull<{ data: string }>(sql, "SELECT data FROM entities WHERE id = ?", contestRow.initiator_entity_id);
  const initiator = initiatorRow ? JSON.parse(initiatorRow.data) : null;
  const initiatorName = initiator?.displayName || initiator?.name || "Unknown";
  const defenderName = defender.displayName || defender.name || "Unknown";

  // Attack contest resolution - apply damage if attacker won
  let attackResult: {
    hit: boolean;
    baseDamage: number;
    physicalAttribute: number;
    finalDamage: number;
    damageType: string;
    criticalType: "normal" | "wicked" | "vicious" | "brutal";
    woundsDealt: number;
    targetEnergy: number;
    targetWounds: Record<string, number>;
  } | null = null;

  const isAttackContest = contestRow.contest_type === "attack";

  if (isAttackContest && winnerEntityId === contestRow.initiator_entity_id) {
    // Attacker wins - calculate and apply damage
    const baseDamage = contestRow.attack_base_damage ?? 0;
    const physicalAttribute = contestRow.attack_physical_attribute ?? 0;
    const damageType = contestRow.attack_damage_type ?? "physical";

    // Determine critical type
    const critical = determineCriticalType(initiatorTotal, defenderTotal);

    // Calculate damage: (baseDamage + physicalAttribute) * damageMultiplier
    let finalDamage = Math.floor((baseDamage + physicalAttribute) * critical.damageMultiplier);

    // Check target immunities/resistances/weaknesses
    const immunities = defender.immunities || [];
    const resistances = defender.resistances || [];
    const weaknesses = defender.weaknesses || [];

    if (immunities.includes(damageType)) {
      finalDamage = 0;
    } else if (resistances.includes(damageType)) {
      finalDamage = Math.floor(finalDamage / 2);
    } else if (weaknesses.includes(damageType)) {
      finalDamage = finalDamage * 2;
    }

    // Apply damage to defender energy
    defender.energy = defender.energy || { current: 100, max: 100 };
    defender.energy.current = defender.energy.current ?? 100;
    defender.energy.max = defender.energy.max ?? 100;
    defender.energy.current = Math.max(0, defender.energy.current - finalDamage);

    // Apply wounds from critical hits
    defender.wounds = defender.wounds || {};
    if (critical.woundCount > 0) {
      defender.wounds[damageType] = (defender.wounds[damageType] || 0) + critical.woundCount;
    }

    // Update defender in database
    runQuery(sql, "UPDATE entities SET data = ? WHERE id = ?", JSON.stringify(defender), defenderEntityId);
    combat.incrementVersion();

    attackResult = {
      hit: true,
      baseDamage,
      physicalAttribute,
      finalDamage,
      damageType,
      criticalType: critical.type,
      woundsDealt: critical.woundCount,
      targetEnergy: defender.energy.current,
      targetWounds: defender.wounds,
    };

    // Check for death/unconscious
    if (defender.energy.current <= 0 && !defender.unconscious) {
      combat.broadcast({
        type: "ENDURE_ROLL_REQUIRED",
        payload: { entityId: defenderEntityId, triggeringDamage: finalDamage },
        timestamp,
      });
    }
  } else if (isAttackContest) {
    // Attack missed (defender won or tie)
    attackResult = {
      hit: false,
      baseDamage: contestRow.attack_base_damage ?? 0,
      physicalAttribute: contestRow.attack_physical_attribute ?? 0,
      finalDamage: 0,
      damageType: contestRow.attack_damage_type ?? "physical",
      criticalType: "normal",
      woundsDealt: 0,
      targetEnergy: defender.energy?.current ?? 100,
      targetWounds: defender.wounds || {},
    };
  }

  // Broadcast resolution to all
  combat.broadcast({
    type: isAttackContest ? "ATTACK_CONTEST_RESOLVED" : "SKILL_CONTEST_RESOLVED",
    payload: {
      contestId,
      contestType: contestRow.contest_type,
      initiatorEntityId: contestRow.initiator_entity_id,
      initiatorName,
      initiatorSkill: contestRow.initiator_skill,
      initiatorRawRolls: JSON.parse(contestRow.initiator_raw_rolls),
      initiatorSelectedRoll: contestRow.initiator_selected_roll,
      initiatorSkillModifier: contestRow.initiator_skill_modifier,
      initiatorTotal,
      defenderEntityId,
      defenderName,
      defenderSkill,
      defenderRawRolls: rawRolls,
      defenderSelectedRoll: selectedRoll,
      defenderSkillModifier: skillModifier,
      defenderTotal,
      winnerEntityId,
      winnerName: winnerEntityId === contestRow.initiator_entity_id ? initiatorName :
                  winnerEntityId === defenderEntityId ? defenderName : null,
      isTie: winnerEntityId === null,
      margin,
      // Attack-specific results
      ...(attackResult && {
        attack: attackResult,
      }),
    },
    timestamp,
    requestId,
  });
}
