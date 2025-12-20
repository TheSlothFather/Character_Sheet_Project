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
}

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
    id: row.bestiary_entry_id,
    name: row.name,
    faction: row.faction ?? undefined,
    combatStatus: row.is_active ? "active" : "inactive"
  };
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
  const { data, error } = (await client
    .from("campaign_combatants")
    .select("id, campaign_id, bestiary_entry_id, faction, is_active, bestiary_entries(name)")
    .eq("campaign_id", campaignId)
    .eq("is_active", true)
    .order("initiative", { ascending: false })) as SupabaseResult<CombatantRow[]>;
  if (error) {
    throw new ApiError(0, `Failed to load combatants: ${error.message}`);
  }
  return (data ?? []).map((row) => {
    const name = (row as CombatantRow & { bestiary_entries?: { name: string } | null }).bestiary_entries?.name ?? "Unknown";
    return mapCombatant({ ...row, name });
  });
}
