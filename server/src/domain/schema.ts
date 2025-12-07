// High-level TypeScript domain models and DB-shape interfaces.
// These are intentionally focused on the Adûrun system but remain generic.

export type ID = string;

export interface Ruleset {
  id: ID;
  key: string; // e.g. "adurun-core-v1"
  name: string;
  description?: string;
  isActive: boolean;
}

export interface AttributeDef {
  id: ID;
  rulesetId: ID;
  key: string; // e.g. "FEAT_OF_STRENGTH"
  name: string;
  description?: string;
}

export interface SkillDef {
  id: ID;
  rulesetId: ID;
  key: string; // e.g. "ACADEMIC_RECALL"
  name: string;
  attributeKey?: string; // FK-ish into AttributeDef.key within same ruleset
  description?: string;
}

export interface Race {
  id: ID;
  rulesetId: ID;
  key: string;
  name: string;
  description?: string;
}

export interface Subrace {
  id: ID;
  rulesetId: ID;
  key: string;
  raceKey: string; // race.key within same ruleset
  name: string;
  description?: string;
}

export interface Feat {
  id: ID;
  rulesetId: ID;
  key: string;
  name: string;
  description?: string;
  prereqExpression?: unknown; // JSON expression evaluated by rules engine
}

export interface ItemDef {
  id: ID;
  rulesetId: ID;
  key: string;
  name: string;
  slot?: string; // weapon, armor, etc.
  description?: string;
}

export interface StatusEffectDef {
  id: ID;
  rulesetId: ID;
  key: string;
  name: string;
  description?: string;
  defaultDurationType?: "rounds" | "scene" | "session" | "permanent";
}

export interface DerivedStatDef {
  id: ID;
  rulesetId: ID;
  key: string; // e.g. "HP_MAX", "INITIATIVE"
  name: string;
  description?: string;
  expression: unknown; // JSON expression
}

export type ModifierSourceType =
  | "race"
  | "subrace"
  | "feat"
  | "item"
  | "status_effect"
  | "background"
  | "other";

export type ModifierOperation = "add" | "mul" | "set" | "max" | "min";

export interface ModifierDef {
  id: ID;
  rulesetId: ID;
  sourceType: ModifierSourceType;
  sourceKey: string; // e.g. feat key, race key, etc.
  targetPath: string; // e.g. "skills.ACADEMIC_RECALL.total"
  operation: ModifierOperation;
  stackingKey?: string;
  priority?: number;
  valueExpression: unknown; // JSON expression
  conditionExpression?: unknown; // JSON expression
}

// Characters and campaigns (simplified shapes)

export interface Character {
  id: ID;
  userId: ID;
  rulesetId: ID;
  name: string;
  level: number;
  raceKey?: string;
  subraceKey?: string;
  notes?: string;
}

export interface CharacterAttribute {
  characterId: ID;
  attributeKey: string;
  baseScore: number;
}

export interface CharacterSkill {
  characterId: ID;
  skillKey: string;
  ranks: number;
}

export interface CharacterFeat {
  characterId: ID;
  featKey: string;
}

export interface CharacterItem {
  id: ID;
  characterId: ID;
  itemKey: string;
  isEquipped: boolean;
  customName?: string;
}

export interface CharacterStatusEffect {
  id: ID;
  characterId: ID;
  statusEffectKey: string;
  isActive: boolean;
}

