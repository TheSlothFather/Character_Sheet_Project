import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";

// In a real implementation this would query Postgres for all definitions.
// For now, load the generated JSON under docs/races_output so the client
// can render meaningful data without a DB.

type RawDefinition = {
  id: string;
  code?: string;
  name: string;
  description?: string;
};

type RawEffect = {
  id: string;
  feature_id: string;
  effect_type: string;
  target?: { type?: string; code?: string; id?: string };
  magnitude?: { flat?: number };
  applies_automatically?: boolean;
};

type RawFeature = {
  id: string;
  code: string;
  source_type: "lineage" | "culture" | string;
  source_id: string;
  name: string;
};

const loadJson = <T>(filename: string): T => {
  const filePath = path.join(__dirname, "../../../docs/races_output", filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
};

// These are read once at module load so the route stays lightweight.
const attributes = loadJson<RawDefinition[]>("attributes.json");
const skills = loadJson<RawDefinition[]>("skills.json");
const races = loadJson<RawDefinition[]>("lineages.json");
const subraces = loadJson<RawDefinition[]>("cultures.json");
const features = loadJson<RawFeature[]>("features.json");
const effects = loadJson<RawEffect[]>("effects.json");

const featureById = new Map(features.map((f) => [f.id, f]));
const raceCodeById = new Map(races.map((r) => [r.id, r.code ?? r.id]));
const subraceCodeById = new Map(subraces.map((s) => [s.id, s.code ?? s.id]));

interface ModifierLike {
  id: string;
  sourceType: "race" | "subrace" | "feat" | "item" | "status_effect" | "background" | "other";
  sourceKey: string;
  targetPath: string;
  operation: "add" | "mul" | "set" | "max" | "min";
  stackingKey?: string;
  priority?: number;
  valueExpression: unknown;
  conditionExpression?: unknown;
}

// Only expose simple, unconditional flat skill bonuses for now.
const modifiers: ModifierLike[] = effects
  .map((effect) => {
    if (effect.effect_type !== "skill_bonus") return null;
    if (!effect.applies_automatically) return null;
    const flat = effect.magnitude?.flat;
    if (typeof flat !== "number") return null;
    const skillCode = effect.target?.code;
    if (!skillCode) return null;

    const feature = featureById.get(effect.feature_id);
    if (!feature) return null;

    let sourceType: ModifierLike["sourceType"];
    let sourceKey: string | undefined;
    if (feature.source_type === "lineage") {
      sourceType = "race";
      sourceKey = raceCodeById.get(feature.source_id);
    } else if (feature.source_type === "culture") {
      sourceType = "subrace";
      sourceKey = subraceCodeById.get(feature.source_id);
    } else {
      return null;
    }
    if (!sourceKey) return null;

    return {
      id: effect.id,
      sourceType,
      sourceKey,
      targetPath: `skills.${skillCode}.racialBonus`,
      operation: "add",
      stackingKey: `${sourceType}-${sourceKey}-skill-bonus`,
      valueExpression: { type: "number", value: flat }
    } satisfies ModifierLike;
  })
  .filter((m): m is ModifierLike => Boolean(m));

const mapDefinition = (d: RawDefinition) => ({
  id: d.code ?? d.id,
  code: d.code,
  name: d.name,
  description: d.description
});

const mapSubrace = (d: RawDefinition & { lineage_id?: string }) => ({
  id: d.code ?? d.id,
  code: d.code,
  name: d.name,
  description: d.description,
  parentId: typeof d.lineage_id === "string" ? raceCodeById.get(d.lineage_id) ?? d.lineage_id : undefined
});

export const definitionsRouter = Router();

definitionsRouter.get("/", async (_req: Request, res: Response) => {
  res.json({
    ruleset: "adurun-core",
    attributes: attributes.map(mapDefinition),
    skills: skills.map(mapDefinition),
    races: races.map(mapDefinition),
    subraces: subraces.map((s) => mapSubrace(s as RawDefinition & { lineage_id?: string })),
    feats: [],
    items: [],
    statusEffects: [],
    derivedStats: [],
    modifiers
  });
});
