/**
 * Combat V2 - Entity Factory
 *
 * Creates CombatEntity instances from characters and bestiary entries.
 * Handles tiered complexity (Minion vs Full entities).
 */

import type { DamageType } from "../types/damage";
import type {
  CombatEntity,
  MinionEntity,
  FullEntity,
  EntityTier,
  EntityController,
  EntityFaction,
  HexPosition,
  WoundCounts,
  StatusEffect,
  CombatResource,
  ResourceModifier,
} from "../types/entity";
import {
  EMPTY_WOUNDS,
  calculateBaseEnergy,
  calculateBaseAP,
  calculateEffectiveMax,
} from "../types/entity";

// ═══════════════════════════════════════════════════════════════════════════
// INPUT TYPES (from database/API)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Character data from Supabase characters table
 */
export interface CharacterInput {
  id: string;
  name: string;
  userId: string;
  level: number;

  // Attributes
  physicalAttribute?: number;

  // Skills
  skills?: Record<string, number>;
  skillAllocations?: Record<string, number>;
  skillBonuses?: Record<string, number>;
  initiativeSkill?: string;

  // Combat resources (persisted)
  energy_current?: number;
  energy_max?: number;
  ap_current?: number;
  ap_max?: number;

  // Damage modifiers
  immunities?: DamageType[];
  resistances?: DamageType[];
  weaknesses?: DamageType[];

  // Wounds (persisted)
  wounds?: WoundCounts;
}

/**
 * Bestiary entry data from Supabase bestiary_entries table
 */
export interface BestiaryEntryInput {
  id: string;
  name: string;

  // Entity tier
  entity_tier?: EntityTier;

  // Stats
  level?: number;
  physicalAttribute?: number;
  dr?: number;

  // Skills
  skills?: Record<string, number>;
  initiativeSkill?: string;
  defaultDefenseSkill?: string;
  autoRollDefense?: boolean;

  // Resources
  energy_max?: number;
  ap_max?: number;

