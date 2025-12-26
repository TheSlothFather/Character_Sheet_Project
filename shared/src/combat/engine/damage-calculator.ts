/**
 * Combat V2 - Damage Calculator
 *
 * Server-authoritative damage calculation pipeline.
 * Order: Immunity -> Resistance -> Weakness -> Apply to target
 */

import type {
  DamageType,
  DamageInstance,
  DamageResult,
  DamageModifierType,
  CriticalTier,
} from "../types/damage";
import {
  getDamageModifierType,
  applyDamageModifier,
  createDamageAudit,
} from "../types/damage";
import type {
  CombatEntity,
  MinionEntity,
  FullEntity,
  WoundCounts,
} from "../types/entity";
import { isMinion, isFull } from "../types/entity";

// ═══════════════════════════════════════════════════════════════════════════
// DAMAGE CALCULATION RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface FullDamageResult extends DamageResult {
  /** Updated entity after damage applied */
  updatedEntity: CombatEntity;
  /** Whether entity needs to make an Endure roll */
  requiresEndureRoll: boolean;
  /** Whether entity is now unconscious */
  targetUnconscious: boolean;
  /** Whether entity was killed/defeated */
  targetDefeated: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DAMAGE CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate and apply damage to an entity.
 * This is the main entry point for all damage calculations.
 *
 * Pipeline:
 * 1. Check immunity (complete negation)
 * 2. Check resistance (50% reduction)
 * 3. Check weakness (200% damage)
 * 4. Apply to target based on entity tier
 */
