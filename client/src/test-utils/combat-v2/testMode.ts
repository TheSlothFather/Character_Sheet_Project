/**
 * Test Mode Utilities
 *
 * Provides helpers for detecting and controlling test mode.
 * When VITE_TEST_MODE=true, authentication can be bypassed for testing.
 */

/**
 * Check if the app is running in test mode.
 * Test mode is enabled when:
 * - VITE_TEST_MODE environment variable is set to "true"
 * - Or __COMBAT_TEST_MODE__ global is set (for vitest)
 */
export function isTestMode(): boolean {
  // Check global flag first (for programmatic control and dev mode bootstrap)
  if ((globalThis as any).__COMBAT_TEST_MODE__ === true) {
    return true;
  }

  // Check window flag (for browser context)
  if (typeof window !== "undefined" && (window as any).__COMBAT_TEST_MODE__ === true) {
    return true;
  }

  // Check vitest environment
  if (typeof (import.meta as any).env?.MODE === "string" && (import.meta as any).env.MODE === "test") {
    return true;
  }

  // Check explicit test mode env var (from .env file or CLI)
  if ((import.meta as any).env?.VITE_TEST_MODE === "true") {
    return true;
  }

  return false;
}

/**
 * Enable test mode programmatically.
 * Useful for setting up test environments.
 */
export function enableTestMode(): void {
  (globalThis as any).__COMBAT_TEST_MODE__ = true;
  if (typeof window !== "undefined") {
    (window as any).__COMBAT_TEST_MODE__ = true;
  }
}

/**
 * Disable test mode programmatically.
 * Call in afterEach to clean up test state.
 */
export function disableTestMode(): void {
  delete (globalThis as any).__COMBAT_TEST_MODE__;
  if (typeof window !== "undefined") {
    delete (window as any).__COMBAT_TEST_MODE__;
  }
}

/**
 * Test mode identity configuration.
 * When test mode is active, useCombatIdentity can use these values.
 */
export interface TestModeIdentity {
  playerId: string;
  controlledCharacterIds: string[];
  isGM?: boolean;
}

/**
 * Set the mock identity to use in test mode.
 * Uses window/globalThis for persistence across module imports.
 */
export function setTestModeIdentity(identity: TestModeIdentity): void {
  (globalThis as any).__TEST_MODE_IDENTITY__ = identity;
  if (typeof window !== "undefined") {
    (window as any).__TEST_MODE_IDENTITY__ = identity;
  }
}

/**
 * Get the current test mode identity, if configured.
 */
export function getTestModeIdentity(): TestModeIdentity | null {
  if (typeof window !== "undefined" && (window as any).__TEST_MODE_IDENTITY__) {
    return (window as any).__TEST_MODE_IDENTITY__;
  }
  return (globalThis as any).__TEST_MODE_IDENTITY__ ?? null;
}

/**
 * Clear the test mode identity.
 */
export function clearTestModeIdentity(): void {
  delete (globalThis as any).__TEST_MODE_IDENTITY__;
  if (typeof window !== "undefined") {
    delete (window as any).__TEST_MODE_IDENTITY__;
  }
}
