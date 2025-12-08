import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs/promises";

export interface StoredCharacter {
  id: string;
  name: string;
  level: number;
  raceKey?: string;
  subraceKey?: string;
  notes?: string;
  skillPoints: number;
  skillAllocations: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_SKILL_POINTS = 100;
const DATA_DIR = path.join(process.cwd(), "server", "data");
const DATA_PATH = path.join(DATA_DIR, "characters.json");

async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_PATH);
  } catch {
    await fs.writeFile(DATA_PATH, "[]", "utf-8");
  }
}

async function readCharacters(): Promise<StoredCharacter[]> {
  await ensureStore();
  const raw = await fs.readFile(DATA_PATH, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as StoredCharacter[];
  } catch {
    // fall through to reset below
  }
  await fs.writeFile(DATA_PATH, "[]", "utf-8");
  return [];
}

async function writeCharacters(characters: StoredCharacter[]): Promise<void> {
  await ensureStore();
  await fs.writeFile(DATA_PATH, JSON.stringify(characters, null, 2), "utf-8");
}

function sanitizeSkillAllocations(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object") return {};
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      result[key] = value;
    }
  }
  return result;
}

function createCharacterId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const charactersRouter = Router();

charactersRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const characters = await readCharacters();
    res.json(characters);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load characters";
    res.status(500).json({ error: message });
  }
});

charactersRouter.post("/", async (req: Request, res: Response) => {
  const { name, level, raceKey, subraceKey, notes, skillPoints, skillAllocations } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const numericLevel = typeof level === "number" && Number.isFinite(level) ? level : 1;
  const numericSkillPoints =
    typeof skillPoints === "number" && Number.isFinite(skillPoints) ? skillPoints : DEFAULT_SKILL_POINTS;
  const sanitizedAllocations = sanitizeSkillAllocations(skillAllocations);

  try {
    const characters = await readCharacters();
    const now = new Date().toISOString();
    const ch: StoredCharacter = {
      id: createCharacterId(),
      name: name.trim(),
      level: numericLevel,
      raceKey: typeof raceKey === "string" ? raceKey : undefined,
      subraceKey: typeof subraceKey === "string" ? subraceKey : undefined,
      notes: typeof notes === "string" ? notes : undefined,
      skillPoints: numericSkillPoints,
      skillAllocations: sanitizedAllocations,
      createdAt: now,
      updatedAt: now
    };
    characters.push(ch);
    await writeCharacters(characters);
    res.status(201).json(ch);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to create character";
    res.status(500).json({ error: message });
  }
});

charactersRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const characters = await readCharacters();
    const ch = characters.find((c) => c.id === req.params.id);
    if (!ch) return res.status(404).json({ error: "not found" });
    res.json(ch);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load character";
    res.status(500).json({ error: message });
  }
});

charactersRouter.put("/:id", async (req: Request, res: Response) => {
  const { name, level, raceKey, subraceKey, notes, skillPoints, skillAllocations } = req.body ?? {};

  try {
    const characters = await readCharacters();
    const idx = characters.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "not found" });

    const existing = characters[idx];
    const nextSkillAllocations =
      skillAllocations !== undefined ? sanitizeSkillAllocations(skillAllocations) : existing.skillAllocations;
    const nextSkillPoints =
      typeof skillPoints === "number" && Number.isFinite(skillPoints) ? skillPoints : existing.skillPoints;

    const updated: StoredCharacter = {
      ...existing,
      name: typeof name === "string" && name.trim() ? name.trim() : existing.name,
      level: typeof level === "number" && Number.isFinite(level) ? level : existing.level,
      raceKey: typeof raceKey === "string" ? raceKey : existing.raceKey,
      subraceKey: typeof subraceKey === "string" ? subraceKey : existing.subraceKey,
      notes: typeof notes === "string" ? notes : existing.notes,
      skillPoints: nextSkillPoints,
      skillAllocations: nextSkillAllocations,
      updatedAt: new Date().toISOString()
    };

    characters[idx] = updated;
    await writeCharacters(characters);
    res.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to update character";
    res.status(500).json({ error: message });
  }
});
