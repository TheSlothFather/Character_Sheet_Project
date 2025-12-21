import { ApiError } from "./client";
import { getSupabaseClient } from "./supabaseClient";

export interface PlayerCampaign {
  id: string;
  name: string;
  gmUserId: string;
  createdAt?: string;
}

export interface PlayerCampaignSetting {
  id: string;
  campaignId: string;
  title: string;
  body?: string;
  tags?: string[];
}

export interface PlayerCombatant {
  id: string;
  name: string;
  faction?: string;
  combatStatus?: string;
  statusEffects?: PlayerCombatantStatusEffect[];
  wounds?: PlayerCombatantWound[];
}

export interface PlayerCombatantStatusEffect {
  id: string;
  campaignId: string;
  combatantId: string;
  statusKey: string;
  durationType?: string;
  durationRemaining?: number;
  stacks?: number;
  isActive?: boolean;
  appliedAt?: string;
  updatedAt?: string;
}

export interface PlayerCombatantWound {
  id: string;
  campaignId: string;
  combatantId: string;
  woundType: string;
  woundCount: number;
  updatedAt?: string;
}

export interface CombatState {
  round: number;
  turnIndex: number;
  initiativeOrder: string[];
  activeCombatantId: string | null;
  ambushRoundFlags: Record<string, boolean>;
  actionPointsById: Record<string, number>;
  actionPointsMaxById: Record<string, number>;
  energyById: Record<string, number>;
  statusEffectsById: Record<string, string[]>;
  woundsById: Record<string, number>;
  reactionsUsedById: Record<string, number>;
  eventLog: { id: string; type: string; timestamp: string; payload?: unknown }[];
}

export type CombatActionResponse = {
  ok: boolean;
  sequence?: number;
  state: CombatState;
};

type CampaignRow = {
  id: string;
  name: string;
  gm_user_id: string;
  created_at?: string | null;
};

type CampaignSettingRow = {
  id: string;
  campaign_id: string;
  title: string;
  body?: string | null;
  tags?: string[] | null;
  is_player_visible?: boolean | null;
};

type CombatantRow = {
  id: string;
  campaign_id: string;
  bestiary_entry_id: string;
  faction?: string | null;
  is_active?: boolean | null;
  name: string;
};

type CombatantStatusEffectRow = {
  id: string;
  campaign_id: string;
  combatant_id: string;
  status_key: string;
  duration_type?: string | null;
  duration_remaining?: number | null;
  stacks?: number | null;
  is_active?: boolean | null;
  applied_at?: string | null;
  updated_at?: string | null;
};

type CombatantWoundRow = {
  id: string;
  campaign_id: string;
  combatant_id: string;
  wound_type: string;
  wound_count: number;
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

function mapCampaign(row: CampaignRow): PlayerCampaign {
  return {
    id: row.id,
    name: row.name,
    gmUserId: row.gm_user_id,
    createdAt: row.created_at ?? undefined
  };
}

function mapSetting(row: CampaignSettingRow): PlayerCampaignSetting {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    body: row.body ?? undefined,
    tags: row.tags ?? undefined
  };
}

function mapCombatant(row: CombatantRow): PlayerCombatant {
  return {
    id: row.id,
    name: row.name,
    faction: row.faction ?? undefined,
    combatStatus: row.is_active ? "active" : "inactive"
  };
}

function mapCombatantStatusEffect(row: CombatantStatusEffectRow): PlayerCombatantStatusEffect {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    combatantId: row.combatant_id,
    statusKey: row.status_key,
    durationType: row.duration_type ?? undefined,
    durationRemaining: row.duration_remaining ?? undefined,
    stacks: row.stacks ?? undefined,
    isActive: row.is_active ?? undefined,
    appliedAt: row.applied_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function mapCombatantWound(row: CombatantWoundRow): PlayerCombatantWound {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    combatantId: row.combatant_id,
    woundType: row.wound_type,
    woundCount: row.wound_count,
    updatedAt: row.updated_at ?? undefined
  };
}

