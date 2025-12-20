import { ApiError } from "./client";
import { getSupabaseClient } from "./supabaseClient";

export interface Campaign {
  id: string;
  name: string;
  gmUserId: string;
  createdAt?: string;
}

export interface CampaignInvite {
  token: string;
  campaignId: string;
  createdBy?: string;
  createdAt?: string;
  expiresAt?: string;
}

export interface CampaignMember {
  campaignId: string;
  playerUserId: string;
  characterId?: string;
  role?: string;
}

export interface BestiaryEntry {
  id: string;
  campaignId: string;
  name: string;
  statsSkills?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  skills?: Record<string, number>;
  abilities?: BestiaryAbility[];
  tags?: string[];
}

export interface CampaignCombatant {
  id: string;
  campaignId: string;
  bestiaryEntryId: string;
  name: string;
  faction?: string;
  isActive?: boolean;
  initiative?: number;
  notes?: string;
  energyCurrent?: number;
  apCurrent?: number;
  tier?: number;
  energyMax?: number;
  apMax?: number;
}

export interface BestiaryAbility {
  type: string;
  tree?: string;
  category?: string;
  key?: string;
  name?: string;
}

export interface BestiaryPin {
  campaignId: string;
  bestiaryEntryId: string;
  pinnedOrder?: number;
}

export interface CampaignSetting {
  id: string;
  campaignId: string;
  title: string;
  body?: string;
  tags?: string[];
  isPlayerVisible?: boolean;
}

type CampaignRow = {
  id: string;
  name: string;
  gm_user_id: string;
  created_at?: string | null;
};

type CampaignInviteRow = {
  token: string;
  campaign_id: string;
  created_by?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
};

type CampaignMemberRow = {
  campaign_id: string;
  player_user_id: string;
  character_id?: string | null;
  role?: string | null;
};

type BestiaryEntryRow = {
  id: string;
  campaign_id: string;
  name: string;
  stats_skills?: Record<string, unknown> | null;
  attributes?: Record<string, unknown> | null;
  skills?: Record<string, number> | null;
  abilities?: BestiaryAbility[] | null;
  tags?: string[] | null;
};

type BestiaryPinRow = {
  campaign_id: string;
  bestiary_entry_id: string;
  pinned_order?: number | null;
};

type CampaignCombatantRow = {
  id: string;
  campaign_id: string;
  bestiary_entry_id: string;
  faction?: string | null;
  is_active?: boolean | null;
  initiative?: number | null;
  notes?: string | null;
  energy_current?: number | null;
  ap_current?: number | null;
  tier?: number | null;
  energy_max?: number | null;
  ap_max?: number | null;
  bestiary_entries?: {
    id: string;
    name: string;
  } | null;
};

type CampaignSettingRow = {
  id: string;
  campaign_id: string;
  title: string;
  body?: string | null;
  tags?: string[] | null;
  is_player_visible?: boolean | null;
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

async function getCurrentUserId(client: ReturnType<typeof getSupabaseClient>): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) {
    throw new ApiError(0, `Failed to load current user: ${error.message}`);
  }
  const userId = data?.user?.id;
  if (!userId) {
    throw new ApiError(0, "No authenticated user available for this request");
  }
  return userId;
}

function createToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

const DEFAULT_INVITE_TTL_DAYS = 7;

function defaultInviteExpiry(): string {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + DEFAULT_INVITE_TTL_DAYS);
  return expiry.toISOString();
}

function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    gmUserId: row.gm_user_id,
    createdAt: row.created_at ?? undefined
  };
}

function mapInvite(row: CampaignInviteRow): CampaignInvite {
  return {
    token: row.token,
    campaignId: row.campaign_id,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at ?? undefined,
    expiresAt: row.expires_at ?? undefined
  };
}

function mapMember(row: CampaignMemberRow): CampaignMember {
  return {
    campaignId: row.campaign_id,
    playerUserId: row.player_user_id,
    characterId: row.character_id ?? undefined,
    role: row.role ?? undefined
  };
}

function mapBestiaryEntry(row: BestiaryEntryRow): BestiaryEntry {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    statsSkills: row.stats_skills ?? undefined,
    attributes: row.attributes ?? undefined,
    skills: row.skills ?? undefined,
    abilities: row.abilities ?? undefined,
    tags: row.tags ?? undefined
  };
}

