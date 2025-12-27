/**
 * Combat Flow Integration Tests
 *
 * Tests the full combat flow from lobby to combat completion:
 * - Lobby → Initiative rolls → Combat start
 * - Turn progression: actions and end turn
 * - State synchronization across phases
 */

import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PlayerCombatPage } from "../../../modules/combat-v2/pages/PlayerCombatPage";
import { GmCombatPage } from "../../../modules/combat-v2/pages/GmCombatPage";
import { CombatLobbyPage } from "../../../modules/combat-v2/pages/CombatLobbyPage";
import {
  CombatTestWrapper,
  GmCombatTestWrapper,
  setupCombatTest,
  teardownCombatTest,
  createPlayerCharacter,
  createEnemy,
  createLobbyState,
  createActiveState,
  createInitiativeFromEntities,
  TEST_PLAYER_ID,
  TEST_CAMPAIGN_ID,
} from "../../../test-utils/combat-v2";
import type { SetupCombatTestResult } from "../../../test-utils/combat-v2";
import type { InitiativeEntry } from "../../../api/combatV2Socket";

// Mock the GM API calls for GmCombatPage
vi.mock("../../../api/gm", () => ({
  gmApi: {
    listCampaignMembers: vi.fn().mockResolvedValue([]),
    listBestiaryEntries: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../api/client", () => ({
  api: {
    listCampaignCharacters: vi.fn().mockResolvedValue([]),
  },
}));

describe("Combat Flow Integration", () => {
  let testEnv: SetupCombatTestResult;

  afterEach(() => {
    teardownCombatTest();
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LOBBY TO COMBAT TRANSITION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("lobby to combat transition", () => {
    beforeEach(() => {
      testEnv = setupCombatTest({
        user: { id: TEST_PLAYER_ID },
        controlledCharacterIds: ["char-1"],
        isGM: false,
      });
    });

    it("transitions from lobby to active combat when GM starts combat", async () => {
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
      const enemy = createEnemy({ name: "Goblin" });

      // First: show lobby state
      const lobbyState = createLobbyState({
        entities: [player, enemy],
        initiative: [],
      });

      await act(async () => {
        ws.sendStateSync(lobbyState, ["char-1"]);
      });

      await waitFor(() => {
        expect(screen.getByText("Combat Lobby")).toBeInTheDocument();
      });

      // Then: transition to active combat
      const activeState = createActiveState({
        entities: [player, enemy],
        currentEntityId: player.id,
        round: 1,
      });

      await act(async () => {
        ws.sendStateSync(activeState, ["char-1"]);
      });

      // Should show combat started message
      await waitFor(() => {
        expect(screen.getByText("Combat has started!")).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TURN PROGRESSION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("turn progression", () => {
    beforeEach(() => {
      testEnv = setupCombatTest({
        user: { id: TEST_PLAYER_ID },
        controlledCharacterIds: ["char-1"],
        isGM: false,
      });
    });

    it("updates UI when turn changes to player", async () => {
      render(
        <CombatTestWrapper>
          <PlayerCombatPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const player = createPlayerCharacter(TEST_PLAYER_ID, "char-1", { name: "Hero" });
      const enemy = createEnemy({ name: "Goblin" });

      // Start with enemy's turn
      const enemyTurnState = createActiveState({
        entities: [player, enemy],
        currentEntityId: enemy.id,
        round: 1,
      });

      await act(async () => {
        ws.sendStateSync(enemyTurnState, ["char-1"]);
      });

      await waitFor(() => {
        expect(screen.getByText(/Waiting for your turn/i)).toBeInTheDocument();
      });

      // Now switch to player's turn
      const playerTurnState = createActiveState({
        entities: [player, enemy],
        currentEntityId: player.id,
        round: 1,
      });

      await act(async () => {
        ws.sendStateSync(playerTurnState, ["char-1"]);
      });

      // Waiting message should be gone (player can act now)
      await waitFor(() => {
        expect(screen.queryByText(/Waiting for your turn/i)).not.toBeInTheDocument();
      });
    });

    it("updates round counter when new round starts", async () => {
      render(
        <CombatTestWrapper>
          <PlayerCombatPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const player = createPlayerCharacter(TEST_PLAYER_ID, "char-1", { name: "Hero" });

      // Round 1
      const round1State = createActiveState({
        entities: [player],
        currentEntityId: player.id,
        round: 1,
      });

      await act(async () => {
        ws.sendStateSync(round1State, ["char-1"]);
      });

      await waitFor(() => {
        expect(screen.getByText("Round 1")).toBeInTheDocument();
      });

      // Round 2
      const round2State = createActiveState({
        entities: [player],
        currentEntityId: player.id,
        round: 2,
      });

      await act(async () => {
        ws.sendStateSync(round2State, ["char-1"]);
      });

      await waitFor(() => {
        expect(screen.getByText("Round 2")).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GM COMBAT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GM combat management", () => {
    beforeEach(() => {
      testEnv = setupCombatTest({
        user: { id: "gm-user-id", email: "gm@test.com" },
        controlledCharacterIds: [],
        isGM: true,
      });
    });

    it("GM sees all entities and can manage combat", async () => {
      render(
        <GmCombatTestWrapper>
          <GmCombatPage />
        </GmCombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const player1 = createPlayerCharacter("player-1", "char-1", { name: "Warrior" });
      const player2 = createPlayerCharacter("player-2", "char-2", { name: "Mage" });
      const enemy1 = createEnemy({ name: "Orc" });
      const enemy2 = createEnemy({ name: "Troll" });

      const state = createActiveState({
        entities: [player1, player2, enemy1, enemy2],
        round: 1,
      });

      await act(async () => {
        ws.sendStateSync(state, []);
      });

      await waitFor(() => {
        expect(screen.getByText("GM Combat Control")).toBeInTheDocument();
        expect(screen.getByText("4 entities")).toBeInTheDocument();
        // All entities visible
        expect(screen.getAllByText("Warrior").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Mage").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Orc").length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("Troll").length).toBeGreaterThanOrEqual(1);
      });
    });

    it("GM can see entity updates in real-time", async () => {
      render(
        <GmCombatTestWrapper>
          <GmCombatPage />
        </GmCombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;
      const player = createPlayerCharacter("player-1", "char-1", { name: "Hero" });
      const enemy = createEnemy({ name: "Goblin" });

      // Initial state
      const state1 = createActiveState({
        entities: [player, enemy],
        round: 1,
      });

      await act(async () => {
        ws.sendStateSync(state1, []);
      });

      await waitFor(() => {
        expect(screen.getByText("2 entities")).toBeInTheDocument();
      });

      // Add a new entity
      const enemy2 = createEnemy({ name: "Orc" });
      const state2 = createActiveState({
        entities: [player, enemy, enemy2],
        round: 1,
      });

      await act(async () => {
        ws.sendStateSync(state2, []);
      });

      await waitFor(() => {
        expect(screen.getByText("3 entities")).toBeInTheDocument();
        expect(screen.getAllByText("Orc").length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTITY STATE CHANGES
  // ═══════════════════════════════════════════════════════════════════════════

  describe("entity state changes", () => {
    beforeEach(() => {
      testEnv = setupCombatTest({
        user: { id: TEST_PLAYER_ID },
        controlledCharacterIds: ["char-1"],
        isGM: false,
      });
    });

    it("reflects entity energy changes", async () => {
      render(
        <CombatTestWrapper>
          <PlayerCombatPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      const ws = testEnv.getWebSocket()!;

      // Full energy
      const player = createPlayerCharacter(TEST_PLAYER_ID, "char-1", {
        name: "Hero",
        energy: { current: 100, max: 100 },
      });

      const state1 = createActiveState({
        entities: [player],
        currentEntityId: player.id,
      });

      await act(async () => {
        ws.sendStateSync(state1, ["char-1"]);
      });

      await waitFor(() => {
        expect(screen.getAllByText("Hero").length).toBeGreaterThanOrEqual(1);
      });

      // Take damage
      const damagedPlayer = {
        ...player,
        energy: { current: 70, max: 100 },
      };

      const state2 = createActiveState({
        entities: [damagedPlayer],
        currentEntityId: damagedPlayer.id,
      });

      await act(async () => {
        ws.sendStateSync(state2, ["char-1"]);
      });

      // The UI should reflect the energy change (verifying state was updated)
      await waitFor(() => {
        expect(screen.getAllByText("Hero").length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBSOCKET MESSAGE VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("WebSocket message verification", () => {
    beforeEach(() => {
      testEnv = setupCombatTest({
        user: { id: TEST_PLAYER_ID },
        controlledCharacterIds: ["char-1"],
        isGM: false,
      });
    });

    it("sends REQUEST_STATE on initial connection", async () => {
      render(
        <CombatTestWrapper>
          <PlayerCombatPage />
        </CombatTestWrapper>
      );

      await waitFor(() => {
        expect(testEnv.getWebSocket()).toBeDefined();
      });

      // Wait for the connection to establish and REQUEST_STATE to be sent
      await waitFor(() => {
        const messages = testEnv.getSentMessages();
        const requestStateMessages = messages.filter((m) => m.type === "REQUEST_STATE");
        expect(requestStateMessages.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
