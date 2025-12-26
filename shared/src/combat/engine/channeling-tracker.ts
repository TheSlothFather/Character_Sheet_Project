/**
 * Combat V2 - Channeling Tracker
 *
 * Manages Ildakar multi-turn spell channeling.
 * Handles accumulation, thresholds, interruption, and blowback.
 */

import type { DamageType } from "../types/damage";
import type { FullEntity, ChannelingState, WoundCounts } from "../types/entity";
import type {
  ChannelingProgress,
  SpellTemplate,
  BlowbackResult,
  IntensityThresholds,
} from "../types/channeling";
import {
  calculateIntensityThresholds,
  calculateBlowback,
  isChannelingComplete,
  getRemainingChannelingCost as getRemaining,
} from "../types/channeling";

// ═══════════════════════════════════════════════════════════════════════════
// CHANNELING LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

export interface StartChannelingResult {
  /** Whether channeling was started successfully */
  success: boolean;
  /** Updated entity with channeling state */
  updatedEntity: FullEntity;
  /** Channeling progress record */
  progress: ChannelingProgress;
  /** Reason for failure if unsuccessful */
  failureReason?: string;
  /** Audit trail */
  audit: string;
}

/**
 * Start channeling a spell.
 * For Ildakar spells, Energy cost = AP cost = totalCost
 */
export function startChanneling(
  entity: FullEntity,
  spell: SpellTemplate,
  initialEnergy: number,
  initialAP: number
): StartChannelingResult {
  // Check if already channeling
  if (entity.channeling) {
    return {
      success: false,
      updatedEntity: entity,
      progress: createEmptyProgress(spell),
      failureReason: "Already channeling a spell",
      audit: `${entity.displayName ?? entity.name} is already channeling ${entity.channeling.spellName}`,
    };
  }

  // Check resources
  if (entity.energy.current < initialEnergy) {
    return {
      success: false,
      updatedEntity: entity,
      progress: createEmptyProgress(spell),
      failureReason: `Insufficient energy: ${entity.energy.current}/${initialEnergy}`,
      audit: `Insufficient energy to begin channeling`,
    };
  }

  if (entity.ap.current < initialAP) {
    return {
      success: false,
      updatedEntity: entity,
      progress: createEmptyProgress(spell),
      failureReason: `Insufficient AP: ${entity.ap.current}/${initialAP}`,
      audit: `Insufficient AP to begin channeling`,
    };
  }

  const startedAt = new Date().toISOString();

  // Create channeling state
  const channelingState: ChannelingState = {
    spellTemplateId: spell.id,
    spellName: spell.name,
    damageType: spell.damageType ?? "mental",
    energyChanneled: initialEnergy,
    apChanneled: initialAP,
    turnsChanneled: 1,
    requiredEnergy: spell.totalCost,
    requiredAP: spell.totalCost,
    intensity: getIntensityTier(spell),
    startedAt,
  };

  // Spend resources
  const updatedEntity: FullEntity = {
    ...entity,
    energy: {
      ...entity.energy,
      current: entity.energy.current - initialEnergy,
    },
    ap: {
      ...entity.ap,
      current: entity.ap.current - initialAP,
    },
    channeling: channelingState,
  };

  // Create progress record
  const progress: ChannelingProgress = {
    spellTemplate: spell,
    energyChanneled: initialEnergy,
    apChanneled: initialAP,
    turnsChanneled: 1,
    startedAt,
  };

  const thresholds = calculateIntensityThresholds(progress);
  const progressPct = getChannelingProgressPercent(progress);

  return {
    success: true,
    updatedEntity,
    progress,
    audit: `${entity.displayName ?? entity.name} begins channeling ${spell.name} ` +
      `(${initialEnergy}E/${initialAP}AP, ${Math.round(progressPct * 100)}% complete)`,
  };
}

/**
 * Get intensity tier from spell template.
 */
function getIntensityTier(spell: SpellTemplate): number {
  const intensityAspect = spell.aspects.find((a) => a.name === "intensity");
  return intensityAspect?.tier ?? 1;
}

/**
 * Create empty progress for error cases.
 */
function createEmptyProgress(spell: SpellTemplate): ChannelingProgress {
  return {
    spellTemplate: spell,
    energyChanneled: 0,
    apChanneled: 0,
    turnsChanneled: 0,
    startedAt: new Date().toISOString(),
  };
}

/**
 * Calculate channeling progress as a percentage.
 */