function mapSetting(row: CampaignSettingRow): CampaignSetting {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    body: row.body ?? undefined,
    tags: row.tags ?? undefined,
    isPlayerVisible: row.is_player_visible ?? undefined
  };
}

function mapCombatant(row: CampaignCombatantRow): CampaignCombatant {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    bestiaryEntryId: row.bestiary_entry_id,
    name: row.bestiary_entries?.name ?? "Unknown",
    faction: row.faction ?? undefined,
    isActive: row.is_active ?? undefined,
    initiative: row.initiative ?? undefined,
    notes: row.notes ?? undefined,
    energyCurrent: row.energy_current ?? undefined,
    apCurrent: row.ap_current ?? undefined,
    tier: row.tier ?? undefined,
    energyMax: row.energy_max ?? undefined,
    apMax: row.ap_max ?? undefined
  };
}

function toCampaignPayload(payload: Partial<Campaign>): Partial<CampaignRow> {
  const record: Partial<CampaignRow> = {};

  if (payload.name !== undefined) record.name = payload.name;

  return record;
}

function toInvitePayload(payload: Partial<CampaignInvite>): Partial<CampaignInviteRow> {
  const record: Partial<CampaignInviteRow> = {};

  if (payload.token !== undefined) record.token = payload.token;
  if (payload.campaignId !== undefined) record.campaign_id = payload.campaignId;
  if (payload.createdBy !== undefined) record.created_by = payload.createdBy ?? null;
  if (payload.expiresAt !== undefined) record.expires_at = payload.expiresAt ?? null;

  return record;
}

function toMemberPayload(payload: Partial<CampaignMember>): Partial<CampaignMemberRow> {
  const record: Partial<CampaignMemberRow> = {};

  if (payload.campaignId !== undefined) record.campaign_id = payload.campaignId;
  if (payload.playerUserId !== undefined) record.player_user_id = payload.playerUserId;
  if (payload.characterId !== undefined) record.character_id = payload.characterId ?? null;
  if (payload.role !== undefined) record.role = payload.role ?? null;

  return record;
}

function toBestiaryPayload(payload: Partial<BestiaryEntry>): Partial<BestiaryEntryRow> {
  const record: Partial<BestiaryEntryRow> = {};

  if (payload.campaignId !== undefined) record.campaign_id = payload.campaignId;
  if (payload.name !== undefined) record.name = payload.name;
  if (payload.statsSkills !== undefined) record.stats_skills = payload.statsSkills ?? null;
  if (payload.attributes !== undefined) record.attributes = payload.attributes ?? null;
  if (payload.skills !== undefined) record.skills = payload.skills ?? null;
  if (payload.abilities !== undefined) record.abilities = payload.abilities ?? null;
  if (payload.tags !== undefined) record.tags = payload.tags ?? null;

  return record;
}

function toPinPayload(payload: Partial<BestiaryPin>): Partial<BestiaryPinRow> {
  const record: Partial<BestiaryPinRow> = {};

  if (payload.campaignId !== undefined) record.campaign_id = payload.campaignId;
  if (payload.bestiaryEntryId !== undefined) record.bestiary_entry_id = payload.bestiaryEntryId;
  if (payload.pinnedOrder !== undefined) record.pinned_order = payload.pinnedOrder ?? null;

  return record;
}

function toCombatantPayload(payload: Partial<CampaignCombatant>): Partial<CampaignCombatantRow> {
  const record: Partial<CampaignCombatantRow> = {};

  if (payload.campaignId !== undefined) record.campaign_id = payload.campaignId;
  if (payload.bestiaryEntryId !== undefined) record.bestiary_entry_id = payload.bestiaryEntryId;
  if (payload.faction !== undefined) record.faction = payload.faction ?? null;
  if (payload.isActive !== undefined) record.is_active = payload.isActive ?? null;
  if (payload.initiative !== undefined) record.initiative = payload.initiative ?? null;
  if (payload.notes !== undefined) record.notes = payload.notes ?? null;
  if (payload.energyCurrent !== undefined) record.energy_current = payload.energyCurrent ?? null;
  if (payload.apCurrent !== undefined) record.ap_current = payload.apCurrent ?? null;
  if (payload.tier !== undefined) record.tier = payload.tier ?? null;
  if (payload.energyMax !== undefined) record.energy_max = payload.energyMax ?? null;
  if (payload.apMax !== undefined) record.ap_max = payload.apMax ?? null;

  return record;
}

