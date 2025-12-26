/**
 * Combat V2 - Validation Module Exports
 *
 * Central export point for all action validation functionality.
 */

export {
  // Turn validation
  validateTurn,
  validateCanAct,

  // Resource validation
  validateResources,
  validateWeaponResources,

  // Target validation
  validateTarget,
  validateTargetFaction,

  // Range validation
  hexDistance,
  validateRange,
  validateWeaponRange,

  // Reaction validation
  validateReaction,

  // Movement validation
  calculateMovementCost,
  validateMovement,

  // Channeling validation
  validateStartChanneling,
  validateContinueChanneling,

  // Complete action validation
  validateAction,
  validateGMOverride,

  // Helper functions
  getWeaponCosts,

  // Types
  type ValidationResult,
  type ActionType,
  type ActionDeclaration,
  type WeaponCostsSimple,
} from "./action-validator";
