/**
 * Combat V2 - Energy Manager
 *
 * Handles Energy/AP spending, regeneration, and the death system.
 * Core formulas:
 * - Base Energy: 100 + 10×(Level-1)
 * - Base AP: 6 + 2×floor((Level-1)/5)
 * - AP→Energy: Tier × (3 + staminaBonus) × unspentAP
 * - Tier: ceil(Level/5)
 */

import type { FullEntity, CombatResource } from "../types/entity";
import {
  calculateBaseEnergy,
  calculateBaseAP,
  calculateTier,
  calculateEffectiveMax,
} from "../types/entity";

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE SPENDING
// ═══════════════════════════════════════════════════════════════════════════

export interface SpendResult {
  /** Whether the spend was successful */
  success: boolean;
  /** Updated entity after spending */
  updatedEntity: FullEntity;
  /** Amount actually spent */
  amountSpent: number;
  /** Reason for failure if unsuccessful */
  failureReason?: string;
  /** Audit trail */
  audit: string;
}

/**
 * Spend energy from an entity.
 * Returns failure if insufficient energy.
 */
export function spendEnergy(
  entity: FullEntity,
  amount: number,
  source: string
): SpendResult {
  if (amount <= 0) {
    return {
      success: true,
      updatedEntity: entity,
      amountSpent: 0,
      audit: `${source}: no energy cost`,
    };
  }

  const current = entity.energy.current;

  if (current < amount) {
    return {
      success: false,
      updatedEntity: entity,
      amountSpent: 0,
      failureReason: `Insufficient energy: ${current}/${amount}`,
      audit: `${source}: FAILED - insufficient energy (${current}/${amount})`,
    };
  }

  const newCurrent = current - amount;
  const updatedEntity: FullEntity = {
    ...entity,
    energy: {
      ...entity.energy,
      current: newCurrent,
    },
  };

  return {
    success: true,
    updatedEntity,
    amountSpent: amount,
    audit: `${source}: -${amount} energy (${current} → ${newCurrent})`,
  };
}

/**
 * Spend AP from an entity.
 * Returns failure if insufficient AP.
 */
export function spendAP(
  entity: FullEntity,
  amount: number,
  source: string
): SpendResult {
  if (amount <= 0) {
    return {
      success: true,
      updatedEntity: entity,
      amountSpent: 0,
      audit: `${source}: no AP cost`,
    };
  }

  const current = entity.ap.current;

  if (current < amount) {
    return {
      success: false,
      updatedEntity: entity,
      amountSpent: 0,
      failureReason: `Insufficient AP: ${current}/${amount}`,
      audit: `${source}: FAILED - insufficient AP (${current}/${amount})`,
    };
  }

  const newCurrent = current - amount;
  const updatedEntity: FullEntity = {
    ...entity,
    ap: {
      ...entity.ap,
      current: newCurrent,
    },
  };

  return {
    success: true,
    updatedEntity,
    amountSpent: amount,
    audit: `${source}: -${amount} AP (${current} → ${newCurrent})`,
  };
}

/**
 * Spend both energy and AP in one transaction.
 * Fails entirely if either resource is insufficient.
 */