function toSettingPayload(payload: Partial<CampaignSetting>): Partial<CampaignSettingRow> {
  const record: Partial<CampaignSettingRow> = {};

  if (payload.campaignId !== undefined) record.campaign_id = payload.campaignId;
  if (payload.title !== undefined) record.title = payload.title;
  if (payload.body !== undefined) record.body = payload.body ?? null;
  if (payload.tags !== undefined) record.tags = payload.tags ?? null;
  if (payload.isPlayerVisible !== undefined) record.is_player_visible = payload.isPlayerVisible ?? null;

  return record;
}

async function listCampaigns(): Promise<Campaign[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("campaigns")
    .select("id, name, gm_user_id, created_at")
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
  const gmUserId = await getCurrentUserId(client);
  const record = { ...toCampaignPayload(payload), gm_user_id: gmUserId };
  const { data, error } = (await client
    .from("campaigns")
    .insert(record)
    .select("id, name, gm_user_id, created_at")
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
    .select("id, name, gm_user_id, created_at")
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
    .select("token, campaign_id, created_by, created_at, expires_at")
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
  if (!payload.campaignId) {
    throw new ApiError(0, "campaignId is required to create an invite");
  }
  const createdBy = await getCurrentUserId(client);
  const record = toInvitePayload({
    ...payload,
    token: payload.token ?? createToken(),
    createdBy,
    expiresAt: payload.expiresAt ?? defaultInviteExpiry()
  });
  const { data, error } = (await client
    .from("campaign_invites")
    .insert(record)
    .select("token, campaign_id, created_by, created_at, expires_at")
    .single()) as SupabaseResult<CampaignInviteRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to create invite: ${error?.message ?? "unknown error"}`);
  }
  return mapInvite(data);
}

async function revokeCampaignInvite(token: string): Promise<void> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { error } = (await client.from("campaign_invites").delete().eq("token", token)) as SupabaseResult<null>;
  if (error) {
    throw new ApiError(0, `Failed to revoke invite: ${error.message}`);
  }
}

async function listCampaignMembers(campaignId: string): Promise<CampaignMember[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("campaign_members")
    .select("campaign_id, player_user_id, character_id, role")
    .eq("campaign_id", campaignId)
    .order("player_user_id", { ascending: true })) as SupabaseResult<CampaignMemberRow[]>;
  if (error) {
    throw new ApiError(0, `Failed to load campaign members: ${error.message}`);
  }
  return (data ?? []).map(mapMember);
}

async function addCampaignMember(payload: Partial<CampaignMember>): Promise<CampaignMember> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  if (!payload.campaignId || !payload.playerUserId) {
    throw new ApiError(0, "campaignId and playerUserId are required to add a member");
  }
  const record = toMemberPayload(payload);
  const { data, error } = (await client
    .from("campaign_members")
    .insert(record)
    .select("campaign_id, player_user_id, character_id, role")
    .single()) as SupabaseResult<CampaignMemberRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to add campaign member: ${error?.message ?? "unknown error"}`);
  }
  return mapMember(data);
}

async function removeCampaignMember(campaignId: string, playerUserId: string): Promise<void> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { error } = (await client
    .from("campaign_members")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("player_user_id", playerUserId)) as SupabaseResult<null>;
  if (error) {
    throw new ApiError(0, `Failed to remove campaign member: ${error.message}`);
  }
}

async function listBestiaryEntries(campaignId: string): Promise<BestiaryEntry[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("bestiary_entries")
    .select("id, campaign_id, name, stats_skills, attributes, skills, abilities, tags")
    .eq("campaign_id", campaignId)
    .order("name", { ascending: true })) as SupabaseResult<BestiaryEntryRow[]>;
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
    .select("id, campaign_id, name, stats_skills, attributes, skills, abilities, tags")
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
    .select("id, campaign_id, name, stats_skills, attributes, skills, abilities, tags")
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

