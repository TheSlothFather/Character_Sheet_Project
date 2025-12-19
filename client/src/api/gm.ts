import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./client";
import { getSupabaseClient } from "./supabaseClient";

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  inviteCode?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CampaignInvite {
  id: string;
  campaignId: string;
  code: string;
  createdAt?: string;
  expiresAt?: string;
  maxUses?: number;
  uses?: number;
}

export interface CampaignMember {
  id: string;
  campaignId: string;
  userId: string;
  role?: string;
  joinedAt?: string;
}

export interface BestiaryEntry {
  id: string;
  campaignId: string;
  name: string;
  entryType?: string;
  description?: string;
  statBlock?: Record<string, unknown>;
  isPinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CampaignSetting {
  id: string;
  campaignId: string;
  title: string;
  summary?: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
}

type CampaignRow = {
  id: string;
  name: string;
  description?: string | null;
  invite_code?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CampaignInviteRow = {
  id: string;
  campaign_id: string;
  code: string;
  created_at?: string | null;
  expires_at?: string | null;
  max_uses?: number | null;
  uses?: number | null;
};

type CampaignMemberRow = {
  id: string;
  campaign_id: string;
  user_id: string;
  role?: string | null;
  joined_at?: string | null;
};

type BestiaryEntryRow = {
  id: string;
  campaign_id: string;
  name: string;
  entry_type?: string | null;
  description?: string | null;
  stat_block?: Record<string, unknown> | null;
  is_pinned?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CampaignSettingRow = {
  id: string;
  campaign_id: string;
  title: string;
  summary?: string | null;
  content?: string | null;
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

function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    inviteCode: row.invite_code ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function mapInvite(row: CampaignInviteRow): CampaignInvite {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    code: row.code,
    createdAt: row.created_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    maxUses: row.max_uses ?? undefined,
    uses: row.uses ?? undefined
  };
}

function mapMember(row: CampaignMemberRow): CampaignMember {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    userId: row.user_id,
    role: row.role ?? undefined,
    joinedAt: row.joined_at ?? undefined
  };
}

function mapBestiaryEntry(row: BestiaryEntryRow): BestiaryEntry {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    entryType: row.entry_type ?? undefined,
    description: row.description ?? undefined,
    statBlock: row.stat_block ?? undefined,
    isPinned: row.is_pinned ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function mapSetting(row: CampaignSettingRow): CampaignSetting {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    summary: row.summary ?? undefined,
    content: row.content ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function toCampaignPayload(payload: Partial<Campaign>): Partial<CampaignRow> {
  const record: Partial<CampaignRow> = {
    updated_at: new Date().toISOString()
  };

  if (payload.name !== undefined) record.name = payload.name;
  if (payload.description !== undefined) record.description = payload.description ?? null;
  if (payload.inviteCode !== undefined) record.invite_code = payload.inviteCode ?? null;

  return record;
}

function toInvitePayload(payload: Partial<CampaignInvite>): Partial<CampaignInviteRow> {
  const record: Partial<CampaignInviteRow> = {};

  if (payload.campaignId !== undefined) record.campaign_id = payload.campaignId;
  if (payload.code !== undefined) record.code = payload.code;
  if (payload.expiresAt !== undefined) record.expires_at = payload.expiresAt ?? null;
  if (payload.maxUses !== undefined) record.max_uses = payload.maxUses ?? null;
  if (payload.uses !== undefined) record.uses = payload.uses ?? null;

  return record;
}

function toMemberPayload(payload: Partial<CampaignMember>): Partial<CampaignMemberRow> {
  const record: Partial<CampaignMemberRow> = {};

  if (payload.campaignId !== undefined) record.campaign_id = payload.campaignId;
  if (payload.userId !== undefined) record.user_id = payload.userId;
  if (payload.role !== undefined) record.role = payload.role ?? null;
  if (payload.joinedAt !== undefined) record.joined_at = payload.joinedAt ?? null;

  return record;
}

function toBestiaryPayload(payload: Partial<BestiaryEntry>): Partial<BestiaryEntryRow> {
  const record: Partial<BestiaryEntryRow> = {
    updated_at: new Date().toISOString()
  };

  if (payload.campaignId !== undefined) record.campaign_id = payload.campaignId;
  if (payload.name !== undefined) record.name = payload.name;
  if (payload.entryType !== undefined) record.entry_type = payload.entryType ?? null;
  if (payload.description !== undefined) record.description = payload.description ?? null;
  if (payload.statBlock !== undefined) record.stat_block = payload.statBlock ?? null;
  if (payload.isPinned !== undefined) record.is_pinned = payload.isPinned ?? null;

  return record;
}

function toSettingPayload(payload: Partial<CampaignSetting>): Partial<CampaignSettingRow> {
  const record: Partial<CampaignSettingRow> = {
    updated_at: new Date().toISOString()
  };

  if (payload.campaignId !== undefined) record.campaign_id = payload.campaignId;
  if (payload.title !== undefined) record.title = payload.title;
  if (payload.summary !== undefined) record.summary = payload.summary ?? null;
  if (payload.content !== undefined) record.content = payload.content ?? null;

  return record;
}

async function listCampaigns(): Promise<Campaign[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: true })) as SupabaseResult<CampaignRow[]>;
  if (error) {
    throw new ApiError(0, `Failed to load campaigns: ${error.message}`);
  }
  return (data ?? []).map(mapCampaign);
}

async function createCampaign(payload: Partial<Campaign>): Promise<Campaign> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  if (payload.name === undefined) {
    throw new ApiError(0, "name is required to create a campaign");
  }
  const record = toCampaignPayload(payload);
  const { data, error } = (await client
    .from("campaigns")
    .insert(record)
    .select("*")
    .single()) as SupabaseResult<CampaignRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to create campaign: ${error?.message ?? "unknown error"}`);
  }
  return mapCampaign(data);
}

async function updateCampaign(id: string, payload: Partial<Campaign>): Promise<Campaign> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const record = toCampaignPayload(payload);
  const { data, error } = (await client
    .from("campaigns")
    .update(record)
    .eq("id", id)
    .select("*")
    .single()) as SupabaseResult<CampaignRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to update campaign: ${error?.message ?? "unknown error"}`);
  }
  return mapCampaign(data);
}

