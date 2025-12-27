/**
 * Combat V2 Test Utilities
 *
 * Comprehensive testing infrastructure for combat-v2 pages.
 *
 * @example Basic usage
 * ```tsx
 * import { render, screen, waitFor } from "@testing-library/react";
 * import { describe, it, expect, beforeEach, afterEach } from "vitest";
 * import { PlayerCombatPage } from "../../modules/combat-v2/pages/PlayerCombatPage";
 * import {
 *   CombatTestWrapper,
 *   setupCombatTest,
 *   teardownCombatTest,
 *   createPlayerCharacter,
 *   createEnemy,
 *   createActiveState,
 * } from "../../test-utils/combat-v2";
 *
 * describe("PlayerCombatPage", () => {
 *   let testEnv: ReturnType<typeof setupCombatTest>;
 *
 *   beforeEach(() => {
 *     testEnv = setupCombatTest({
 *       user: { id: "test-player" },
 *       controlledCharacterIds: ["char-1"],
 *     });
 *   });
 *
 *   afterEach(() => {
 *     teardownCombatTest();
 *   });
 *
 *   it("displays combat after state sync", async () => {
 *     render(
 *       <CombatTestWrapper>
 *         <PlayerCombatPage />
 *       </CombatTestWrapper>
 *     );
 *
 *     const ws = testEnv.getWebSocket()!;
 *     const player = createPlayerCharacter("test-player", "char-1");
 *     const enemy = createEnemy({ name: "Goblin" });
 *     const state = createActiveState({ entities: [player, enemy] });
 *
 *     ws.sendStateSync(state, ["char-1"]);
 *
 *     await waitFor(() => {
 *       expect(screen.getByText("Combat")).toBeInTheDocument();
 *     });
 *   });
 * });
 * ```
 */

// Test mode utilities
export { isTestMode, enableTestMode, disableTestMode, setTestModeIdentity, getTestModeIdentity, clearTestModeIdentity } from "./testMode";
export type { TestModeIdentity } from "./testMode";

// Mock WebSocket
export { MockWebSocket, installMockWebSocket, uninstallMockWebSocket } from "./MockWebSocket";

// Mock Supabase
export {
  MockSupabaseClientForCombat,
  installMockSupabase,
  uninstallMockSupabase,
  getMockSupabaseClient,
} from "./mockSupabaseAuth";
export type { MockUser, TableData, MockSupabaseConfig } from "./mockSupabaseAuth";

// Test wrapper components
export {
  CombatTestWrapper,
  GmCombatTestWrapper,
  setupCombatTest,
  teardownCombatTest,
  setupPlayerCombatTest,
  setupGmCombatTest,
  setupUnauthenticatedTest,
} from "./CombatTestWrapper";
export type { CombatTestWrapperProps, SetupCombatTestOptions, SetupCombatTestResult } from "./CombatTestWrapper";

// Factories
export * from "./factories";

// Fixtures
export * from "./fixtures";

// Dev mode for manual browser testing
export {
  bootstrapDevMode,
  isDevModeActive,
  getMockState,
  setMockState,
  resetMockState,
} from "./devModeBootstrap";
export type { MockServerState } from "./devModeBootstrap";
export { DevTestPanel } from "./DevTestPanel";
