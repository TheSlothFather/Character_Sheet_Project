/**
 * Combat V2 - Wound Tracker
 *
 * Tracks 8 wound types and calculates their penalties.
 * Wound penalties affect various combat capabilities.
 */

import type { DamageType } from "../types/damage";
import type { WoundCounts, FullEntity } from "../types/entity";
import { EMPTY_WOUNDS } from "../types/entity";

// ═══════════════════════════════════════════════════════════════════════════
// WOUND DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface WoundDefinition {
  key: DamageType;
  label: string;
  description: string;
  penaltyDescription: string;
  color: string;
  icon: string;
}

export const WOUND_DEFINITIONS: Record<DamageType, WoundDefinition> = {
  blunt: {
    key: "blunt",
    label: "Blunt",
    description: "Crushing trauma from blunt force",
    penaltyDescription: "+1 movement energy cost per wound",
    color: "#8B4513",
    icon: "💢",
  },
  burn: {
    key: "burn",
    label: "Burn",
    description: "Thermal damage from fire or heat",
    penaltyDescription: "-3 physical skill penalty per wound",
    color: "#FF4500",
    icon: "🔥",
  },
  freeze: {
    key: "freeze",
    label: "Freeze",
    description: "Cold damage causing numbness and frostbite",
    penaltyDescription: "-1 AP per wound",
    color: "#00BFFF",
    icon: "❄️",
  },
  laceration: {
    key: "laceration",
    label: "Laceration",
    description: "Cutting wounds causing blood loss",
    penaltyDescription: "-3 energy per round per wound (bleeding)",
    color: "#DC143C",
    icon: "🩸",
  },
  mental: {
    key: "mental",
    label: "Mental",
    description: "Psychic damage affecting the mind",
    penaltyDescription: "-3 mental skill penalty per wound",
    color: "#9932CC",
    icon: "🧠",
  },
  necrosis: {
    key: "necrosis",
    label: "Necrosis",
    description: "Death and decay damage",
    penaltyDescription: "-3 max energy per wound",
    color: "#2F4F4F",
    icon: "💀",
  },
  holy_spiritual: {
    key: "holy_spiritual",
    label: "Holy Spiritual",
    description: "Divine damage affecting the soul",
    penaltyDescription: "-3 spiritual skill penalty per wound",
    color: "#FFD700",
    icon: "✨",
  },
  unholy_spiritual: {
    key: "unholy_spiritual",
    label: "Unholy Spiritual",
    description: "Profane damage corrupting the soul",
    penaltyDescription: "-3 spiritual skill penalty per wound",
    color: "#4B0082",
    icon: "👁️",
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// WOUND PENALTY SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

export interface WoundPenaltySummary {
  /** Multiplier for movement energy cost (1 + blunt count) */
  movementEnergyMultiplier: number;
  /** Penalty to physical skills (-3 per burn wound) */
  physicalSkillPenalty: number;
  /** Penalty to mental skills (-3 per mental wound) */
  mentalSkillPenalty: number;
  /** Penalty to spiritual skills (-3 per holy + unholy spiritual wound) */
  spiritualSkillPenalty: number;
  /** Reduction to max AP (-1 per freeze wound) */
  actionPointPenalty: number;
  /** Energy lost per round (-3 per laceration wound) */
  energyPerRoundPenalty: number;
  /** Reduction to max energy (-3 per necrosis wound) */
  maxEnergyPenalty: number;
}

/**
 * Calculate all wound penalties from wound counts.
 */
export function computeWoundPenalties(wounds: WoundCounts): WoundPenaltySummary {
  const blunt = wounds.blunt || 0;
  const burn = wounds.burn || 0;
  const freeze = wounds.freeze || 0;
  const laceration = wounds.laceration || 0;
  const mental = wounds.mental || 0;
  const necrosis = wounds.necrosis || 0;
  const holySpiritual = wounds.holy_spiritual || 0;
  const unholySpiritual = wounds.unholy_spiritual || 0;

  // Spiritual penalty combines both holy and unholy
  const totalSpiritual = holySpiritual + unholySpiritual;

  return {
    movementEnergyMultiplier: 1 + blunt,
    physicalSkillPenalty: -3 * burn,
    mentalSkillPenalty: -3 * mental,
    spiritualSkillPenalty: -3 * totalSpiritual,
    actionPointPenalty: -1 * freeze,
    energyPerRoundPenalty: -3 * laceration,
    maxEnergyPenalty: -3 * necrosis,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// APPLY WOUND PENALTIES TO ENTITY
// ═══════════════════════════════════════════════════════════════════════════

export interface EntityWithPenalties {
  /** Effective max AP after freeze wounds */
  effectiveMaxAP: number;
  /** Effective max energy after necrosis wounds */
  effectiveMaxEnergy: number;
  /** Energy lost this round from laceration */
  bleedingDamage: number;
  /** Skill modifiers after wound penalties */
  skillModifiers: {
    physical: number;
    mental: number;
    spiritual: number;
  };
  /** Movement energy multiplier from blunt wounds */
  movementCostMultiplier: number;
}

/**
 * Calculate effective stats for an entity after wound penalties.
 */
export function getEntityWithPenalties(entity: FullEntity): EntityWithPenalties {
  const penalties = computeWoundPenalties(entity.wounds);

  // Calculate effective max AP (min 1)
  const baseMaxAP = entity.ap.baseMax;
  const effectiveMaxAP = Math.max(1, baseMaxAP + penalties.actionPointPenalty);

  // Calculate effective max energy (min 1)
  const baseMaxEnergy = entity.energy.baseMax;
  const effectiveMaxEnergy = Math.max(1, baseMaxEnergy + penalties.maxEnergyPenalty);

  // Calculate bleeding damage (energy lost per round)
  const bleedingDamage = Math.abs(penalties.energyPerRoundPenalty);

  return {
    effectiveMaxAP,
    effectiveMaxEnergy,
    bleedingDamage,
    skillModifiers: {
      physical: penalties.physicalSkillPenalty,
      mental: penalties.mentalSkillPenalty,
      spiritual: penalties.spiritualSkillPenalty,
    },
    movementCostMultiplier: penalties.movementEnergyMultiplier,
  };
}

/**
 * Apply bleeding damage at the start of a turn.
 * Returns new energy value and audit string.
 */
export function applyBleedingDamage(
  entity: FullEntity
): { newEnergy: number; damage: number; audit: string } {
  const penalties = computeWoundPenalties(entity.wounds);
  const bleedingDamage = Math.abs(penalties.energyPerRoundPenalty);

  if (bleedingDamage === 0) {
    return {
      newEnergy: entity.energy.current,
      damage: 0,
      audit: "",
    };
  }

  const lacerationCount = entity.wounds.laceration || 0;
  const newEnergy = Math.max(0, entity.energy.current - bleedingDamage);

  return {
    newEnergy,
    damage: bleedingDamage,
    audit: `Bleeding: -${bleedingDamage} energy (${lacerationCount} laceration wounds × 3)`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// WOUND MODIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add wounds to an entity's wound counts.
 */
export function addWounds(
  current: WoundCounts,
  toAdd: Partial<WoundCounts>
): WoundCounts {
  const result = { ...current };

  for (const [type, count] of Object.entries(toAdd)) {
    if (count !== undefined && count > 0) {
      const key = type as keyof WoundCounts;
      result[key] = (result[key] || 0) + count;
    }
  }

  return result;
}

/**
 * Remove wounds from an entity's wound counts.
 */
export function removeWounds(
  current: WoundCounts,
  toRemove: Partial<WoundCounts>
): WoundCounts {
  const result = { ...current };

  for (const [type, count] of Object.entries(toRemove)) {
    if (count !== undefined && count > 0) {
      const key = type as keyof WoundCounts;
      result[key] = Math.max(0, (result[key] || 0) - count);
    }
  }

  return result;
}

/**
 * Set wound counts directly (for GM overrides).
 */
export function setWounds(
  current: WoundCounts,
  toSet: Partial<WoundCounts>
): WoundCounts {
  const result = { ...current };

  for (const [type, count] of Object.entries(toSet)) {
    if (count !== undefined) {
      const key = type as keyof WoundCounts;
      result[key] = Math.max(0, count);
    }
  }

  return result;
}

/**
 * Clear all wounds of a specific type.
 */
export function clearWoundType(
  current: WoundCounts,
  type: DamageType
): WoundCounts {
  return {
    ...current,
    [type]: 0,
  };
}

/**
 * Clear all wounds.
 */
export function clearAllWounds(): WoundCounts {
  return { ...EMPTY_WOUNDS };
}

// ═══════════════════════════════════════════════════════════════════════════
// WOUND QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get total wound count across all types.
 */
export function getTotalWounds(wounds: WoundCounts): number {
  return Object.values(wounds).reduce((sum, count) => sum + (count || 0), 0);
}

/**
 * Check if entity has any wounds.
 */
export function hasAnyWounds(wounds: WoundCounts): boolean {
  return getTotalWounds(wounds) > 0;
}

/**
 * Get wound count for a specific type.
 */
export function getWoundCount(wounds: WoundCounts, type: DamageType): number {
  return wounds[type as keyof WoundCounts] || 0;
}

/**
 * Get all non-zero wound types.
 */
export function getNonZeroWoundTypes(wounds: WoundCounts): DamageType[] {
  return Object.entries(wounds)
    .filter(([, count]) => count && count > 0)
    .map(([type]) => type as DamageType);
}

/**
 * Check if entity is critically wounded (total wounds >= threshold).
 */
export function isCriticallyWounded(wounds: WoundCounts, threshold: number = 5): boolean {
  return getTotalWounds(wounds) >= threshold;
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL MODIFIER APPLICATION
// ═══════════════════════════════════════════════════════════════════════════

export type SkillCategory = "physical" | "mental" | "spiritual" | "other";

/**
 * Get the penalty for a skill based on its category.
 */
export function getSkillPenalty(
  wounds: WoundCounts,
  skillCategory: SkillCategory
): number {
  const penalties = computeWoundPenalties(wounds);

  switch (skillCategory) {
    case "physical":
      return penalties.physicalSkillPenalty;
    case "mental":
      return penalties.mentalSkillPenalty;
    case "spiritual":
      return penalties.spiritualSkillPenalty;
    default:
      return 0;
  }
}

/**
 * Apply wound penalty to a skill modifier.
 */
export function applyWoundPenaltyToSkill(
  baseModifier: number,
  wounds: WoundCounts,
  skillCategory: SkillCategory
): number {
  const penalty = getSkillPenalty(wounds, skillCategory);
  return baseModifier + penalty;
}

// ═══════════════════════════════════════════════════════════════════════════
// WOUND SUMMARY FOR UI
// ═══════════════════════════════════════════════════════════════════════════

export interface WoundSummary {
  type: DamageType;
  count: number;
  definition: WoundDefinition;
  penalty: string;
}

/**
 * Get a summary of all wounds for UI display.
 */
export function getWoundSummary(wounds: WoundCounts): WoundSummary[] {
  return Object.entries(wounds)
    .filter(([, count]) => count && count > 0)
    .map(([type, count]) => {
      const damageType = type as DamageType;
      const definition = WOUND_DEFINITIONS[damageType];
      return {
        type: damageType,
        count: count || 0,
        definition,
        penalty: definition.penaltyDescription,
      };
    })
    .sort((a, b) => b.count - a.count);
}
