/**
 * Combat State Factory for Combat V2 Testing
 *
 * Creates mock CombatV2State objects for testing different combat scenarios.
 */

import type { CombatV2State, CombatV2Entity, InitiativeEntry, GridPosition, GridConfig, MapConfig } from "../../../api/combatV2Socket";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateCombatStateOptions {
  combatId?: string;
  campaignId?: string;
  phase?: CombatV2State["phase"];
  round?: number;
  entities?: CombatV2Entity[];
  currentEntityId?: string | null;
  currentTurnIndex?: number;
  gridPositions?: Record<string, GridPosition>;
  gridConfig?: GridConfig;
  mapConfig?: MapConfig;
  initiative?: InitiativeEntry[];
  version?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create initiative entries from entities.
 * Assigns descending roll values by default (first entity has highest initiative).
 */
export function createInitiativeFromEntities(
  entities: CombatV2Entity[],
  options: { startRoll?: number; delayed?: boolean[]; readied?: boolean[] } = {}
): InitiativeEntry[] {
  const { startRoll = 20, delayed = [], readied = [] } = options;

  return entities.map((entity, index) => ({
    entityId: entity.id,
    roll: startRoll - index,
    tiebreaker: Math.random(),
    delayed: delayed[index] ?? false,
    readied: readied[index] ?? false,
  }));
}

/**
 * Create grid positions for entities in a line.
 */
export function createLinePositions(
  entities: CombatV2Entity[],
  startRow: number = 5,
  startCol: number = 5
): Record<string, GridPosition> {
  const positions: Record<string, GridPosition> = {};
  entities.forEach((entity, index) => {
    positions[entity.id] = { row: startRow, col: startCol + index * 2 };
  });
  return positions;
}

/**
 * Create grid positions for entities in two opposing lines.
 */
export function createBattleLinePositions(
  allies: CombatV2Entity[],
  enemies: CombatV2Entity[],
  gap: number = 6
): Record<string, GridPosition> {
  const positions: Record<string, GridPosition> = {};

  // Allies on left side
  allies.forEach((entity, index) => {
    positions[entity.id] = { row: 5 + index, col: 5 };
  });

  // Enemies on right side (across the gap)
  enemies.forEach((entity, index) => {
    positions[entity.id] = { row: 5 + index, col: 5 + gap };
  });

  return positions;
}

/**
 * Create a full combat state with sensible defaults.
 */
export function createCombatState(options: CreateCombatStateOptions = {}): CombatV2State {
  const combatId = options.combatId ?? "test-combat-id";
  const campaignId = options.campaignId ?? "test-campaign-id";
  const entities = options.entities ?? [];
  const phase = options.phase ?? "active";
  const round = options.round ?? 1;

  // Build entities record
  const entitiesRecord: Record<string, CombatV2Entity> = {};
  entities.forEach((e) => {
    entitiesRecord[e.id] = e;
  });

  // Build initiative if not provided
  const initiative = options.initiative ?? createInitiativeFromEntities(entities);

  // Determine current turn
  let currentTurnIndex = options.currentTurnIndex ?? 0;
  let currentEntityId = options.currentEntityId;

  if (currentEntityId === undefined) {
    // Default to first entity in initiative
    currentEntityId = initiative[0]?.entityId ?? null;
  } else if (currentEntityId !== null && currentTurnIndex === 0) {
    // Find turn index from entity ID
    const foundIndex = initiative.findIndex((i) => i.entityId === currentEntityId);
    if (foundIndex >= 0) {
      currentTurnIndex = foundIndex;
    }
  }

  // Build grid positions if not provided
  const gridPositions = options.gridPositions ?? createLinePositions(entities);

  // Default grid configuration
  const gridConfig = options.gridConfig ?? {
    rows: 20,
    cols: 30,
    cellSize: 40,
    offsetX: 0,
    offsetY: 0,
    visible: true,
    opacity: 0.5,
  };

  // Default map configuration
  const mapConfig = options.mapConfig ?? {
    imageUrl: null,
    imageKey: null,
    imageWidth: null,
    imageHeight: null,
    templateId: null,
  };

  return {
    combatId,
    campaignId,
    phase,
    round,
    currentTurnIndex,
    currentEntityId,
    entities: entitiesRecord,
    initiative,
    gridPositions,
    gridConfig,
    mapConfig,
    version: options.version ?? 1,
  };
}

/**
 * Create combat state in the "setup" phase (before initiative rolls).
 */
export function createSetupState(options: CreateCombatStateOptions = {}): CombatV2State {
  return createCombatState({
    phase: "setup",
    round: 0,
    currentEntityId: null,
    currentTurnIndex: -1,
    initiative: [],
    ...options,
  });
}

/**
 * Create combat state in the "initiative" phase (lobby, waiting for rolls).
 */
export function createLobbyState(options: CreateCombatStateOptions = {}): CombatV2State {
  const entities = options.entities ?? [];

  // In lobby, initiative entries exist but may not all have rolls yet
  const initiative =
    options.initiative ??
    entities.map((e) => ({
      entityId: e.id,
      roll: 0, // Not rolled yet
      tiebreaker: 0,
      delayed: false,
      readied: false,
    }));

  return createCombatState({
    phase: "initiative",
    round: 0,
    currentEntityId: null,
    currentTurnIndex: -1,
    initiative,
    ...options,
  });
}

/**
 * Create combat state in "active" phase (combat in progress).
 */
export function createActiveState(options: CreateCombatStateOptions = {}): CombatV2State {
  return createCombatState({
    phase: "active",
    round: options.round ?? 1,
    ...options,
  });
}

/**
 * Create combat state in "active-turn" phase (entity is taking their turn).
 */
export function createActiveTurnState(options: CreateCombatStateOptions = {}): CombatV2State {
  return createCombatState({
    phase: "active-turn",
    round: options.round ?? 1,
    ...options,
  });
}

/**
 * Create combat state in "completed" phase (combat ended).
 */
export function createCompletedState(options: CreateCombatStateOptions = {}): CombatV2State {
  return createCombatState({
    phase: "completed",
    currentEntityId: null,
    currentTurnIndex: -1,
    ...options,
  });
}

/**
 * Create combat state for a specific entity's turn.
 */
export function createStateForEntityTurn(
  entityId: string,
  entities: CombatV2Entity[],
  options: Omit<CreateCombatStateOptions, "entities" | "currentEntityId"> = {}
): CombatV2State {
  const initiative = createInitiativeFromEntities(entities);
  const turnIndex = initiative.findIndex((i) => i.entityId === entityId);

  return createCombatState({
    entities,
    currentEntityId: entityId,
    currentTurnIndex: turnIndex >= 0 ? turnIndex : 0,
    initiative,
    phase: "active-turn",
    ...options,
  });
}

/**
 * Create a mid-combat state (round 3, some entities wounded).
 */
export function createMidCombatState(
  entities: CombatV2Entity[],
  options: CreateCombatStateOptions = {}
): CombatV2State {
  // Apply some damage to entities to simulate mid-combat
  const damagedEntities = entities.map((e, index) => {
    if (e.faction === "enemy" && e.energy) {
      // Enemies have taken some damage
      const damage = Math.floor(e.energy.max * 0.3);
      return {
        ...e,
        energy: { ...e.energy, current: e.energy.max - damage },
      };
    }
    if (e.faction === "ally" && index % 2 === 0 && e.energy) {
      // Some allies have minor damage
      const damage = Math.floor(e.energy.max * 0.1);
      return {
        ...e,
        energy: { ...e.energy, current: e.energy.max - damage },
      };
    }
    return e;
  });

  return createActiveState({
    entities: damagedEntities,
    round: 3,
    ...options,
  });
}

/**
 * Create an empty combat state (no entities).
 */
export function createEmptyState(options: Omit<CreateCombatStateOptions, "entities"> = {}): CombatV2State {
  return createCombatState({
    entities: [],
    initiative: [],
    gridPositions: {},
    currentEntityId: null,
    currentTurnIndex: -1,
    ...options,
  });
}
