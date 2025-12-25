/**
 * Authoritative Combat System Types
 *
 * These types define the server-authoritative combat state machine.
 * All combat logic is enforced by the Durable Object - clients are untrusted.
 */

import { WoundType, WoundCounts, StatusKey } from "./wounds";

// Re-export for convenience
export { WoundType, WoundCounts, StatusKey };

// ═══════════════════════════════════════════════════════════════════════════
// COMBAT PHASES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Combat phase state machine:
 * setup -> initiative-rolling -> initiative -> active-turn <-> reaction-interrupt -> resolution -> active-turn
 *                                                                                                -> completed
 */
export type CombatPhase =
  | "setup"              // Combat is being configured, entities being added
  | "initiative-rolling" // Players manually rolling initiative
  | "initiative"         // Initiative order computed and displayed
  | "active-turn"        // Entity is taking their turn
  | "reaction-interrupt" // Reactions have been declared, awaiting resolution
  | "resolution"         // Resolving reactions and pending action
  | "completed";         // Combat has ended

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Entity controller - who controls this entity
 * 'gm' = Game Master controls
 * 'player:${userId}' = Specific player controls
 */
export type EntityController = "gm" | `player:${string}`;

/**
 * Entity faction for grid placement and targeting
 */
export type EntityFaction = "ally" | "enemy";

/**
 * Status effect on an entity during combat
 */
export interface CombatStatusEffect {
  key: StatusKey;
  stacks: number;
  duration: number | null;        // Rounds remaining, null = permanent
  tickDamage?: {
    woundType: WoundType;
    amount: number;
  };
}

/**
 * Combat entity - a participant in combat
 */
export interface CombatEntity {
  id: string;
  name: string;
  controller: EntityController;
  faction: EntityFaction;

  // Skills map (skill name -> modifier value)
  skills: Record<string, number>;
  initiativeSkill: string;  // Key into skills map used for initiative

  // Resources
  energy: {
    current: number;
    max: number;
  };
  ap: {
    current: number;
    max: number;
  };
  tier: number;  // Used for energy gain calculations

  // Combat state
  reaction: {
    available: boolean;  // Can declare a reaction this round
  };
  statusEffects: CombatStatusEffect[];
  wounds: WoundCounts;
  alive: boolean;

  // Metadata
  bestiaryEntryId?: string;  // Reference to bestiary for NPC stats

  // Monster numbering (for duplicate monsters)
  displayName?: string;          // "Goblin 1", "Goblin 2" for numbered monsters
  baseNameForNumbering?: string; // Original "Goblin" for auto-numbering

  // Auto-roll settings for monsters
  autoRollDefense?: boolean;     // Auto-roll defense in skill contests
  defaultDefenseSkill?: string;  // Default skill for auto-defense
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIATIVE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initiative entry for sorting
 * Tiebreakers: roll -> skillValue -> currentEnergy -> entityId
 */
export interface InitiativeEntry {
  entityId: string;
  roll: number;           // d100 or similar roll result
  skillValue: number;     // Initiative skill modifier
  currentEnergy: number;  // Energy at time of roll
  groupId?: string;       // For group initiative mode
}

/**
 * Initiative mode toggle
 */
export type InitiativeMode = "individual" | "group";

// ═══════════════════════════════════════════════════════════════════════════
// ROLL & DICE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Raw dice roll submitted by client
 * Server validates these values are within valid range
 */
export interface DiceRoll {
  diceCount: number;      // Number of dice rolled
  diceSize: number;       // Size of dice (e.g., 100 for d100)
  rawValues: number[];    // Raw dice values from client
  keepHighest: boolean;   // True = keep highest, False = keep lowest
  modifier: number;       // Skill modifier to add
}

/**
 * Server-validated roll data
 */
export interface RollData {
  skill: string;
  modifier: number;
  diceCount: number;
  keepHighest: boolean;
  rawDice: number[];      // Client-provided values
  selectedDie: number;    // The die value used (highest or lowest)
  total: number;          // Final calculated total
  audit: string;          // Human-readable audit trail
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION & REACTION TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Action types that can trigger reactions
 */
export type ActionType =
  | "attack"
  | "spell"
  | "ability"
  | "movement"
  | "item"
  | "other";

/**
 * Pending action awaiting resolution
 * Created when entity declares an action during their turn
 */
export interface PendingAction {
  actionId: string;
  type: ActionType;
  sourceEntityId: string;
  targetEntityId?: string;
  rollData?: RollData;
  apCost: number;
  energyCost: number;
  interruptible: boolean;  // Can reactions be declared against this?
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Reaction types
 */
export type ReactionType =
  | "parry"
  | "dodge"
  | "counterspell"
  | "opportunity"
  | "other";

/**
 * Pending reaction declared against an action
 */
export interface PendingReaction {
  reactionId: string;
  entityId: string;
  type: ReactionType;
  targetActionId: string;  // The action this reaction targets
  skill?: string;
  rollData?: RollData;
  apCost: number;
  energyCost: number;
  timestamp: string;