function toCombatantStatusPayload(
  payload: Partial<PlayerCombatantStatusEffect> & { campaignId: string; combatantId: string; statusKey: string }
): Partial<CombatantStatusEffectRow> {
  return {
    campaign_id: payload.campaignId,
    combatant_id: payload.combatantId,
    status_key: payload.statusKey,
    duration_type: payload.durationType ?? null,
    duration_remaining: payload.durationRemaining ?? null,
    stacks: payload.stacks ?? 1,
    is_active: payload.isActive ?? true,
    applied_at: payload.appliedAt ?? null,
    updated_at: payload.updatedAt ?? null
  };
}

function toCombatantWoundPayload(
  payload: Partial<PlayerCombatantWound> & { campaignId: string; combatantId: string; woundType: string }
): Partial<CombatantWoundRow> {
  return {
    campaign_id: payload.campaignId,
    combatant_id: payload.combatantId,
    wound_type: payload.woundType,
    wound_count: payload.woundCount ?? 0,
    updated_at: payload.updatedAt ?? null
  };
}

async function postCombatAction<T>(campaignId: string, action: string, payload: unknown): Promise<T> {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/combat/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload ?? {})
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof parsed === "object" && parsed && "error" in (parsed as Record<string, unknown>)
        ? String((parsed as Record<string, unknown>).error)
        : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, parsed);
  }

  return parsed as T;
}

export async function startCombat(
  campaignId: string,
  payload: { groupInitiative?: boolean; ambushedIds?: string[] } = {}
): Promise<CombatActionResponse> {
  return postCombatAction<CombatActionResponse>(campaignId, "start", payload);
}

export async function advanceCombat(
  campaignId: string,
  payload: { statusEffectsById?: Record<string, string[]> } = {}
): Promise<CombatActionResponse> {
  return postCombatAction<CombatActionResponse>(campaignId, "advance", payload);
}

export async function spendCombatResources(
  campaignId: string,
  payload: {
    combatantId: string;
    actionPointCost: number;
    energyCost: number;
    actionType?: string;
    targetId?: string;
    rollResults?: unknown;
    metadata?: unknown;
  }
): Promise<CombatActionResponse> {
  return postCombatAction<CombatActionResponse>(campaignId, "spend", payload);
}

export async function recordCombatReaction(
  campaignId: string,
  payload: { combatantId: string; actionPointCost: number; reactionType?: string; metadata?: unknown }
): Promise<CombatActionResponse> {
  return postCombatAction<CombatActionResponse>(campaignId, "reaction", payload);
}

export async function getCampaign(campaignId: string): Promise<PlayerCampaign> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("campaigns")
    .select("id, name, gm_user_id, created_at")
    .eq("id", campaignId)
    .maybeSingle()) as SupabaseResult<CampaignRow | null>;
  if (error) {
    throw new ApiError(0, `Failed to load campaign: ${error.message}`);
  }
  if (!data) {
    throw new ApiError(0, "Campaign not found.");
  }
  return mapCampaign(data);
}

export async function listSharedSettings(campaignId: string): Promise<PlayerCampaignSetting[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("setting_entries")
    .select("id, campaign_id, title, body, tags, is_player_visible")
    .eq("campaign_id", campaignId)
    .eq("is_player_visible", true)
    .order("title", { ascending: true })) as SupabaseResult<CampaignSettingRow[]>;
  if (error) {
    throw new ApiError(0, `Failed to load setting notes: ${error.message}`);
  }
  return (data ?? []).map(mapSetting);
}

