/**
 * Skill Contest Handler
 *
 * Handles: INITIATE_SKILL_CONTEST, RESPOND_SKILL_CONTEST
 *
 * Skill contests allow players and GMs to roll skill checks against each other.
 * The initiator rolls d100 dice (taking highest or lowest based on circumstance),
 * then the target responds with their own roll. Winner is determined by total.
 */

import type { CombatDurableObject, WebSocketMetadata, ClientMessageType } from "../CombatDurableObject";
import { canControlEntity } from "./permissions";

// Helper for optional single-row queries
function queryOneOrNull<T>(sql: SqlStorage, query: string, ...params: unknown[]): T | null {
  const rows = sql["exec"](query, ...params).toArray();
  return rows.length > 0 ? (rows[0] as T) : null;
}

// Ensure the skill_contests table exists
function ensureSkillContestsTable(sql: SqlStorage): void {
  sql["exec"](`
    CREATE TABLE IF NOT EXISTS skill_contests (
      id TEXT PRIMARY KEY,
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
      resolved_at TEXT
    )
  `);
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
      await handleInitiateContest(combat, ws, session, payload, requestId);
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
  requestId?: string
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
      id, initiator_entity_id, initiator_player_id, target_entity_id, target_player_id,
      initiator_skill, initiator_dice_count, initiator_keep_highest,
      initiator_raw_rolls, initiator_selected_roll, initiator_skill_modifier, initiator_total,
      status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    contestId,
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
    timestamp
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
    type: "SKILL_CONTEST_INITIATED",
    payload: {
      contestId,
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
    },
    timestamp,
    requestId,
  });

  // If there's a target, send them a response request
  if (targetEntityId && targetPlayerId) {
    combat.broadcastToPlayer(targetPlayerId, {
      type: "SKILL_CONTEST_RESPONSE_REQUESTED",
      payload: {
        contestId,
        initiatorEntityId,
        initiatorName,
        initiatorSkill: skill,
        initiatorTotal,
        targetEntityId,
      },
      timestamp,
    });
  }
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

  // Find the contest
  const contestRow = queryOneOrNull<{
    id: string;
    initiator_entity_id: string;
    initiator_player_id: string;
    target_entity_id: string;
    initiator_skill: string;
    initiator_total: number;
    initiator_raw_rolls: string;
    initiator_selected_roll: number;
    initiator_skill_modifier: number;
    status: string;
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
  const initiatorName = initiatorRow ? JSON.parse(initiatorRow.data).displayName || JSON.parse(initiatorRow.data).name : "Unknown";
  const defenderName = defender.displayName || defender.name || "Unknown";

  // Broadcast resolution to all
  combat.broadcast({
    type: "SKILL_CONTEST_RESOLVED",
    payload: {
      contestId,
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
    },
    timestamp,
    requestId,
  });
}