  // Effects to apply if reaction succeeds
  effects?: ReactionEffect[];
}

/**
 * Effect to apply from a successful reaction
 */
export interface ReactionEffect {
  type: "cancel_action" | "modify_action" | "apply_wounds" | "apply_status" | "reduce_damage";
  targetEntityId: string;
  data?: {
    wounds?: WoundCounts;
    statusKey?: StatusKey;
    statusStacks?: number;
    statusDuration?: number;
    damageReduction?: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBAT LOG TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Combat log entry types
 */
export type CombatLogType =
  | "combat_started"
  | "combat_ended"
  | "round_started"
  | "turn_started"
  | "turn_ended"
  | "action_declared"
  | "action_resolved"
  | "action_cancelled"
  | "reaction_declared"
  | "reaction_resolved"
  | "wounds_applied"
  | "status_applied"
  | "status_removed"
  | "status_tick"
  | "resources_updated"
  | "gm_override";

/**
 * Combat log entry
 */
export interface CombatLogEntry {
  id: string;
  timestamp: string;
  type: CombatLogType;
  sourceEntityId?: string;
  targetEntityId?: string;
  data?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER CONNECTION TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Player connection state during combat
 */
export interface PlayerCombatState {
  playerId: string;
  connectionId: string;
  controlledEntities: string[];  // Entity IDs this player controls
  connected: boolean;
  lastSeen: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBAT STATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Full combat state - server-authoritative
 * This is the single source of truth for combat
 */
export interface CombatState {
  combatId: string;
  campaignId: string;

  // Phase state machine
  phase: CombatPhase;

  // Round/Turn tracking
  round: number;
  turnIndex: number;

  // Initiative
  initiativeOrder: string[];        // Entity IDs in initiative order
  activeEntityId: string | null;    // Currently acting entity
  initiativeMode: InitiativeMode;
  initiativeRolls: Record<string, InitiativeEntry>;  // Stored for reference

  // Entities
  entities: Record<string, CombatEntity>;

  // Grid positions
  grid: {
    allies: string[];   // Entity IDs
    enemies: string[];  // Entity IDs
  };

  // Connected players
  players: Record<string, PlayerCombatState>;

  // Pending actions/reactions
  pendingAction: PendingAction | null;
  pendingReactions: PendingReaction[];

  // Event log
  log: CombatLogEntry[];

  // Optimistic concurrency control
  version: number;

  // Timestamps
  startedAt: string;
  lastUpdatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// GM OVERRIDE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GM override action types
 */
export type GmOverrideType =
  | "modify_initiative"
  | "adjust_ap"
  | "adjust_energy"
  | "force_reaction"
  | "cancel_reaction"
  | "skip_entity"
  | "end_turn"
  | "add_status"
  | "remove_status"
  | "modify_wounds"
  | "set_phase"
  | "end_combat";

/**
 * GM override payload
 */
export interface GmOverride {
  type: GmOverrideType;
  gmId: string;
  targetEntityId?: string;
  data?: Record<string, unknown>;
  reason?: string;  // Optional reason for audit log
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sort initiative entries with proper tiebreakers
 * Tiebreakers in order:
 * 1. Roll (descending)
 * 2. Skill value (descending)
 * 3. Current energy (descending)
 * 4. Entity ID (alphabetical - deterministic)
 */
export function sortInitiative(entries: InitiativeEntry[]): string[] {
  return [...entries]
    .sort((a, b) => {
      // Primary: Initiative roll (descending)
      if (a.roll !== b.roll) return b.roll - a.roll;

      // Tiebreaker 1: Initiative skill value (descending)
      if (a.skillValue !== b.skillValue) return b.skillValue - a.skillValue;

      // Tiebreaker 2: Current energy (descending)
      if (a.currentEnergy !== b.currentEnergy) return b.currentEnergy - a.currentEnergy;

      // Tiebreaker 3: Entity ID (alphabetical for determinism)
      return a.entityId.localeCompare(b.entityId);
    })
    .map(e => e.entityId);
}

/**
 * Sort initiative entries with group mode
 * Groups entities by faction, uses highest roll in group
 */
export function sortGroupInitiative(
  entries: InitiativeEntry[],
  entities: Record<string, CombatEntity>
): string[] {
  // Group entries by faction
  const groups: Record<EntityFaction, InitiativeEntry[]> = {
    ally: [],
    enemy: []
  };

  for (const entry of entries) {
    const entity = entities[entry.entityId];
    if (entity) {
      groups[entity.faction].push(entry);
    }
  }

  // Find best entry in each group
  const groupBests: { faction: EntityFaction; bestEntry: InitiativeEntry }[] = [];

  for (const [faction, factionEntries] of Object.entries(groups) as [EntityFaction, InitiativeEntry[]][]) {
    if (factionEntries.length === 0) continue;

    const sorted = [...factionEntries].sort((a, b) => {
      if (a.roll !== b.roll) return b.roll - a.roll;
      if (a.skillValue !== b.skillValue) return b.skillValue - a.skillValue;
      if (a.currentEnergy !== b.currentEnergy) return b.currentEnergy - a.currentEnergy;
      return a.entityId.localeCompare(b.entityId);
    });

    groupBests.push({ faction, bestEntry: sorted[0] });
  }

  // Sort groups by their best entry
  groupBests.sort((a, b) => {
    const aE = a.bestEntry;
    const bE = b.bestEntry;
    if (aE.roll !== bE.roll) return bE.roll - aE.roll;
    if (aE.skillValue !== bE.skillValue) return bE.skillValue - aE.skillValue;
    if (aE.currentEnergy !== bE.currentEnergy) return bE.currentEnergy - aE.currentEnergy;
    return aE.entityId.localeCompare(bE.entityId);
  });

  // Build final order: entities in order of their group, sorted within group
  const result: string[] = [];

  for (const { faction } of groupBests) {
    const factionEntries = groups[faction];
    const sorted = sortInitiative(factionEntries);
    result.push(...sorted);
  }

  return result;
}

/**
 * Validate a dice roll from client
 * Returns null if valid, error message if invalid
 */
export function validateDiceRoll(roll: DiceRoll): string | null {
  if (roll.diceCount < 1 || roll.diceCount > 20) {
    return "Dice count must be between 1 and 20";
  }

  if (roll.diceSize < 2 || roll.diceSize > 100) {
    return "Dice size must be between 2 and 100";
  }

  if (roll.rawValues.length !== roll.diceCount) {
    return "Raw values count does not match dice count";
  }

  for (const value of roll.rawValues) {
    if (value < 1 || value > roll.diceSize) {
      return `Dice value ${value} is out of range [1, ${roll.diceSize}]`;
    }
    if (!Number.isInteger(value)) {
      return "Dice values must be integers";
    }
  }

  return null;
}

/**
 * Calculate roll result from validated dice
 */
export function calculateRollResult(roll: DiceRoll, skill: string, skillModifier: number): RollData {
  const selectedDie = roll.keepHighest
    ? Math.max(...roll.rawValues)
    : Math.min(...roll.rawValues);

  const total = selectedDie + roll.modifier + skillModifier;

  const audit = `${roll.diceCount}d${roll.diceSize} [${roll.rawValues.join(", ")}] ` +
    `${roll.keepHighest ? "highest" : "lowest"}=${selectedDie} ` +
    `+ ${roll.modifier} (modifier) + ${skillModifier} (${skill}) = ${total}`;

  return {
    skill,
    modifier: skillModifier,
    diceCount: roll.diceCount,
    keepHighest: roll.keepHighest,
    rawDice: roll.rawValues,
    selectedDie,
    total,
    audit
  };
}

/**
 * Check if an entity can declare a reaction
 */
export function canDeclareReaction(
  state: CombatState,
  entityId: string
): { allowed: boolean; reason?: string } {
  const entity = state.entities[entityId];

  if (!entity) {
    return { allowed: false, reason: "Entity not found" };
  }

  if (!entity.alive) {
    return { allowed: false, reason: "Entity is not alive" };
  }

  if (!entity.reaction.available) {
    return { allowed: false, reason: "Reaction already used this round" };
  }

  if (state.activeEntityId === entityId) {
    return { allowed: false, reason: "Cannot react during your own turn" };
  }

  if (state.phase !== "active-turn" && state.phase !== "reaction-interrupt") {
    return { allowed: false, reason: "Cannot declare reactions in current phase" };
  }

  if (!state.pendingAction) {
    return { allowed: false, reason: "No pending action to react to" };
  }

  if (!state.pendingAction.interruptible) {
    return { allowed: false, reason: "Pending action cannot be interrupted" };
  }

  return { allowed: true };
}

/**
 * Check if an entity can take an action
 */
export function canTakeAction(
  state: CombatState,
  entityId: string,
  controllerId: string,
  apCost: number,
  energyCost: number
): { allowed: boolean; reason?: string } {
  if (state.phase !== "active-turn") {
    return { allowed: false, reason: "Not in active-turn phase" };
  }

  if (state.activeEntityId !== entityId) {
    return { allowed: false, reason: "Not your turn" };
  }

  const entity = state.entities[entityId];

  if (!entity) {
    return { allowed: false, reason: "Entity not found" };
  }

  if (!entity.alive) {
    return { allowed: false, reason: "Entity is not alive" };
  }

  // Check controller matches
  if (entity.controller !== controllerId && !controllerId.startsWith("gm")) {
    return { allowed: false, reason: "You do not control this entity" };
  }

  if (entity.ap.current < apCost) {
    return { allowed: false, reason: `Insufficient AP (have ${entity.ap.current}, need ${apCost})` };
  }

  if (entity.energy.current < energyCost) {
    return { allowed: false, reason: `Insufficient energy (have ${entity.energy.current}, need ${energyCost})` };
  }

  return { allowed: true };
}

/**
 * Create a new combat log entry
 */
export function createLogEntry(
  type: CombatLogType,
  sourceEntityId?: string,
  targetEntityId?: string,
  data?: Record<string, unknown>
): CombatLogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    sourceEntityId,
    targetEntityId,
    data
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL CONTEST TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Critical success tiers based on ratio of winner to loser total
 * - normal: Winner's total < 1.5x loser's
 * - wicked: Winner's total >= 1.5x loser's (50%+ higher)
 * - vicious: Winner's total >= 2x loser's (100%+ higher)
 * - brutal: Winner's total >= 3x loser's (200%+ higher)
 */
export type CriticalTier =
  | "normal"
  | "wicked"
  | "vicious"
  | "brutal";

/**
 * Contest outcome with winner and critical tier
 */
export interface ContestOutcome {
  winnerId: string | null;  // null = tie
  loserId: string | null;
  winnerTotal: number;
  loserTotal: number;
  criticalTier: CriticalTier;
  isTie: boolean;
}

/**
 * Skill contest request - awaiting opponent's response
 */
export interface SkillContestRequest {
  contestId: string;
  initiatorId: string;          // Entity initiating the contest
  initiatorSkill: string;       // Skill being used
  initiatorRoll: RollData;      // Already-rolled data
  targetId: string;             // Target entity
  suggestedDefenseSkill?: string; // GM/system suggested skill
  autoRollDefense: boolean;     // Whether to auto-roll for target
  gmCanResolve?: boolean;       // GM may resolve for player-controlled target
  status: "pending" | "awaiting_defense" | "resolved";
  createdAt: string;
  resolvedAt?: string;
  outcome?: ContestOutcome;
  defenderSkill?: string;       // Skill used for defense
  defenderRoll?: RollData;      // Defender's roll data
}

/**
 * Skill check request (GM-initiated, against target number)
 */
export interface SkillCheckRequest {
  checkId: string;
  requesterId: string;          // GM who requested
  targetPlayerId: string;       // Player who must roll
  targetEntityId: string;       // Entity making the roll
  skill: string;                // Required skill
  targetNumber?: number;        // Optional DC (GM sees result either way)
  diceCount?: number;           // Suggested dice count for the roll
  keepHighest?: boolean;        // Suggested keep highest/lowest for the roll
  gmCanResolve?: boolean;       // GM may resolve for player-controlled roller
  status: "pending" | "rolled" | "acknowledged";
  rollData?: RollData;          // Filled when player rolls
  createdAt: string;
  resolvedAt?: string;
}
