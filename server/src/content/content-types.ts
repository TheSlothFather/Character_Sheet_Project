// Types for file-based content packs (YAML/JSON) that will be imported
// into the database. These mirror the domain schema but are optimized
// for authoring by hand.

import type { Expr } from "@shared/rules/expressions";
import type { Modifier } from "@shared/rules/modifiers";

export interface ContentRuleset {
  key: string;
  name: string;
  description?: string;
}

export interface ContentAttribute {
  key: string;
  name: string;
  description?: string;
}

export interface ContentSkill {
  key: string;
  name: string;
  attributeKey?: string;
  description?: string;
}

export interface ContentRace {
  key: string;
  name: string;
  description?: string;
}

export interface ContentSubrace {
  key: string;
  raceKey: string;
  name: string;
  description?: string;
}

export interface ContentFeat {
  key: string;
  name: string;
  description?: string;
  prereqExpression?: Expr;
  modifiers?: ContentModifier[];
}

export interface ContentItem {
  key: string;
  name: string;
  slot?: string;
  description?: string;
  modifiers?: ContentModifier[];
}

export interface ContentStatusEffect {
  key: string;
  name: string;
  description?: string;
  defaultDurationType?: "rounds" | "scene" | "session" | "permanent";
  modifiers?: ContentModifier[];
}

export interface ContentDerivedStat {
  key: string;
  name: string;
  description?: string;
  expression: Expr;
}

export type ContentModifierSourceType =
  | "race"
  | "subrace"
  | "feat"
  | "item"
  | "status_effect"
  | "background"
  | "other";

export interface ContentModifier extends Modifier {
  sourceType: ContentModifierSourceType;
  sourceKey: string;
}

export interface ContentPack {
  ruleset: ContentRuleset;
  attributes: ContentAttribute[];
  skills: ContentSkill[];
  races: ContentRace[];
  subraces: ContentSubrace[];
  feats: ContentFeat[];
  items: ContentItem[];
  statusEffects: ContentStatusEffect[];
  derivedStats: ContentDerivedStat[];
  // Optional standalone modifiers (e.g. backgrounds) that are not nested.
  modifiers?: ContentModifier[];
}

