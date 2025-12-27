/**
 * Campaign Data Fixtures for Combat V2 Testing
 *
 * Provides mock data for campaigns, members, characters, and bestiary entries.
 */

import { vi } from "vitest";
import type { CampaignMember, BestiaryEntry, Campaign } from "../../../api/gm";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const TEST_CAMPAIGN_ID = "test-campaign-id";
export const TEST_PLAYER_ID = "test-player-id";
export const TEST_GM_ID = "test-gm-id";

// ═══════════════════════════════════════════════════════════════════════════
// MOCK CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════

export const mockCampaign: Campaign = {
  id: TEST_CAMPAIGN_ID,
  name: "Test Campaign",
  gmUserId: TEST_GM_ID,
  createdAt: "2024-01-01T00:00:00Z",
};

export const mockCampaigns: Campaign[] = [mockCampaign];

// ═══════════════════════════════════════════════════════════════════════════
// MOCK CAMPAIGN MEMBERS
// ═══════════════════════════════════════════════════════════════════════════

export const mockCampaignMembers: CampaignMember[] = [
  {
    campaignId: TEST_CAMPAIGN_ID,
    playerUserId: TEST_PLAYER_ID,
    characterId: "char-1",
    role: "player",
  },
  {
    campaignId: TEST_CAMPAIGN_ID,
    playerUserId: "player-2",
    characterId: "char-2",
    role: "player",
  },
  {
    campaignId: TEST_CAMPAIGN_ID,
    playerUserId: "player-3",
    characterId: "char-3",
    role: "player",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MOCK CHARACTERS (simplified, matching Character type from api/client.ts)
// ═══════════════════════════════════════════════════════════════════════════

export interface MockCharacter {
  id: string;
  name: string;
  level: number;
  userId?: string;
  raceKey?: string;
  skillPoints?: number;
  skillAllocations?: Record<string, number>;
  attributes?: Record<string, number>;
}

export const mockCharacters: MockCharacter[] = [
  {
    id: "char-1",
    name: "Test Hero",
    level: 5,
    userId: TEST_PLAYER_ID,
    attributes: { PHYSICAL: 3, MENTAL: 2, SPIRITUAL: 1 },
    skillPoints: 0,
    skillAllocations: { melee: 5, dodge: 3 },
  },
  {
    id: "char-2",
    name: "Second Player",
    level: 5,
    userId: "player-2",
    attributes: { PHYSICAL: 2, MENTAL: 3, SPIRITUAL: 2 },
    skillPoints: 0,
    skillAllocations: { ranged: 4, perception: 3 },
  },
  {
    id: "char-3",
    name: "Third Player",
    level: 4,
    userId: "player-3",
    attributes: { PHYSICAL: 1, MENTAL: 2, SPIRITUAL: 4 },
    skillPoints: 0,
    skillAllocations: { channeling: 5, willpower: 3 },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MOCK BESTIARY ENTRIES
// ═══════════════════════════════════════════════════════════════════════════

export const mockBestiaryEntries: BestiaryEntry[] = [
  {
    id: "goblin-1",
    campaignId: TEST_CAMPAIGN_ID,
    name: "Goblin",
    rank: "minion",
    skills: { melee: 5, dodge: 3 },
    energyBars: 1,
    dr: 0,
  },
  {
    id: "orc-1",
    campaignId: TEST_CAMPAIGN_ID,
    name: "Orc Warrior",
    rank: "full",
    skills: { melee: 8, toughness: 6, intimidate: 4 },
    energyBars: 2,
    dr: 2,
    armorType: "medium",
  },
  {
    id: "ogre-1",
    campaignId: TEST_CAMPAIGN_ID,
    name: "Ogre Brute",
    rank: "lieutenant",
    skills: { melee: 10, toughness: 8 },
    energyBars: 3,
    dr: 4,
    armorType: "heavy",
  },
  {
    id: "dragon-1",
    campaignId: TEST_CAMPAIGN_ID,
    name: "Young Dragon",
    rank: "hero",
    skills: { melee: 12, dodge: 8, perception: 10 },
    energyBars: 5,
    dr: 6,
    immunities: ["fire"] as unknown as BestiaryEntry["immunities"],
    abilities: [
      {
        type: "attack",
        name: "Fire Breath",
        description: "Breathe fire in a cone",
        damage: "3d6",
        energyCost: 20,
        apCost: 3,
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MOCK API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a mock gmApi object with vi.fn() spies.
 * Reset these in beforeEach if needed.
 */
export function createMockGmApi() {
  return {
    listCampaigns: vi.fn().mockResolvedValue(mockCampaigns),
    createCampaign: vi.fn().mockResolvedValue(mockCampaign),
    updateCampaign: vi.fn().mockResolvedValue(mockCampaign),
    deleteCampaign: vi.fn().mockResolvedValue(undefined),
    listCampaignMembers: vi.fn().mockResolvedValue(mockCampaignMembers),
    addCampaignMember: vi.fn().mockResolvedValue(mockCampaignMembers[0]),
    removeCampaignMember: vi.fn().mockResolvedValue(undefined),
    listBestiaryEntries: vi.fn().mockResolvedValue(mockBestiaryEntries),
    createBestiaryEntry: vi.fn().mockResolvedValue(mockBestiaryEntries[0]),
    updateBestiaryEntry: vi.fn().mockResolvedValue(mockBestiaryEntries[0]),
    deleteBestiaryEntry: vi.fn().mockResolvedValue(undefined),
    listCampaignInvites: vi.fn().mockResolvedValue([]),
    createCampaignInvite: vi.fn().mockResolvedValue({ token: "test-token", campaignId: TEST_CAMPAIGN_ID }),
    revokeCampaignInvite: vi.fn().mockResolvedValue(undefined),
    listCombatants: vi.fn().mockResolvedValue([]),
    createCombatant: vi.fn().mockResolvedValue({}),
    updateCombatant: vi.fn().mockResolvedValue({}),
    deleteCombatant: vi.fn().mockResolvedValue(undefined),
    startCombat: vi.fn().mockResolvedValue({ ok: true, state: {} }),
    advanceCombat: vi.fn().mockResolvedValue({ ok: true, state: {} }),
    getCombatState: vi.fn().mockResolvedValue({ ok: true, state: {} }),
    advanceCombatTurn: vi.fn().mockResolvedValue({ ok: true, state: {} }),
    spendCombatResources: vi.fn().mockResolvedValue({ ok: true, state: {} }),
    recordCombatReaction: vi.fn().mockResolvedValue({ ok: true, state: {} }),
    resolveAmbushCheck: vi.fn().mockResolvedValue({ ok: true, state: {} }),
    listSettings: vi.fn().mockResolvedValue([]),
    createSetting: vi.fn().mockResolvedValue({}),
    updateSetting: vi.fn().mockResolvedValue({}),
    deleteSetting: vi.fn().mockResolvedValue(undefined),
    pinBestiaryEntry: vi.fn().mockResolvedValue(undefined),
    unpinBestiaryEntry: vi.fn().mockResolvedValue(undefined),
    listCombatantStatusEffects: vi.fn().mockResolvedValue([]),
    upsertCombatantStatusEffect: vi.fn().mockResolvedValue({}),
    removeCombatantStatusEffect: vi.fn().mockResolvedValue(undefined),
    listCombatantWounds: vi.fn().mockResolvedValue([]),
    upsertCombatantWound: vi.fn().mockResolvedValue({}),
  };
}

/**
 * Create a mock client api object with vi.fn() spies.
 */
export function createMockClientApi() {
  return {
    listCampaignCharacters: vi.fn().mockResolvedValue(mockCharacters),
    getCharacter: vi.fn().mockImplementation((id: string) => {
      const char = mockCharacters.find((c) => c.id === id);
      return Promise.resolve(char ?? null);
    }),
    listCharacters: vi.fn().mockResolvedValue(mockCharacters),
    createCharacter: vi.fn().mockResolvedValue(mockCharacters[0]),
    updateCharacter: vi.fn().mockResolvedValue(mockCharacters[0]),
    deleteCharacter: vi.fn().mockResolvedValue(undefined),
  };
}

// Pre-created mock instances (can be imported directly)
export const mockGmApi = createMockGmApi();
export const mockClientApi = createMockClientApi();

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Reset all mock API functions to their default implementations.
 */
export function resetMockApis(): void {
  // Reset gmApi mocks
  Object.values(mockGmApi).forEach((fn) => {
    if (typeof fn.mockReset === "function") {
      fn.mockReset();
    }
  });

  // Restore default implementations
  mockGmApi.listCampaigns.mockResolvedValue(mockCampaigns);
  mockGmApi.listCampaignMembers.mockResolvedValue(mockCampaignMembers);
  mockGmApi.listBestiaryEntries.mockResolvedValue(mockBestiaryEntries);

  // Reset clientApi mocks
  Object.values(mockClientApi).forEach((fn) => {
    if (typeof fn.mockReset === "function") {
      fn.mockReset();
    }
  });

  // Restore default implementations
  mockClientApi.listCampaignCharacters.mockResolvedValue(mockCharacters);
  mockClientApi.listCharacters.mockResolvedValue(mockCharacters);
}

/**
 * Create a campaign member for a specific player and character.
 */
export function createCampaignMember(
  playerUserId: string,
  characterId: string,
  overrides: Partial<CampaignMember> = {}
): CampaignMember {
  return {
    campaignId: TEST_CAMPAIGN_ID,
    playerUserId,
    characterId,
    role: "player",
    ...overrides,
  };
}

/**
 * Create a bestiary entry for testing.
 */
export function createBestiaryEntry(
  name: string,
  rank: string = "full",
  overrides: Partial<BestiaryEntry> = {}
): BestiaryEntry {
  return {
    id: `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    campaignId: TEST_CAMPAIGN_ID,
    name,
    rank,
    skills: { melee: 5, dodge: 3 },
    energyBars: 2,
    ...overrides,
  };
}

/**
 * Get the character IDs controlled by a specific player.
 */
export function getControlledCharacterIds(playerUserId: string): string[] {
  return mockCampaignMembers
    .filter((m) => m.playerUserId === playerUserId && m.characterId)
    .map((m) => m.characterId!);
}
