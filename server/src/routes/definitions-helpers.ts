import path from "path";

import type { ContentModifier, ContentPack } from "../content/content-types";
import { loadContentPackFromFile } from "../content/import";
import type { Expr } from "@shared/rules/expressions";
import { evalExpr } from "@shared/rules/expressions";
import type { Modifier } from "@shared/rules/modifiers";
import { applyModifiers } from "@shared/rules/modifiers";

export type ContentModifierWithId = ContentModifier & { id: string };

export type DerivedStatWithExpression = {
  id: string;
  name: string;
  description?: string;
  expression: Expr;
};

export type NamedDefinition = {
  id: string;
  code?: string;
  name: string;
  description?: string;
  parentId?: string;
};

const getContentPackPath = () =>
  process.env.CONTENT_PACK_PATH ?? path.join(__dirname, "../../../docs/races_output/content-pack.json");

let cachedContentPack: ContentPack | null = null;
export const getContentPack = (): ContentPack => {
  if (!cachedContentPack) {
    cachedContentPack = loadContentPackFromFile(getContentPackPath());
  }
  return cachedContentPack;
};

export const mapDefinition = ({ key, name, description }: { key: string; name: string; description?: string }): NamedDefinition => ({
  id: key,
  code: key,
  name,
  description
});

export const mapSubrace = ({ key, raceKey, name, description }: { key: string; raceKey: string; name: string; description?: string }):
NamedDefinition => ({
  id: key,
  code: key,
  parentId: raceKey,
  name,
  description
});

export const mapDerivedStat = ({ key, name, description, expression }: { key: string; name: string; description?: string; expression: Expr }):
DerivedStatWithExpression => ({
  id: key,
  name,
  description,
  expression
});

const ensureModifierId = (modifier: ContentModifier): ContentModifierWithId => {
  const { id, ...rest } = modifier;

  return {
    ...rest,
    id: id ?? `${modifier.sourceType}:${modifier.sourceKey}:${modifier.targetPath}:${modifier.operation}`
  };
};

export const collectModifiers = (pack: ContentPack): ContentModifierWithId[] => {
  const list: ContentModifierWithId[] = [];
  const add = (mods?: ContentModifier[]) => {
    mods?.forEach((m) => list.push(ensureModifierId(m)));
  };

  add(pack.modifiers);
  pack.feats.forEach((f) => add(f.modifiers));
  pack.items.forEach((i) => add(i.modifiers));
  pack.statusEffects.forEach((s) => add(s.modifiers));

  return list;
};

const buildBaseState = (pack: ContentPack): Record<string, unknown> => {
  const attributes = Object.fromEntries(pack.attributes.map((a) => [a.key, { score: 0 }]));
  const skills = Object.fromEntries(pack.skills.map((s) => [s.key, { score: 0, racialBonus: 0 }]));
  const derived = Object.fromEntries(pack.derivedStats.map((d) => [d.key, 0]));

  return { attributes, skills, derived };
};

export const computeDerivedStats = (
  pack: ContentPack,
  modifiers: Modifier[]
): Record<string, number> => {
  const baseState = buildBaseState(pack);
  const stateWithModifiers = applyModifiers({ baseState, modifiers });
  const values: Record<string, number> = {};

  for (const derived of pack.derivedStats) {
    const value = evalExpr(derived.expression, { state: stateWithModifiers });
    values[derived.key] = typeof value === "number" ? value : 0;
  }

  return values;
};
