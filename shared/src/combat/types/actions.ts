/**
 * Combat V2 - Action Types and Costs
 *
 * Defines all action types and their AP/Energy costs.
 * Weapon costs derived from weapons.csv.
 */

import type { DamageType } from "./damage";
import type { HexPosition } from "./entity";

// ═══════════════════════════════════════════════════════════════════════════
// ACTION CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

export type ActionCategory =
  | "movement"
  | "melee_martial"
  | "ranged_martial"
  | "psionic"
  | "divine"
  | "ildakar"
  | "item"
  | "reaction"
  | "other";

// ═══════════════════════════════════════════════════════════════════════════
// WEAPON CATEGORIES (from weapons.csv)
// ═══════════════════════════════════════════════════════════════════════════

export type WeaponCategory =
  | "small_blades"
  | "medium_blades"
  | "large_blades"
  | "small_bearded"
  | "large_bearded"
  | "polearms"
  | "long_ranged"
  | "thrown"
  | "small_blunt"
  | "large_blunt"
  | "flexible"
  | "unarmed";

export interface WeaponCosts {
  energy: number;
  ap: number;
  damage: number;
  damageType: "sharp" | "blunt" | "mixed";
  rangeMin: number;
  rangeMax: number;
  twoHanded: boolean;
}

/**
 * Base costs per weapon category from weapons.csv
 */
export const WEAPON_CATEGORY_COSTS: Record<WeaponCategory, WeaponCosts> = {
  small_blades: { energy: 1, ap: 1, damage: 3, damageType: "sharp", rangeMin: 0, rangeMax: 1, twoHanded: false },
  medium_blades: { energy: 2, ap: 2, damage: 7, damageType: "sharp", rangeMin: 1, rangeMax: 1, twoHanded: false },
  large_blades: { energy: 3, ap: 3, damage: 12, damageType: "sharp", rangeMin: 1, rangeMax: 2, twoHanded: true },
  small_bearded: { energy: 1, ap: 1, damage: 3, damageType: "sharp", rangeMin: 1, rangeMax: 1, twoHanded: false },
  large_bearded: { energy: 3, ap: 3, damage: 12, damageType: "sharp", rangeMin: 1, rangeMax: 2, twoHanded: true },
  polearms: { energy: 3, ap: 3, damage: 15, damageType: "sharp", rangeMin: 2, rangeMax: 3, twoHanded: true },
  long_ranged: { energy: 3, ap: 3, damage: 15, damageType: "sharp", rangeMin: 1, rangeMax: 30, twoHanded: true },
  thrown: { energy: 1, ap: 1, damage: 5, damageType: "mixed", rangeMin: 1, rangeMax: 1, twoHanded: false },
  small_blunt: { energy: 2, ap: 2, damage: 7, damageType: "blunt", rangeMin: 0, rangeMax: 1, twoHanded: false },
  large_blunt: { energy: 3, ap: 3, damage: 12, damageType: "blunt", rangeMin: 1, rangeMax: 2, twoHanded: true },
  flexible: { energy: 2, ap: 2, damage: 5, damageType: "mixed", rangeMin: 1, rangeMax: 3, twoHanded: false },
  unarmed: { energy: 1, ap: 1, damage: 2, damageType: "blunt", rangeMin: 0, rangeMax: 1, twoHanded: false },
};

