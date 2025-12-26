/**
 * Combat V2 - Ildakar Channeling Types
 *
 * Multi-turn spell channeling system for Ildakar (mages).
 * Spells are built from 6 aspects with costs: [1, 9, 27, 57, 99, 153] per tier.
 */

import type { DamageType } from "./damage";
import type { WoundCounts } from "./entity";

// ═══════════════════════════════════════════════════════════════════════════
// SPELL ASPECTS
// ═══════════════════════════════════════════════════════════════════════════

export type SpellAspectName =
  | "intensity"
  | "area"
  | "range"
  | "duration"
  | "origins"
  | "compound";

export interface SpellAspect {
  name: SpellAspectName;
  tier: number; // 1-6
}

/**
 * Cost per aspect tier: [0, 1, 9, 27, 57, 99, 153]
 * Index 0 is unused, tiers are 1-6
 */
export const ASPECT_TIER_COSTS: readonly number[] = [0, 1, 9, 27, 57, 99, 153];

/**
 * Get cost for a specific aspect tier
 */
export function getAspectCost(tier: number): number {
  if (tier < 1 || tier > 6) return 0;
  return ASPECT_TIER_COSTS[tier];
}

// ═══════════════════════════════════════════════════════════════════════════
// SPELL TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

export interface SpellTemplate {
  /** Unique identifier */
  id: string;
  /** Spell name */
  name: string;
  /** Primary faculty (Thermomancy, etc.) */
  primaryFaculty: string;
  /** Optional secondary faculty for resonance */
  secondaryFaculty?: string;
  /** Tier of primary faculty (1-6) */
  primaryTier: number;
  /** Tier of secondary faculty (1-6) */
  secondaryTier?: number;
  /** Aspect configuration */
  aspects: SpellAspect[];
  /** Primary damage type (if any) */
  damageType?: DamageType;
  /** Status effects to apply */
  statusEffects?: SpellStatusEffect[];
  /** Description for logging */
  description?: string;
  /** Total cost (Energy = AP for Ildakar spells) */
  totalCost: number;
}

export interface SpellStatusEffect {
  statusKey: string;
  stacks: number;
  duration: number | null;
  applyTo: "target" | "area" | "self";
}

/**
 * Calculate total spell cost from aspects.
 * For Ildakar, Energy cost = AP cost = sum of all aspect costs.
 */
