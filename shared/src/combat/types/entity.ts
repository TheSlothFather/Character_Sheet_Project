/**
 * Combat V2 - Entity Types
 *
 * Defines combat entities with tiered complexity:
 * - Minions: Simplified single-hit entities
 * - Full Entities: Complete resource tracking (PC, Lieutenant, Hero)
 */

import type { DamageType, DamageModifiers } from "./damage";

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

export type EntityTier = "minion" | "full" | "lieutenant" | "hero";

export type EntityController = "gm" | `player:${string}`;

export type EntityFaction = "ally" | "enemy" | "neutral";

// ═══════════════════════════════════════════════════════════════════════════
// HEX POSITION (Axial Coordinates)
// ═══════════════════════════════════════════════════════════════════════════

export interface HexPosition {
  /** Axial coordinate q */
  q: number;
  /** Axial coordinate r */
  r: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// WOUND COUNTS (8 Types)
// ═══════════════════════════════════════════════════════════════════════════

export interface WoundCounts {
  blunt: number;
  burn: number;
  freeze: number;
  laceration: number;
  mental: number;
  necrosis: number;
  holy_spiritual: number;
  unholy_spiritual: number;
}

export const EMPTY_WOUNDS: WoundCounts = {
  blunt: 0,
  burn: 0,
  freeze: 0,
  laceration: 0,
  mental: 0,
  necrosis: 0,
  holy_spiritual: 0,
  unholy_spiritual: 0,
};

// ═══════════════════════════════════════════════════════════════════════════
// STATUS EFFECTS (With Spiritual Split)
// ═══════════════════════════════════════════════════════════════════════════

export type StatusKey =
  | "BLESSED"
  | "BLINDED"
  | "BURNING"
  | "CHARMED"
  | "CRUSHING"
  | "CURSED"
  | "DAZED"
  | "DEAFENED"
  | "ENRAGED"
  | "FREEZING"
  | "HASTENED"
  | "INTOXICATED"
  | "BLEEDING"
  | "PRONE"
  | "RENDED_HOLY"
  | "RENDED_UNHOLY"
  | "ROTTING"
  | "SLOWED"
  | "STUPIFICATION"
  | "SUFFOCATING"
  | "UNCONSCIOUS";

export interface StatusEffect {
  /** Status effect identifier */
  key: StatusKey;
  /** Number of stacks (for stackable effects) */
  stacks: number;
  /** Rounds remaining (null = permanent until removed) */
  duration: number | null;
  /** Optional tick damage per round */
  tickDamage?: {
    woundType: DamageType;
    amount: number;
  };
  /** Source of the effect for logging */
  source?: string;
  /** When the effect was applied */
  appliedAt: string;
}

/**
 * Status effects that cause wound ticks each round
 */
export const STATUS_WOUND_TICKS: Record<StatusKey, { woundType: DamageType; amount: number } | null> = {
  BLESSED: null,
  BLINDED: null,
  BURNING: { woundType: "burn", amount: 1 },
  CHARMED: null,
  CRUSHING: { woundType: "blunt", amount: 1 },
  CURSED: null,
  DAZED: null,
  DEAFENED: null,
  ENRAGED: null,
  FREEZING: { woundType: "freeze", amount: 1 },
  HASTENED: null,
  INTOXICATED: null,
  BLEEDING: { woundType: "laceration", amount: 1 },
  PRONE: null,
  RENDED_HOLY: { woundType: "holy_spiritual", amount: 1 },
  RENDED_UNHOLY: { woundType: "unholy_spiritual", amount: 1 },
  ROTTING: { woundType: "necrosis", amount: 1 },
  SLOWED: null,
  STUPIFICATION: { woundType: "mental", amount: 1 },
  SUFFOCATING: null,
  UNCONSCIOUS: null,
};

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE MODIFIERS
// ═══════════════════════════════════════════════════════════════════════════

export interface ResourceModifier {
  /** Unique identifier */
  id: string;
  /** Type of modification */
  type: "add_max" | "reduce_max" | "add_current";
  /** Amount to modify */
  amount: number;
  /** Rounds remaining (null = permanent) */
  duration: number | null;
  /** Source of the modifier for display */
  source: string;
  /** When the modifier was applied */
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBAT RESOURCE (Energy or AP)
// ═══════════════════════════════════════════════════════════════════════════

export interface CombatResource {
  /** Current value */
  current: number;
  /** Maximum value (after modifiers) */
  max: number;
  /** Base maximum before modifiers */
  baseMax: number;
  /** Active modifiers */
  modifiers: ResourceModifier[];
}

/**
 * Calculate effective max from base + modifiers
 */
export function calculateEffectiveMax(resource: CombatResource): number {
  let effectiveMax = resource.baseMax;
  for (const modifier of resource.modifiers) {
    if (modifier.type === "add_max") effectiveMax += modifier.amount;
    else if (modifier.type === "reduce_max") effectiveMax -= modifier.amount;
  }
  return Math.max(0, effectiveMax);
}

// ═══════════════════════════════════════════════════════════════════════════
// BASE ENTITY (Shared properties)
// ═══════════════════════════════════════════════════════════════════════════

export interface BaseEntity {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Numbered display name (e.g., "Goblin 1") */
  displayName?: string;
  /** Base name for numbering duplicates */
  baseNameForNumbering?: string;
  /** Who controls this entity */
  controller: EntityController;
  /** Faction allegiance */
  faction: EntityFaction;
  /** Entity tier (determines complexity) */
  tier: EntityTier;
  /** Current hex position */
  position: HexPosition;
  /** Whether entity is alive */
  alive: boolean;
  /** Whether entity is unconscious */
  unconscious: boolean;
  /** Damage type modifiers */
  immunities: DamageType[];
  resistances: DamageType[];
  weaknesses: DamageType[];
  /** Active status effects */
  statusEffects: StatusEffect[];
  /** Skills with modifiers */
  skills: Record<string, number>;
  /** Skill used for initiative rolls */
  initiativeSkill: string;
  /** Reference to bestiary entry if NPC */
  bestiaryEntryId?: string;
  /** Reference to character if PC */
  characterId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MINION ENTITY (Simplified - Single Hit)
// ═══════════════════════════════════════════════════════════════════════════

export interface MinionEntity extends BaseEntity {
  tier: "minion";
  /** Damage threshold = DR. If damage exceeds this, minion is defeated. */
  damageThreshold: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL ENTITY (Complete Resource Tracking)
// ═══════════════════════════════════════════════════════════════════════════

export interface FullEntity extends BaseEntity {
  tier: "full" | "lieutenant" | "hero";

