/**
 * Entity Factory for Combat V2 Testing
 *
 * Creates mock CombatV2Entity objects for testing.
 */

import type { CombatV2Entity } from "../../../api/combatV2Socket";

let entityCounter = 0;

/**
 * Reset the entity counter (call in beforeEach)
 */
export function resetEntityCounter(): void {
  entityCounter = 0;
}

/**
 * Create a generic combat entity with sensible defaults.
 * Override any field via the overrides parameter.
 */
export function createEntity(overrides: Partial<CombatV2Entity> = {}): CombatV2Entity {
  const id = overrides.id ?? `entity-${++entityCounter}`;
  const name = overrides.name ?? `Entity ${entityCounter}`;

  return {
    id,
    name,
    displayName: overrides.displayName ?? name,
    tier: overrides.tier ?? "full",
    faction: overrides.faction ?? "ally",
    controller: overrides.controller ?? "gm",
    entityType: overrides.entityType ?? "npc",
    level: overrides.level ?? 5,
    ap: overrides.ap ?? { current: 6, max: 6 },
    energy: overrides.energy ?? { current: 100, max: 100 },
    wounds: overrides.wounds ?? {},
    immunities: overrides.immunities ?? [],
    resistances: overrides.resistances ?? [],
    weaknesses: overrides.weaknesses ?? [],
    alive: overrides.alive ?? true,
    unconscious: overrides.unconscious ?? false,
    ...overrides,
  };
}

/**
 * Create a player character entity.
 * Automatically sets controller to `player:{playerId}`, entityType to "pc",
 * tier to "hero", and faction to "ally".
 */
export function createPlayerCharacter(
  playerId: string,
  characterId: string,
  overrides: Partial<CombatV2Entity> = {}
): CombatV2Entity {
  return createEntity({
    id: characterId,
    name: overrides.name ?? "Player Character",
    tier: "hero",
    faction: "ally",
    controller: `player:${playerId}`,
    entityType: "pc",
    characterId,
    level: overrides.level ?? 5,
    ap: overrides.ap ?? { current: 6, max: 6 },
    energy: overrides.energy ?? { current: 120, max: 120 },
    ...overrides,
  });
}

/**
 * Create an enemy entity.
 * Sets faction to "enemy" and controller to "gm".
 */
export function createEnemy(overrides: Partial<CombatV2Entity> = {}): CombatV2Entity {
  return createEntity({
    name: overrides.name ?? "Enemy",
    faction: "enemy",
    controller: "gm",
    entityType: "monster",
    ...overrides,
  });
}

/**
 * Create a minion-tier enemy (weaker stats).
 */
export function createMinion(overrides: Partial<CombatV2Entity> = {}): CombatV2Entity {
  return createEnemy({
    name: overrides.name ?? "Minion",
    tier: "minion",
    ap: overrides.ap ?? { current: 3, max: 3 },
    energy: overrides.energy ?? { current: 30, max: 30 },
    ...overrides,
  });
}

/**
 * Create a lieutenant-tier enemy (moderate stats).
 */
export function createLieutenant(overrides: Partial<CombatV2Entity> = {}): CombatV2Entity {
  return createEnemy({
    name: overrides.name ?? "Lieutenant",
    tier: "lieutenant",
    ap: overrides.ap ?? { current: 6, max: 6 },
    energy: overrides.energy ?? { current: 150, max: 150 },
    ...overrides,
  });
}

/**
 * Create a hero-tier enemy (boss stats).
 */
export function createBoss(overrides: Partial<CombatV2Entity> = {}): CombatV2Entity {
  return createEnemy({
    name: overrides.name ?? "Boss",
    tier: "hero",
    ap: overrides.ap ?? { current: 8, max: 8 },
    energy: overrides.energy ?? { current: 250, max: 250 },
    ...overrides,
  });
}

/**
 * Create an NPC ally (friendly non-player).
 */
export function createAllyNPC(overrides: Partial<CombatV2Entity> = {}): CombatV2Entity {
  return createEntity({
    name: overrides.name ?? "Ally NPC",
    faction: "ally",
    controller: "gm",
    entityType: "npc",
    ...overrides,
  });
}

/**
 * Create a neutral entity.
 */
export function createNeutral(overrides: Partial<CombatV2Entity> = {}): CombatV2Entity {
  return createEntity({
    name: overrides.name ?? "Neutral",
    faction: "neutral",
    controller: "gm",
    entityType: "npc",
    ...overrides,
  });
}

/**
 * Create an entity that is channeling a spell.
 */
export function createChannelingEntity(
  overrides: Partial<CombatV2Entity> = {},
  channelingOverrides: Partial<NonNullable<CombatV2Entity["channeling"]>> = {}
): CombatV2Entity {
  return createEntity({
    ...overrides,
    channeling: {
      spellName: channelingOverrides.spellName ?? "Fireball",
      energyChanneled: channelingOverrides.energyChanneled ?? 10,
      apChanneled: channelingOverrides.apChanneled ?? 2,
      totalCost: channelingOverrides.totalCost ?? 30,
      progress: channelingOverrides.progress ?? 0.33,
      ...channelingOverrides,
    },
  });
}

/**
 * Create a wounded entity.
 */
export function createWoundedEntity(
  wounds: Record<string, number>,
  overrides: Partial<CombatV2Entity> = {}
): CombatV2Entity {
  return createEntity({
    ...overrides,
    wounds,
  });
}

/**
 * Create an unconscious entity.
 */
export function createUnconsciousEntity(overrides: Partial<CombatV2Entity> = {}): CombatV2Entity {
  return createEntity({
    ...overrides,
    unconscious: true,
    energy: overrides.energy ?? { current: 0, max: 100 },
  });
}

/**
 * Create a dead entity.
 */
export function createDeadEntity(overrides: Partial<CombatV2Entity> = {}): CombatV2Entity {
  return createEntity({
    ...overrides,
    alive: false,
    unconscious: true,
    energy: overrides.energy ?? { current: 0, max: 100 },
  });
}

/**
 * Create multiple entities at once.
 */
export function createEntities(count: number, overrides: Partial<CombatV2Entity> = {}): CombatV2Entity[] {
  return Array.from({ length: count }, () => createEntity(overrides));
}

/**
 * Create a battle scenario with allies and enemies.
 */
export function createBattleScenario(config: {
  playerCount?: number;
  enemyCount?: number;
  minionCount?: number;
  playerId?: string;
}): {
  players: CombatV2Entity[];
  enemies: CombatV2Entity[];
  minions: CombatV2Entity[];
  all: CombatV2Entity[];
} {
  const {
    playerCount = 1,
    enemyCount = 2,
    minionCount = 3,
    playerId = "test-player-id",
  } = config;

  const players = Array.from({ length: playerCount }, (_, i) =>
    createPlayerCharacter(playerId, `char-${i + 1}`, { name: `Hero ${i + 1}` })
  );

  const enemies = Array.from({ length: enemyCount }, (_, i) =>
    createEnemy({ name: `Enemy ${i + 1}` })
  );

  const minions = Array.from({ length: minionCount }, (_, i) =>
    createMinion({ name: `Minion ${i + 1}` })
  );

  return {
    players,
    enemies,
    minions,
    all: [...players, ...enemies, ...minions],
  };
}
