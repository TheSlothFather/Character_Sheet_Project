export interface Character {
  id: string;
  name: string;
  level: number;
  raceKey?: string;
  subraceKey?: string;
  notes?: string;
  attributePointsAvailable?: number;
  skillPoints: number;
  skillAllocations: Record<string, number>;
  skillBonuses?: Record<string, number>;
  backgrounds?: BackgroundSelection;
  attributes?: AttributeScores;
  fatePoints?: number;
  weaponNotes?: string;
  defenseNotes?: string;
  gearNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BackgroundSelection {
  family?: string;
  childhood?: string;
  adolescence?: string;
  adulthood?: string[];
  flaws?: string[];
  incitingIncident?: string;
}

export type AttributeScores = Record<string, number>;

import type { Expr } from "@shared/rules/expressions";
import type { Modifier } from "@shared/rules/modifiers";

export interface NamedDefinition {
  id: string;
  code?: string;
  parentId?: string;
  name: string;
  description?: string;
}

export type ContentModifierSourceType =
  | "race"
  | "subrace"
  | "feat"
  | "item"
  | "status_effect"
  | "background"
  | "other";

export interface ModifierWithSource extends Modifier {
  sourceType: ContentModifierSourceType;
  sourceKey: string;
}

export interface DerivedStatDefinition extends NamedDefinition {
  expression: Expr;
}

export interface RaceDisciplineBonuses {
  martialProwess: number;
  ildakarFaculty: number;
  psiPoints: number;
  deityCapPerSpirit: number;
}

export interface RaceDetailProfile {
  attributes: Record<string, number>;
  skills: Record<string, number>;
  disciplines: RaceDisciplineBonuses;
  deityCapPerSpirit?: number;
}

export interface DefinitionsResponse {
  ruleset: string | null;
  attributes: NamedDefinition[];
  skills: NamedDefinition[];
  races: NamedDefinition[];
  subraces: NamedDefinition[];
  feats: NamedDefinition[];
  items: NamedDefinition[];
  statusEffects: NamedDefinition[];
  derivedStats: DerivedStatDefinition[];
  derivedStatValues?: Record<string, number>;
  modifiers: ModifierWithSource[];
  raceDetails?: Record<string, RaceDetailProfile>;
}

export class ApiError extends Error {
  status: number;
  info?: unknown;

  constructor(status: number, message: string, info?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.info = info;
  }
}

const API_BASE = "/api";

function deriveMessage(data: unknown, status: number): string {
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    const info = data as { message?: string; error?: string };
    if (info.message?.trim()) return info.message;
    if (info.error?.trim()) return info.error;
  }
  return `Request failed with status ${status}`;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network request failed";
    throw new ApiError(0, message);
  }

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    const message = deriveMessage(data, response.status);
    throw new ApiError(response.status, message, data);
  }

  return data as T;
}

export const api = {
  listCharacters: () => apiRequest<Character[]>("/characters"),
  createCharacter: (payload: {
    name: string;
    level: number;
    raceKey?: string;
    subraceKey?: string;
    notes?: string;
    attributePointsAvailable?: number;
    skillPoints?: number;
    skillAllocations?: Record<string, number>;
    skillBonuses?: Record<string, number>;
    backgrounds?: BackgroundSelection;
    attributes?: AttributeScores;
    fatePoints?: number;
    weaponNotes?: string;
    defenseNotes?: string;
    gearNotes?: string;
  }) =>
    apiRequest<Character>("/characters", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateCharacter: (
    id: string,
    payload: Partial<{
      name: string;
      level: number;
      raceKey?: string;
      subraceKey?: string;
      notes?: string;
      attributePointsAvailable?: number;
      skillPoints?: number;
      skillAllocations?: Record<string, number>;
      skillBonuses?: Record<string, number>;
      backgrounds?: BackgroundSelection;
      attributes?: AttributeScores;
      fatePoints?: number;
      weaponNotes?: string;
      defenseNotes?: string;
      gearNotes?: string;
    }>
  ) =>
    apiRequest<Character>(`/characters/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  deleteCharacter: (id: string) =>
    apiRequest<void>(`/characters/${id}`, {
      method: "DELETE"
    }),
  getDefinitions: () => apiRequest<DefinitionsResponse>("/definitions")
};
