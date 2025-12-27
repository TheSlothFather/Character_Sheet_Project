/**
 * Combat Test Wrapper for Combat V2 Testing
 *
 * Provides a wrapper component with all necessary providers and mocks
 * for testing combat-v2 pages and components.
 */

import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { installMockWebSocket, uninstallMockWebSocket, MockWebSocket } from "./MockWebSocket";
import {
  installMockSupabase,
  uninstallMockSupabase,
  type MockUser,
  type TableData,
  type MockSupabaseClientForCombat,
} from "./mockSupabaseAuth";
import { enableTestMode, disableTestMode, setTestModeIdentity, clearTestModeIdentity } from "./testMode";
import { TEST_PLAYER_ID, TEST_CAMPAIGN_ID } from "./fixtures/campaignData";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CombatTestWrapperProps {
  children: React.ReactNode;
  /** Route pattern (e.g., "/campaigns/:campaignId/combat") */
  route?: string;
  /** Initial URL path (e.g., "/campaigns/test-id/combat") */
  initialPath?: string;
  /** Mock user for authentication */
  user?: MockUser | null;
  /** Mock table data for Supabase queries */
  tables?: TableData;
}

export interface SetupCombatTestOptions {
  /** Mock user for authentication. Defaults to test player. */
  user?: MockUser | null;
  /** Mock table data for Supabase queries */
  tables?: TableData;
  /** Character IDs controlled by the test user */
  controlledCharacterIds?: string[];
  /** Whether the test user is a GM */
  isGM?: boolean;
}

export interface SetupCombatTestResult {
  /** The mock Supabase client instance */
  supabaseClient: MockSupabaseClientForCombat;
  /** Get the latest MockWebSocket instance */
  getWebSocket: () => MockWebSocket | undefined;
  /** Get all WebSocket instances */
  getAllWebSockets: () => MockWebSocket[];
  /** Get all sent WebSocket messages */
  getSentMessages: () => Array<{ type: string; payload: unknown }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// WRAPPER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wrapper component for testing combat-v2 pages.
 * Provides MemoryRouter with the correct route structure.
 *
 * @example
 * ```tsx
 * render(
 *   <CombatTestWrapper
 *     route="/campaigns/:campaignId/combat"
 *     initialPath="/campaigns/test-id/combat"
 *     user={{ id: "test-player" }}
 *   >
 *     <PlayerCombatPage />
 *   </CombatTestWrapper>
 * );
 * ```
 */
export function CombatTestWrapper({
  children,
  route = "/campaigns/:campaignId/combat",
  initialPath = `/campaigns/${TEST_CAMPAIGN_ID}/combat`,
  user = { id: TEST_PLAYER_ID, email: "test@example.com" },
  tables = {},
}: CombatTestWrapperProps): React.ReactElement {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={route} element={children} />
        {/* Catch-all for any unmatched routes */}
        <Route path="*" element={<div data-testid="route-not-found">Route not found</div>} />
      </Routes>
    </MemoryRouter>
  );
}

/**
 * Wrapper for GM combat pages.
 */
export function GmCombatTestWrapper({
  children,
  route = "/gm/campaigns/:campaignId/combat",
  initialPath = `/gm/campaigns/${TEST_CAMPAIGN_ID}/combat`,
  user = { id: "test-gm-id", email: "gm@example.com" },
  tables = {},
}: CombatTestWrapperProps): React.ReactElement {
  return (
    <CombatTestWrapper route={route} initialPath={initialPath} user={user} tables={tables}>
      {children}
    </CombatTestWrapper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SETUP / TEARDOWN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set up the test environment for combat-v2 tests.
 * Call this in beforeEach.
 *
 * @example
 * ```ts
 * let testEnv: SetupCombatTestResult;
 *
 * beforeEach(() => {
 *   testEnv = setupCombatTest({
 *     user: { id: "test-player-id" },
 *     controlledCharacterIds: ["char-1"],
 *   });
 * });
 *
 * afterEach(() => {
 *   teardownCombatTest();
 * });
 * ```
 */
export function setupCombatTest(options: SetupCombatTestOptions = {}): SetupCombatTestResult {
  const {
    user = { id: TEST_PLAYER_ID, email: "test@example.com" },
    tables = {},
    controlledCharacterIds = [],
    isGM = false,
  } = options;

  // Enable test mode
  enableTestMode();

  // Set test mode identity
  if (user) {
    setTestModeIdentity({
      playerId: user.id,
      controlledCharacterIds,
      isGM,
    });
  }

  // Install mock WebSocket
  installMockWebSocket();

  // Install mock Supabase
  const supabaseClient = installMockSupabase({ user, tables });

  return {
    supabaseClient,
    getWebSocket: () => MockWebSocket.getLatest(),
    getAllWebSockets: () => MockWebSocket.getAll(),
    getSentMessages: () => MockWebSocket.getAllSentMessages(),
  };
}

/**
 * Tear down the test environment for combat-v2 tests.
 * Call this in afterEach.
 */
export function teardownCombatTest(): void {
  // Disable test mode
  disableTestMode();
  clearTestModeIdentity();

  // Uninstall mocks
  uninstallMockWebSocket();
  uninstallMockSupabase();

  // Reset WebSocket instances
  MockWebSocket.reset();
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set up a player combat test scenario.
 */
export function setupPlayerCombatTest(
  controlledCharacterIds: string[] = ["char-1"]
): SetupCombatTestResult {
  return setupCombatTest({
    user: { id: TEST_PLAYER_ID, email: "player@test.com" },
    controlledCharacterIds,
    isGM: false,
  });
}

/**
 * Set up a GM combat test scenario.
 */
export function setupGmCombatTest(): SetupCombatTestResult {
  return setupCombatTest({
    user: { id: "test-gm-id", email: "gm@test.com" },
    controlledCharacterIds: [],
    isGM: true,
  });
}

/**
 * Set up an unauthenticated test scenario.
 */
export function setupUnauthenticatedTest(): SetupCombatTestResult {
  return setupCombatTest({
    user: null,
  });
}
