import { Router, Request, Response } from "express";

import {
  collectModifiers,
  computeDerivedStats,
  getContentPack,
  mapDefinition,
  mapDerivedStat,
  mapSubrace
} from "./definitions-helpers";

export const definitionsRouter = Router();

definitionsRouter.get("/", async (_req: Request, res: Response) => {
  const pack = getContentPack();
  const modifiers = collectModifiers(pack);
  const derivedStatValues = computeDerivedStats(pack, modifiers);

  res.json({
    ruleset: pack.ruleset.key,
    attributes: pack.attributes.map(mapDefinition),
    skills: pack.skills.map(mapDefinition),
    races: pack.races.map(mapDefinition),
    subraces: pack.subraces.map(mapSubrace),
    feats: pack.feats.map(mapDefinition),
    items: pack.items.map(mapDefinition),
    statusEffects: pack.statusEffects.map(mapDefinition),
    derivedStats: pack.derivedStats.map(mapDerivedStat),
    derivedStatValues,
    modifiers
  });
});
