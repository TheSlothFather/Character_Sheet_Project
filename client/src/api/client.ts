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
  skillAllocationMinimums?: Record<string, number>;
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
import { evalExpr } from "@shared/rules/expressions";
import type { Modifier } from "@shared/rules/modifiers";
import { applyModifiers } from "@shared/rules/modifiers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";

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

type RulesetRow = { id: number; key: string; name: string; description?: string | null };
type NamedRow = { key: string; name: string; description?: string | null };
type SkillRow = NamedRow & { attribute_key?: string | null };
type SubraceRow = NamedRow & { race_key: string };
type DerivedRow = NamedRow & { expression: Expr };
type ModifierRow = {
  id: string;
  source_type: string;
  source_key: string;
  target_path: string;
  operation: string;
  stacking_key?: string | null;
  priority?: number | null;
  value_expression: unknown;
  condition_expression?: unknown;
};
type RaceDetailRow = {
  race_key: string;
  attributes?: Record<string, number> | null;
  skills?: Record<string, number> | null;
  disciplines?: Record<string, number> | null;
  deity_cap_per_spirit?: number | null;
};

type CharacterRow = {
  id: string;
  name: string;
  level: number;
  race_key?: string | null;
  subrace_key?: string | null;
  notes?: string | null;
  attribute_points_available?: number | null;
  skill_points: number;
  skill_allocations: Record<string, number> | null;
  skill_allocation_minimums?: Record<string, number> | null;
  skill_bonuses?: Record<string, number> | null;
  backgrounds?: BackgroundSelection | null;
  attributes?: AttributeScores | null;
  fate_points?: number | null;
  weapon_notes?: string | null;
  defense_notes?: string | null;
  gear_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SupabaseResult<T> = { data: T; error: null } | { data: null; error: { message: string } };

const REQUIRED_ENV_VARS = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] as const;

function readEnv(): Record<string, string | undefined> {
  const viteEnv = ((import.meta as any).env ?? {}) as Record<string, string | undefined>;
  const override = ((globalThis as any).__SUPABASE_ENV__ ?? {}) as Record<string, string | undefined>;
  return { ...viteEnv, ...override };
}

function ensureSupabaseEnv(): void {
  const env = readEnv();
  const missing = REQUIRED_ENV_VARS.filter((key) => !env[key]);
  if (missing.length) {
    throw new ApiError(0, `Missing env vars: ${missing.join(", ")}`);
  }
}

function unwrap<T>(result: SupabaseResult<T>, message: string): T {
  if (result.error) {
    throw new ApiError(0, `${message}: ${result.error.message}`);
  }
  return result.data as T;
}

function mapDefinition(row: NamedRow): NamedDefinition {
  return {
    id: row.key,
    code: row.key,
    name: row.name,
    description: row.description ?? undefined
  };
}

function mapSubrace(row: SubraceRow): NamedDefinition {
  return {
    id: row.key,
    code: row.key,
    parentId: row.race_key,
    name: row.name,
    description: row.description ?? undefined
  };
}

function mapDerived(row: DerivedRow): DerivedStatDefinition {
  return {
    id: row.key,
    name: row.name,
    description: row.description ?? undefined,
    expression: row.expression
  };
}

function mapModifier(row: ModifierRow): ModifierWithSource {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceKey: row.source_key,
    targetPath: row.target_path,
    operation: row.operation as ModifierWithSource["operation"],
    stackingKey: row.stacking_key ?? undefined,
    priority: row.priority ?? undefined,
    valueExpression: row.value_expression as any,
    conditionExpression: row.condition_expression as any
  };
}

function mapRaceDetails(rows: RaceDetailRow[]): Record<string, RaceDetailProfile> {
  const details: Record<string, RaceDetailProfile> = {};
  rows.forEach((row) => {
    details[row.race_key] = {
      attributes: (row.attributes ?? {}) as Record<string, number>,
      skills: (row.skills ?? {}) as Record<string, number>,
      disciplines: (row.disciplines ?? {}) as RaceDisciplineBonuses,
      deityCapPerSpirit: row.deity_cap_per_spirit ?? undefined
    };
  });
  return details;
}

function buildBaseState(
  attributes: NamedDefinition[],
  skills: (NamedDefinition & { attributeKey?: string })[],
  derivedStats: DerivedStatDefinition[]
) {
  const attributeState = Object.fromEntries(attributes.map((a) => [a.id, { score: 0 }]));
  const skillState = Object.fromEntries(skills.map((s) => [s.code ?? s.id, { score: 0, racialBonus: 0 }]));
  const derivedState: Record<string, number> = Object.fromEntries(derivedStats.map((d) => [d.id, 0]));
  return { attributes: attributeState, skills: skillState, derived: derivedState };
}

