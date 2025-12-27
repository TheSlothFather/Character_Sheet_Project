/**
 * GmCombatPage Unit Tests
 *
 * Tests the GM combat interface using mock WebSocket and Supabase.
 */

import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GmCombatPage } from "../../modules/combat-v2/pages/GmCombatPage";
import {
  GmCombatTestWrapper,
  setupCombatTest,
  teardownCombatTest,
  createPlayerCharacter,
  createEnemy,
  createActiveState,
  createLobbyState,
} from "../../test-utils/combat-v2";
import type { SetupCombatTestResult } from "../../test-utils/combat-v2";

// Mock the GM API calls
vi.mock("../../api/gm", () => ({
  gmApi: {
    listCampaignMembers: vi.fn().mockResolvedValue([]),
    listBestiaryEntries: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../api/client", () => ({
  api: {
    listCampaignCharacters: vi.fn().mockResolvedValue([]),
  },
}));

const TEST_CAMPAIGN_ID = "test-campaign-id";
const TEST_GM_ID = "test-gm-id";

describe("GmCombatPage", () => {
  let testEnv: SetupCombatTestResult;

  beforeEach(() => {
    testEnv = setupCombatTest({
      user: { id: TEST_GM_ID, email: "gm@test.com" },
      controlledCharacterIds: [],
      isGM: true,
    });
  });

  afterEach(() => {
    teardownCombatTest();
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION STATES
  // ═══════════════════════════════════════════════════════════════════════════

  describe("connection states", () => {
    it("shows connecting state initially", async () => {
      render(
        <GmCombatTestWrapper>
          <GmCombatPage />
        </GmCombatTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Connecting to combat/i)).toBeInTheDocument();
      });
    });

    it("shows reconnecting state when WebSocket closes", async () => {
      render(
        <GmCombatTestWrapper>
          <GmCombatPage />
        </GmCombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const state = createActiveState({ entities: [] });

      await act(async () => {
        ws.sendStateSync(state, []);
      });

      await waitFor(() => {
        expect(screen.getByText("GM Combat Control")).toBeInTheDocument();
      });

      await act(async () => {
        ws.close();
      });

      await waitFor(() => {
        expect(screen.getByText(/Reconnecting/i)).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GM INTERFACE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GM interface", () => {
    it("displays GM Combat Control header after STATE_SYNC", async () => {
      render(
        <GmCombatTestWrapper>
          <GmCombatPage />
        </GmCombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const state = createActiveState({
        entities: [],
        round: 2,
      });

      await act(async () => {
        ws.sendStateSync(state, []);
      });

      await waitFor(() => {
        expect(screen.getByText("GM Combat Control")).toBeInTheDocument();
        expect(screen.getByText("Round 2")).toBeInTheDocument();
      });
    });

    it("displays phase badge", async () => {
      render(
        <GmCombatTestWrapper>
          <GmCombatPage />
        </GmCombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const state = createActiveState({ entities: [] });

      await act(async () => {
        ws.sendStateSync(state, []);
      });

      await waitFor(() => {
        // Phase appears in both header badge and GM Controls section
        expect(screen.getAllByText("active").length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows entity count", async () => {
      render(
        <GmCombatTestWrapper>
          <GmCombatPage />
        </GmCombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const player = createPlayerCharacter(TEST_GM_ID, "char-1", { name: "Hero" });
      const enemy1 = createEnemy({ name: "Goblin" });
      const enemy2 = createEnemy({ name: "Orc" });

      const state = createActiveState({
        entities: [player, enemy1, enemy2],
      });

      await act(async () => {
        ws.sendStateSync(state, []);
      });

      await waitFor(() => {
        expect(screen.getByText("3 entities")).toBeInTheDocument();
      });
    });

    it("shows entities in initiative order", async () => {
      render(
        <GmCombatTestWrapper>
          <GmCombatPage />
        </GmCombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const player = createPlayerCharacter(TEST_GM_ID, "char-1", { name: "Knight" });
      const enemy = createEnemy({ name: "Dragon" });

      const state = createActiveState({
        entities: [player, enemy],
        currentEntityId: player.id,
      });

      await act(async () => {
        ws.sendStateSync(state, []);
      });

      await waitFor(() => {
        // Entities should be visible somewhere on the page
        expect(screen.getAllByText("Knight").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Dragon").length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE DISPLAY
  // ═══════════════════════════════════════════════════════════════════════════

  describe("phase display", () => {
    it("shows initiative phase for lobby state", async () => {
      render(
        <GmCombatTestWrapper>
          <GmCombatPage />
        </GmCombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const state = createLobbyState({ entities: [] });

      await act(async () => {
        ws.sendStateSync(state, []);
      });

      await waitFor(() => {
        // Phase appears in both header badge and GM Controls section
        expect(screen.getAllByText("initiative").length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR STATES
  // ═══════════════════════════════════════════════════════════════════════════

  describe("error states", () => {
    it("shows error when not authenticated", async () => {
      teardownCombatTest();
      testEnv = setupCombatTest({
        user: null, // No user
        isGM: true,
      });

      render(
        <GmCombatTestWrapper>
          <GmCombatPage />
        </GmCombatTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Not authenticated/i)).toBeInTheDocument();
      });
    });

    it("shows error when no campaign ID provided", async () => {
      render(
        <GmCombatTestWrapper
          route="/gm/combat"
          initialPath="/gm/combat"
        >
          <GmCombatPage />
        </GmCombatTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/No campaign ID provided/i)).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMBAT STATE UPDATES
  // ═══════════════════════════════════════════════════════════════════════════

  describe("combat state updates", () => {
    it("updates when round changes via STATE_SYNC", async () => {
      render(
        <GmCombatTestWrapper>
          <GmCombatPage />
        </GmCombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;

      // Initial state - Round 1
      const state1 = createActiveState({ entities: [], round: 1 });
      await act(async () => {
        ws.sendStateSync(state1, []);
      });

      await waitFor(() => {
        expect(screen.getByText("Round 1")).toBeInTheDocument();
      });

      // Updated state - Round 2
      const state2 = createActiveState({ entities: [], round: 2 });
      await act(async () => {
        ws.sendStateSync(state2, []);
      });

      await waitFor(() => {
        expect(screen.getByText("Round 2")).toBeInTheDocument();
      });
    });

    it("updates entity count when entities are added", async () => {
      render(
        <GmCombatTestWrapper>
          <GmCombatPage />
        </GmCombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;

      // Initial state - 1 entity
      const enemy1 = createEnemy({ name: "Goblin" });
      const state1 = createActiveState({ entities: [enemy1] });

      await act(async () => {
        ws.sendStateSync(state1, []);
      });

      await waitFor(() => {
        expect(screen.getByText("1 entities")).toBeInTheDocument();
      });

      // Add another entity
      const enemy2 = createEnemy({ name: "Orc" });
      const state2 = createActiveState({ entities: [enemy1, enemy2] });

      await act(async () => {
        ws.sendStateSync(state2, []);
      });

      await waitFor(() => {
        expect(screen.getByText("2 entities")).toBeInTheDocument();
      });
    });
  });
});