// ═══════════════════════════════════════════════════════════════════════════
// ACTION COST
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionCost {
  ap: number;
  energy: number;
  /** For divine intervention */
  divineInterventionPoints?: number;
  /** Whether this action uses the entity's reaction */
  usesReaction?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// REACTION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ReactionType =
  | "parry"
  | "dodge"
  | "counterspell"
  | "opportunity"
  | "counter"
  | "other";

// ═══════════════════════════════════════════════════════════════════════════
// BASE ACTION
// ═══════════════════════════════════════════════════════════════════════════

export interface BaseAction {
  /** Unique action ID */
  id: string;
  /** Action category */
  category: ActionCategory;
  /** Display name */
  name: string;
  /** AP and Energy cost */
  cost: ActionCost;
  /** Whether reactions can be declared against this action */
  interruptible: boolean;
  /** Entity performing the action */
  sourceEntityId: string;
  /** When the action was declared */
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIFIC ACTION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MovementAction extends BaseAction {
  category: "movement";
  /** Destination hex */
  targetHex: HexPosition;
  /** Path of hexes traversed */
  pathHexes: HexPosition[];
  /** Total hexes moved */
  hexesMoved: number;
}

export interface MartialAction extends BaseAction {
  category: "melee_martial" | "ranged_martial";
  /** Target entity */
  targetEntityId: string;
  /** Weapon category used */
  weaponCategory: WeaponCategory;
  /** Skill used for attack roll */
  attackSkill: string;
  /** Damage type dealt */
  damageType: DamageType;
  /** Base damage before modifiers */
  baseDamage: number;
  /** Specific ability being used */
  abilityKey?: string;
}

export interface PsionicAction extends BaseAction {
  category: "psionic";
  /** Target entity (if any) */
  targetEntityId?: string;
  /** Target hex (for area effects) */
  targetHex?: HexPosition;
  /** Psionic ability key */
  abilityKey: string;
  /** Energy cost (variable) */
  energyCost: number;
}

export interface DivineAction extends BaseAction {
  category: "divine";
  /** Target entity (if any) */
  targetEntityId?: string;
  /** Divine intervention ability */
  interventionKey: string;
  /** Divine Intervention Points spent */
  divinePointsSpent: number;
}

export interface IldakarAction extends BaseAction {
  category: "ildakar";
  /** Spell being channeled/released */
  spellTemplateId: string;
  spellName: string;
  /** Whether this is adding to channel or releasing */
  isChanneling: boolean;
  /** Amount of Energy/AP being channeled this turn */
  channelAmount: { ap: number; energy: number };
  /** Target entity (if any) */
  targetEntityId?: string;
  /** Target hex (for area effects) */
  targetHex?: HexPosition;
}

export interface ItemAction extends BaseAction {
  category: "item";
  /** Item being used */
  itemKey: string;
  /** Target entity (if any) */
  targetEntityId?: string;
}

export interface ReactionAction extends BaseAction {
  category: "reaction";
  /** Type of reaction */
  reactionType: ReactionType;
  /** Action being reacted to */
  targetActionId: string;
  /** Skill used for reaction roll (if any) */
  reactionSkill?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION UNION TYPE
// ═══════════════════════════════════════════════════════════════════════════

export type CombatAction =
  | MovementAction
  | MartialAction
  | PsionicAction
  | DivineAction
  | IldakarAction
  | ItemAction
  | ReactionAction;

// ═══════════════════════════════════════════════════════════════════════════
// PENDING ACTION (Awaiting resolution)
// ═══════════════════════════════════════════════════════════════════════════

export interface PendingAction {
  action: CombatAction;
  /** Reactions declared against this action */
  reactions: PendingReaction[];
  /** Current resolution status */
  status: "pending" | "resolving" | "resolved" | "cancelled";
}

export interface PendingReaction {
  /** Unique reaction ID */
  reactionId: string;
  /** Entity declaring the reaction */
  entityId: string;
  /** Type of reaction */
  type: ReactionType;
  /** Target action ID */
  targetActionId: string;
  /** Skill used (if any) */
  skill?: string;
  /** Roll data (if rolled) */
  rollData?: RollData;
  /** AP cost */
  apCost: number;
  /** Energy cost */
  energyCost: number;
  /** When declared */
  timestamp: string;
  /** Effects to apply if reaction succeeds */
  effects?: ReactionEffect[];
}

export interface ReactionEffect {
  type: "cancel_action" | "modify_action" | "apply_wounds" | "apply_status" | "reduce_damage";
  targetEntityId: string;
  data?: {
    wounds?: Partial<Record<DamageType, number>>;
    statusKey?: string;
    statusStacks?: number;
    statusDuration?: number;
    damageReduction?: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLL DATA
// ═══════════════════════════════════════════════════════════════════════════

export interface DiceRoll {
  /** Number of dice rolled */
  diceCount: number;
  /** Size of dice (e.g., 100 for d100) */
  diceSize: number;
  /** Raw values rolled */
  rawValues: number[];
  /** Whether to keep highest (true) or lowest (false) */
  keepHighest: boolean;
  /** Skill modifier added */
  modifier: number;
}

export interface RollData {
  /** Skill used */
  skill: string;
  /** Skill modifier */
  modifier: number;
  /** Number of dice */
  diceCount: number;
  /** Keep highest or lowest */
  keepHighest: boolean;
  /** All dice values */
  rawDice: number[];
  /** Selected die value (highest or lowest based on keepHighest) */
  selectedDie: number;
  /** Final total (selectedDie + modifier) */
  total: number;
  /** Audit string for logging */
  audit: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionValidationResult {
  valid: boolean;
  reason?: string;
  insufficientAP?: boolean;
  insufficientEnergy?: boolean;
  invalidTarget?: boolean;
  outOfRange?: boolean;
  wrongPhase?: boolean;
}

/**
 * Validate that an entity has sufficient resources for an action cost
 */
export function validateActionCost(
  currentAP: number,
  currentEnergy: number,
  cost: ActionCost
): ActionValidationResult {
  if (currentAP < cost.ap) {
    return {
      valid: false,
      reason: `Insufficient AP (have ${currentAP}, need ${cost.ap})`,
      insufficientAP: true,
    };
  }
  if (currentEnergy < cost.energy) {
    return {
      valid: false,
      reason: `Insufficient Energy (have ${currentEnergy}, need ${cost.energy})`,
      insufficientEnergy: true,
    };
  }
  return { valid: true };
}