function computeDerivedStatValues(
  attributes: NamedDefinition[],
  skills: (NamedDefinition & { attributeKey?: string })[],
  derivedStats: DerivedStatDefinition[],
  modifiers: ModifierWithSource[]
): Record<string, number> {
  const baseState = buildBaseState(attributes, skills, derivedStats);
  const withModifiers = applyModifiers({ baseState, modifiers });
  const values: Record<string, number> = {};
  derivedStats.forEach((stat) => {
    const value = evalExpr(stat.expression, { state: withModifiers });
    values[stat.id] = typeof value === "number" ? value : 0;
  });
  return values;
}

async function getRuleset(client: SupabaseClient): Promise<RulesetRow> {
  const { data, error } = (await client
    .from("content_rulesets")
    .select("id, key, name, description")
    .limit(1)
    .maybeSingle()) as SupabaseResult<RulesetRow | null>;
  if (error) {
    throw new ApiError(0, `Failed to load ruleset: ${error.message}`);
  }
  if (!data) {
    throw new ApiError(0, "No ruleset found in Supabase content tables");
  }
  return data;
}

async function getDefinitionsFromSupabase(): Promise<DefinitionsResponse> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const ruleset = await getRuleset(client);
  const filter = { column: "ruleset_id", value: ruleset.id };

  const [attributesRes, skillsRes, racesRes, subracesRes, featsRes, itemsRes, statusRes, derivedRes, modifiersRes, raceDetailsRes] =
    await Promise.all([
      client.from("content_attributes").select("key, name, description").eq(filter.column, filter.value),
      client
        .from("content_skills")
        .select("key, name, description, attribute_key")
        .eq(filter.column, filter.value),
      client.from("content_races").select("key, name, description").eq(filter.column, filter.value),
      client
        .from("content_subraces")
        .select("key, race_key, name, description")
        .eq(filter.column, filter.value),
      client.from("content_feats").select("key, name, description, prereq_expression").eq(filter.column, filter.value),
      client.from("content_items").select("key, name, description, slot").eq(filter.column, filter.value),
      client.from("content_status_effects").select("key, name, description, default_duration_type").eq(filter.column, filter.value),
      client.from("content_derived_stats").select("key, name, description, expression").eq(filter.column, filter.value),
      client
        .from("content_modifiers")
        .select(
          "id, source_type, source_key, target_path, operation, stacking_key, priority, value_expression, condition_expression"
        )
        .eq(filter.column, filter.value),
      client
        .from("content_race_details")
        .select("race_key, attributes, skills, disciplines, deity_cap_per_spirit")
        .eq(filter.column, filter.value)
    ]);

  const attributes = unwrap<NamedRow[]>(attributesRes as SupabaseResult<NamedRow[]>, "Failed to load attributes").map(mapDefinition);
  const skills = unwrap<SkillRow[]>(skillsRes as SupabaseResult<SkillRow[]>, "Failed to load skills").map((row) => ({
    ...mapDefinition(row),
    attributeKey: row.attribute_key ?? undefined
  }));
  const races = unwrap<NamedRow[]>(racesRes as SupabaseResult<NamedRow[]>, "Failed to load races").map(mapDefinition);
  const subraces = unwrap<SubraceRow[]>(subracesRes as SupabaseResult<SubraceRow[]>, "Failed to load subraces").map(mapSubrace);
  const feats = unwrap<NamedRow[]>(featsRes as SupabaseResult<NamedRow[]>, "Failed to load feats").map(mapDefinition);
  const items = unwrap<NamedRow[]>(itemsRes as SupabaseResult<NamedRow[]>, "Failed to load items").map(mapDefinition);
  const statusEffects = unwrap<NamedRow[]>(statusRes as SupabaseResult<NamedRow[]>, "Failed to load status effects").map(mapDefinition);
  const derivedStats = unwrap<DerivedRow[]>(derivedRes as SupabaseResult<DerivedRow[]>, "Failed to load derived stats").map(mapDerived);
  const modifiers = unwrap<ModifierRow[]>(modifiersRes as SupabaseResult<ModifierRow[]>, "Failed to load modifiers").map(mapModifier);
  const raceDetailsRows = unwrap<RaceDetailRow[]>(raceDetailsRes as SupabaseResult<RaceDetailRow[]>, "Failed to load race details");

  return {
    ruleset: ruleset.key,
    attributes,
    skills,
    races,
    subraces,
    feats,
    items,
    statusEffects,
    derivedStats,
    derivedStatValues: computeDerivedStatValues(attributes, skills, derivedStats, modifiers),
    modifiers,
    raceDetails: mapRaceDetails(raceDetailsRows)
  };
}