export function calculateSpellCost(aspects: SpellAspect[]): number {
  let total = 0;
  for (const aspect of aspects) {
    total += getAspectCost(aspect.tier);
  }
  return total;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANNELING STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface ChannelingProgress {
  /** Spell being channeled */
  spellTemplate: SpellTemplate;
  /** Total Energy channeled so far */
  energyChanneled: number;
  /** Total AP channeled so far */
  apChanneled: number;
  /** Number of turns spent channeling */
  turnsChanneled: number;
  /** When channeling started */
  startedAt: string;
}

/**
 * Calculate intensity thresholds for a channeling spell.
 * Thresholds = Total / Intensity
 */
export interface IntensityThresholds {
  /** Energy threshold per intensity level */
  energyThreshold: number;
  /** AP threshold per intensity level */
  apThreshold: number;
  /** Current intensity level achieved */
  currentIntensity: number;
  /** Maximum intensity possible with total channeled */
  maxIntensity: number;
}

export function calculateIntensityThresholds(
  channeling: ChannelingProgress
): IntensityThresholds {
  const intensityAspect = channeling.spellTemplate.aspects.find(
    (a) => a.name === "intensity"
  );
  const intensityTier = intensityAspect?.tier ?? 1;

  // Threshold = Total required / Intensity tier
  const totalRequired = channeling.spellTemplate.totalCost;
  const energyThreshold = Math.ceil(totalRequired / intensityTier);
  const apThreshold = Math.ceil(totalRequired / intensityTier);

  // Current intensity = how many thresholds we've crossed
  const currentEnergyIntensity = Math.floor(
    channeling.energyChanneled / energyThreshold
  );
  const currentAPIntensity = Math.floor(channeling.apChanneled / apThreshold);
  const currentIntensity = Math.min(currentEnergyIntensity, currentAPIntensity);

  // Max intensity is the tier of the intensity aspect
  const maxIntensity = intensityTier;

  return {
    energyThreshold,
    apThreshold,
    currentIntensity,
    maxIntensity,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANNELING COMPLETION
// ═══════════════════════════════════════════════════════════════════════════

export interface ChannelingResult {
  /** Whether the spell was successfully released */
  success: boolean;
  /** Total Energy channeled */
  totalEnergy: number;
  /** Total AP channeled */
  totalAP: number;
  /** Final intensity achieved */
  finalIntensity: number;
  /** Whether spell was interrupted */
  interrupted: boolean;
  /** Blowback damage if interrupted */
  blowback?: BlowbackResult;
}

/**
 * Check if channeling is complete (enough Energy and AP channeled)
 */
export function isChannelingComplete(channeling: ChannelingProgress): boolean {
  const required = channeling.spellTemplate.totalCost;
  return (
    channeling.energyChanneled >= required && channeling.apChanneled >= required
  );
}

/**
 * Calculate remaining resources needed to complete channeling
 */
export function getRemainingChannelingCost(
  channeling: ChannelingProgress
): { energy: number; ap: number } {
  const required = channeling.spellTemplate.totalCost;
  return {
    energy: Math.max(0, required - channeling.energyChanneled),
    ap: Math.max(0, required - channeling.apChanneled),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOWBACK (Interrupted Channeling)
// ═══════════════════════════════════════════════════════════════════════════

export interface BlowbackResult {
  /** Type of wound inflicted */
  woundType: DamageType;
  /** Number of wounds inflicted */
  woundCount: number;
  /** Energy damage to caster */
  energyDamage: number;
  /** Audit string for logging */
  audit: string;
}

/**
 * Calculate blowback damage when channeling is interrupted.
 * Wounds scale with channeled Energy (1 wound per 20 Energy).
 * Damage type matches the spell's damage type (or mental if none).
 */
export function calculateBlowback(channeling: ChannelingProgress): BlowbackResult {
  const damageType = channeling.spellTemplate.damageType ?? "mental";
  const woundCount = Math.ceil(channeling.energyChanneled / 20);
  const energyDamage = channeling.energyChanneled;

  return {
    woundType: damageType,
    woundCount,
    energyDamage,
    audit: `Blowback: ${woundCount} ${damageType} wounds, ${energyDamage} energy damage (channeled ${channeling.energyChanneled} energy)`,
  };
}

/**
 * Apply blowback wounds to a wound count
 */
export function applyBlowbackWounds(
  wounds: WoundCounts,
  blowback: BlowbackResult
): WoundCounts {
  return {
    ...wounds,
    [blowback.woundType]: (wounds[blowback.woundType as keyof WoundCounts] || 0) + blowback.woundCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANNELING VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ChannelValidationResult {
  valid: boolean;
  reason?: string;
  insufficientAP?: boolean;
  insufficientEnergy?: boolean;
  alreadyChanneling?: boolean;
  notChanneling?: boolean;
}

/**
 * Validate that an entity can start channeling a spell
 */
export function validateStartChanneling(
  currentAP: number,
  currentEnergy: number,
  channelAmount: { ap: number; energy: number },
  existingChanneling: ChannelingProgress | undefined
): ChannelValidationResult {
  if (existingChanneling) {
    return {
      valid: false,
      reason: "Already channeling a spell",
      alreadyChanneling: true,
    };
  }
  if (currentAP < channelAmount.ap) {
    return {
      valid: false,
      reason: `Insufficient AP (have ${currentAP}, need ${channelAmount.ap})`,
      insufficientAP: true,
    };
  }
  if (currentEnergy < channelAmount.energy) {
    return {
      valid: false,
      reason: `Insufficient Energy (have ${currentEnergy}, need ${channelAmount.energy})`,
      insufficientEnergy: true,
    };
  }
  return { valid: true };
}

/**
 * Validate that an entity can continue channeling
 */
export function validateContinueChanneling(
  currentAP: number,
  currentEnergy: number,
  channelAmount: { ap: number; energy: number },
  existingChanneling: ChannelingProgress | undefined
): ChannelValidationResult {
  if (!existingChanneling) {
    return {
      valid: false,
      reason: "Not currently channeling a spell",
      notChanneling: true,
    };
  }
  if (currentAP < channelAmount.ap) {
    return {
      valid: false,
      reason: `Insufficient AP (have ${currentAP}, need ${channelAmount.ap})`,
      insufficientAP: true,
    };
  }
  if (currentEnergy < channelAmount.energy) {
    return {
      valid: false,
      reason: `Insufficient Energy (have ${currentEnergy}, need ${channelAmount.energy})`,
      insufficientEnergy: true,
    };
  }
  return { valid: true };
}

/**
 * Validate that an entity can release a channeled spell
 */
export function validateReleaseSpell(
  existingChanneling: ChannelingProgress | undefined
): ChannelValidationResult {
  if (!existingChanneling) {
    return {
      valid: false,
      reason: "Not currently channeling a spell",
      notChanneling: true,
    };
  }
  if (!isChannelingComplete(existingChanneling)) {
    const remaining = getRemainingChannelingCost(existingChanneling);
    return {
      valid: false,
      reason: `Channeling incomplete (need ${remaining.energy} more Energy, ${remaining.ap} more AP)`,
    };
  }
  return { valid: true };
}
