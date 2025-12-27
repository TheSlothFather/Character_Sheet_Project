/**
 * PlayerCombatPage Unit Tests
 *
 * Tests the player combat interface using mock WebSocket and Supabase.
 */

import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PlayerCombatPage } from "../../modules/combat-v2/pages/PlayerCombatPage";
import {
  CombatTestWrapper,
  setupCombatTest,
  teardownCombatTest,
  MockWebSocket,
  createPlayerCharacter,
  createEnemy,
  createActiveState,
  createLobbyState,
  TEST_PLAYER_ID,
  TEST_CAMPAIGN_ID,
} from "../../test-utils/combat-v2";
import type { SetupCombatTestResult } from "../../test-utils/combat-v2";

describe("PlayerCombatPage", () => {
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
          route="/campaigns/:campaignId/combat"
          initialPath={`/campaigns/${TEST_CAMPAIGN_ID}/combat`}
        >
          <PlayerCombatPage />
        </CombatTestWrapper>
      );

      // Initially shows connecting (before WebSocket open event fires)
      await waitFor(() => {
        expect(screen.getByText(/Connecting to combat/i)).toBeInTheDocument();
      });
    });

    it("shows reconnecting state when WebSocket closes", async () => {
      render(
        <CombatTestWrapper>
          <PlayerCombatPage />
        </CombatTestWrapper>
      );

      // Wait for WebSocket to be created
      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;

      // Send initial state to get past connecting
      const state = createActiveState({ entities: [] });
      await act(async () => {
        ws.sendStateSync(state, []);
      });

      // Verify connected
      await waitFor(() => {
        expect(screen.getByText("Combat")).toBeInTheDocument();
      });

      // Close the WebSocket - the reconnecting wrapper will try to reconnect
      await act(async () => {
        ws.close();
      });

      // Should show reconnecting (the socket wrapper tries to reconnect automatically)
      await waitFor(() => {
        expect(screen.getByText(/Reconnecting/i)).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMBAT UI
  // ═══════════════════════════════════════════════════════════════════════════

  describe("combat UI", () => {
    it("displays combat header after STATE_SYNC", async () => {
      render(
        <CombatTestWrapper>
          <PlayerCombatPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const playerEntity = createPlayerCharacter(TEST_PLAYER_ID, "char-1", {
        name: "Test Hero",
      });
      const state = createActiveState({
        entities: [playerEntity],
        round: 1,
      });

      await act(async () => {
        ws.sendStateSync(state, ["char-1"]);
      });

      await waitFor(() => {
        expect(screen.getByText("Combat")).toBeInTheDocument();
        expect(screen.getByText("Round 1")).toBeInTheDocument();
      });
    });

    it("displays player entities in My Entities section", async () => {
      render(
        <CombatTestWrapper>
          <PlayerCombatPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const playerEntity = createPlayerCharacter(TEST_PLAYER_ID, "char-1", {
        name: "Test Hero",
      });
      const state = createActiveState({
        entities: [playerEntity],
        currentEntityId: playerEntity.id,
      });

      await act(async () => {
        ws.sendStateSync(state, ["char-1"]);
      });

      await waitFor(() => {
        expect(screen.getByText("My Entities")).toBeInTheDocument();
        // Entity appears in both Initiative Order and My Entities sections
        expect(screen.getAllByText("Test Hero").length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows initiative order", async () => {
      render(
        <CombatTestWrapper>
          <PlayerCombatPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const playerEntity = createPlayerCharacter(TEST_PLAYER_ID, "char-1", {
        name: "Hero",
      });
      const enemyEntity = createEnemy({ name: "Goblin" });

      const state = createActiveState({
        entities: [playerEntity, enemyEntity],
        currentEntityId: playerEntity.id,
      });

      await act(async () => {
        ws.sendStateSync(state, ["char-1"]);
      });

      await waitFor(() => {
        expect(screen.getByText("Initiative Order")).toBeInTheDocument();
        // Entities appear in multiple places (initiative and possibly My Entities)
        expect(screen.getAllByText("Hero").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Goblin").length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TURN MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("turn management", () => {
    it("shows waiting message when not player's turn", async () => {
      render(
        <CombatTestWrapper>
          <PlayerCombatPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const playerEntity = createPlayerCharacter(TEST_PLAYER_ID, "char-1", {
        name: "Hero",
      });
      const enemyEntity = createEnemy({ name: "Goblin" });

      const state = createActiveState({
        entities: [playerEntity, enemyEntity],
        currentEntityId: enemyEntity.id, // Enemy's turn
      });

      await act(async () => {
        ws.sendStateSync(state, ["char-1"]);
      });

      await waitFor(() => {
        expect(screen.getByText(/Waiting for your turn/i)).toBeInTheDocument();
        expect(screen.getByText(/Current turn: Goblin/i)).toBeInTheDocument();
      });
    });

    it("shows 'no entities' message when player has no controlled entities", async () => {
      // Set up without any controlled characters
      teardownCombatTest();
      testEnv = setupCombatTest({
        user: { id: TEST_PLAYER_ID },
        controlledCharacterIds: [], // No characters
        isGM: false,
      });

      render(
        <CombatTestWrapper>
          <PlayerCombatPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const enemyEntity = createEnemy({ name: "Goblin" });

      const state = createActiveState({
        entities: [enemyEntity],
        currentEntityId: enemyEntity.id,
      });

      await act(async () => {
        ws.sendStateSync(state, []);
      });

      await waitFor(() => {
        expect(screen.getByText(/No entities under your control/i)).toBeInTheDocument();
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
      });

      render(
        <CombatTestWrapper>
          <PlayerCombatPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Not authenticated/i)).toBeInTheDocument();
      });
    });

    it("shows error when no campaign ID provided", async () => {
      render(
        <CombatTestWrapper
          route="/combat" // No :campaignId param
          initialPath="/combat"
        >
          <PlayerCombatPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/No campaign ID provided/i)).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE DISPLAY
  // ═══════════════════════════════════════════════════════════════════════════

  describe("phase display", () => {
    it("shows active phase badge", async () => {
      render(
        <CombatTestWrapper>
          <PlayerCombatPage />
        </CombatTestWrapper>
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
        expect(screen.getByText("active")).toBeInTheDocument();
      });
    });

    it("shows initiative phase badge for lobby", async () => {
      render(
        <CombatTestWrapper>
          <PlayerCombatPage />
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
        expect(screen.getByText("initiative")).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBSOCKET MESSAGE ASSERTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("WebSocket messages", () => {
    it("receives STATE_SYNC and renders entities correctly", async () => {
      render(
        <CombatTestWrapper>
          <PlayerCombatPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;

      // Create a rich combat scenario
      const player1 = createPlayerCharacter(TEST_PLAYER_ID, "char-1", {
        name: "Warrior",
        energy: { current: 80, max: 100 },
      });
      const player2 = createPlayerCharacter("other-player", "char-2", {
        name: "Mage",
        energy: { current: 100, max: 100 },
      });
      const enemy1 = createEnemy({ name: "Orc" });
      const enemy2 = createEnemy({ name: "Troll" });

      const state = createActiveState({
        entities: [player1, player2, enemy1, enemy2],
        round: 3,
        currentEntityId: player1.id,
      });

      await act(async () => {
        ws.sendStateSync(state, ["char-1"]);
      });

      await waitFor(() => {
        // Entities appear in multiple places (initiative and My Entities)
        expect(screen.getAllByText("Warrior").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Mage").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Orc").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Troll").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Round 3")).toBeInTheDocument();
      });
    });
  });
});
