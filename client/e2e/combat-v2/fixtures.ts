/**
 * E2E Test Fixtures for Combat V2
 *
 * Provides WebSocket mocking and test data helpers for Playwright tests.
 */

import { test as base, Page, WebSocketRoute } from "@playwright/test";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CombatV2Entity {
  id: string;
  name: string;
  displayName?: string;
  tier: "minion" | "full" | "lieutenant" | "hero";
  faction: "ally" | "enemy" | "neutral";
  controller: "gm" | `player:${string}`;
  entityType?: "pc" | "npc" | "monster";
  characterId?: string;
  level?: number;
  ap?: { current: number; max: number };
  energy?: { current: number; max: number };
}

export interface InitiativeEntry {
  entityId: string;
  roll: number;
  tiebreaker: number;
  delayed: boolean;
  readied: boolean;
}

export interface CombatV2State {
  combatId: string;
  campaignId: string;
  phase: "setup" | "initiative" | "active" | "active-turn" | "completed";
  round: number;
  currentTurnIndex: number;
  currentEntityId: string | null;
  entities: Record<string, CombatV2Entity>;
  initiative: InitiativeEntry[];
  hexPositions: Record<string, { q: number; r: number }>;
  version: number;
}

export interface MockWebSocketServer {
  ws: WebSocketRoute;
  sendStateSync: (state: CombatV2State, controlledEntities: string[]) => Promise<void>;
  sendCombatStarted: (combatId: string) => Promise<void>;
  sendTurnStarted: (entityId: string, round: number, turnIndex: number) => Promise<void>;
  getReceivedMessages: () => Array<{ type: string; payload: unknown }>;
  close: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

let entityIdCounter = 0;

export function createPlayerCharacter(
  playerId: string,
  characterId: string,
  overrides: Partial<CombatV2Entity> = {}
): CombatV2Entity {
  return {
    id: characterId,
    name: overrides.name ?? "Test Hero",
    displayName: overrides.displayName ?? overrides.name ?? "Test Hero",
    tier: "hero",
    faction: "ally",
    controller: `player:${playerId}`,
    entityType: "pc",
    characterId,
    level: 1,
    ap: { current: 6, max: 6 },
    energy: { current: 100, max: 100 },
    ...overrides,
  };
}

export function createEnemy(overrides: Partial<CombatV2Entity> = {}): CombatV2Entity {
  const id = overrides.id ?? `enemy-${++entityIdCounter}`;
  return {
    id,
    name: overrides.name ?? "Test Enemy",
    displayName: overrides.displayName ?? overrides.name ?? "Test Enemy",
    tier: "full",
    faction: "enemy",
    controller: "gm",
    entityType: "monster",
    level: 1,
    ap: { current: 6, max: 6 },
    energy: { current: 100, max: 100 },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

export function createActiveState(options: {
  entities?: CombatV2Entity[];
  round?: number;
  currentEntityId?: string | null;
  combatId?: string;
  campaignId?: string;
}): CombatV2State {
  const entities = options.entities ?? [];
  const entitiesRecord: Record<string, CombatV2Entity> = {};
  entities.forEach((e) => {
    entitiesRecord[e.id] = e;
  });

  const initiative: InitiativeEntry[] = entities.map((e, i) => ({
    entityId: e.id,
    roll: 20 - i,
    tiebreaker: Math.random(),
    delayed: false,
    readied: false,
  }));

  const hexPositions: Record<string, { q: number; r: number }> = {};
  entities.forEach((e, i) => {
    hexPositions[e.id] = { q: i, r: 0 };
  });

  return {
    combatId: options.combatId ?? "test-combat-id",
    campaignId: options.campaignId ?? "test-campaign-id",
    phase: "active",
    round: options.round ?? 1,
    currentTurnIndex: 0,
    currentEntityId: options.currentEntityId ?? entities[0]?.id ?? null,
    entities: entitiesRecord,
    initiative,
    hexPositions,
    version: 1,
  };
}

export function createLobbyState(options: {
  entities?: CombatV2Entity[];
  initiative?: InitiativeEntry[];
  combatId?: string;
  campaignId?: string;
}): CombatV2State {
  const entities = options.entities ?? [];
  const entitiesRecord: Record<string, CombatV2Entity> = {};
  entities.forEach((e) => {
    entitiesRecord[e.id] = e;
  });

  const hexPositions: Record<string, { q: number; r: number }> = {};
  entities.forEach((e, i) => {
    hexPositions[e.id] = { q: i, r: 0 };
  });

  return {
    combatId: options.combatId ?? "test-combat-id",
    campaignId: options.campaignId ?? "test-campaign-id",
    phase: "initiative",
    round: 0,
    currentTurnIndex: -1,
    currentEntityId: null,
    entities: entitiesRecord,
    initiative: options.initiative ?? [],
    hexPositions,
    version: 1,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBSOCKET MOCK HELPER
// ═══════════════════════════════════════════════════════════════════════════

export async function setupMockCombatWebSocket(
  page: Page,
  options: {
    campaignId?: string;
    playerId?: string;
    isGM?: boolean;
  } = {}
): Promise<MockWebSocketServer> {
  const { campaignId = "test-campaign-id" } = options;
  const receivedMessages: Array<{ type: string; payload: unknown }> = [];
  let wsRoute: WebSocketRoute | null = null;

  // Route WebSocket connections to our mock
  await page.routeWebSocket(/\/api\/combat\/.*\/connect/, (ws) => {
    wsRoute = ws;

    ws.onMessage((message) => {
      try {
        const data = JSON.parse(message.toString());
        receivedMessages.push({
          type: data.type,
          payload: data.payload,
        });
      } catch {
        // Ignore non-JSON messages
      }
    });
  });

  const sendMessage = async (type: string, payload: unknown) => {
    if (!wsRoute) {
      throw new Error("WebSocket not connected yet");
    }
    wsRoute.send(
      JSON.stringify({
        type,
        payload,
        timestamp: new Date().toISOString(),
      })
    );
  };

  return {
    get ws() {
      return wsRoute!;
    },
    sendStateSync: async (state: CombatV2State, controlledEntities: string[]) => {
      await sendMessage("STATE_SYNC", {
        state,
        yourControlledEntities: controlledEntities,
      });
    },
    sendCombatStarted: async (combatId: string) => {
      await sendMessage("COMBAT_STARTED", {
        combatId,
        phase: "active",
      });
    },
    sendTurnStarted: async (entityId: string, round: number, turnIndex: number) => {
      await sendMessage("TURN_STARTED", {
        entityId,
        round,
        turnIndex,
      });
    },
    getReceivedMessages: () => [...receivedMessages],
    close: async () => {
      if (wsRoute) {
        wsRoute.close();
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE AUTH MOCK
// ═══════════════════════════════════════════════════════════════════════════

export async function mockSupabaseAuth(
  page: Page,
  options: {
    userId?: string;
    email?: string;
  } = {}
): Promise<void> {
  const { userId = "test-player-id", email = "test@example.com" } = options;

  // Inject mock user into the page context before loading
  await page.addInitScript(
    ({ userId, email }) => {
      // Set test mode
      (window as any).__COMBAT_TEST_MODE__ = true;
      (window as any).__TEST_MODE_IDENTITY__ = {
        playerId: userId,
        controlledCharacterIds: ["char-1"],
        isGM: false,
      };
    },
    { userId, email }
  );
}

export async function mockSupabaseGmAuth(
  page: Page,
  options: {
    userId?: string;
    email?: string;
  } = {}
): Promise<void> {
  const { userId = "test-gm-id", email = "gm@example.com" } = options;

  await page.addInitScript(
    ({ userId, email }) => {
      (window as any).__COMBAT_TEST_MODE__ = true;
      (window as any).__TEST_MODE_IDENTITY__ = {
        playerId: userId,
        controlledCharacterIds: [],
        isGM: true,
      };
    },
    { userId, email }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM TEST FIXTURE
// ═══════════════════════════════════════════════════════════════════════════

export const test = base.extend<{
  mockWebSocket: MockWebSocketServer;
}>({
  mockWebSocket: async ({ page }, use) => {
    const mockWs = await setupMockCombatWebSocket(page);
    await use(mockWs);
    await mockWs.close();
  },
});

export { expect } from "@playwright/test";