async function pinBestiaryEntry(payload: BestiaryPin): Promise<void> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const record = toPinPayload(payload);
  const { error } = (await client.from("npc_pins").insert(record)) as SupabaseResult<null>;
  if (error) {
    throw new ApiError(0, `Failed to pin bestiary entry: ${error.message}`);
  }
}

async function unpinBestiaryEntry(campaignId: string, bestiaryEntryId: string): Promise<void> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { error } = (await client
    .from("npc_pins")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("bestiary_entry_id", bestiaryEntryId)) as SupabaseResult<null>;
  if (error) {
    throw new ApiError(0, `Failed to unpin bestiary entry: ${error.message}`);
  }
}

async function listCombatants(campaignId: string): Promise<CampaignCombatant[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("campaign_combatants")
    .select(
      "id, campaign_id, bestiary_entry_id, faction, is_active, initiative, notes, energy_current, ap_current, tier, energy_max, ap_max, bestiary_entries(id, name)"
    )
    .eq("campaign_id", campaignId)
    .order("initiative", { ascending: false })) as SupabaseResult<CampaignCombatantRow[]>;
  if (error) {
    throw new ApiError(0, `Failed to load combatants: ${error.message}`);
  }
  return (data ?? []).map(mapCombatant);
}

async function createCombatant(payload: Partial<CampaignCombatant>): Promise<CampaignCombatant> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  if (!payload.campaignId || !payload.bestiaryEntryId) {
    throw new ApiError(0, "campaignId and bestiaryEntryId are required to create a combatant");
  }
  const record = toCombatantPayload(payload);
  const { data, error } = (await client
    .from("campaign_combatants")
    .insert(record)
    .select(
      "id, campaign_id, bestiary_entry_id, faction, is_active, initiative, notes, energy_current, ap_current, tier, energy_max, ap_max, bestiary_entries(id, name)"
    )
    .single()) as SupabaseResult<CampaignCombatantRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to create combatant: ${error?.message ?? "unknown error"}`);
  }
  return mapCombatant(data);
}

async function updateCombatant(id: string, payload: Partial<CampaignCombatant>): Promise<CampaignCombatant> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const record = toCombatantPayload(payload);
  const { data, error } = (await client
    .from("campaign_combatants")
    .update(record)
    .eq("id", id)
    .select(
      "id, campaign_id, bestiary_entry_id, faction, is_active, initiative, notes, energy_current, ap_current, tier, energy_max, ap_max, bestiary_entries(id, name)"
    )
    .single()) as SupabaseResult<CampaignCombatantRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to update combatant: ${error?.message ?? "unknown error"}`);
  }
  return mapCombatant(data);
}

async function deleteCombatant(id: string): Promise<void> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { error } = (await client.from("campaign_combatants").delete().eq("id", id)) as SupabaseResult<null>;
  if (error) {
    throw new ApiError(0, `Failed to remove combatant: ${error.message}`);
  }
}

async function listSettings(campaignId: string): Promise<CampaignSetting[]> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { data, error } = (await client
    .from("setting_entries")
    .select("id, campaign_id, title, body, tags, is_player_visible")
    .eq("campaign_id", campaignId)
    .order("title", { ascending: true })) as SupabaseResult<CampaignSettingRow[]>;
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
    .from("setting_entries")
    .insert(record)
    .select("id, campaign_id, title, body, tags, is_player_visible")
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
    .from("setting_entries")
    .update(record)
    .eq("id", id)
    .select("id, campaign_id, title, body, tags, is_player_visible")
    .single()) as SupabaseResult<CampaignSettingRow>;
  if (error || !data) {
    throw new ApiError(0, `Failed to update setting: ${error?.message ?? "unknown error"}`);
  }
  return mapSetting(data);
}

async function deleteSetting(id: string): Promise<void> {
  ensureSupabaseEnv();
  const client = getSupabaseClient();
  const { error } = (await client.from("setting_entries").delete().eq("id", id)) as SupabaseResult<null>;
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
  listCombatants,
  createCombatant,
  updateCombatant,
  deleteCombatant,
  listSettings,
  createSetting,
  updateSetting,
  deleteSetting
};
