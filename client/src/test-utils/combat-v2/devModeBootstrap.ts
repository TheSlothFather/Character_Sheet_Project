/**
 * Dev Mode Bootstrap for Combat V2
 *
 * Initializes test mode for manual browser testing when VITE_TEST_MODE=true.
 * This allows developers to browse combat pages without real auth or WebSocket.
 */

import { enableTestMode, setTestModeIdentity } from "./testMode";

// ═══════════════════════════════════════════════════════════════════════════
// MOCK WEBSOCKET FOR BROWSER DEV MODE
// ═══════════════════════════════════════════════════════════════════════════

interface MockServerState {
  combatId: string;
  campaignId: string;
  phase: "setup" | "initiative" | "active" | "active-turn" | "completed";
  round: number;
  currentTurnIndex: number;
  currentEntityId: string | null;
  entities: Record<string, any>;
  initiative: any[];
  gridPositions: Record<string, { row: number; col: number }>;
  gridConfig: {
    rows: number;
    cols: number;
    cellSize: number;
    offsetX: number;
    offsetY: number;
    visible: boolean;
    opacity: number;
  };
  mapConfig: {
    imageUrl: string | null;
    imageKey: string | null;
    imageWidth: number | null;
    imageHeight: number | null;
    templateId: string | null;
  };
  version: number;
}

const defaultMockState: MockServerState = {
  combatId: "dev-combat-id",
  campaignId: "dev-campaign-id",
  phase: "active",
  round: 1,
  currentTurnIndex: 0,
  currentEntityId: "hero-1",
  entities: {
    "hero-1": {
      id: "hero-1",
      name: "Test Hero",
      displayName: "Test Hero",
      tier: "hero",
      faction: "ally",
      controller: "player:dev-player-id",
      entityType: "pc",
      characterId: "char-1",
      level: 5,
      ap: { current: 6, max: 6 },
      energy: { current: 85, max: 100 },
      wounds: {},
      alive: true,
      unconscious: false,
      skills: {
        MELEE_ATTACK: 50,
        RANGED_ATTACK: 40,
        ENDURE: 45,
        DODGE: 40,
      },
    },
    "enemy-1": {
      id: "enemy-1",
      name: "Goblin Warrior",
      displayName: "Goblin Warrior",
      tier: "full",
      faction: "enemy",
      controller: "gm",
      entityType: "monster",
      level: 3,
      ap: { current: 4, max: 4 },
      energy: { current: 60, max: 60 },
      wounds: {},
      alive: true,
      unconscious: false,
      skills: {
        MELEE_ATTACK: 35,
        DODGE: 30,
        ENDURE: 32,
      },
    },
    "enemy-2": {
      id: "enemy-2",
      name: "Goblin Archer",
      displayName: "Goblin Archer",
      tier: "minion",
      faction: "enemy",
      controller: "gm",
      entityType: "monster",
      level: 2,
      ap: { current: 3, max: 3 },
      energy: { current: 30, max: 30 },
      wounds: {},
      alive: true,
      unconscious: false,
      skills: {
        RANGED_ATTACK: 40,
        DODGE: 35,
        ENDURE: 25,
      },
    },
  },
  initiative: [
    { entityId: "hero-1", roll: 18, tiebreaker: 0.5, delayed: false, readied: false },
    { entityId: "enemy-1", roll: 14, tiebreaker: 0.3, delayed: false, readied: false },
    { entityId: "enemy-2", roll: 10, tiebreaker: 0.7, delayed: false, readied: false },
  ],
  gridPositions: {
    "hero-1": { row: 5, col: 5 },
    "enemy-1": { row: 8, col: 12 },
    "enemy-2": { row: 3, col: 15 },
  },
  gridConfig: {
    rows: 20,
    cols: 30,
    cellSize: 40,
    offsetX: 0,
    offsetY: 0,
    visible: true,
    opacity: 0.5,
  },
  mapConfig: {
    imageUrl: null,
    imageKey: null,
    imageWidth: null,
    imageHeight: null,
    templateId: null,
  },
  version: 1,
};

// Store active mock connections
const activeMockSockets: Set<MockDevWebSocket> = new Set();

// Mutable mock state that can be modified via dev panel
let mockState: MockServerState = { ...defaultMockState };

export function getMockState(): MockServerState {
  return mockState;
}

export function setMockState(newState: Partial<MockServerState>): void {
  mockState = { ...mockState, ...newState, version: mockState.version + 1 };
  // Broadcast state update to all connected mock sockets
  broadcastStateSync();
}

export function resetMockState(): void {
  mockState = JSON.parse(JSON.stringify(defaultMockState));
  broadcastStateSync();
}

