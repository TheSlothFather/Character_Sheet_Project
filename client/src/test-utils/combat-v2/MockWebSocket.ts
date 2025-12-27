/**
 * Mock WebSocket for Combat V2 Testing
 *
 * Simulates WebSocket connections to the CombatDurableObject.
 * Allows tests to control server messages and verify client messages.
 */

import type { ServerEventType, ClientMessageType, CombatV2State } from "../../api/combatV2Socket";

export class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readyState: number = WebSocket.CONNECTING;
  url: string;

  private listeners = new Map<string, Set<Function>>();
  public sentMessages: Array<{ type: ClientMessageType; payload: unknown; requestId?: string }> = [];

  constructor(url: string | URL) {
    this.url = url.toString();
    MockWebSocket.instances.push(this);

    // Auto-trigger open after microtask (simulates connection)
    queueMicrotask(() => {
      this.readyState = WebSocket.OPEN;
      this.triggerOpen();
    });
  }

  addEventListener(type: string, handler: Function): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: Function): void {
    this.listeners.get(type)?.delete(handler);
  }

  send(data: string): void {
    if (this.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    try {
      const parsed = JSON.parse(data);
      this.sentMessages.push({
        type: parsed.type,
        payload: parsed.payload,
        requestId: parsed.requestId,
      });
    } catch {
      // Store raw message if not JSON
      this.sentMessages.push({ type: data as ClientMessageType, payload: {} });
    }
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    this.triggerClose();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST HELPERS - Simulate server events
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Trigger the WebSocket open event
   */
  triggerOpen(): void {
    this.listeners.get("open")?.forEach((fn) => fn(new Event("open")));
  }

  /**
   * Trigger the WebSocket close event
   */
  triggerClose(): void {
    this.listeners.get("close")?.forEach((fn) => fn(new CloseEvent("close")));
  }

  /**
   * Trigger the WebSocket error event
   */
  triggerError(error?: string): void {
    const event = new Event("error");
    if (error) {
      (event as any).message = error;
    }
    this.listeners.get("error")?.forEach((fn) => fn(event));
  }

  /**
   * Simulate receiving a server message
   */
  triggerMessage<T extends ServerEventType>(type: T, payload: unknown): void {
    const event = new MessageEvent("message", {
      data: JSON.stringify({
        type,
        payload,
        timestamp: new Date().toISOString(),
      }),
    });
    this.listeners.get("message")?.forEach((fn) => fn(event));
  }

  /**
   * Convenience method to send STATE_SYNC event with combat state
   */
  sendStateSync(state: CombatV2State, controlledEntities: string[] = []): void {
    this.triggerMessage("STATE_SYNC", {
      state,
      yourControlledEntities: controlledEntities,
    });
  }

  /**
   * Simulate combat starting
   */
  sendCombatStarted(combatId: string, campaignId: string): void {
    this.triggerMessage("COMBAT_STARTED", {
      combatId,
      campaignId,
      phase: "active",
    });
  }

  /**
   * Simulate combat ending
   */
  sendCombatEnded(reason: string = "Combat completed"): void {
    this.triggerMessage("COMBAT_ENDED", { reason });
  }

  /**
   * Simulate turn starting for an entity
   */
  sendTurnStarted(entityId: string, round: number, turnIndex: number): void {
    this.triggerMessage("TURN_STARTED", { entityId, round, turnIndex });
  }

  /**
   * Simulate turn ending for an entity
   */
  sendTurnEnded(entityId: string, energyGained: number = 0): void {
    this.triggerMessage("TURN_ENDED", { entityId, energyGained });
  }

  /**
   * Simulate action rejection
   */
  sendActionRejected(reason: string): void {
    this.triggerMessage("ACTION_REJECTED", { reason });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATIC HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the most recently created MockWebSocket instance
   */
  static getLatest(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  /**
   * Get all MockWebSocket instances
   */
  static getAll(): MockWebSocket[] {
    return [...MockWebSocket.instances];
  }

  /**
   * Reset all MockWebSocket instances
   */
  static reset(): void {
    MockWebSocket.instances = [];
  }

  /**
   * Get sent messages from all instances
   */
  static getAllSentMessages(): Array<{ type: ClientMessageType; payload: unknown }> {
    return MockWebSocket.instances.flatMap((ws) => ws.sentMessages);
  }

  /**
   * Find messages of a specific type from all instances
   */
  static findMessagesByType<T extends ClientMessageType>(
    type: T
  ): Array<{ type: T; payload: unknown }> {
    return MockWebSocket.getAllSentMessages().filter((m) => m.type === type) as Array<{
      type: T;
      payload: unknown;
    }>;
  }
}

// Store the original WebSocket for restoration
let originalWebSocket: typeof WebSocket | undefined;

/**
 * Install MockWebSocket as the global WebSocket constructor.
 * Call this in beforeEach.
 */
export function installMockWebSocket(): void {
  if (typeof globalThis.WebSocket !== "undefined") {
    originalWebSocket = globalThis.WebSocket;
  }
  (globalThis as any).WebSocket = MockWebSocket;
}

/**
 * Uninstall MockWebSocket and restore the original WebSocket.
 * Call this in afterEach.
 */
export function uninstallMockWebSocket(): void {
  if (originalWebSocket) {
    globalThis.WebSocket = originalWebSocket;
    originalWebSocket = undefined;
  } else {
    delete (globalThis as any).WebSocket;
  }
}
