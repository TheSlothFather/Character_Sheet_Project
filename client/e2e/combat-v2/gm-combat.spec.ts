/**
 * GM Combat E2E Tests
 *
 * Tests the GM combat interface in a real browser environment.
 */

import { test, expect } from "@playwright/test";
import {
  setupMockCombatWebSocket,
  mockSupabaseGmAuth,
  createPlayerCharacter,
  createEnemy,
  createActiveState,
  createLobbyState,
} from "./fixtures";

const TEST_CAMPAIGN_ID = "test-campaign-id";
const TEST_GM_ID = "test-gm-id";

test.describe("GM Combat Page", () => {
  test.beforeEach(async ({ page }) => {
    // Set up GM auth mock before navigating
    await mockSupabaseGmAuth(page, {
      userId: TEST_GM_ID,
      email: "gm@test.com",
    });
  });

  test("displays connecting state initially", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      isGM: true,
    });

    await page.goto(`/gm/campaigns/${TEST_CAMPAIGN_ID}/combat`);

    await expect(page.getByText(/Connecting to combat/i)).toBeVisible();

    await mockWs.close();
  });

  test("displays GM Combat Control header after receiving state", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      isGM: true,
    });

    await page.goto(`/gm/campaigns/${TEST_CAMPAIGN_ID}/combat`);
    await page.waitForTimeout(500);

    const player = createPlayerCharacter("player-1", "char-1", { name: "Warrior" });
    const enemy = createEnemy({ name: "Goblin" });

    const state = createActiveState({
      entities: [player, enemy],
      round: 1,
    });

    await mockWs.sendStateSync(state, []);

    // Should show GM header
    await expect(page.getByText("GM Combat Control")).toBeVisible();
    await expect(page.getByText("Round 1")).toBeVisible();

    await mockWs.close();
  });

  test("shows entity count", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      isGM: true,
    });

    await page.goto(`/gm/campaigns/${TEST_CAMPAIGN_ID}/combat`);
    await page.waitForTimeout(500);

    const player = createPlayerCharacter("player-1", "char-1", { name: "Hero" });
    const enemy1 = createEnemy({ name: "Orc" });
    const enemy2 = createEnemy({ name: "Troll" });

    const state = createActiveState({
      entities: [player, enemy1, enemy2],
    });

    await mockWs.sendStateSync(state, []);

    await expect(page.getByText("3 entities")).toBeVisible();

    await mockWs.close();
  });

  test("shows all entities regardless of faction", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      isGM: true,
    });

    await page.goto(`/gm/campaigns/${TEST_CAMPAIGN_ID}/combat`);
    await page.waitForTimeout(500);

    const player1 = createPlayerCharacter("player-1", "char-1", { name: "Knight" });
    const player2 = createPlayerCharacter("player-2", "char-2", { name: "Mage" });
    const enemy = createEnemy({ name: "Dragon" });

    const state = createActiveState({
      entities: [player1, player2, enemy],
    });

    await mockWs.sendStateSync(state, []);

    // All entities should be visible
    await expect(page.getByText("Knight")).toBeVisible();
    await expect(page.getByText("Mage")).toBeVisible();
    await expect(page.getByText("Dragon")).toBeVisible();

    await mockWs.close();
  });

  test("shows GM Controls section", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      isGM: true,
    });

    await page.goto(`/gm/campaigns/${TEST_CAMPAIGN_ID}/combat`);
    await page.waitForTimeout(500);

    const state = createActiveState({ entities: [] });
    await mockWs.sendStateSync(state, []);

    await expect(page.getByText("GM Controls")).toBeVisible();

    await mockWs.close();
  });

  test("shows Add Entity button", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      isGM: true,
    });

    await page.goto(`/gm/campaigns/${TEST_CAMPAIGN_ID}/combat`);
    await page.waitForTimeout(500);

    const state = createActiveState({ entities: [] });
    await mockWs.sendStateSync(state, []);

    await expect(page.getByText("+ Add Entity")).toBeVisible();

    await mockWs.close();
  });

  test("shows phase badge", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      isGM: true,
    });

    await page.goto(`/gm/campaigns/${TEST_CAMPAIGN_ID}/combat`);
    await page.waitForTimeout(500);

    const state = createActiveState({ entities: [] });
    await mockWs.sendStateSync(state, []);

    // Phase should be visible (appears in multiple places)
    await expect(page.getByText("active").first()).toBeVisible();

    await mockWs.close();
  });

  test("shows initiative phase for lobby state", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      isGM: true,
    });

    await page.goto(`/gm/campaigns/${TEST_CAMPAIGN_ID}/combat`);
    await page.waitForTimeout(500);

    const state = createLobbyState({ entities: [] });
    await mockWs.sendStateSync(state, []);

    await expect(page.getByText("initiative").first()).toBeVisible();

    await mockWs.close();
  });

  test("updates entity count when entities are added", async ({ page }) => {
    const mockWs = await setupMockCombatWebSocket(page, {
      campaignId: TEST_CAMPAIGN_ID,
      isGM: true,
    });

    await page.goto(`/gm/campaigns/${TEST_CAMPAIGN_ID}/combat`);
    await page.waitForTimeout(500);

    // Initial state with 1 entity
    const enemy1 = createEnemy({ name: "Goblin" });
    const state1 = createActiveState({ entities: [enemy1] });
    await mockWs.sendStateSync(state1, []);

    await expect(page.getByText("1 entities")).toBeVisible();

    // Add another entity
    const enemy2 = createEnemy({ name: "Orc" });
    const state2 = createActiveState({ entities: [enemy1, enemy2] });
    await mockWs.sendStateSync(state2, []);

    await expect(page.getByText("2 entities")).toBeVisible();

    await mockWs.close();
  });
});
