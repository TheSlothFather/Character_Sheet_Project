import { Router, Request, Response } from "express";

// Simple in-memory stub for characters so frontend work can begin.
// This should be replaced with real DB-backed logic once the DB layer
// is wired up.

interface StubCharacter {
  id: string;
  name: string;
  level: number;
  raceKey?: string;
  subraceKey?: string;
}

const characters: StubCharacter[] = [];

export const charactersRouter = Router();

charactersRouter.get("/", (_req: Request, res: Response) => {
  res.json(characters);
});

charactersRouter.post("/", (req: Request, res: Response) => {
  const { name, level, raceKey, subraceKey } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const numericLevel = typeof level === "number" ? level : 1;
  const ch: StubCharacter = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: name.trim(),
    level: numericLevel,
    raceKey: typeof raceKey === "string" ? raceKey : undefined,
    subraceKey: typeof subraceKey === "string" ? subraceKey : undefined
  };
  characters.push(ch);
  res.status(201).json(ch);
});

charactersRouter.get("/:id", (req: Request, res: Response) => {
  const ch = characters.find((c) => c.id === req.params.id);
  if (!ch) return res.status(404).json({ error: "not found" });
  res.json(ch);
});