export function spendResources(
  entity: FullEntity,
  energyCost: number,
  apCost: number,
  source: string
): SpendResult {
  // Check both resources first
  if (entity.energy.current < energyCost) {
    return {
      success: false,
      updatedEntity: entity,
      amountSpent: 0,
      failureReason: `Insufficient energy: ${entity.energy.current}/${energyCost}`,
      audit: `${source}: FAILED - insufficient energy`,
    };
  }

  if (entity.ap.current < apCost) {
    return {
      success: false,
      updatedEntity: entity,
      amountSpent: 0,
      failureReason: `Insufficient AP: ${entity.ap.current}/${apCost}`,
      audit: `${source}: FAILED - insufficient AP`,
    };
  }

  // Spend both
  const newEnergy = entity.energy.current - energyCost;
  const newAP = entity.ap.current - apCost;

  const updatedEntity: FullEntity = {
    ...entity,
    energy: {
      ...entity.energy,
      current: newEnergy,
    },
    ap: {
      ...entity.ap,
      current: newAP,
    },
  };

  const auditParts: string[] = [];
  if (energyCost > 0) auditParts.push(`-${energyCost} energy`);
  if (apCost > 0) auditParts.push(`-${apCost} AP`);

  return {
    success: true,
    updatedEntity,
    amountSpent: energyCost + apCost,
    audit: `${source}: ${auditParts.join(", ")}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE RESTORATION
// ═══════════════════════════════════════════════════════════════════════════

export interface RestoreResult {
  /** Updated entity after restoration */
  updatedEntity: FullEntity;
  /** Amount actually restored (capped at max) */
  amountRestored: number;
  /** Audit trail */
  audit: string;
}

/**
 * Restore energy to an entity.
 */
export function restoreEnergy(
  entity: FullEntity,
  amount: number,
  source: string
): RestoreResult {
  const current = entity.energy.current;
  const max = entity.energy.max;
  const newCurrent = Math.min(max, current + amount);
  const actualRestored = newCurrent - current;

  const updatedEntity: FullEntity = {
    ...entity,
    energy: {
      ...entity.energy,
      current: newCurrent,
    },
  };

  return {
    updatedEntity,
    amountRestored: actualRestored,
    audit: `${source}: +${actualRestored} energy (${current} → ${newCurrent})`,
  };
}

/**
 * Restore AP to an entity.
 */
export function restoreAP(
  entity: FullEntity,
  amount: number,
  source: string
): RestoreResult {
  const current = entity.ap.current;
  const max = entity.ap.max;
  const newCurrent = Math.min(max, current + amount);
  const actualRestored = newCurrent - current;

  const updatedEntity: FullEntity = {
    ...entity,
    ap: {
      ...entity.ap,
      current: newCurrent,
    },
  };

  return {
    updatedEntity,
    amountRestored: actualRestored,
    audit: `${source}: +${actualRestored} AP (${current} → ${newCurrent})`,
  };
}

/**
 * Fully restore AP to maximum (used at turn start).
 */
export function restoreAPToMax(
  entity: FullEntity
): RestoreResult {
  const current = entity.ap.current;
  const max = entity.ap.max;

  if (current >= max) {
    return {
      updatedEntity: entity,
      amountRestored: 0,
      audit: "AP already at maximum",
    };
  }

  const updatedEntity: FullEntity = {
    ...entity,
    ap: {
      ...entity.ap,
      current: max,
    },
  };

  return {
    updatedEntity,
    amountRestored: max - current,
    audit: `AP restored to ${max}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AP TO ENERGY CONVERSION
// ═══════════════════════════════════════════════════════════════════════════

export interface APConversionResult {
  /** Updated entity after conversion */
  updatedEntity: FullEntity;
  /** Unspent AP that was converted */
  unspentAP: number;
  /** Energy gained from conversion */
  energyGained: number;
  /** Audit trail */
  audit: string;
}

/**
 * Convert unspent AP to energy at end of turn.
 * Formula: Tier × (3 + staminaPotionBonus) × unspentAP
 */
export function convertAPToEnergy(
  entity: FullEntity
): APConversionResult {
  const unspentAP = entity.ap.current;

  if (unspentAP <= 0) {
    return {
      updatedEntity: entity,
      unspentAP: 0,
      energyGained: 0,
      audit: "No unspent AP to convert",
    };
  }

  const tier = calculateTier(entity.level);
  const factor = 3 + (entity.staminaPotionBonus ?? 0);
  const potentialGain = tier * factor * unspentAP;

  // Apply gain capped at max energy
  const current = entity.energy.current;
  const max = entity.energy.max;
  const newEnergy = Math.min(max, current + potentialGain);
  const actualGain = newEnergy - current;

  const updatedEntity: FullEntity = {
    ...entity,
    energy: {
      ...entity.energy,
      current: newEnergy,
    },
    ap: {
      ...entity.ap,
      current: 0, // AP is spent in conversion
    },
  };

  let audit = `AP→Energy: ${unspentAP} AP × ${tier} tier × ${factor} factor = +${potentialGain} energy`;
  if (actualGain < potentialGain) {
    audit += ` (capped at max: ${max})`;
  }

  return {
    updatedEntity,
    unspentAP,
    energyGained: actualGain,
    audit,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DEATH SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export type DeathCheckType = "endure" | "feat_of_defiance";

export interface EndureRollRequired {
  /** Type of check required */
  type: "endure";
  /** Entity that needs to roll */
  entityId: string;
  /** Damage that triggered this */
  triggeringDamage: number;
  /** Message */
  message: string;
}

export interface FeatOfDefianceRequired {
  /** Type of check required */
  type: "feat_of_defiance";
  /** Entity that needs to roll */
  entityId: string;
  /** Damage that triggered this */
  triggeringDamage: number;
  /** Message */
  message: string;
}

export type DeathCheckRequired = EndureRollRequired | FeatOfDefianceRequired;

export interface DeathCheckResult {
  /** Type of check that was made */
  type: DeathCheckType;
  /** Whether the check succeeded */
  success: boolean;
  /** Updated entity after the check */
  updatedEntity: FullEntity;
  /** Whether entity is now unconscious */
  nowUnconscious: boolean;
  /** Whether entity died */
  nowDead: boolean;
  /** Audit trail */
  audit: string;
}

/**
 * Check if entity needs a death check after taking damage.
 */
export function checkForDeathCheck(
  entity: FullEntity,
  damageAmount: number
): DeathCheckRequired | null {
  // Entity is already dead - no check needed
  if (!entity.alive) {
    return null;
  }

  // Energy at 0 and NOT already unconscious = Endure roll
  if (entity.energy.current <= 0 && !entity.unconscious) {
    return {
      type: "endure",
      entityId: entity.id,
      triggeringDamage: damageAmount,
      message: `${entity.displayName ?? entity.name} must make an Endure roll!`,
    };
  }

  // Already unconscious and took damage = Feat of Defiance
  if (entity.unconscious && damageAmount > 0) {
    return {
      type: "feat_of_defiance",
      entityId: entity.id,
      triggeringDamage: damageAmount,
      message: `${entity.displayName ?? entity.name} must make a Feat of Defiance or die!`,
    };
  }

  return null;
}

/**
 * Process the result of an Endure roll.
 * Success: Entity remains conscious at 0 energy
 * Failure: Entity becomes unconscious
 */
export function processEndureRoll(
  entity: FullEntity,
  success: boolean,
  rollTotal: number
): DeathCheckResult {
  if (success) {
    return {
      type: "endure",
      success: true,
      updatedEntity: entity,
      nowUnconscious: false,
      nowDead: false,
      audit: `Endure roll succeeded (${rollTotal}): ${entity.displayName ?? entity.name} fights through the pain!`,
    };
  }

  // Failed - entity becomes unconscious
  const updatedEntity: FullEntity = {
    ...entity,
    unconscious: true,
  };

  return {
    type: "endure",
    success: false,
    updatedEntity,
    nowUnconscious: true,
    nowDead: false,
    audit: `Endure roll failed (${rollTotal}): ${entity.displayName ?? entity.name} falls unconscious!`,
  };
}

/**
 * Process the result of a Feat of Defiance (death check).
 * Success: Entity miraculously survives
 * Failure: Entity dies
 */
export function processFeatOfDefiance(
  entity: FullEntity,
  success: boolean,
  rollTotal: number
): DeathCheckResult {
  if (success) {
    return {
      type: "feat_of_defiance",
      success: true,
      updatedEntity: entity,
      nowUnconscious: true, // Still unconscious, but alive
      nowDead: false,
      audit: `Feat of Defiance succeeded (${rollTotal}): ${entity.displayName ?? entity.name} defies death!`,
    };
  }

  // Failed - entity dies
  const updatedEntity: FullEntity = {
    ...entity,
    alive: false,
  };

  return {
    type: "feat_of_defiance",
    success: false,
    updatedEntity,
    nowUnconscious: false,
    nowDead: true,
    audit: `Feat of Defiance failed (${rollTotal}): ${entity.displayName ?? entity.name} has died!`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if entity has enough energy for an action.
 */
export function hasEnoughEnergy(entity: FullEntity, amount: number): boolean {
  return entity.energy.current >= amount;
}

/**
 * Check if entity has enough AP for an action.
 */
export function hasEnoughAP(entity: FullEntity, amount: number): boolean {
  return entity.ap.current >= amount;
}

/**
 * Check if entity can afford both energy and AP costs.
 */
export function canAfford(
  entity: FullEntity,
  energyCost: number,
  apCost: number
): boolean {
  return hasEnoughEnergy(entity, energyCost) && hasEnoughAP(entity, apCost);
}

/**
 * Get the percentage of energy remaining.
 */
export function getEnergyPercent(entity: FullEntity): number {
  if (entity.energy.max === 0) return 0;
  return Math.round((entity.energy.current / entity.energy.max) * 100);
}

/**
 * Get the percentage of AP remaining.
 */
export function getAPPercent(entity: FullEntity): number {
  if (entity.ap.max === 0) return 0;
  return Math.round((entity.ap.current / entity.ap.max) * 100);
}

/**
 * Check if entity is at full energy.
 */
export function isFullEnergy(entity: FullEntity): boolean {
  return entity.energy.current >= entity.energy.max;
}

/**
 * Check if entity is at full AP.
 */
export function isFullAP(entity: FullEntity): boolean {
  return entity.ap.current >= entity.ap.max;
}

/**
 * Check if entity is critically low on energy (below 25%).
 */
export function isCriticalEnergy(entity: FullEntity): boolean {
  return getEnergyPercent(entity) < 25;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE MODIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set entity energy to a specific value.
 */
export function setEnergy(
  entity: FullEntity,
  amount: number,
  source: string
): RestoreResult {
  const newAmount = Math.max(0, Math.min(entity.energy.max, amount));
  const diff = newAmount - entity.energy.current;

  const updatedEntity: FullEntity = {
    ...entity,
    energy: {
      ...entity.energy,
      current: newAmount,
    },
  };

  return {
    updatedEntity,
    amountRestored: diff,
    audit: `${source}: set energy to ${newAmount}`,
  };
}

/**
 * Set entity AP to a specific value.
 */
export function setAP(
  entity: FullEntity,
  amount: number,
  source: string
): RestoreResult {
  const newAmount = Math.max(0, Math.min(entity.ap.max, amount));
  const diff = newAmount - entity.ap.current;

  const updatedEntity: FullEntity = {
    ...entity,
    ap: {
      ...entity.ap,
      current: newAmount,
    },
  };

  return {
    updatedEntity,
    amountRestored: diff,
    audit: `${source}: set AP to ${newAmount}`,
  };
}

/**
 * Modify max energy (temporary buffs/debuffs).
 */
export function modifyMaxEnergy(
  entity: FullEntity,
  delta: number,
  source: string
): RestoreResult {
  const newMax = Math.max(1, entity.energy.max + delta);
  const newCurrent = Math.min(entity.energy.current, newMax);

  const updatedEntity: FullEntity = {
    ...entity,
    energy: {
      ...entity.energy,
      max: newMax,
      current: newCurrent,
    },
  };

  return {
    updatedEntity,
    amountRestored: delta,
    audit: `${source}: max energy ${delta >= 0 ? "+" : ""}${delta} (now ${newMax})`,
  };
}

/**
 * Modify max AP (temporary buffs/debuffs).
 */
export function modifyMaxAP(
  entity: FullEntity,
  delta: number,
  source: string
): RestoreResult {
  const newMax = Math.max(1, entity.ap.max + delta);
  const newCurrent = Math.min(entity.ap.current, newMax);

  const updatedEntity: FullEntity = {
    ...entity,
    ap: {
      ...entity.ap,
      max: newMax,
      current: newCurrent,
    },
  };

  return {
    updatedEntity,
    amountRestored: delta,
    audit: `${source}: max AP ${delta >= 0 ? "+" : ""}${delta} (now ${newMax})`,
  };
}