function getChannelingProgressPercent(progress: ChannelingProgress): number {
  const required = progress.spellTemplate.totalCost;
  if (required <= 0) return 1;

  const energyProgress = progress.energyChanneled / required;
  const apProgress = progress.apChanneled / required;

  // Both must be met, so use minimum
  return Math.min(energyProgress, apProgress, 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTINUE CHANNELING
// ═══════════════════════════════════════════════════════════════════════════

export interface ContinueChannelingResult {
  /** Whether channeling continued successfully */
  success: boolean;
  /** Updated entity */
  updatedEntity: FullEntity;
  /** Updated progress */
  progress: ChannelingProgress;
  /** Whether spell is now ready to release */
  readyToRelease: boolean;
  /** Reason for failure if unsuccessful */
  failureReason?: string;
  /** Audit trail */
  audit: string;
}

/**
 * Continue channeling, adding more energy/AP.
 */
export function continueChanneling(
  entity: FullEntity,
  additionalEnergy: number,
  additionalAP: number
): ContinueChannelingResult {
  if (!entity.channeling) {
    const emptySpell: SpellTemplate = {
      id: "",
      name: "",
      primaryFaculty: "",
      primaryTier: 1,
      aspects: [],
      totalCost: 0,
    };
    return {
      success: false,
      updatedEntity: entity,
      progress: createEmptyProgress(emptySpell),
      readyToRelease: false,
      failureReason: "Not currently channeling",
      audit: `${entity.displayName ?? entity.name} is not channeling`,
    };
  }

  // Check resources
  if (entity.energy.current < additionalEnergy) {
    return {
      success: false,
      updatedEntity: entity,
      progress: createProgressFromState(entity),
      readyToRelease: false,
      failureReason: `Insufficient energy: ${entity.energy.current}/${additionalEnergy}`,
      audit: `Insufficient energy to continue channeling`,
    };
  }

  if (entity.ap.current < additionalAP) {
    return {
      success: false,
      updatedEntity: entity,
      progress: createProgressFromState(entity),
      readyToRelease: false,
      failureReason: `Insufficient AP: ${entity.ap.current}/${additionalAP}`,
      audit: `Insufficient AP to continue channeling`,
    };
  }

  const channeling = entity.channeling;
  const newEnergyChanneled = channeling.energyChanneled + additionalEnergy;
  const newAPChanneled = channeling.apChanneled + additionalAP;
  const newTurnsChanneled = channeling.turnsChanneled + 1;

  // Update channeling state
  const updatedChanneling: ChannelingState = {
    ...channeling,
    energyChanneled: newEnergyChanneled,
    apChanneled: newAPChanneled,
    turnsChanneled: newTurnsChanneled,
  };

  // Check if ready to release
  const readyToRelease =
    newEnergyChanneled >= channeling.requiredEnergy &&
    newAPChanneled >= channeling.requiredAP;

  // Spend resources
  const updatedEntity: FullEntity = {
    ...entity,
    energy: {
      ...entity.energy,
      current: entity.energy.current - additionalEnergy,
    },
    ap: {
      ...entity.ap,
      current: entity.ap.current - additionalAP,
    },
    channeling: updatedChanneling,
  };

  // Create progress record (reconstruct spell template from state)
  const spellTemplate = reconstructSpellTemplate(channeling);
  const progress: ChannelingProgress = {
    spellTemplate,
    energyChanneled: newEnergyChanneled,
    apChanneled: newAPChanneled,
    turnsChanneled: newTurnsChanneled,
    startedAt: channeling.startedAt,
  };

  const progressPct = getChannelingProgressPercent(progress);

  let audit = `${entity.displayName ?? entity.name} continues channeling ${channeling.spellName} ` +
    `(+${additionalEnergy}E/+${additionalAP}AP, now ${Math.round(progressPct * 100)}% complete)`;

  if (readyToRelease) {
    audit += " - READY TO RELEASE";
  }

  return {
    success: true,
    updatedEntity,
    progress,
    readyToRelease,
    audit,
  };
}

/**
 * Reconstruct a minimal SpellTemplate from ChannelingState.
 * Note: This won't have all aspects info, only what we stored.
 */
function reconstructSpellTemplate(channeling: ChannelingState): SpellTemplate {
  return {
    id: channeling.spellTemplateId,
    name: channeling.spellName,
    primaryFaculty: "",
    primaryTier: 1,
    aspects: [{ name: "intensity", tier: channeling.intensity }],
    damageType: channeling.damageType,
    totalCost: channeling.requiredEnergy, // Energy = AP for Ildakar
  };
}

/**
 * Create progress from entity's channeling state.
 */
function createProgressFromState(entity: FullEntity): ChannelingProgress {
  if (!entity.channeling) {
    const emptySpell: SpellTemplate = {
      id: "",
      name: "",
      primaryFaculty: "",
      primaryTier: 1,
      aspects: [],
      totalCost: 0,
    };
    return createEmptyProgress(emptySpell);
  }

  const channeling = entity.channeling;
  return {
    spellTemplate: reconstructSpellTemplate(channeling),
    energyChanneled: channeling.energyChanneled,
    apChanneled: channeling.apChanneled,
    turnsChanneled: channeling.turnsChanneled,
    startedAt: channeling.startedAt,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RELEASE SPELL
// ═══════════════════════════════════════════════════════════════════════════

export interface ReleaseSpellResult {
  /** Whether spell was released successfully */
  success: boolean;
  /** Updated entity (channeling cleared) */
  updatedEntity: FullEntity;
  /** Spell damage to apply */
  spellDamage: number;
  /** Damage type */
  damageType: DamageType;
  /** Total energy invested */
  totalEnergy: number;
  /** Total AP invested */
  totalAP: number;
  /** Final intensity achieved */
  finalIntensity: number;
  /** Reason for failure if unsuccessful */
  failureReason?: string;
  /** Audit trail */
  audit: string;
}

/**
 * Release a fully channeled spell.
 */
export function releaseSpell(entity: FullEntity): ReleaseSpellResult {
  if (!entity.channeling) {
    return {
      success: false,
      updatedEntity: entity,
      spellDamage: 0,
      damageType: "mental",
      totalEnergy: 0,
      totalAP: 0,
      finalIntensity: 0,
      failureReason: "Not channeling a spell",
      audit: `${entity.displayName ?? entity.name} has no spell to release`,
    };
  }

  const channeling = entity.channeling;

  // Check if fully charged
  const isComplete =
    channeling.energyChanneled >= channeling.requiredEnergy &&
    channeling.apChanneled >= channeling.requiredAP;

  if (!isComplete) {
    return {
      success: false,
      updatedEntity: entity,
      spellDamage: 0,
      damageType: channeling.damageType,
      totalEnergy: channeling.energyChanneled,
      totalAP: channeling.apChanneled,
      finalIntensity: 0,
      failureReason: `Spell not fully charged: ${channeling.energyChanneled}/${channeling.requiredEnergy}E, ${channeling.apChanneled}/${channeling.requiredAP}AP`,
      audit: `${channeling.spellName} is not fully charged`,
    };
  }

  // Calculate final intensity and spell damage
  const progress = createProgressFromState(entity);
  const thresholds = calculateIntensityThresholds(progress);

  // Spell damage scales with energy channeled and intensity
  const spellDamage = channeling.energyChanneled * thresholds.currentIntensity;

  // Clear channeling state
  const updatedEntity: FullEntity = {
    ...entity,
    channeling: undefined,
  };

  return {
    success: true,
    updatedEntity,
    spellDamage,
    damageType: channeling.damageType,
    totalEnergy: channeling.energyChanneled,
    totalAP: channeling.apChanneled,
    finalIntensity: thresholds.currentIntensity,
    audit: `${entity.displayName ?? entity.name} releases ${channeling.spellName}! ` +
      `(${spellDamage} ${channeling.damageType} damage at intensity ${thresholds.currentIntensity}, ` +
      `${channeling.turnsChanneled} turns channeled)`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERRUPT CHANNELING
// ═══════════════════════════════════════════════════════════════════════════

export interface InterruptResult {
  /** Whether interruption was processed */
  success: boolean;
  /** Updated entity (channeling cleared, wounds applied) */
  updatedEntity: FullEntity;
  /** Blowback wounds inflicted */
  blowbackWounds: Partial<WoundCounts>;
  /** Total blowback wound count */
  blowbackCount: number;
  /** Energy damage from blowback */
  energyDamage: number;
  /** Audit trail */
  audit: string;
}

/**
 * Interrupt channeling and apply blowback damage.
 */
export function interruptChanneling(entity: FullEntity): InterruptResult {
  if (!entity.channeling) {
    return {
      success: false,
      updatedEntity: entity,
      blowbackWounds: {},
      blowbackCount: 0,
      energyDamage: 0,
      audit: `${entity.displayName ?? entity.name} is not channeling`,
    };
  }

  const channeling = entity.channeling;
  const progress = createProgressFromState(entity);

  // Calculate blowback
  const blowback = calculateBlowback(progress);

  // Apply blowback wounds
  const blowbackWounds: Partial<WoundCounts> = {};
  if (blowback.woundCount > 0) {
    blowbackWounds[blowback.woundType as keyof WoundCounts] = blowback.woundCount;
  }

  // Update entity wounds
  const newWounds = { ...entity.wounds };
  for (const [type, count] of Object.entries(blowbackWounds)) {
    if (count) {
      const key = type as keyof WoundCounts;
      newWounds[key] = (newWounds[key] || 0) + count;
    }
  }

  // Apply energy damage from blowback
  const newEnergy = Math.max(0, entity.energy.current - blowback.energyDamage);

  // Clear channeling and apply wounds
  const updatedEntity: FullEntity = {
    ...entity,
    channeling: undefined,
    wounds: newWounds,
    energy: {
      ...entity.energy,
      current: newEnergy,
    },
  };

  return {
    success: true,
    updatedEntity,
    blowbackWounds,
    blowbackCount: blowback.woundCount,
    energyDamage: blowback.energyDamage,
    audit: `${entity.displayName ?? entity.name}'s ${channeling.spellName} is interrupted! ` +
      `${blowback.audit}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ABORT CHANNELING
// ═══════════════════════════════════════════════════════════════════════════

export interface AbortResult {
  /** Whether abort was successful */
  success: boolean;
  /** Updated entity (channeling cleared) */
  updatedEntity: FullEntity;
  /** Energy lost (not refunded) */
  energyLost: number;
  /** AP lost (not refunded) */
  apLost: number;
  /** Audit trail */
  audit: string;
}

/**
 * Voluntarily abort channeling (no blowback, but no refund).
 */
export function abortChanneling(entity: FullEntity): AbortResult {
  if (!entity.channeling) {
    return {
      success: false,
      updatedEntity: entity,
      energyLost: 0,
      apLost: 0,
      audit: `${entity.displayName ?? entity.name} is not channeling`,
    };
  }

  const channeling = entity.channeling;

  // Clear channeling state (resources already spent, not refunded)
  const updatedEntity: FullEntity = {
    ...entity,
    channeling: undefined,
  };

  return {
    success: true,
    updatedEntity,
    energyLost: channeling.energyChanneled,
    apLost: channeling.apChanneled,
    audit: `${entity.displayName ?? entity.name} aborts ${channeling.spellName} ` +
      `(lost ${channeling.energyChanneled}E/${channeling.apChanneled}AP)`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANNELING QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if entity is currently channeling.
 */
export function isChanneling(entity: FullEntity): boolean {
  return entity.channeling !== undefined;
}

/**
 * Get channeling progress percentage (0-1).
 */
export function getChannelingProgress(entity: FullEntity): number {
  if (!entity.channeling) return 0;

  const progress = createProgressFromState(entity);
  return getChannelingProgressPercent(progress);
}

/**
 * Check if channeling is ready to release.
 */
export function isReadyToRelease(entity: FullEntity): boolean {
  if (!entity.channeling) return false;

  const progress = createProgressFromState(entity);
  return isChannelingComplete(progress);
}

/**
 * Get remaining resources needed to complete channeling.
 */
export function getRemainingChannelingCost(entity: FullEntity): { energy: number; ap: number } {
  if (!entity.channeling) return { energy: 0, ap: 0 };

  const progress = createProgressFromState(entity);
  return getRemaining(progress);
}

/**
 * Get channeling thresholds for UI display.
 */
export function getChannelingThresholds(entity: FullEntity): IntensityThresholds | null {
  if (!entity.channeling) return null;

  const progress = createProgressFromState(entity);
  return calculateIntensityThresholds(progress);
}

/**
 * Estimate blowback if interrupted now.
 */
export function estimateBlowback(entity: FullEntity): BlowbackResult | null {
  if (!entity.channeling) return null;

  const progress = createProgressFromState(entity);
  return calculateBlowback(progress);
}

// ═══════════════════════════════════════════════════════════════════════════
// SPELL TEMPLATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate total spell cost from aspect tiers.
 * For Ildakar, Energy cost = AP cost.
 */
export function calculateSpellCost(aspects: { name: string; tier: number }[]): number {
  const ASPECT_TIER_COSTS = [0, 1, 9, 27, 57, 99, 153];
  let total = 0;

  for (const aspect of aspects) {
    if (aspect.tier >= 1 && aspect.tier <= 6) {
      total += ASPECT_TIER_COSTS[aspect.tier];
    }
  }

  return total;
}

/**
 * Create a spell template from configuration.
 */
export function createSpellTemplate(
  id: string,
  name: string,
  primaryFaculty: string,
  primaryTier: number,
  aspects: { name: string; tier: number }[],
  damageType?: DamageType
): SpellTemplate {
  const totalCost = calculateSpellCost(aspects);

  return {
    id,
    name,
    primaryFaculty,
    primaryTier,
    aspects: aspects.map((a) => ({
      name: a.name as any,
      tier: a.tier,
    })),
    damageType,
    totalCost,
  };
}

/**
 * Get minimum turns needed to channel a spell given resource limits.
 */
export function getMinimumChannelingTurns(
  spell: SpellTemplate,
  maxEnergyPerTurn: number,
  maxAPPerTurn: number
): number {
  const energyTurns = Math.ceil(spell.totalCost / maxEnergyPerTurn);
  const apTurns = Math.ceil(spell.totalCost / maxAPPerTurn);
  return Math.max(energyTurns, apTurns);
}
