/**
 * Player Combat E2E Tests
 *
 * Tests the player combat interface in a real browser environment.
 */

import { test, expect } from "@playwright/test";
import {
  setupMockCombatWebSocket,
  mockSupabaseAuth,
  createPlayerCharacter,
  createEnemy,
  createActiveState,
  createLobbyState,
} from "./fixtures";

const TEST_CAMPAIGN_ID = "test-campaign-id";
const TEST_PLAYER_ID = "test-player-id";

test.describe("Player Combat Page", () => {
  test.beforeEach(async ({ page }) => {
    // Set up auth mock before navigating
    await mockSupabaseAuth(page, {
      userId: TEST_PLAYER_ID,
      email: "player@test.com",
    });
  });

  test("displays connecting state initially", async ({ page }) => {
    // Set up WebSocket mock
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      playerId: TEST_PLAYER_ID,
    });

    // Navigate to combat page
    await page.goto(`/campaigns/${TEST_CAMPAIGN_ID}/combat`);

    // Should show connecting state
    await expect(page.getByText(/Connecting to combat/i)).toBeVisible();

    await mockWs.close();
  });

  test("displays combat UI after receiving state", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      playerId: TEST_PLAYER_ID,
    });

    await page.goto(`/campaigns/${TEST_CAMPAIGN_ID}/combat`);

    // Wait for WebSocket connection, then send state
    await page.waitForTimeout(500); // Give WebSocket time to connect

    const player = createPlayerCharacter(TEST_PLAYER_ID, "char-1", {
      name: "Hero",
    });
    const enemy = createEnemy({ name: "Goblin" });
    const state = createActiveState({
      entities: [player, enemy],
      currentEntityId: player.id,
      round: 1,
    });

    await mockWs.sendStateSync(state, ["char-1"]);

    // Should show combat header
    await expect(page.getByText("Combat")).toBeVisible();
    await expect(page.getByText("Round 1")).toBeVisible();

    // Should show entities
    await expect(page.getByText("Hero")).toBeVisible();
    await expect(page.getByText("Goblin")).toBeVisible();

    await mockWs.close();
  });

  test("displays initiative order", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      playerId: TEST_PLAYER_ID,
    });

    await page.goto(`/campaigns/${TEST_CAMPAIGN_ID}/combat`);
    await page.waitForTimeout(500);

    const player = createPlayerCharacter(TEST_PLAYER_ID, "char-1", {
      name: "Warrior",
    });
    const enemy1 = createEnemy({ name: "Orc" });
    const enemy2 = createEnemy({ name: "Troll" });

    const state = createActiveState({
      entities: [player, enemy1, enemy2],
      currentEntityId: player.id,
    });

    await mockWs.sendStateSync(state, ["char-1"]);

    // Should show initiative order section
    await expect(page.getByText("Initiative Order")).toBeVisible();
    await expect(page.getByText("Warrior")).toBeVisible();
    await expect(page.getByText("Orc")).toBeVisible();
    await expect(page.getByText("Troll")).toBeVisible();

    await mockWs.close();
  });

  test("shows waiting message when not player's turn", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      playerId: TEST_PLAYER_ID,
    });

    await page.goto(`/campaigns/${TEST_CAMPAIGN_ID}/combat`);
    await page.waitForTimeout(500);

    const player = createPlayerCharacter(TEST_PLAYER_ID, "char-1", {
      name: "Hero",
    });
    const enemy = createEnemy({ name: "Goblin" });

    // Enemy's turn
    const state = createActiveState({
      entities: [player, enemy],
      currentEntityId: enemy.id,
    });

    await mockWs.sendStateSync(state, ["char-1"]);

    // Should show waiting message
    await expect(page.getByText(/Waiting for your turn/i)).toBeVisible();
    await expect(page.getByText(/Current turn: Goblin/i)).toBeVisible();

    await mockWs.close();
  });

  test("shows hex grid", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      playerId: TEST_PLAYER_ID,
    });

    await page.goto(`/campaigns/${TEST_CAMPAIGN_ID}/combat`);
    await page.waitForTimeout(500);

    const player = createPlayerCharacter(TEST_PLAYER_ID, "char-1", {
      name: "Hero",
    });
    const state = createActiveState({
      entities: [player],
      currentEntityId: player.id,
    });

    await mockWs.sendStateSync(state, ["char-1"]);

    // Should have SVG hex grid
    await expect(page.locator("svg")).toBeVisible();

    await mockWs.close();
  });

  test("updates when round changes", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      playerId: TEST_PLAYER_ID,
    });

    await page.goto(`/campaigns/${TEST_CAMPAIGN_ID}/combat`);
    await page.waitForTimeout(500);

    const player = createPlayerCharacter(TEST_PLAYER_ID, "char-1", {
      name: "Hero",
    });

    // Round 1
    const state1 = createActiveState({
      entities: [player],
      currentEntityId: player.id,
      round: 1,
    });
    await mockWs.sendStateSync(state1, ["char-1"]);
    await expect(page.getByText("Round 1")).toBeVisible();

    // Round 2
    const state2 = createActiveState({
      entities: [player],
      currentEntityId: player.id,
      round: 2,
    });
    await mockWs.sendStateSync(state2, ["char-1"]);
    await expect(page.getByText("Round 2")).toBeVisible();

    await mockWs.close();
  });

  test("shows phase badge", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      playerId: TEST_PLAYER_ID,
    });

    await page.goto(`/campaigns/${TEST_CAMPAIGN_ID}/combat`);
    await page.waitForTimeout(500);

    const player = createPlayerCharacter(TEST_PLAYER_ID, "char-1", {
      name: "Hero",
    });

    const state = createActiveState({
      entities: [player],
      currentEntityId: player.id,
    });

    await mockWs.sendStateSync(state, ["char-1"]);

    // Should show active phase badge
    await expect(page.getByText("active")).toBeVisible();

    await mockWs.close();
  });
});