export function calculateAndApplyDamage(
  damage: DamageInstance,
  target: CombatEntity
): FullDamageResult {
  // Get modifier type (immunity > resistance > weakness > normal)
  const modifierType = getDamageModifierType(damage.type, {
    immunities: target.immunities,
    resistances: target.resistances,
    weaknesses: target.weaknesses,
  });

  // Apply modifier to damage amount
  const modifiedAmount = applyDamageModifier(damage.amount, modifierType);

  // Create audit trail
  const audit = createDamageAudit(
    damage.amount,
    modifiedAmount,
    damage.type,
    modifierType
  );

  // Route to appropriate handler based on entity tier
  if (isMinion(target)) {
    return applyDamageToMinion(damage, target, modifiedAmount, modifierType, audit);
  } else {
    return applyDamageToFullEntity(damage, target, modifiedAmount, modifierType, audit);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MINION DAMAGE (Simplified - Damage Threshold)
// ═══════════════════════════════════════════════════════════════════════════

function applyDamageToMinion(
  damage: DamageInstance,
  target: MinionEntity,
  modifiedAmount: number,
  modifierType: DamageModifierType,
  audit: string
): FullDamageResult {
  // Minions use Damage Threshold (DR) - if damage exceeds it, they're defeated
  const defeated = modifiedAmount > target.damageThreshold;

  const updatedEntity: MinionEntity = {
    ...target,
    alive: !defeated,
  };

  const extendedAudit = defeated
    ? `${audit} -> exceeds DR ${target.damageThreshold} -> DEFEATED`
    : `${audit} -> blocked by DR ${target.damageThreshold}`;

  return {
    originalAmount: damage.amount,
    modifiedAmount,
    damageType: damage.type,
    modifier: modifierType,
    woundsInflicted: 0, // Minions don't track wounds
    energyDamage: modifiedAmount,
    targetDefeated: defeated,
    targetUnconscious: false,
    requiresEndureRoll: false,
    audit: extendedAudit,
    updatedEntity,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL ENTITY DAMAGE (Complete Resource Tracking)
// ═══════════════════════════════════════════════════════════════════════════

function applyDamageToFullEntity(
  damage: DamageInstance,
  target: FullEntity,
  modifiedAmount: number,
  modifierType: DamageModifierType,
  audit: string
): FullDamageResult {
  // Damage is applied to Energy first
  const currentEnergy = target.energy.current;
  const newEnergy = Math.max(0, currentEnergy - modifiedAmount);
  const energyDepleted = newEnergy === 0 && currentEnergy > 0;

  // Check if already unconscious (damage while unconscious = death check)
  const wasUnconscious = target.unconscious;

  // Determine if Endure roll is needed
  // - Energy depleted from damage = Endure roll
  // - Already unconscious and taking damage = Death check (not Endure)
  const requiresEndureRoll = energyDepleted && !wasUnconscious;
  const requiresDeathCheck = wasUnconscious && modifiedAmount > 0;

  // Update entity
  const updatedEntity: FullEntity = {
    ...target,
    energy: {
      ...target.energy,
      current: newEnergy,
    },
    // Don't set unconscious here - that happens after Endure roll fails
  };

  // Build extended audit
  let extendedAudit = `${audit} -> ${currentEnergy} - ${modifiedAmount} = ${newEnergy} energy`;
  if (requiresEndureRoll) {
    extendedAudit += " -> ENDURE ROLL REQUIRED";
  }
  if (requiresDeathCheck) {
    extendedAudit += " -> DEATH CHECK REQUIRED (damage while unconscious)";
  }

  return {
    originalAmount: damage.amount,
    modifiedAmount,
    damageType: damage.type,
    modifier: modifierType,
    woundsInflicted: 0, // Wounds are applied separately
    energyDamage: modifiedAmount,
    targetDefeated: false, // Only set after failed death check
    targetUnconscious: false, // Only set after failed Endure roll
    requiresEndureRoll: requiresEndureRoll || requiresDeathCheck,
    audit: extendedAudit,
    updatedEntity,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// WOUND APPLICATION (Separate from Energy Damage)
// ═══════════════════════════════════════════════════════════════════════════

export interface WoundApplicationResult {
  /** Wounds actually applied (after modifiers) */
  woundsApplied: Partial<WoundCounts>;
  /** Updated wound totals */
  newWoundTotals: WoundCounts;
  /** Updated entity */
  updatedEntity: FullEntity;
  /** Audit trail */
  audit: string;
}

/**
 * Apply wounds to a full entity.
 * Wounds are tracked separately from Energy.
 * Immunity/Resistance/Weakness apply to wound counts too.
 */
export function applyWoundsToEntity(
  entity: FullEntity,
  wounds: Partial<WoundCounts>,
  source: string
): WoundApplicationResult {
  const appliedWounds: Partial<WoundCounts> = {};
  const auditParts: string[] = [];

  // Process each wound type
  for (const [type, count] of Object.entries(wounds)) {
    if (count === undefined || count <= 0) continue;

    const damageType = type as DamageType;

    // Check modifiers
    const modifierType = getDamageModifierType(damageType, {
      immunities: entity.immunities,
      resistances: entity.resistances,
      weaknesses: entity.weaknesses,
    });

    // Apply modifier to wound count
    const modifiedCount = applyDamageModifier(count, modifierType);

    if (modifiedCount > 0) {
      appliedWounds[damageType] = modifiedCount;
      auditParts.push(`${modifiedCount} ${damageType}${modifierType !== "normal" ? ` (${modifierType})` : ""}`);
    } else if (modifierType === "immunity") {
      auditParts.push(`${count} ${damageType} (IMMUNE)`);
    }
  }

  // Calculate new wound totals
  const newWoundTotals: WoundCounts = { ...entity.wounds };
  for (const [type, count] of Object.entries(appliedWounds)) {
    const key = type as keyof WoundCounts;
    newWoundTotals[key] = (newWoundTotals[key] || 0) + (count || 0);
  }

  // Update entity
  const updatedEntity: FullEntity = {
    ...entity,
    wounds: newWoundTotals,
  };

  const audit = auditParts.length > 0
    ? `${source}: ${auditParts.join(", ")}`
    : `${source}: no wounds applied`;

  return {
    woundsApplied: appliedWounds,
    newWoundTotals,
    updatedEntity,
    audit,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALING
// ═══════════════════════════════════════════════════════════════════════════

export interface HealingResult {
  /** Energy restored */
  energyRestored: number;
  /** Wounds healed by type */
  woundsHealed: Partial<WoundCounts>;
  /** New energy value */
  newEnergy: number;
  /** New wound totals */
  newWoundTotals: WoundCounts;
  /** Updated entity */
  updatedEntity: FullEntity;
  /** Audit trail */
  audit: string;
}

/**
 * Heal energy and/or wounds on an entity.
 */
export function healEntity(
  entity: FullEntity,
  energyAmount: number = 0,
  woundsToHeal: Partial<WoundCounts> = {},
  source: string
): HealingResult {
  const auditParts: string[] = [];

  // Heal energy (capped at max)
  const effectiveMax = entity.energy.max;
  const currentEnergy = entity.energy.current;
  const newEnergy = Math.min(effectiveMax, currentEnergy + energyAmount);
  const actualEnergyRestored = newEnergy - currentEnergy;

  if (actualEnergyRestored > 0) {
    auditParts.push(`+${actualEnergyRestored} energy`);
  }

  // Heal wounds
  const healedWounds: Partial<WoundCounts> = {};
  const newWoundTotals: WoundCounts = { ...entity.wounds };

  for (const [type, amount] of Object.entries(woundsToHeal)) {
    if (amount === undefined || amount <= 0) continue;

    const key = type as keyof WoundCounts;
    const currentWounds = newWoundTotals[key] || 0;
    const actualHealed = Math.min(currentWounds, amount);

    if (actualHealed > 0) {
      healedWounds[key] = actualHealed;
      newWoundTotals[key] = currentWounds - actualHealed;
      auditParts.push(`-${actualHealed} ${type} wounds`);
    }
  }

  // Check if entity was unconscious and is now conscious
  const wasUnconscious = entity.unconscious;
  const nowConscious = wasUnconscious && newEnergy > 0;

  const updatedEntity: FullEntity = {
    ...entity,
    energy: {
      ...entity.energy,
      current: newEnergy,
    },
    wounds: newWoundTotals,
    unconscious: wasUnconscious && !nowConscious,
  };

  if (nowConscious) {
    auditParts.push("regained consciousness");
  }

  const audit = auditParts.length > 0
    ? `${source}: ${auditParts.join(", ")}`
    : `${source}: no healing applied`;

  return {
    energyRestored: actualEnergyRestored,
    woundsHealed: healedWounds,
    newEnergy,
    newWoundTotals,
    updatedEntity,
    audit,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a damage instance from attack data
 */
export function createDamageInstance(
  amount: number,
  type: DamageType,
  sourceEntityId: string,
  options: {
    sourceAbility?: string;
    isCritical?: boolean;
    criticalTier?: CriticalTier;
  } = {}
): DamageInstance {
  return {
    amount,
    type,
    sourceEntityId,
    sourceAbility: options.sourceAbility,
    isCritical: options.isCritical ?? false,
    criticalTier: options.criticalTier,
  };
}

/**
 * Calculate total wounds on an entity
 */
export function getTotalWoundCount(wounds: WoundCounts): number {
  return Object.values(wounds).reduce((sum, count) => sum + (count || 0), 0);
}

/**
 * Check if entity has any wounds of a specific type
 */
export function hasWoundType(entity: FullEntity, type: DamageType): boolean {
  return (entity.wounds[type as keyof WoundCounts] || 0) > 0;
}

/**
 * Get the highest wound count on an entity
 */
export function getHighestWoundCount(wounds: WoundCounts): { type: DamageType; count: number } | null {
  let highest: { type: DamageType; count: number } | null = null;

  for (const [type, count] of Object.entries(wounds)) {
    if (count && count > 0) {
      if (!highest || count > highest.count) {
        highest = { type: type as DamageType, count };
      }
    }
  }

  return highest;
}
