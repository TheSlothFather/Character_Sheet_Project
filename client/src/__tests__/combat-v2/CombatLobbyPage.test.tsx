/**
 * CombatLobbyPage Unit Tests
 *
 * Tests the combat lobby (initiative phase) interface using mock WebSocket and Supabase.
 */

import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CombatLobbyPage } from "../../modules/combat-v2/pages/CombatLobbyPage";
import {
  CombatTestWrapper,
  setupCombatTest,
  teardownCombatTest,
  createPlayerCharacter,
  createEnemy,
  createLobbyState,
  createActiveState,
} from "../../test-utils/combat-v2";
import type { SetupCombatTestResult } from "../../test-utils/combat-v2";
import type { InitiativeEntry } from "../../api/combatV2Socket";

const TEST_CAMPAIGN_ID = "test-campaign-id";
const TEST_PLAYER_ID = "test-player-id";

describe("CombatLobbyPage", () => {
  let testEnv: SetupCombatTestResult;

  beforeEach(() => {
    testEnv = setupCombatTest({
      user: { id: TEST_PLAYER_ID, email: "player@test.com" },
      controlledCharacterIds: ["char-1"],
      isGM: false,
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
        <CombatTestWrapper
          route="/campaigns/:campaignId/lobby"
          initialPath={`/campaigns/${TEST_CAMPAIGN_ID}/lobby`}
        >
          <CombatLobbyPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Joining combat lobby/i)).toBeInTheDocument();
      });
    });

    it("shows reconnecting state when WebSocket closes", async () => {
      render(
        <CombatTestWrapper
          route="/campaigns/:campaignId/lobby"
          initialPath={`/campaigns/${TEST_CAMPAIGN_ID}/lobby`}
        >
          <CombatLobbyPage />
        </CombatTestWrapper>
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
        expect(screen.getByText("Combat Lobby")).toBeInTheDocument();
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
  // LOBBY UI
  // ═══════════════════════════════════════════════════════════════════════════

  describe("lobby UI", () => {
    it("displays Combat Lobby header after STATE_SYNC", async () => {
      render(
        <CombatTestWrapper
          route="/campaigns/:campaignId/lobby"
          initialPath={`/campaigns/${TEST_CAMPAIGN_ID}/lobby`}
        >
          <CombatLobbyPage />
        </CombatTestWrapper>
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
        expect(screen.getByText("Combat Lobby")).toBeInTheDocument();
        expect(screen.getByText("Waiting for players...")).toBeInTheDocument();
      });
    });

    it("shows initiative rolls section", async () => {
      render(
        <CombatTestWrapper
          route="/campaigns/:campaignId/lobby"
          initialPath={`/campaigns/${TEST_CAMPAIGN_ID}/lobby`}
        >
          <CombatLobbyPage />
        </CombatTestWrapper>
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
        expect(screen.getByText("Initiative Rolls")).toBeInTheDocument();
        expect(screen.getByText("Progress")).toBeInTheDocument();
      });
    });

    it("shows entities waiting for initiative", async () => {
      render(
        <CombatTestWrapper
          route="/campaigns/:campaignId/lobby"
          initialPath={`/campaigns/${TEST_CAMPAIGN_ID}/lobby`}
        >
          <CombatLobbyPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const player = createPlayerCharacter(TEST_PLAYER_ID, "char-1", { name: "Warrior" });
      const enemy = createEnemy({ name: "Goblin" });

      // Lobby state without initiative entries means entities are waiting
      const state = createLobbyState({
        entities: [player, enemy],
      });

      await act(async () => {
        ws.sendStateSync(state, ["char-1"]);
      });

      await waitFor(() => {
        // Entities should appear (may be in multiple places)
        expect(screen.getAllByText("Warrior").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Goblin").length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows entity count summary", async () => {
      render(
        <CombatTestWrapper
          route="/campaigns/:campaignId/lobby"
          initialPath={`/campaigns/${TEST_CAMPAIGN_ID}/lobby`}
        >
          <CombatLobbyPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const player = createPlayerCharacter(TEST_PLAYER_ID, "char-1", { name: "Hero" });
      const enemy = createEnemy({ name: "Monster" });

      const state = createLobbyState({
        entities: [player, enemy],
      });

      await act(async () => {
        ws.sendStateSync(state, ["char-1"]);
      });

      await waitFor(() => {
        expect(screen.getByText(/2 entities in combat/i)).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIATIVE PROGRESS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("initiative progress", () => {
    it("shows progress count", async () => {
      render(
        <CombatTestWrapper
          route="/campaigns/:campaignId/lobby"
          initialPath={`/campaigns/${TEST_CAMPAIGN_ID}/lobby`}
        >
          <CombatLobbyPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const player = createPlayerCharacter(TEST_PLAYER_ID, "char-1", { name: "Hero" });
      const enemy = createEnemy({ name: "Monster" });

      // One entity has rolled
      const initiative: InitiativeEntry[] = [
        { entityId: player.id, roll: 15, tiebreaker: 0.5, delayed: false, readied: false },
      ];

      const state = createLobbyState({
        entities: [player, enemy],
        initiative,
      });

      await act(async () => {
        ws.sendStateSync(state, ["char-1"]);
      });

      await waitFor(() => {
        // Should show 1 / 2 rolled
        expect(screen.getByText(/1 \/ 2 rolled/i)).toBeInTheDocument();
      });
    });

    it("shows entities with their initiative rolls", async () => {
      render(
        <CombatTestWrapper
          route="/campaigns/:campaignId/lobby"
          initialPath={`/campaigns/${TEST_CAMPAIGN_ID}/lobby`}
        >
          <CombatLobbyPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const player = createPlayerCharacter(TEST_PLAYER_ID, "char-1", { name: "Hero" });

      const initiative: InitiativeEntry[] = [
        { entityId: player.id, roll: 18, tiebreaker: 0.5, delayed: false, readied: false },
      ];

      const state = createLobbyState({
        entities: [player],
        initiative,
      });

      await act(async () => {
        ws.sendStateSync(state, ["char-1"]);
      });

      await waitFor(() => {
        // Should show the roll value
        expect(screen.getByText("18")).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GM CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GM controls", () => {
    it("shows GM controls when user is GM", async () => {
      teardownCombatTest();
      testEnv = setupCombatTest({
        user: { id: "test-gm-id", email: "gm@test.com" },
        controlledCharacterIds: [],
        isGM: true,
      });

      render(
        <CombatTestWrapper
          route="/campaigns/:campaignId/lobby"
          initialPath={`/campaigns/${TEST_CAMPAIGN_ID}/lobby?gm=true`}
        >
          <CombatLobbyPage />
        </CombatTestWrapper>
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
        expect(screen.getByText("GM Controls")).toBeInTheDocument();
      });
    });

    it("shows waiting message when not all entities have rolled", async () => {
      teardownCombatTest();
      testEnv = setupCombatTest({
        user: { id: "test-gm-id", email: "gm@test.com" },
        controlledCharacterIds: [],
        isGM: true,
      });

      render(
        <CombatTestWrapper
          route="/campaigns/:campaignId/lobby"
          initialPath={`/campaigns/${TEST_CAMPAIGN_ID}/lobby?gm=true`}
        >
          <CombatLobbyPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const enemy = createEnemy({ name: "Goblin" });

      // Entity without initiative
      const state = createLobbyState({
        entities: [enemy],
        initiative: [],
      });

      await act(async () => {
        ws.sendStateSync(state, []);
      });

      await waitFor(() => {
        expect(screen.getByText(/Waiting for all initiative rolls/i)).toBeInTheDocument();
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
        user: null,
      });

      render(
        <CombatTestWrapper
          route="/campaigns/:campaignId/lobby"
          initialPath={`/campaigns/${TEST_CAMPAIGN_ID}/lobby`}
        >
          <CombatLobbyPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Not authenticated/i)).toBeInTheDocument();
      });
    });

    it("shows error when no campaign ID provided", async () => {
      render(
        <CombatTestWrapper
          route="/lobby"
          initialPath="/lobby"
        >
          <CombatLobbyPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/No campaign ID provided/i)).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMBAT START REDIRECT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("combat start redirect", () => {
    it("shows 'Combat has started' when phase becomes active", async () => {
      render(
        <CombatTestWrapper
          route="/campaigns/:campaignId/lobby"
          initialPath={`/campaigns/${TEST_CAMPAIGN_ID}/lobby`}
        >
          <CombatLobbyPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;

      // Send active state instead of lobby state
      const state = createActiveState({ entities: [] });

      await act(async () => {
        ws.sendStateSync(state, []);
      });

      await waitFor(() => {
        expect(screen.getByText("Combat has started!")).toBeInTheDocument();
        expect(screen.getByText("Join Combat")).toBeInTheDocument();
      });
    });
  });
});
