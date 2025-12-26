/**
 * Combat V2 - Combat State Types
 *
 * Server-authoritative combat state and hex grid management.
 */

import type { CombatEntity, HexPosition, StatusEffect } from "./entity";
import type { PendingAction, PendingReaction, RollData } from "./actions";
import type { ChannelingProgress } from "./channeling";

// ═══════════════════════════════════════════════════════════════════════════
// COMBAT PHASES
// ═══════════════════════════════════════════════════════════════════════════

export type CombatPhase =
  | "lobby"              // Pre-combat setup
  | "initiative-rolling" // Manual initiative rolls in progress
  | "initiative-ready"   // Initiative computed, ready to start
  | "active-turn"        // Entity is taking their turn
  | "channeling"         // Entity is channeling an Ildakar spell
  | "reaction-window"    // Waiting for reactions to a declared action
  | "resolution"         // Resolving actions and reactions
  | "endure-roll"        // Entity at 0 energy must roll Endure
  | "death-check"        // Unconscious entity must roll Feat of Defiance
  | "completed";         // Combat ended

// ═══════════════════════════════════════════════════════════════════════════
// INITIATIVE
// ═══════════════════════════════════════════════════════════════════════════

export type InitiativeMode = "individual" | "group";

export interface InitiativeEntry {
  entityId: string;
  roll: RollData;
  skillValue: number;
  currentEnergy: number;
  /** For group initiative */
  groupId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TERRAIN TYPES (for hex grid)
// ═══════════════════════════════════════════════════════════════════════════

export type TerrainType =
  | "normal"
  | "difficult"    // Costs 2 movement per hex
  | "impassable"   // Cannot enter
  | "hazardous"    // Deals damage on entry
  | "elevated"     // Provides height advantage
  | "water"
  | "pit";

export interface TerrainHex {
  type: TerrainType;
  movementCost: number;
  hazardDamage?: number;
  hazardType?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HEX GRID STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface HexGridState {
  /** Grid width in hexes */
  width: number;
  /** Grid height in hexes */
  height: number;
  /** Terrain by hex coordinate "q,r" */
  terrain: Record<string, TerrainHex>;
  /** Entity positions "q,r" -> entityId */
  entityPositions: Record<string, string>;
}

/**
 * Create a hex key from coordinates
 */
export function hexKey(pos: HexPosition): string {
  return `${pos.q},${pos.r}`;
}

/**
 * Parse a hex key back to coordinates
 */
export function parseHexKey(key: string): HexPosition {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

// ═══════════════════════════════════════════════════════════════════════════
// ENDURE AND DEATH ROLLS
// ═══════════════════════════════════════════════════════════════════════════

export interface EndureRollRequest {
  entityId: string;
  reason: "own_action" | "damage";
  timestamp: string;
}

export interface DeathCheckRequest {
  entityId: string;
  damageSource: string;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL CONTESTS AND CHECKS
// ═══════════════════════════════════════════════════════════════════════════

export interface SkillContestRequest {
  contestId: string;
  initiatorId: string;
  initiatorSkill: string;
  initiatorRoll: RollData;
  targetId: string;
  suggestedDefenseSkill?: string;
  autoRollDefense: boolean;
  gmCanResolve?: boolean;
  status: "pending" | "awaiting_defense" | "resolved";
  createdAt: string;
  resolvedAt?: string;
  outcome?: ContestOutcome;
  defenderSkill?: string;
  defenderRoll?: RollData;
}

export interface ContestOutcome {
  winnerId: string | null;
  loserId: string | null;
  winnerTotal: number;
  loserTotal: number;
  criticalTier: "normal" | "wicked" | "vicious" | "brutal";
  isTie: boolean;
}

export interface SkillCheckRequest {
  checkId: string;
  requesterId: string;
  targetPlayerId: string;
  targetEntityId: string;
  skill: string;
  targetNumber?: number;
  diceCount?: number;
  keepHighest?: boolean;
  gmCanResolve?: boolean;
  status: "pending" | "rolled" | "acknowledged";
  rollData?: RollData;
  createdAt: string;
  resolvedAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBAT LOG
// ═══════════════════════════════════════════════════════════════════════════

export type CombatLogType =
  | "combat_started"
  | "combat_ended"
  | "round_started"
  | "turn_started"
  | "turn_ended"
  | "movement_executed"
  | "action_declared"
  | "action_resolved"
  | "action_cancelled"
  | "reaction_declared"
  | "reaction_resolved"
  | "damage_applied"
  | "wounds_inflicted"
  | "status_applied"
  | "status_removed"
  | "status_tick"
  | "channeling_started"
  | "channeling_continued"
  | "spell_released"
  | "channeling_interrupted"
  | "blowback_applied"
  | "energy_depleted"
  | "endure_roll"
  | "unconscious"
  | "death_check"
  | "entity_died"
  | "entity_removed"
  | "initiative_rolled"
  | "skill_contest"
  | "skill_check"
  | "gm_override";

export interface CombatLogEntry {
  id: string;
  timestamp: string;
  type: CombatLogType;
  round: number;
  turnIndex: number;
  sourceEntityId?: string;
  targetEntityId?: string;
  data?: Record<string, unknown>;
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOBBY STATE (Pre-Combat)
// ═══════════════════════════════════════════════════════════════════════════

export interface LobbyPlayer {
  userId: string;
  characterId?: string;
  isReady: boolean;
  joinedAt: string;
}

export interface LobbyState {
  players: Record<string, LobbyPlayer>;
  combatants: CombatEntity[];
  initiativeMode: InitiativeMode;
  gridConfig?: HexGridState;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMBAT STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface CombatState {
  // ─── Identification ────────────────────────────────────────────────────────
  combatId: string;
  campaignId: string;

  // ─── Phase Machine ─────────────────────────────────────────────────────────
  phase: CombatPhase;

  // ─── Round/Turn Tracking ───────────────────────────────────────────────────
  round: number;
  turnIndex: number;
  initiativeOrder: string[];
  activeEntityId: string | null;

  // ─── Initiative ────────────────────────────────────────────────────────────
  initiativeMode: InitiativeMode;
  initiativeRolls: Record<string, InitiativeEntry>;

  // ─── Entities ──────────────────────────────────────────────────────────────
  entities: Record<string, CombatEntity>;

  // ─── Hex Grid ──────────────────────────────────────────────────────────────
  grid: HexGridState;

  // ─── Pending Actions ───────────────────────────────────────────────────────
  pendingAction: PendingAction | null;
  pendingReactions: PendingReaction[];

  // ─── Channeling ────────────────────────────────────────────────────────────
  pendingChanneling: Record<string, ChannelingProgress>;

  // ─── Endure/Death Rolls ────────────────────────────────────────────────────
  pendingEndureRoll: EndureRollRequest | null;
  pendingDeathCheck: DeathCheckRequest | null;

  // ─── Skill Contests & Checks ───────────────────────────────────────────────
  pendingContests: Record<string, SkillContestRequest>;
  pendingChecks: Record<string, SkillCheckRequest>;

  // ─── Combat Log ────────────────────────────────────────────────────────────
  log: CombatLogEntry[];

  // ─── Metadata ──────────────────────────────────────────────────────────────
  version: number;
  startedAt: string;
  lastUpdatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create initial empty combat state
 */
export function createInitialCombatState(
  campaignId: string,
  combatId: string
): CombatState {
  return {
    combatId,
    campaignId,
    phase: "lobby",
    round: 0,
    turnIndex: 0,
    initiativeOrder: [],
    activeEntityId: null,
    initiativeMode: "individual",
    initiativeRolls: {},
    entities: {},
    grid: {
      width: 20,
      height: 20,
      terrain: {},
      entityPositions: {},
    },
    pendingAction: null,
    pendingReactions: [],
    pendingChanneling: {},
    pendingEndureRoll: null,
    pendingDeathCheck: null,
    pendingContests: {},
    pendingChecks: {},
    log: [],
    version: 0,
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Get the currently active entity
 */
export function getActiveEntity(state: CombatState): CombatEntity | null {
  if (!state.activeEntityId) return null;
  return state.entities[state.activeEntityId] ?? null;
}

/**
 * Get entities in initiative order
 */
export function getEntitiesInInitiativeOrder(
  state: CombatState
): CombatEntity[] {
  return state.initiativeOrder
    .map((id) => state.entities[id])
    .filter((e): e is CombatEntity => e !== undefined);
}

/**
 * Get entities by faction
 */
export function getEntitiesByFaction(
  state: CombatState,
  faction: "ally" | "enemy" | "neutral"
): CombatEntity[] {
  return Object.values(state.entities).filter((e) => e.faction === faction);
}

/**
 * Get entity at a specific hex position
 */
export function getEntityAtHex(
  state: CombatState,
  position: HexPosition
): CombatEntity | null {
  const key = hexKey(position);
  const entityId = state.grid.entityPositions[key];
  if (!entityId) return null;
  return state.entities[entityId] ?? null;
}

/**
 * Check if a hex is occupied
 */
export function isHexOccupied(
  state: CombatState,
  position: HexPosition
): boolean {
  return hexKey(position) in state.grid.entityPositions;
}

/**
 * Add a log entry to combat state
 */
export function addLogEntry(
  state: CombatState,
  entry: Omit<CombatLogEntry, "id" | "timestamp" | "round" | "turnIndex">
): CombatLogEntry {
  const logEntry: CombatLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    round: state.round,
    turnIndex: state.turnIndex,
  };
  state.log.push(logEntry);
  return logEntry;
}
