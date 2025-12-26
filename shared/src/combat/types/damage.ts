/**
 * Combat V2 - Damage Types and Modifiers
 *
 * Defines the 8 damage types and the damage calculation system.
 * Damage pipeline order: Immunity -> Resistance -> Weakness
 */

// ═══════════════════════════════════════════════════════════════════════════
// DAMAGE TYPES (8 total - Spiritual split into Holy/Unholy)
// ═══════════════════════════════════════════════════════════════════════════

export type DamageType =
  | "blunt"
  | "burn"
  | "freeze"
  | "laceration"
  | "mental"
  | "necrosis"
  | "holy_spiritual"
  | "unholy_spiritual";

export const DAMAGE_TYPES: readonly DamageType[] = [
  "blunt",
  "burn",
  "freeze",
  "laceration",
  "mental",
  "necrosis",
  "holy_spiritual",
  "unholy_spiritual",
] as const;

export const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  blunt: "Blunt",
  burn: "Burn",
  freeze: "Freeze",
  laceration: "Laceration",
  mental: "Mental",
  necrosis: "Necrosis",
  holy_spiritual: "Holy Spiritual",
  unholy_spiritual: "Unholy Spiritual",
};

// ═══════════════════════════════════════════════════════════════════════════
// DAMAGE MODIFIERS
// ═══════════════════════════════════════════════════════════════════════════

export type DamageModifierType = "immunity" | "resistance" | "weakness" | "normal";

export interface DamageModifiers {
  immunities: DamageType[];
  resistances: DamageType[];
  weaknesses: DamageType[];
}

export const EMPTY_DAMAGE_MODIFIERS: DamageModifiers = {
  immunities: [],
  resistances: [],
  weaknesses: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// DAMAGE INSTANCE (Input to damage calculation)
// ═══════════════════════════════════════════════════════════════════════════

export interface DamageInstance {
  /** Base damage amount before modifiers */
  amount: number;
  /** Type of damage being dealt */
  type: DamageType;
  /** Entity dealing the damage */
  sourceEntityId: string;
  /** Optional ability/weapon name for logging */
  sourceAbility?: string;
  /** Whether this was a critical hit */
  isCritical: boolean;
  /** Critical tier if applicable */
  criticalTier?: CriticalTier;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL TIERS
// ═══════════════════════════════════════════════════════════════════════════

export type CriticalTier = "normal" | "wicked" | "vicious" | "brutal";

/**
 * Calculate critical tier based on winner/loser ratio in a contest
 * ratio >= 3.0 → brutal
 * ratio >= 2.0 → vicious
 * ratio >= 1.5 → wicked
 * ratio < 1.5 → normal
 */
export function calculateCriticalTier(winnerTotal: number, loserTotal: number): CriticalTier {
  if (loserTotal <= 0) return "brutal";
  const ratio = winnerTotal / loserTotal;
  if (ratio >= 3.0) return "brutal";
  if (ratio >= 2.0) return "vicious";
  if (ratio >= 1.5) return "wicked";
  return "normal";
}

// ═══════════════════════════════════════════════════════════════════════════
// DAMAGE RESULT (Output of damage calculation)
// ═══════════════════════════════════════════════════════════════════════════

export interface DamageResult {
  /** Original damage before modifiers */
  originalAmount: number;
  /** Final damage after immunity/resistance/weakness */
  modifiedAmount: number;
  /** Type of damage dealt */
  damageType: DamageType;
  /** Which modifier was applied */
  modifier: DamageModifierType;
  /** Number of wounds inflicted (for wound-dealing attacks) */
  woundsInflicted: number;
  /** Energy damage dealt */
  energyDamage: number;
  /** Whether the target was defeated (minions) or incapacitated */
  targetDefeated: boolean;
  /** Whether the target fell unconscious */
  targetUnconscious: boolean;
  /** Whether an Endure roll is required */
  requiresEndureRoll: boolean;
  /** Audit trail for debugging */
  audit: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DAMAGE CALCULATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the modifier type for a damage type against an entity's modifiers.
 * Priority: Immunity > Resistance > Weakness > Normal
 */
export function getDamageModifierType(
  damageType: DamageType,
  modifiers: DamageModifiers
): DamageModifierType {
  if (modifiers.immunities.includes(damageType)) return "immunity";
  if (modifiers.resistances.includes(damageType)) return "resistance";
  if (modifiers.weaknesses.includes(damageType)) return "weakness";
  return "normal";
}

/**
 * Apply damage modifiers to a base amount.
 * - Immunity: 0 damage
 * - Resistance: 50% damage (floor)
 * - Weakness: 200% damage
 * - Normal: 100% damage
 */
export function applyDamageModifier(
  amount: number,
  modifierType: DamageModifierType
): number {
  switch (modifierType) {
    case "immunity":
      return 0;
    case "resistance":
      return Math.floor(amount / 2);
    case "weakness":
      return amount * 2;
    case "normal":
    default:
      return amount;
  }
}

/**
 * Create an audit string for damage calculation
 */
export function createDamageAudit(
  original: number,
  modified: number,
  damageType: DamageType,
  modifier: DamageModifierType
): string {
  const modifierText = {
    immunity: "IMMUNE",
    resistance: "resisted (50%)",
    weakness: "WEAK (200%)",
    normal: "",
  }[modifier];

  if (modifier === "normal") {
    return `${original} ${damageType} damage`;
  }
  return `${original} ${damageType} → ${modified} (${modifierText})`;
}