  /** Energy resource: 100 + 10×(Level-1) */
  energy: CombatResource;

  /** Action Points: 6 + 2×floor((Level-1)/5) */
  ap: CombatResource;

  /** Wound counts by type */
  wounds: WoundCounts;

  /** Character level (1-20+) */
  level: number;

  /** Physical attribute (for movement calculation) */
  physicalAttribute: number;

  /** Bonus to AP-to-Energy conversion from stamina potions */
  staminaPotionBonus: number;

  /** Whether reaction is available this round */
  reactionAvailable: boolean;

  /** Current channeling state if casting Ildakar spell */
  channeling?: ChannelingState;

  /** Default defense skill for auto-roll (NPCs) */
  defaultDefenseSkill?: string;

  /** Whether to auto-roll defense in contests (NPCs) */
  autoRollDefense?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANNELING STATE (Ildakar Multi-Turn Spells)
// ═══════════════════════════════════════════════════════════════════════════

export interface ChannelingState {
  /** Spell being channeled */
  spellTemplateId: string;
  spellName: string;
  /** Damage type of the spell (for blowback) */
  damageType: DamageType;
  /** Total Energy channeled so far */
  energyChanneled: number;
  /** Total AP channeled so far */
  apChanneled: number;
  /** Number of turns spent channeling */
  turnsChanneled: number;
  /** Required Energy to complete */
  requiredEnergy: number;
  /** Required AP to complete */
  requiredAP: number;
  /** Spell intensity for threshold calculations */
  intensity: number;
  /** When channeling started */
  startedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBAT ENTITY UNION TYPE
// ═══════════════════════════════════════════════════════════════════════════

export type CombatEntity = MinionEntity | FullEntity;

// ═══════════════════════════════════════════════════════════════════════════
// TYPE GUARDS
// ═══════════════════════════════════════════════════════════════════════════

export function isMinion(entity: CombatEntity): entity is MinionEntity {
  return entity.tier === "minion";
}

export function isFull(entity: CombatEntity): entity is FullEntity {
  return entity.tier === "full" || entity.tier === "lieutenant" || entity.tier === "hero";
}

export function isPlayerControlled(entity: CombatEntity): boolean {
  return entity.controller.startsWith("player:");
}

export function getPlayerId(entity: CombatEntity): string | null {
  if (entity.controller.startsWith("player:")) {
    return entity.controller.slice(7);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY FORMULAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate base Energy for a character level.
 * Formula: 100 + 10×(Level-1)
 */
export function calculateBaseEnergy(level: number): number {
  return 100 + 10 * (level - 1);
}

/**
 * Calculate base AP for a character level.
 * Formula: 6 + 2×floor((Level-1)/5)
 * Level 1-5: 6 AP, Level 6-10: 8 AP, Level 11-15: 10 AP, etc.
 */
export function calculateBaseAP(level: number): number {
  return 6 + 2 * Math.floor((level - 1) / 5);
}

/**
 * Calculate tier from level.
 * Tier 1 = Levels 1-5, Tier 2 = Levels 6-10, etc.
 */
export function calculateTier(level: number): number {
  return Math.ceil(level / 5);
}

/**
 * Calculate Energy gain from unspent AP at turn end.
 * Formula: Tier × (3 + staminaPotionBonus) × unspentAP
 */
export function calculateEndTurnEnergyGain(
  level: number,
  unspentAP: number,
  staminaPotionBonus: number = 0
): number {
  const tier = calculateTier(level);
  const factor = 3 + staminaPotionBonus;
  return tier * factor * unspentAP;
}

/**
 * Calculate movement hexes per AP.
 * Formula: max(Physical Attribute, 3)
 */
export function calculateMovementPerAP(physicalAttribute: number): number {
  return Math.max(physicalAttribute, 3);
}

/**
 * Calculate AP cost for moving a certain number of hexes.
 */
export function calculateMovementAPCost(hexes: number, physicalAttribute: number): number {
  const hexesPerAP = calculateMovementPerAP(physicalAttribute);
  return Math.ceil(hexes / hexesPerAP);
}