function mapCharacterRow(row: CharacterRow): Character {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    raceKey: row.race_key ?? undefined,
    subraceKey: row.subrace_key ?? undefined,
    notes: row.notes ?? undefined,
    attributePointsAvailable: row.attribute_points_available ?? undefined,
    skillPoints: row.skill_points,
    skillAllocations: row.skill_allocations ?? {},
    skillAllocationMinimums: row.skill_allocation_minimums ?? undefined,
    skillBonuses: row.skill_bonuses ?? undefined,
    backgrounds: row.backgrounds ?? undefined,
    attributes: row.attributes ?? undefined,
    fatePoints: row.fate_points ?? undefined,
    weaponNotes: row.weapon_notes ?? undefined,
    defenseNotes: row.defense_notes ?? undefined,
    gearNotes: row.gear_notes ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function toCharacterPayload(payload: Partial<Character>): Partial<CharacterRow> {
  const record: Partial<CharacterRow> = {
    updated_at: new Date().toISOString()
  };

  if (payload.name !== undefined) record.name = payload.name;
  if (payload.level !== undefined) record.level = payload.level;
  if (payload.raceKey !== undefined) record.race_key = payload.raceKey ?? null;
  if (payload.subraceKey !== undefined) record.subrace_key = payload.subraceKey ?? null;
  if (payload.notes !== undefined) record.notes = payload.notes ?? null;
  if (payload.attributePointsAvailable !== undefined)
    record.attribute_points_available = payload.attributePointsAvailable ?? null;
  if (payload.skillPoints !== undefined) record.skill_points = payload.skillPoints ?? 0;
  if (payload.skillAllocations !== undefined) record.skill_allocations = payload.skillAllocations ?? {};
  if (payload.skillAllocationMinimums !== undefined)
    record.skill_allocation_minimums = payload.skillAllocationMinimums ?? null;
  if (payload.skillBonuses !== undefined) record.skill_bonuses = payload.skillBonuses ?? null;
  if (payload.backgrounds !== undefined) record.backgrounds = payload.backgrounds ?? null;
  if (payload.attributes !== undefined) record.attributes = payload.attributes ?? null;
  if (payload.fatePoints !== undefined) record.fate_points = payload.fatePoints ?? null;
  if (payload.weaponNotes !== undefined) record.weapon_notes = payload.weaponNotes ?? null;
  if (payload.defenseNotes !== undefined) record.defense_notes = payload.defenseNotes ?? null;
  if (payload.gearNotes !== undefined) record.gear_notes = payload.gearNotes ?? null;

  return record;
}

async function listCharacters(): Promise<Character[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("characters")
    .select("*")
    .order("created_at", { ascending: true })) as SupabaseResult<CharacterRow[]>;
  if (error) {
    throw new ApiError(0, `Failed to load characters: ${error.message}`);
  }
  return (data ?? []).map(mapCharacterRow);
}

async function createCharacter(payload: Partial<Character>): Promise<Character> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  if (payload.name === undefined || payload.level === undefined) {
    throw new ApiError(0, "name and level are required to create a character");
  }
  const normalized: Partial<Character> = {
    skillPoints: 0,
    skillAllocations: {},
    ...payload
  };
  const record = toCharacterPayload(normalized);
  const { data, error } = (await client
    .from("characters")
    .insert(record)
    .select("*")
    .single()) as SupabaseResult<CharacterRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to create character: ${error?.message ?? "unknown error"}`);
  }
  return mapCharacterRow(data);
}

async function updateCharacter(id: string, payload: Partial<Character>): Promise<Character> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const record = toCharacterPayload(payload);
  const { data, error } = (await client
    .from("characters")
    .update(record)
    .eq("id", id)
    .select("*")
    .single()) as SupabaseResult<CharacterRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to update character: ${error?.message ?? "unknown error"}`);
  }
  return mapCharacterRow(data);
}

async function deleteCharacter(id: string): Promise<void> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { error } = (await client.from("characters").delete().eq("id", id)) as SupabaseResult<null>;
  if (error) {
    throw new ApiError(0, `Failed to delete character: ${error.message}`);
  }
}

export const api = {
  listCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  getDefinitions: getDefinitionsFromSupabase
};
