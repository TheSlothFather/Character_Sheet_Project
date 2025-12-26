/**
 * Combat V2 - Turn Manager
 *
 * Handles initiative, turn order, and round progression.
 * Manages the combat flow lifecycle.
 */

import type {
  CombatEntity,
  FullEntity,
} from "../types/entity";
import { isFull, calculateTier } from "../types/entity";
import type { InitiativeEntry as StateInitiativeEntry } from "../types/state";

// ═══════════════════════════════════════════════════════════════════════════
// TURN ORDER INITIATIVE ENTRY (Extended for turn management)
// ═══════════════════════════════════════════════════════════════════════════

export interface InitiativeEntry {
  entityId: string;
  entityName: string;
  total: number;
  tiebreaker: number;
  hasActed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIATIVE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export interface InitiativeRoll {
  entityId: string;
  skillBonus: number;
  diceResult: number;
  total: number;
  tiebreaker: number; // Secondary roll or random for ties
}

/**
 * Sort initiative entries by total (descending), then tiebreaker.
 */
export function sortInitiative(entries: InitiativeEntry[]): InitiativeEntry[] {
  return [...entries].sort((a, b) => {
    // Higher total goes first
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    // Tiebreaker (higher wins)
    return b.tiebreaker - a.tiebreaker;
  });
}

/**
 * Create an initiative entry from a roll.
 */
export function createInitiativeEntry(
  entity: CombatEntity,
  roll: InitiativeRoll
): InitiativeEntry {
  return {
    entityId: entity.id,
    entityName: entity.displayName ?? entity.name,
    total: roll.total,
    tiebreaker: roll.tiebreaker,
    hasActed: false,
  };
}

/**
 * Get the skill bonus for initiative from an entity.
 */
export function getInitiativeBonus(entity: CombatEntity): number {
  const skillName = entity.initiativeSkill ?? "initiative";
  return entity.skills[skillName] ?? 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// TURN ORDER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface TurnOrderState {
  /** Sorted list of initiative entries */
  order: InitiativeEntry[];
  /** Index of current turn in order array */
  currentIndex: number;
  /** Current round number (1-indexed) */
  round: number;
}

/**
 * Create initial turn order from initiative rolls.
 */
export function createTurnOrder(entries: InitiativeEntry[]): TurnOrderState {
  return {
    order: sortInitiative(entries),
    currentIndex: 0,
    round: 1,
  };
}

/**
 * Get the current entity in turn order.
 */
export function getCurrentTurnEntity(state: TurnOrderState): InitiativeEntry | null {
  if (state.order.length === 0) return null;
  return state.order[state.currentIndex] ?? null;
}

/**
 * Get the next entity that will act.
 */
export function getNextTurnEntity(state: TurnOrderState): InitiativeEntry | null {
  if (state.order.length === 0) return null;
  const nextIndex = (state.currentIndex + 1) % state.order.length;
  return state.order[nextIndex] ?? null;
}

/**
 * Advance to the next turn, handling round wrap.
 * Returns new state and whether a new round started.
 */
export function advanceTurn(state: TurnOrderState): {
  newState: TurnOrderState;
  newRoundStarted: boolean;
} {
  const nextIndex = state.currentIndex + 1;
  const newRoundStarted = nextIndex >= state.order.length;

  // Mark current entity as having acted
  const updatedOrder = state.order.map((entry, idx) =>
    idx === state.currentIndex ? { ...entry, hasActed: true } : entry
  );

  if (newRoundStarted) {
    // Reset hasActed flags for new round
    return {
      newState: {
        order: updatedOrder.map((entry) => ({ ...entry, hasActed: false })),
        currentIndex: 0,
        round: state.round + 1,
      },
      newRoundStarted: true,
    };
  }

  return {
    newState: {
      ...state,
      order: updatedOrder,
      currentIndex: nextIndex,
    },
    newRoundStarted: false,
  };
}

/**
 * Remove an entity from turn order (when they die or leave combat).
 */
export function removeFromTurnOrder(
  state: TurnOrderState,
  entityId: string
): TurnOrderState {
  const removeIndex = state.order.findIndex((e) => e.entityId === entityId);
  if (removeIndex === -1) return state;

  const newOrder = state.order.filter((e) => e.entityId !== entityId);

  // Adjust current index if needed
  let newCurrentIndex = state.currentIndex;
  if (removeIndex < state.currentIndex) {
    newCurrentIndex--;
  } else if (removeIndex === state.currentIndex && newCurrentIndex >= newOrder.length) {
    newCurrentIndex = 0;
  }

  return {
    ...state,
    order: newOrder,
    currentIndex: Math.max(0, Math.min(newCurrentIndex, newOrder.length - 1)),
  };
}

/**
 * Add a new entity to turn order (summoned creature, late joiner).
 */
export function addToTurnOrder(
  state: TurnOrderState,
  entry: InitiativeEntry
): TurnOrderState {
  const newOrder = sortInitiative([...state.order, entry]);
  const newIndex = newOrder.findIndex((e) => e.entityId === entry.entityId);

  // Adjust current index if the new entity is inserted before current
  let newCurrentIndex = state.currentIndex;
  if (newIndex <= state.currentIndex) {
    newCurrentIndex++;
  }

  return {
    ...state,
    order: newOrder,
    currentIndex: newCurrentIndex,
  };
}

/**
 * Update initiative for an entity (haste/slow effects).
 */
export function updateInitiative(
  state: TurnOrderState,
  entityId: string,
  newTotal: number
): TurnOrderState {
  const entry = state.order.find((e) => e.entityId === entityId);
  if (!entry) return state;

  const updatedEntry: InitiativeEntry = { ...entry, total: newTotal };
  const currentEntityId = state.order[state.currentIndex]?.entityId;

  // Remove and re-add to maintain sort
  const filteredOrder = state.order.filter((e) => e.entityId !== entityId);
  const newOrder = sortInitiative([...filteredOrder, updatedEntry]);

  // Find where current entity ended up
  const newCurrentIndex = newOrder.findIndex((e) => e.entityId === currentEntityId);

  return {
    ...state,
    order: newOrder,
    currentIndex: Math.max(0, newCurrentIndex),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TURN START/END PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

export interface TurnStartResult {
  /** Entity starting their turn */
  entity: CombatEntity;
  /** Updated entity after turn start processing */
  updatedEntity: CombatEntity;
  /** Energy lost to bleeding this turn */
  bleedingDamage: number;
  /** Status effects that ticked */
  statusEffectsTicked: string[];
  /** Status effects that expired */
  statusEffectsExpired: string[];
  /** Audit trail */
  audit: string[];
}

/**
 * Process turn start for an entity.
 * - Tick status effects
 * - Apply bleeding damage
 * - Reset reaction availability
 * - Regenerate AP
 */
export function processTurnStart(
  entity: CombatEntity
): TurnStartResult {
  const audit: string[] = [];
  let updatedEntity = { ...entity };

  // Tick status effects (decrement duration, apply effects)
  const statusTicked: string[] = [];
  const statusExpired: string[] = [];

  updatedEntity.statusEffects = updatedEntity.statusEffects
    .map((effect) => {
      statusTicked.push(effect.key);
      if (effect.duration === null) return effect; // Permanent
      const newDuration = effect.duration - 1;
      if (newDuration <= 0) {
        statusExpired.push(effect.key);
        return null;
      }
      return { ...effect, duration: newDuration };
    })
    .filter((effect): effect is NonNullable<typeof effect> => effect !== null);

  if (statusExpired.length > 0) {
    audit.push(`Status effects expired: ${statusExpired.join(", ")}`);
  }

  // Process bleeding for full entities
  let bleedingDamage = 0;
  if (isFull(updatedEntity)) {
    const lacerationWounds = updatedEntity.wounds.laceration ?? 0;
    if (lacerationWounds > 0) {
      bleedingDamage = lacerationWounds * 3;
      const newEnergy = Math.max(0, updatedEntity.energy.current - bleedingDamage);
      updatedEntity = {
        ...updatedEntity,
        energy: {
          ...updatedEntity.energy,
          current: newEnergy,
        },
      };
      audit.push(`Bleeding: -${bleedingDamage} energy (${lacerationWounds} laceration wounds)`);
    }

    // Reset reaction availability
    updatedEntity = {
      ...updatedEntity,
      reactionAvailable: true,
    };

    // Regenerate AP to max at turn start
    const apMax = updatedEntity.ap.max;
    if (updatedEntity.ap.current !== apMax) {
      audit.push(`AP restored to ${apMax}`);
      updatedEntity = {
        ...updatedEntity,
        ap: {
          ...updatedEntity.ap,
          current: apMax,
        },
      };
    }
  }

  return {
    entity,
    updatedEntity,
    bleedingDamage,
    statusEffectsTicked: statusTicked,
    statusEffectsExpired: statusExpired,
    audit,
  };
}

export interface TurnEndResult {
  /** Entity ending their turn */
  entity: FullEntity;
  /** Updated entity after turn end processing */
  updatedEntity: FullEntity;
  /** AP that was unspent */
  unspentAP: number;
  /** Energy gained from unspent AP */
  energyGained: number;
  /** Audit trail */
  audit: string[];
}

/**
 * Process turn end for a full entity.
 * - Convert unspent AP to Energy
 * - Formula: Tier × (3 + staminaPotionBonus) × unspentAP
 */
export function processTurnEnd(
  entity: FullEntity
): TurnEndResult {
  const audit: string[] = [];
  const unspentAP = entity.ap.current;

  // Calculate energy gain
  const tier = calculateTier(entity.level);
  const factor = 3 + (entity.staminaPotionBonus ?? 0);
  const energyGain = tier * factor * unspentAP;

  // Apply energy gain (capped at max)
  const currentEnergy = entity.energy.current;
  const maxEnergy = entity.energy.max;
  const newEnergy = Math.min(maxEnergy, currentEnergy + energyGain);
  const actualGain = newEnergy - currentEnergy;

  if (energyGain > 0) {
    audit.push(
      `Unspent AP: ${unspentAP} → +${energyGain} energy ` +
      `(Tier ${tier} × ${factor} × ${unspentAP})`
    );
    if (actualGain < energyGain) {
      audit.push(`Energy capped at max (${maxEnergy})`);
    }
  }

  // Reset AP to 0 at end of turn (will be restored at start of next turn)
  const updatedEntity: FullEntity = {
    ...entity,
    energy: {
      ...entity.energy,
      current: newEnergy,
    },
    ap: {
      ...entity.ap,
      current: 0,
    },
  };

  return {
    entity,
    updatedEntity,
    unspentAP,
    energyGained: actualGain,
    audit,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUND MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface RoundStartResult {
  /** Round number that started */
  round: number;
  /** Entities in turn order */
  turnOrder: InitiativeEntry[];
  /** Audit message */
  audit: string;
}

/**
 * Process round start.
 */
export function processRoundStart(
  state: TurnOrderState
): RoundStartResult {
  return {
    round: state.round,
    turnOrder: state.order,
    audit: `Round ${state.round} begins`,
  };
}

export interface RoundEndResult {
  /** Round number that ended */
  round: number;
  /** Audit message */
  audit: string;
}

/**
 * Process round end.
 */
export function processRoundEnd(
  state: TurnOrderState
): RoundEndResult {
  return {
    round: state.round,
    audit: `Round ${state.round} ends`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DELAY/READY ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Delay current turn - move to end of initiative order.
 */
export function delayTurn(state: TurnOrderState): TurnOrderState {
  const current = state.order[state.currentIndex];
  if (!current) return state;

  // Move current entity to end
  const newOrder = [
    ...state.order.slice(0, state.currentIndex),
    ...state.order.slice(state.currentIndex + 1),
    current,
  ];

  return {
    ...state,
    order: newOrder,
    // Current index stays the same (next entity moves into this slot)
  };
}

/**
 * Ready an action - entity will act after a specified trigger.
 * For now, this just marks the entity as having a readied action.
 */
export function readyAction(
  state: TurnOrderState,
  _trigger: string
): TurnOrderState {
  // In a full implementation, this would store the trigger condition
  // For now, we just advance the turn
  return advanceTurn(state).newState;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if it's a specific entity's turn.
 */
export function isEntitysTurn(
  state: TurnOrderState,
  entityId: string
): boolean {
  const current = getCurrentTurnEntity(state);
  return current?.entityId === entityId;
}

/**
 * Get remaining entities that haven't acted this round.
 */
export function getRemainingActors(state: TurnOrderState): InitiativeEntry[] {
  return state.order.slice(state.currentIndex);
}

/**
 * Get entities that have already acted this round.
 */
export function getActedEntities(state: TurnOrderState): InitiativeEntry[] {
  return state.order.slice(0, state.currentIndex);
}

/**
 * Check if the round is complete (all entities have acted).
 */
export function isRoundComplete(state: TurnOrderState): boolean {
  return state.currentIndex >= state.order.length;
}

/**
 * Get the position of an entity in turn order.
 */
export function getTurnPosition(
  state: TurnOrderState,
  entityId: string
): number {
  return state.order.findIndex((e) => e.entityId === entityId);
}