async function deleteCampaign(id: string): Promise<void> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { error } = (await client.from("campaigns").delete().eq("id", id)) as SupabaseResult<null>;
  if (error) {
    throw new ApiError(0, `Failed to delete campaign: ${error.message}`);
  }
}

async function listCampaignInvites(campaignId: string): Promise<CampaignInvite[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("campaign_invites")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })) as SupabaseResult<CampaignInviteRow[]>;
  if (error) {
    throw new ApiError(0, `Failed to load campaign invites: ${error.message}`);
  }
  return (data ?? []).map(mapInvite);
}

async function createCampaignInvite(payload: Partial<CampaignInvite>): Promise<CampaignInvite> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  if (!payload.campaignId || !payload.code) {
    throw new ApiError(0, "campaignId and code are required to create an invite");
  }
  const record = toInvitePayload(payload);
  const { data, error } = (await client
    .from("campaign_invites")
    .insert(record)
    .select("*")
    .single()) as SupabaseResult<CampaignInviteRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to create invite: ${error?.message ?? "unknown error"}`);
  }
  return mapInvite(data);
}

async function revokeCampaignInvite(id: string): Promise<void> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { error } = (await client.from("campaign_invites").delete().eq("id", id)) as SupabaseResult<null>;
  if (error) {
    throw new ApiError(0, `Failed to revoke invite: ${error.message}`);
  }
}

async function listCampaignMembers(campaignId: string): Promise<CampaignMember[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("campaign_memberships")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("joined_at", { ascending: true })) as SupabaseResult<CampaignMemberRow[]>;
  if (error) {
    throw new ApiError(0, `Failed to load campaign members: ${error.message}`);
  }
  return (data ?? []).map(mapMember);
}

async function addCampaignMember(payload: Partial<CampaignMember>): Promise<CampaignMember> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  if (!payload.campaignId || !payload.userId) {
    throw new ApiError(0, "campaignId and userId are required to add a member");
  }
  const record = toMemberPayload(payload);
  const { data, error } = (await client
    .from("campaign_memberships")
    .insert(record)
    .select("*")
    .single()) as SupabaseResult<CampaignMemberRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to add campaign member: ${error?.message ?? "unknown error"}`);
  }
  return mapMember(data);
}

