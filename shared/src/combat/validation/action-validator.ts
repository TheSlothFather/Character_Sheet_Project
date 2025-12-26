/**
 * Combat V2 - Action Validator
 *
 * Validates that actions are legal given current combat state.
 * Checks: turn order, resources, targets, range, cooldowns.
 */

import type { CombatEntity, FullEntity, HexPosition } from "../types/entity";
import { isFull, isMinion } from "../types/entity";
import type { CombatState, CombatPhase } from "../types/state";
import type { WeaponCategory } from "../types/actions";
import { WEAPON_CATEGORY_COSTS } from "../types/actions";

// ═══════════════════════════════════════════════════════════════════════════
// ACTION DECLARATION (for validation)
// ═══════════════════════════════════════════════════════════════════════════

export type ActionType =
  | "weapon_attack"
  | "movement"
  | "ability"
  | "start_channeling"
  | "continue_channeling"
  | "release_spell"
  | "end_turn";

export interface ActionDeclaration {
  type: ActionType;
  actorId: string;
  targetId?: string;
  weaponCategory?: WeaponCategory;
  path?: HexPosition[];
  energyCost?: number;
  apCost?: number;
  allowFriendlyFire?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Get weapon costs
// ═══════════════════════════════════════════════════════════════════════════

export interface WeaponCostsSimple {
  energy: number;
  ap: number;
  damage: number;
  minRange: number;
  maxRange: number;
}

export function getWeaponCosts(category: WeaponCategory): WeaponCostsSimple {
  const costs = WEAPON_CATEGORY_COSTS[category];
  return {
    energy: costs.energy,
    ap: costs.ap,
    damage: costs.damage,
    minRange: costs.rangeMin,
    maxRange: costs.rangeMax,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface ValidationResult {
  /** Whether the action is valid */
  valid: boolean;
  /** Error messages if invalid */
  errors: string[];
  /** Warnings that don't prevent the action */
  warnings: string[];
}

function validResult(): ValidationResult {
  return { valid: true, errors: [], warnings: [] };
}

function invalidResult(...errors: string[]): ValidationResult {
  return { valid: false, errors, warnings: [] };
}

function addWarning(result: ValidationResult, warning: string): ValidationResult {
  return { ...result, warnings: [...result.warnings, warning] };
}

function combineResults(...results: ValidationResult[]): ValidationResult {
  const allErrors = results.flatMap((r) => r.errors);
  const allWarnings = results.flatMap((r) => r.warnings);
  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE CHECKS
// ═══════════════════════════════════════════════════════════════════════════

const ACTIVE_PHASES: CombatPhase[] = ["active-turn", "channeling", "reaction-window", "resolution"];

function isActivePhase(phase: CombatPhase): boolean {
  return ACTIVE_PHASES.includes(phase);
}

// ═══════════════════════════════════════════════════════════════════════════
// TURN VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if it's the entity's turn to act.
 */
export function validateTurn(
  state: CombatState,
  actorId: string
): ValidationResult {
  // Combat must be in an active phase
  if (!isActivePhase(state.phase)) {
    return invalidResult(`Combat is not active (phase: ${state.phase})`);
  }

  // Check if it's this entity's turn
  if (state.activeEntityId !== actorId) {
    const currentEntity = state.activeEntityId ? state.entities[state.activeEntityId] : null;
    const currentName = currentEntity?.displayName ?? currentEntity?.name ?? "Unknown";
    return invalidResult(`It is ${currentName}'s turn, not yours`);
  }

  return validResult();
}

/**
 * Check if entity can act (alive, conscious, not incapacitated).
 */
export function validateCanAct(
  entity: CombatEntity
): ValidationResult {
  if (!entity.alive) {
    return invalidResult(`${entity.displayName ?? entity.name} is dead`);
  }

  if (isFull(entity) && entity.unconscious) {
    return invalidResult(`${entity.displayName ?? entity.name} is unconscious`);
  }

  // Check for incapacitating status effects
  const incapacitatingEffects = ["STUNNED", "PARALYZED", "PETRIFIED", "FROZEN"];
  for (const effect of entity.statusEffects) {
    if (incapacitatingEffects.includes(effect.key)) {
      return invalidResult(`${entity.displayName ?? entity.name} is ${effect.key.toLowerCase()}`);
    }
  }

  return validResult();
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if entity has enough resources for an action.
 */
export function validateResources(
  entity: CombatEntity,
  energyCost: number,
  apCost: number
): ValidationResult {
  // Minions don't track resources
  if (isMinion(entity)) {
    return validResult();
  }

  const fullEntity = entity as FullEntity;
  const errors: string[] = [];

  if (fullEntity.energy.current < energyCost) {
    errors.push(
      `Insufficient energy: ${fullEntity.energy.current}/${energyCost}`
    );
  }

  if (fullEntity.ap.current < apCost) {
    errors.push(
      `Insufficient AP: ${fullEntity.ap.current}/${apCost}`
    );
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings: [] };
  }

  return validResult();
}

/**
 * Validate resources for a weapon attack.
 */
export function validateWeaponResources(
  entity: CombatEntity,
  weaponCategory: WeaponCategory
): ValidationResult {
  const costs = getWeaponCosts(weaponCategory);
  return validateResources(entity, costs.energy, costs.ap);
}

// ═══════════════════════════════════════════════════════════════════════════
// TARGET VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a target is valid.
 */
export function validateTarget(
  state: CombatState,
  targetId: string
): ValidationResult {
  const target = state.entities[targetId];

  if (!target) {
    return invalidResult("Target not found in combat");
  }

  if (!target.alive) {
    return invalidResult(`${target.displayName ?? target.name} is already dead`);
  }

  return validResult();
}

/**
 * Check if attacker can target this entity (faction rules).
 */
export function validateTargetFaction(
  attacker: CombatEntity,
  target: CombatEntity,
  allowFriendlyFire: boolean = false
): ValidationResult {
  if (attacker.id === target.id) {
    return invalidResult("Cannot target yourself");
  }

  if (!allowFriendlyFire && attacker.faction === target.faction) {
    return addWarning(
      validResult(),
      `Warning: ${target.displayName ?? target.name} is an ally`
    );
  }

  return validResult();
}

// ═══════════════════════════════════════════════════════════════════════════
// RANGE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate hex distance between two positions using axial coordinates.
 */
export function hexDistance(a: HexPosition, b: HexPosition): number {
  return (
    (Math.abs(a.q - b.q) +
      Math.abs(a.q + a.r - b.q - b.r) +
      Math.abs(a.r - b.r)) /
    2
  );
}

/**
 * Check if target is within range.
 */
export function validateRange(
  attackerPos: HexPosition,
  targetPos: HexPosition,
  minRange: number,
  maxRange: number
): ValidationResult {
  const distance = hexDistance(attackerPos, targetPos);

  if (distance < minRange) {
    return invalidResult(`Target is too close (distance: ${distance}, min: ${minRange})`);
  }

  if (distance > maxRange) {
    return invalidResult(`Target is out of range (distance: ${distance}, max: ${maxRange})`);
  }

  return validResult();
}

/**
 * Validate range for a weapon attack.
 */
export function validateWeaponRange(
  attackerPos: HexPosition,
  targetPos: HexPosition,
  weaponCategory: WeaponCategory
): ValidationResult {
  const costs = getWeaponCosts(weaponCategory);
  return validateRange(attackerPos, targetPos, costs.minRange, costs.maxRange);
}

// ═══════════════════════════════════════════════════════════════════════════
// REACTION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if entity can use a reaction.
 */
export function validateReaction(
  entity: CombatEntity,
  apCost: number
): ValidationResult {
  // Must be alive
  if (!entity.alive) {
    return invalidResult(`${entity.displayName ?? entity.name} is dead`);
  }

  // Minions don't have reactions
  if (isMinion(entity)) {
    return invalidResult("Minions cannot use reactions");
  }

  const fullEntity = entity as FullEntity;

  // Must have reaction available (not already used this round)
  if (!fullEntity.reactionAvailable) {
    return invalidResult("Reaction already used this round");
  }

  // Must have enough AP (reactions share AP pool)
  if (fullEntity.ap.current < apCost) {
    return invalidResult(`Insufficient AP for reaction: ${fullEntity.ap.current}/${apCost}`);
  }

  return validResult();
}

// ═══════════════════════════════════════════════════════════════════════════
// MOVEMENT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate movement cost in AP.
 * Formula: ceil(hexes / max(physicalAttribute, 3))
 */
export function calculateMovementCost(
  entity: CombatEntity,
  hexCount: number
): number {
  if (hexCount <= 0) return 0;

  // Get physical attribute (default 3)
  let physicalAttr = 3;
  if (isFull(entity)) {
    physicalAttr = entity.physicalAttribute ?? 3;
  }

  const hexesPerAP = Math.max(physicalAttr, 3);
  return Math.ceil(hexCount / hexesPerAP);
}

/**
 * Validate a movement action.
 */
export function validateMovement(
  state: CombatState,
  entity: CombatEntity,
  path: HexPosition[]
): ValidationResult {
  if (path.length === 0) {
    return invalidResult("No path specified");
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check each hex in path
  for (let i = 0; i < path.length; i++) {
    const hex = path[i];

    // Check if hex is occupied
    for (const entityId of Object.keys(state.entities)) {
      const otherEntity = state.entities[entityId];
      if (otherEntity.id !== entity.id && otherEntity.alive) {
        if (otherEntity.position.q === hex.q && otherEntity.position.r === hex.r) {
          // Can move through allies, but not enemies
          if (otherEntity.faction !== entity.faction) {
            errors.push(`Hex (${hex.q}, ${hex.r}) is blocked by ${otherEntity.displayName ?? otherEntity.name}`);
          } else if (i === path.length - 1) {
            // Can't end on ally's space
            errors.push(`Cannot end movement on ${otherEntity.displayName ?? otherEntity.name}'s space`);
          }
        }
      }
    }

    // Check if hex is in valid combat area
    if (!isHexInBounds(hex, state.grid)) {
      errors.push(`Hex (${hex.q}, ${hex.r}) is out of bounds`);
    }
  }

  // Calculate AP cost
  const apCost = calculateMovementCost(entity, path.length);

  // Validate resources
  const resourceResult = validateResources(entity, 0, apCost);
  if (!resourceResult.valid) {
    errors.push(...resourceResult.errors);
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  return { valid: true, errors: [], warnings };
}

/**
 * Check if a hex is within the combat grid bounds.
 */
function isHexInBounds(
  hex: HexPosition,
  grid: CombatState["grid"]
): boolean {
  if (!grid) return true; // No grid defined = no bounds check

  // Check within grid dimensions
  const maxDist = Math.max(grid.width, grid.height) / 2;
  const distance = Math.max(
    Math.abs(hex.q),
    Math.abs(hex.r),
    Math.abs(-hex.q - hex.r)
  );

  return distance <= maxDist;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANNELING VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if entity can start channeling.
 */
export function validateStartChanneling(
  entity: CombatEntity
): ValidationResult {
  if (isMinion(entity)) {
    return invalidResult("Minions cannot channel spells");
  }

  const fullEntity = entity as FullEntity;

  // Already channeling
  if (fullEntity.channeling) {
    return invalidResult("Already channeling a spell");
  }

  return validResult();
}

/**
 * Check if entity can continue channeling.
 */
export function validateContinueChanneling(
  entity: CombatEntity,
  energyCost: number,
  apCost: number
): ValidationResult {
  if (isMinion(entity)) {
    return invalidResult("Minions cannot channel");
  }

  const fullEntity = entity as FullEntity;

  // Must be channeling
  if (!fullEntity.channeling) {
    return invalidResult("Not currently channeling");
  }

  // Check resources
  return validateResources(entity, energyCost, apCost);
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE ACTION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate a complete action declaration.
 */
export function validateAction(
  state: CombatState,
  action: ActionDeclaration
): ValidationResult {
  const actor = state.entities[action.actorId];
  if (!actor) {
    return invalidResult("Actor not found in combat");
  }

  // Base validations
  const results: ValidationResult[] = [
    validateTurn(state, action.actorId),
    validateCanAct(actor),
  ];

  // Action-specific validations
  switch (action.type) {
    case "weapon_attack": {
      if (!action.weaponCategory) {
        results.push(invalidResult("Weapon category required"));
        break;
      }
      if (!action.targetId) {
        results.push(invalidResult("Target required for attack"));
        break;
      }

      const target = state.entities[action.targetId];
      if (!target) {
        results.push(invalidResult("Target not found"));
        break;
      }

      results.push(
        validateTarget(state, action.targetId),
        validateTargetFaction(actor, target, action.allowFriendlyFire),
        validateWeaponResources(actor, action.weaponCategory),
        validateWeaponRange(actor.position, target.position, action.weaponCategory)
      );
      break;
    }

    case "movement": {
      if (!action.path || action.path.length === 0) {
        results.push(invalidResult("Movement path required"));
        break;
      }
      results.push(validateMovement(state, actor, action.path));
      break;
    }

    case "start_channeling": {
      results.push(validateStartChanneling(actor));
      if (action.energyCost !== undefined || action.apCost !== undefined) {
        results.push(validateResources(actor, action.energyCost ?? 0, action.apCost ?? 0));
      }
      break;
    }

    case "continue_channeling": {
      results.push(
        validateContinueChanneling(actor, action.energyCost ?? 0, action.apCost ?? 0)
      );
      break;
    }

    case "release_spell": {
      if (isMinion(actor)) {
        results.push(invalidResult("Minions cannot release spells"));
      } else if (!(actor as FullEntity).channeling) {
        results.push(invalidResult("No spell to release"));
      }
      break;
    }

    case "ability": {
      // Generic ability - just check resources
      results.push(
        validateResources(actor, action.energyCost ?? 0, action.apCost ?? 0)
      );
      break;
    }

    case "end_turn":
      // Always valid if it's your turn
      break;

    default:
      results.push(invalidResult(`Unknown action type: ${(action as ActionDeclaration).type}`));
  }

  return combineResults(...results);
}

// ═══════════════════════════════════════════════════════════════════════════
// GM OVERRIDE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate a GM override action.
 * GMs can bypass most restrictions but still need valid targets.
 */
export function validateGMOverride(
  state: CombatState,
  gmUserId: string,
  action: ActionDeclaration
): ValidationResult {
  // Check if user is GM (campaign owner) - this would need to be passed in or checked externally
  // For now, we just validate targets exist

  // Still validate that targets exist
  if (action.targetId) {
    const target = state.entities[action.targetId];
    if (!target) {
      return invalidResult("Target not found");
    }
  }

  return validResult();
}