  // Damage modifiers
  immunities?: DamageType[];
  resistances?: DamageType[];
  weaknesses?: DamageType[];
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY CREATION OPTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface EntityCreationOptions {
  /** Starting hex position */
  position: HexPosition;
  /** Faction (ally/enemy/neutral) */
  faction: EntityFaction;
  /** Override display name (for numbered monsters) */
  displayName?: string;
  /** Base name for numbering (e.g., "Goblin" for "Goblin 1") */
  baseNameForNumbering?: string;
  /** Pre-existing status effects */
  statusEffects?: StatusEffect[];
  /** Override controller */
  controller?: EntityController;
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE FROM CHARACTER (Player Characters)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a FullEntity from a player character.
 * Player characters always use the full entity system.
 */
export function createEntityFromCharacter(
  character: CharacterInput,
  options: EntityCreationOptions
): FullEntity {
  const level = character.level || 1;
  const physicalAttribute = character.physicalAttribute || 3;

  // Calculate base resources
  const baseEnergy = calculateBaseEnergy(level);
  const baseAP = calculateBaseAP(level);

  // Use persisted values if available, otherwise calculate
  const energyMax = character.energy_max ?? baseEnergy;
  const energyCurrent = character.energy_current ?? energyMax;
  const apMax = character.ap_max ?? baseAP;
  const apCurrent = character.ap_current ?? apMax;

  // Merge skill sources
  const skills = mergeSkills(
    character.skills,
    character.skillAllocations,
    character.skillBonuses
  );

  // Create energy resource
  const energy: CombatResource = {
    current: energyCurrent,
    max: energyMax,
    baseMax: baseEnergy,
    modifiers: [],
  };

  // Create AP resource
  const ap: CombatResource = {
    current: apCurrent,
    max: apMax,
    baseMax: baseAP,
    modifiers: [],
  };

  // Get wounds (persisted or empty)
  const wounds: WoundCounts = character.wounds ?? { ...EMPTY_WOUNDS };

  return {
    id: character.id,
    name: character.name,
    displayName: options.displayName,
    controller: options.controller ?? `player:${character.userId}`,
    faction: options.faction,
    tier: "full",
    position: options.position,
    alive: true,
    unconscious: false,

    // Damage modifiers
    immunities: character.immunities ?? [],
    resistances: character.resistances ?? [],
    weaknesses: character.weaknesses ?? [],

    // Status effects
    statusEffects: options.statusEffects ?? [],

    // Skills
    skills,
    initiativeSkill: character.initiativeSkill ?? "initiative",

    // Resources
    energy,
    ap,
    wounds,
    level,
    physicalAttribute,
    staminaPotionBonus: 0,
    reactionAvailable: true,

    // References
    characterId: character.id,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE FROM BESTIARY (NPCs/Monsters)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a CombatEntity from a bestiary entry.
 * Returns MinionEntity or FullEntity based on entity_tier.
 */
export function createEntityFromBestiary(
  entry: BestiaryEntryInput,
  entityId: string,
  options: EntityCreationOptions
): CombatEntity {
  const tier = entry.entity_tier ?? "minion";

  if (tier === "minion") {
    return createMinionFromBestiary(entry, entityId, options);
  } else {
    return createFullEntityFromBestiary(entry, entityId, tier, options);
  }
}

/**
 * Create a MinionEntity from a bestiary entry.
 * Minions have simplified mechanics (single hit with DR threshold).
 */
function createMinionFromBestiary(
  entry: BestiaryEntryInput,
  entityId: string,
  options: EntityCreationOptions
): MinionEntity {
  return {
    id: entityId,
    name: entry.name,
    displayName: options.displayName ?? entry.name,
    baseNameForNumbering: options.baseNameForNumbering,
    controller: options.controller ?? "gm",
    faction: options.faction,
    tier: "minion",
    position: options.position,
    alive: true,
    unconscious: false,

    // Damage modifiers
    immunities: entry.immunities ?? [],
    resistances: entry.resistances ?? [],
    weaknesses: entry.weaknesses ?? [],

    // Status effects
    statusEffects: options.statusEffects ?? [],

    // Skills
    skills: entry.skills ?? {},
    initiativeSkill: entry.initiativeSkill ?? "initiative",

    // Minion-specific
    damageThreshold: entry.dr ?? 0,

    // References
    bestiaryEntryId: entry.id,
  };
}

/**
 * Create a FullEntity from a bestiary entry (Lieutenant/Hero).
 */
function createFullEntityFromBestiary(
  entry: BestiaryEntryInput,
  entityId: string,
  tier: "full" | "lieutenant" | "hero",
  options: EntityCreationOptions
): FullEntity {
  const level = entry.level ?? 1;
  const physicalAttribute = entry.physicalAttribute ?? 3;

  // Calculate base resources
  const baseEnergy = calculateBaseEnergy(level);
  const baseAP = calculateBaseAP(level);

  // Use entry values if provided, otherwise calculate
  const energyMax = entry.energy_max ?? baseEnergy;
  const apMax = entry.ap_max ?? baseAP;

  // Create resources at full
  const energy: CombatResource = {
    current: energyMax,
    max: energyMax,
    baseMax: baseEnergy,
    modifiers: [],
  };

  const ap: CombatResource = {
    current: apMax,
    max: apMax,
    baseMax: baseAP,
    modifiers: [],
  };

  return {
    id: entityId,
    name: entry.name,
    displayName: options.displayName ?? entry.name,
    baseNameForNumbering: options.baseNameForNumbering,
    controller: options.controller ?? "gm",
    faction: options.faction,
    tier,
    position: options.position,
    alive: true,
    unconscious: false,

    // Damage modifiers
    immunities: entry.immunities ?? [],
    resistances: entry.resistances ?? [],
    weaknesses: entry.weaknesses ?? [],

    // Status effects
    statusEffects: options.statusEffects ?? [],

    // Skills
    skills: entry.skills ?? {},
    initiativeSkill: entry.initiativeSkill ?? "initiative",

    // Resources
    energy,
    ap,
    wounds: { ...EMPTY_WOUNDS },
    level,
    physicalAttribute,
    staminaPotionBonus: 0,
    reactionAvailable: true,

    // NPC-specific
    defaultDefenseSkill: entry.defaultDefenseSkill,
    autoRollDefense: entry.autoRollDefense ?? false,

    // References
    bestiaryEntryId: entry.id,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MONSTER NUMBERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Track monster counts for numbering duplicates.
 */
export interface MonsterCounter {
  counts: Record<string, number>;
}

export function createMonsterCounter(): MonsterCounter {
  return { counts: {} };
}

/**
 * Get the next number for a monster name.
 * Returns the display name (e.g., "Goblin 1") and updates the counter.
 */
export function getNextMonsterNumber(
  counter: MonsterCounter,
  baseName: string
): { displayName: string; number: number } {
  const current = counter.counts[baseName] ?? 0;
  const next = current + 1;
  counter.counts[baseName] = next;

  return {
    displayName: `${baseName} ${next}`,
    number: next,
  };
}

/**
 * Create multiple entities from the same bestiary entry with numbering.
 */
export function createNumberedEntitiesFromBestiary(
  entry: BestiaryEntryInput,
  count: number,
  counter: MonsterCounter,
  baseOptions: Omit<EntityCreationOptions, "displayName" | "baseNameForNumbering">,
  positionGenerator: (index: number) => HexPosition
): CombatEntity[] {
  const entities: CombatEntity[] = [];

  for (let i = 0; i < count; i++) {
    const { displayName, number } = getNextMonsterNumber(counter, entry.name);
    const entityId = `${entry.id}-${number}`;

    const entity = createEntityFromBestiary(entry, entityId, {
      ...baseOptions,
      position: positionGenerator(i),
      displayName,
      baseNameForNumbering: entry.name,
    });

    entities.push(entity);
  }

  return entities;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Merge multiple skill sources into a single record.
 */
function mergeSkills(
  ...sources: (Record<string, number> | undefined)[]
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const source of sources) {
    if (!source) continue;
    for (const [skill, value] of Object.entries(source)) {
      result[skill] = (result[skill] ?? 0) + value;
    }
  }

  return result;
}

/**
 * Generate a unique entity ID.
 */
export function generateEntityId(): string {
  return crypto.randomUUID();
}

/**
 * Clone an entity with a new ID.
 */
export function cloneEntity<T extends CombatEntity>(
  entity: T,
  newId?: string
): T {
  return {
    ...entity,
    id: newId ?? generateEntityId(),
    statusEffects: [...entity.statusEffects],
    immunities: [...entity.immunities],
    resistances: [...entity.resistances],
    weaknesses: [...entity.weaknesses],
  };
}

/**
 * Reset a full entity to fresh combat state.
 */
export function resetEntityForCombat(entity: FullEntity): FullEntity {
  const baseEnergy = entity.energy.baseMax;
  const baseAP = entity.ap.baseMax;

  return {
    ...entity,
    energy: {
      current: baseEnergy,
      max: baseEnergy,
      baseMax: baseEnergy,
      modifiers: [],
    },
    ap: {
      current: baseAP,
      max: baseAP,
      baseMax: baseAP,
      modifiers: [],
    },
    wounds: { ...EMPTY_WOUNDS },
    statusEffects: [],
    alive: true,
    unconscious: false,
    reactionAvailable: true,
    channeling: undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE MODIFIER HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add a modifier to a resource.
 */
export function addResourceModifier(
  resource: CombatResource,
  modifier: Omit<ResourceModifier, "id" | "createdAt">
): CombatResource {
  const newModifier: ResourceModifier = {
    ...modifier,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  const newResource = {
    ...resource,
    modifiers: [...resource.modifiers, newModifier],
  };

  // Recalculate effective max
  newResource.max = calculateEffectiveMax(newResource);

  // Ensure current doesn't exceed new max
  if (newResource.current > newResource.max) {
    newResource.current = newResource.max;
  }

  return newResource;
}

/**
 * Remove a modifier from a resource.
 */
export function removeResourceModifier(
  resource: CombatResource,
  modifierId: string
): CombatResource {
  const newResource = {
    ...resource,
    modifiers: resource.modifiers.filter((m) => m.id !== modifierId),
  };

  // Recalculate effective max
  newResource.max = calculateEffectiveMax(newResource);

  // Ensure current doesn't exceed new max
  if (newResource.current > newResource.max) {
    newResource.current = newResource.max;
  }

  return newResource;
}

/**
 * Decrement duration on all modifiers and remove expired ones.
 */
export function tickResourceModifiers(resource: CombatResource): CombatResource {
  const newModifiers = resource.modifiers
    .map((m) => {
      if (m.duration === null) return m; // Permanent
      return { ...m, duration: m.duration - 1 };
    })
    .filter((m) => m.duration === null || m.duration > 0);

  const newResource = {
    ...resource,
    modifiers: newModifiers,
  };

  // Recalculate effective max
  newResource.max = calculateEffectiveMax(newResource);

  return newResource;
}