async function removeCampaignMember(id: string): Promise<void> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { error } = (await client.from("campaign_memberships").delete().eq("id", id)) as SupabaseResult<null>;
  if (error) {
    throw new ApiError(0, `Failed to remove campaign member: ${error.message}`);
  }
}

async function listBestiaryEntries(campaignId: string): Promise<BestiaryEntry[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("bestiary_entries")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })) as SupabaseResult<BestiaryEntryRow[]>;
  if (error) {
    throw new ApiError(0, `Failed to load bestiary entries: ${error.message}`);
  }
  return (data ?? []).map(mapBestiaryEntry);
}

async function createBestiaryEntry(payload: Partial<BestiaryEntry>): Promise<BestiaryEntry> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  if (!payload.campaignId || !payload.name) {
    throw new ApiError(0, "campaignId and name are required to create a bestiary entry");
  }
  const record = toBestiaryPayload(payload);
  const { data, error } = (await client
    .from("bestiary_entries")
    .insert(record)
    .select("*")
    .single()) as SupabaseResult<BestiaryEntryRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to create bestiary entry: ${error?.message ?? "unknown error"}`);
  }
  return mapBestiaryEntry(data);
}

async function updateBestiaryEntry(id: string, payload: Partial<BestiaryEntry>): Promise<BestiaryEntry> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const record = toBestiaryPayload(payload);
  const { data, error } = (await client
    .from("bestiary_entries")
    .update(record)
    .eq("id", id)
    .select("*")
    .single()) as SupabaseResult<BestiaryEntryRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to update bestiary entry: ${error?.message ?? "unknown error"}`);
  }
  return mapBestiaryEntry(data);
}

async function deleteBestiaryEntry(id: string): Promise<void> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { error } = (await client.from("bestiary_entries").delete().eq("id", id)) as SupabaseResult<null>;
  if (error) {
    throw new ApiError(0, `Failed to delete bestiary entry: ${error.message}`);
  }
}

async function pinBestiaryEntry(id: string): Promise<BestiaryEntry> {
  return updateBestiaryEntry(id, { isPinned: true });
}

async function unpinBestiaryEntry(id: string): Promise<BestiaryEntry> {
  return updateBestiaryEntry(id, { isPinned: false });
}

async function listSettings(campaignId: string): Promise<CampaignSetting[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("campaign_settings")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true })) as SupabaseResult<CampaignSettingRow[]>;
  if (error) {
    throw new ApiError(0, `Failed to load settings: ${error.message}`);
  }
  return (data ?? []).map(mapSetting);
}

async function createSetting(payload: Partial<CampaignSetting>): Promise<CampaignSetting> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  if (!payload.campaignId || !payload.title) {
    throw new ApiError(0, "campaignId and title are required to create a setting");
  }
  const record = toSettingPayload(payload);
  const { data, error } = (await client
    .from("campaign_settings")
    .insert(record)
    .select("*")
    .single()) as SupabaseResult<CampaignSettingRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to create setting: ${error?.message ?? "unknown error"}`);
  }
  return mapSetting(data);
}

async function updateSetting(id: string, payload: Partial<CampaignSetting>): Promise<CampaignSetting> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const record = toSettingPayload(payload);
  const { data, error } = (await client
    .from("campaign_settings")
    .update(record)
    .eq("id", id)
    .select("*")
    .single()) as SupabaseResult<CampaignSettingRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to update setting: ${error?.message ?? "unknown error"}`);
  }
  return mapSetting(data);
}

async function deleteSetting(id: string): Promise<void> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { error } = (await client.from("campaign_settings").delete().eq("id", id)) as SupabaseResult<null>;
  if (error) {
    throw new ApiError(0, `Failed to delete setting: ${error.message}`);
  }
}

export const gmApi = {
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  listCampaignInvites,
  createCampaignInvite,
  revokeCampaignInvite,
  listCampaignMembers,
  addCampaignMember,
  removeCampaignMember,
  listBestiaryEntries,
  createBestiaryEntry,
  updateBestiaryEntry,
  deleteBestiaryEntry,
  pinBestiaryEntry,
  unpinBestiaryEntry,
  listSettings,
  createSetting,
  updateSetting,
  deleteSetting
};