export async function listActiveCombatants(campaignId: string): Promise<PlayerCombatant[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const [combatantsRes, statusRes, woundRes] = (await Promise.all([
    client
      .from("campaign_combatants")
      .select("id, campaign_id, bestiary_entry_id, faction, is_active, bestiary_entries(name)")
      .eq("campaign_id", campaignId)
      .eq("is_active", true)
      .order("initiative", { ascending: false }),
    client
      .from("campaign_combatant_status_effects")
      .select("id, campaign_id, combatant_id, status_key, duration_type, duration_remaining, stacks, is_active, applied_at, updated_at")
      .eq("campaign_id", campaignId),
    client
      .from("campaign_combatant_wounds")
      .select("id, campaign_id, combatant_id, wound_type, wound_count, updated_at")
      .eq("campaign_id", campaignId)
  ])) as [
    SupabaseResult<CombatantRow[]>,
    SupabaseResult<CombatantStatusEffectRow[]>,
    SupabaseResult<CombatantWoundRow[]>
  ];
  if (combatantsRes.error) {
    throw new ApiError(0, `Failed to load combatants: ${combatantsRes.error.message}`);
  }
  if (statusRes.error) {
    throw new ApiError(0, `Failed to load combatant status effects: ${statusRes.error.message}`);
  }
  if (woundRes.error) {
    throw new ApiError(0, `Failed to load combatant wounds: ${woundRes.error.message}`);
  }

  const statusByCombatant = new Map<string, PlayerCombatantStatusEffect[]>();
  (statusRes.data ?? []).forEach((row) => {
    const entry = mapCombatantStatusEffect(row);
    const list = statusByCombatant.get(entry.combatantId) ?? [];
    list.push(entry);
    statusByCombatant.set(entry.combatantId, list);
  });

  const woundsByCombatant = new Map<string, PlayerCombatantWound[]>();
  (woundRes.data ?? []).forEach((row) => {
    const entry = mapCombatantWound(row);
    const list = woundsByCombatant.get(entry.combatantId) ?? [];
    list.push(entry);
    woundsByCombatant.set(entry.combatantId, list);
  });

  return (combatantsRes.data ?? []).map((row) => {
    const name = (row as CombatantRow & { bestiary_entries?: { name: string } | null }).bestiary_entries?.name ?? "Unknown";
    const combatant = mapCombatant({ ...row, name });
    return {
      ...combatant,
      statusEffects: statusByCombatant.get(combatant.id) ?? [],
      wounds: woundsByCombatant.get(combatant.id) ?? []
    };
  });
}

export async function listCombatantStatusEffects(campaignId: string): Promise<PlayerCombatantStatusEffect[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("campaign_combatant_status_effects")
    .select("id, campaign_id, combatant_id, status_key, duration_type, duration_remaining, stacks, is_active, applied_at, updated_at")
    .eq("campaign_id", campaignId)) as SupabaseResult<CombatantStatusEffectRow[]>;
  if (error) {
    throw new ApiError(0, `Failed to load combatant status effects: ${error.message}`);
  }
  return (data ?? []).map(mapCombatantStatusEffect);
}

export async function upsertCombatantStatusEffect(
  payload: Partial<PlayerCombatantStatusEffect> & { campaignId: string; combatantId: string; statusKey: string }
): Promise<PlayerCombatantStatusEffect> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const record = toCombatantStatusPayload(payload);
  const { data, error } = (await client
    .from("campaign_combatant_status_effects")
    .upsert(record, { onConflict: "combatant_id,status_key" })
    .select("id, campaign_id, combatant_id, status_key, duration_type, duration_remaining, stacks, is_active, applied_at, updated_at")
    .single()) as SupabaseResult<CombatantStatusEffectRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to upsert combatant status effect: ${error?.message ?? "unknown error"}`);
  }
  return mapCombatantStatusEffect(data);
}

export async function removeCombatantStatusEffect(id: string): Promise<void> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { error } = (await client.from("campaign_combatant_status_effects").delete().eq("id", id)) as SupabaseResult<null>;
  if (error) {
    throw new ApiError(0, `Failed to remove combatant status effect: ${error.message}`);
  }
}

export async function listCombatantWounds(campaignId: string): Promise<PlayerCombatantWound[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("campaign_combatant_wounds")
    .select("id, campaign_id, combatant_id, wound_type, wound_count, updated_at")
    .eq("campaign_id", campaignId)) as SupabaseResult<CombatantWoundRow[]>;
  if (error) {
    throw new ApiError(0, `Failed to load combatant wounds: ${error.message}`);
  }
  return (data ?? []).map(mapCombatantWound);
}

export async function upsertCombatantWound(
  payload: Partial<PlayerCombatantWound> & { campaignId: string; combatantId: string; woundType: string }
): Promise<PlayerCombatantWound> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const record = toCombatantWoundPayload(payload);
  const { data, error } = (await client
    .from("campaign_combatant_wounds")
    .upsert(record, { onConflict: "combatant_id,wound_type" })
    .select("id, campaign_id, combatant_id, wound_type, wound_count, updated_at")
    .single()) as SupabaseResult<CombatantWoundRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to upsert combatant wound: ${error?.message ?? "unknown error"}`);
  }
  return mapCombatantWound(data);
}
