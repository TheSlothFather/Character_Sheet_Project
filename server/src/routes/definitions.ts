import { Router, Request, Response } from "express";

// In a real implementation this would query Postgres for all definitions
// for the current ruleset. For now, it returns an empty payload so the
// client can be wired without blocking on DB implementation.

export const definitionsRouter = Router();

definitionsRouter.get("/", async (_req: Request, res: Response) => {
  res.json({
    ruleset: null,
    attributes: [],
    skills: [],
    races: [],
    subraces: [],
    feats: [],
    items: [],
    statusEffects: [],
    derivedStats: [],
    modifiers: []
  });
});