function broadcastStateSync(): void {
  activeMockSockets.forEach((socket) => {
    socket.triggerServerMessage("STATE_SYNC", {
      state: mockState,
      yourControlledEntities: socket.isGM ? Object.keys(mockState.entities) : ["hero-1"],
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK WEBSOCKET CLASS
// ═══════════════════════════════════════════════════════════════════════════

class MockDevWebSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockDevWebSocket.CONNECTING;
  url: string;
  isGM: boolean = false;
  playerId: string = "dev-player-id";

  private messageListeners: ((event: MessageEvent) => void)[] = [];
  private openListeners: (() => void)[] = [];
  private closeListeners: ((event: CloseEvent) => void)[] = [];
  private errorListeners: ((event: Event) => void)[] = [];

  constructor(url: string | URL) {
    super();
    this.url = typeof url === "string" ? url : url.toString();

    // Parse URL params
    const urlObj = new URL(this.url, window.location.origin);
    this.isGM = urlObj.searchParams.get("isGM") === "true";
    this.playerId = urlObj.searchParams.get("playerId") || "dev-player-id";

    // Register this socket
    activeMockSockets.add(this);

    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockDevWebSocket.OPEN;
      this.openListeners.forEach((listener) => listener());
      this.dispatchEvent(new Event("open"));

      // Send initial state after connection
      setTimeout(() => {
        this.triggerServerMessage("STATE_SYNC", {
          state: mockState,
          yourControlledEntities: this.isGM ? Object.keys(mockState.entities) : ["hero-1"],
        });
      }, 100);
    }, 50);
  }

  addEventListener(type: string, listener: any): void {
    if (type === "message") {
      this.messageListeners.push(listener);
    } else if (type === "open") {
      this.openListeners.push(listener);
    } else if (type === "close") {
      this.closeListeners.push(listener);
    } else if (type === "error") {
      this.errorListeners.push(listener);
    }
  }

  removeEventListener(type: string, listener: any): void {
    if (type === "message") {
      this.messageListeners = this.messageListeners.filter((l) => l !== listener);
    } else if (type === "open") {
      this.openListeners = this.openListeners.filter((l) => l !== listener);
    } else if (type === "close") {
      this.closeListeners = this.closeListeners.filter((l) => l !== listener);
    } else if (type === "error") {
      this.errorListeners = this.errorListeners.filter((l) => l !== listener);
    }
  }

  send(data: string | ArrayBuffer): void {
    if (this.readyState !== MockDevWebSocket.OPEN) {
      console.warn("[MockDevWebSocket] Cannot send, socket not open");
      return;
    }

    // Parse and log the message
    try {
      const parsed = JSON.parse(data as string);
      console.log("[MockDevWebSocket] Client sent:", parsed.type, parsed.payload);

      // Handle common messages with mock responses
      this.handleClientMessage(parsed);
    } catch (e) {
      console.warn("[MockDevWebSocket] Failed to parse message:", data);
    }
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockDevWebSocket.CLOSING;
    activeMockSockets.delete(this);

    setTimeout(() => {
      this.readyState = MockDevWebSocket.CLOSED;
      const closeEvent = new CloseEvent("close", {
        code: code || 1000,
        reason: reason || "Normal closure",
        wasClean: true,
      });
      this.closeListeners.forEach((listener) => listener(closeEvent));
      this.dispatchEvent(closeEvent);
    }, 10);
  }

  // Trigger a server message (for dev panel controls)
  triggerServerMessage(type: string, payload: any): void {
    const messageData = JSON.stringify({
      type,
      payload,
      timestamp: new Date().toISOString(),
    });

    const event = new MessageEvent("message", { data: messageData });
    this.messageListeners.forEach((listener) => listener(event));
    this.dispatchEvent(event);
  }

  private handleClientMessage(message: { type: string; payload?: any }): void {
    switch (message.type) {
      case "REQUEST_STATE":
        this.triggerServerMessage("STATE_SYNC", {
          state: mockState,
          yourControlledEntities: this.isGM ? Object.keys(mockState.entities) : ["hero-1"],
        });
        break;

      case "START_COMBAT":
        mockState.phase = "active";
        mockState.round = 1;
        mockState.currentTurnIndex = 0;
        mockState.currentEntityId = mockState.initiative[0]?.entityId || null;
        broadcastStateSync();
        this.triggerServerMessage("COMBAT_STARTED", {
          combatId: mockState.combatId,
          phase: mockState.phase,
        });
        break;

      case "END_TURN":
        const nextIndex = (mockState.currentTurnIndex + 1) % mockState.initiative.length;
        const isNewRound = nextIndex === 0;
        if (isNewRound) {
          mockState.round++;
        }
        mockState.currentTurnIndex = nextIndex;
        mockState.currentEntityId = mockState.initiative[nextIndex]?.entityId || null;
        mockState.version++;
        broadcastStateSync();
        this.triggerServerMessage("TURN_STARTED", {
          entityId: mockState.currentEntityId,
          round: mockState.round,
          turnIndex: mockState.currentTurnIndex,
        });
        break;

      case "DECLARE_MOVEMENT":
        if (message.payload?.entityId && message.payload?.targetRow !== undefined) {
          const entityId = message.payload.entityId;
          const oldPos = mockState.gridPositions[entityId] || { row: 0, col: 0 };
          mockState.gridPositions[entityId] = {
            row: message.payload.targetRow,
            col: message.payload.targetCol,
          };
          // Deduct AP
          if (mockState.entities[entityId]?.ap) {
            mockState.entities[entityId].ap.current = Math.max(
              0,
              mockState.entities[entityId].ap.current - 1
            );
          }
          mockState.version++;
          broadcastStateSync();
          this.triggerServerMessage("MOVEMENT_EXECUTED", {
            entityId,
            from: oldPos,
            to: mockState.gridPositions[entityId],
            distance: 1,
            apCost: 1,
            remainingAP: mockState.entities[entityId]?.ap?.current || 0,
          });
        }
        break;

      case "GM_ADD_ENTITY":
        if (message.payload?.entity) {
          const entity = {
            id: message.payload.entity.id || `entity-${Date.now()}`,
            name: message.payload.entity.name || "New Entity",
            displayName: message.payload.entity.displayName || message.payload.entity.name || "New Entity",
            tier: message.payload.entity.tier || "full",
            faction: message.payload.entity.faction || "enemy",
            controller: message.payload.entity.controller || "gm",
            entityType: message.payload.entity.entityType || "monster",
            level: message.payload.entity.level || 1,
            ap: message.payload.entity.ap || { current: 4, max: 4 },
            energy: message.payload.entity.energy || { current: 50, max: 50 },
            wounds: {},
            alive: true,
            unconscious: false,
          };
          mockState.entities[entity.id] = entity;
          mockState.gridPositions[entity.id] = { row: 5, col: 10 };
          mockState.initiative.push({
            entityId: entity.id,
            roll: message.payload.initiativeRoll || 10,
            tiebreaker: message.payload.initiativeTiebreaker || Math.random(),
            delayed: false,
            readied: false,
          });
          mockState.version++;
          broadcastStateSync();
          this.triggerServerMessage("ENTITY_UPDATED", {
            entityId: entity.id,
            action: "added",
            entity,
            initiative: mockState.initiative,
            gridPosition: mockState.gridPositions[entity.id],
          });
        }
        break;

      case "GM_REMOVE_ENTITY":
        if (message.payload?.entityId) {
          const entityId = message.payload.entityId;
          delete mockState.entities[entityId];
          delete mockState.gridPositions[entityId];
          mockState.initiative = mockState.initiative.filter((i) => i.entityId !== entityId);
          mockState.version++;
          broadcastStateSync();
          this.triggerServerMessage("ENTITY_UPDATED", {
            entityId,
            action: "removed",
            initiative: mockState.initiative,
          });
        }
        break;

      default:
        console.log("[MockDevWebSocket] Unhandled message type:", message.type);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════════

let isBootstrapped = false;
const OriginalWebSocket = typeof window !== "undefined" ? window.WebSocket : null;

export function bootstrapDevMode(): void {
  if (isBootstrapped) return;
  if (typeof window === "undefined") return;

  // Check for VITE_TEST_MODE environment variable
  const viteTestMode = (import.meta as any).env?.VITE_TEST_MODE;
  const isDevTestMode = viteTestMode === "true" || viteTestMode === true;

  if (!isDevTestMode) {
    console.log("[DevMode] VITE_TEST_MODE not set (value:", viteTestMode, "), skipping dev mode bootstrap");
    return;
  }

  console.log("[DevMode] Bootstrapping dev mode for manual testing...");

  // Enable test mode and set identity
  enableTestMode();
  setTestModeIdentity({
    playerId: "dev-player-id",
    controlledCharacterIds: ["hero-1", "char-1"],
    isGM: false, // Default to player mode; GM mode can be accessed via /gm routes
  });

  // Install mock WebSocket for combat connections
  const RealWebSocket = OriginalWebSocket!;
  (window as any).WebSocket = class {
    constructor(url: string | URL) {
      const urlStr = typeof url === "string" ? url : url.toString();

      // Only mock combat WebSocket connections
      if (urlStr.includes("/api/combat/") && urlStr.includes("/connect")) {
        console.log("[DevMode] Intercepting combat WebSocket:", urlStr);
        return new MockDevWebSocket(url) as any;
      } else {
        // Use real WebSocket for non-combat connections
        return new RealWebSocket(url) as any;
      }
    }
  };

  // Make mock state controls available globally for dev panel
  (window as any).__DEV_MOCK_STATE__ = {
    get: getMockState,
    set: setMockState,
    reset: resetMockState,
    broadcast: broadcastStateSync,
  };

  isBootstrapped = true;
  console.log("[DevMode] Dev mode bootstrap complete");
  console.log("[DevMode] Mock state controls available at window.__DEV_MOCK_STATE__");
}

export function isDevModeActive(): boolean {
  return isBootstrapped;
}

// Export the mock state type for dev panel
export type { MockServerState };
