/**
 * Combat V2 WebSocket Connection
 *
 * Connects to the CombatDurableObject for real-time combat state management.
 * Uses typed events matching the new combat system.
 */

// ═══════════════════════════════════════════════════════════════════════════
// SERVER EVENT TYPES (from CombatDurableObject)
// ═══════════════════════════════════════════════════════════════════════════

export type ServerEventType =
  | "STATE_SYNC"
  | "COMBAT_STARTED"
  | "COMBAT_ENDED"
  | "ROUND_STARTED"
  | "TURN_STARTED"
  | "TURN_ENDED"
  | "INITIATIVE_UPDATED"
  | "MOVEMENT_EXECUTED"
  | "ATTACK_RESOLVED"
  | "ABILITY_RESOLVED"
  | "REACTION_RESOLVED"
  | "CHANNELING_STARTED"
  | "CHANNELING_CONTINUED"
  | "CHANNELING_RELEASED"
  | "CHANNELING_INTERRUPTED"
  | "DAMAGE_APPLIED"
  | "WOUNDS_INFLICTED"
  | "ENTITY_UPDATED"
  | "ENTITY_UNCONSCIOUS"
  | "ENTITY_DIED"
  | "ENDURE_ROLL_REQUIRED"
  | "DEATH_CHECK_REQUIRED"
  | "ACTION_REJECTED"
  | "ERROR";

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT MESSAGE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ClientMessageType =
  | "START_COMBAT"
  | "END_COMBAT"
  | "SUBMIT_INITIATIVE_ROLL"
  | "END_TURN"
  | "DELAY_TURN"
  | "READY_ACTION"
  | "DECLARE_MOVEMENT"
  | "DECLARE_ATTACK"
  | "DECLARE_ABILITY"
  | "DECLARE_REACTION"
  | "START_CHANNELING"
  | "CONTINUE_CHANNELING"
  | "RELEASE_SPELL"
  | "ABORT_CHANNELING"
  | "SUBMIT_ENDURE_ROLL"
  | "SUBMIT_DEATH_CHECK"
  | "GM_OVERRIDE"
  | "GM_MOVE_ENTITY"
  | "GM_APPLY_DAMAGE"
  | "GM_MODIFY_RESOURCES"
  | "GM_ADD_ENTITY"
  | "GM_REMOVE_ENTITY"
  | "REQUEST_STATE";

// ═══════════════════════════════════════════════════════════════════════════
// DAMAGE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type DamageType =
  | "blunt"
  | "burn"
  | "freeze"
  | "laceration"
  | "mental"
  | "necrosis"
  | "holy_spiritual"
  | "unholy_spiritual";

// ═══════════════════════════════════════════════════════════════════════════
// EVENT PAYLOADS
// ═══════════════════════════════════════════════════════════════════════════

export interface CombatV2Entity {
  id: string;
  name: string;
  displayName?: string;
  tier: "minion" | "full" | "lieutenant" | "hero";
  faction: "ally" | "enemy" | "neutral";
  controller: "gm" | `player:${string}`;
  entityType?: "pc" | "npc" | "monster";
  characterId?: string;
  bestiaryEntryId?: string;
  level?: number;
  skills?: Record<string, number>;
  ap?: { current: number; max: number };
  energy?: { current: number; max: number };
  wounds?: Record<string, number>;
  immunities?: string[];
  resistances?: string[];
  weaknesses?: string[];
  unconscious?: boolean;
  alive?: boolean;
  channeling?: {
    spellName: string;
    energyChanneled: number;
    apChanneled: number;
    totalCost: number;
    progress: number;
  };
}

export interface HexPosition {
  q: number;
  r: number;
}

export interface InitiativeEntry {
  entityId: string;
  roll: number;
  tiebreaker: number;
  delayed: boolean;
  readied: boolean;
}

export interface InitiativeUpdatedPayload {
  initiative?: InitiativeEntry[];
  entityId?: string;
  roll?: number;
  skillValue?: number;
  tiebreaker?: number;
  allRolled?: boolean;
}

export interface CombatV2State {
  combatId: string;
  campaignId: string;
  phase: "setup" | "initiative" | "active" | "active-turn" | "completed";
  round: number;
  currentTurnIndex: number;
  currentEntityId: string | null;
  entities: Record<string, CombatV2Entity>;
  initiative: InitiativeEntry[];
  hexPositions: Record<string, HexPosition>;
  version: number;
}

export interface StateSyncPayload {
  state: CombatV2State;
  yourControlledEntities: string[];
}

export interface CombatStartedPayload {
  combatId: string;
  campaignId?: string;
  phase?: CombatV2State["phase"];
}

export interface MovementExecutedPayload {
  entityId: string;
  from: HexPosition;
  to: HexPosition;
  path?: HexPosition[];
  distance: number;
  apCost: number;
  remainingAP: number;
}

export interface AttackResolvedPayload {
  attackerId: string;
  targetId: string;
  weaponCategory: string;
  attackRoll: number;
  baseDamage: number;
  finalDamage: number;
  damageType: string;
  targetEnergy: number;
  targetWounds: Record<string, number>;
}

export interface ChannelingPayload {
  entityId: string;
  spellName: string;
  totalCost?: number;
  energyChanneled?: number;
  apChanneled?: number;
  progress?: number;
  isReady?: boolean;
  turnsChanneled?: number;
  spellDamage?: number;
  damageType?: string;
  intensity?: number;
  targetId?: string;
  voluntary?: boolean;
  energyLost?: number;
  apLost?: number;
  blowbackDamage?: number;
  blowbackType?: string;
}

export interface EndureRollRequiredPayload {
  entityId: string;
  triggeringDamage: number;
}

export interface DeathCheckRequiredPayload {
  entityId: string;
  triggeringDamage: number;
}

export interface EntityUpdatedPayload {
  entityId: string;
  action?: "added" | "removed" | "updated";
  entity?: CombatV2Entity;
  initiative?: InitiativeEntry[];
  hexPosition?: HexPosition;
  endureResult?: "success" | "failure";
  deathCheckResult?: "success" | "failure";
  rollTotal?: number;
  message?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SOCKET HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

export interface CombatV2SocketHandlers {
  // State sync
  onStateSync?: (payload: StateSyncPayload) => void;
  onCombatStarted?: (payload: CombatStartedPayload) => void;
  onCombatEnded?: (payload: { reason: string }) => void;

  // Round/Turn management
  onRoundStarted?: (payload: { round: number }) => void;
  onTurnStarted?: (payload: { entityId: string; round: number; turnIndex: number }) => void;
  onTurnEnded?: (payload: { entityId: string; energyGained: number }) => void;
  onInitiativeUpdated?: (payload: InitiativeUpdatedPayload) => void;

  // Actions
  onMovementExecuted?: (payload: MovementExecutedPayload) => void;
  onAttackResolved?: (payload: AttackResolvedPayload) => void;
  onAbilityResolved?: (payload: { entityId: string; abilityName: string; effects: unknown }) => void;
  onReactionResolved?: (payload: { entityId: string; reactionType: string }) => void;

  // Channeling
  onChannelingStarted?: (payload: ChannelingPayload) => void;
  onChannelingContinued?: (payload: ChannelingPayload) => void;
  onChannelingReleased?: (payload: ChannelingPayload) => void;
  onChannelingInterrupted?: (payload: ChannelingPayload) => void;

  // Damage/Death
  onEntityUpdated?: (payload: EntityUpdatedPayload) => void;
  onEntityUnconscious?: (payload: { entityId: string; message: string }) => void;
  onEntityDied?: (payload: { entityId: string; message: string }) => void;
  onEndureRollRequired?: (payload: EndureRollRequiredPayload) => void;
  onDeathCheckRequired?: (payload: DeathCheckRequiredPayload) => void;

  // Errors
  onActionRejected?: (payload: { reason: string; [key: string]: unknown }) => void;
  onError?: (payload: { message: string }) => void;

  // Connection lifecycle
  onOpen?: () => void;
  onClose?: () => void;
  onConnectionError?: (error: Event) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

const getWorkerBaseUrl = () => {
  const workerUrl = import.meta.env.VITE_WORKER_URL;
  if (workerUrl) {
    return workerUrl;
  }
  return window.location.origin;
};

const buildWebSocketUrl = (path: string) => {
  const baseUrl = getWorkerBaseUrl();
  const base = new URL(path, baseUrl);
  base.search = "";
  base.hash = "";
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  return base;
};

// ═══════════════════════════════════════════════════════════════════════════
// SOCKET CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

export interface CombatV2SocketConnection {
  socket: WebSocket;
  send: <T extends ClientMessageType>(type: T, payload?: Record<string, unknown>) => void;
  close: () => void;
  requestState: () => void;
  isConnected: () => boolean;
}

/**
 * Connect to Combat V2 WebSocket (CombatDurableObject)
 */
export const connectCombatV2Socket = (
  combatId: string,
  handlers: CombatV2SocketHandlers,
  options: {
    playerId: string;
    isGM: boolean;
    controlledEntityIds?: string[];
  }
): CombatV2SocketConnection => {
  const url = buildWebSocketUrl(`/api/combat/${encodeURIComponent(combatId)}/connect`);
  url.searchParams.set("playerId", options.playerId);
  url.searchParams.set("isGM", String(options.isGM));
  if (options.controlledEntityIds?.length) {
    url.searchParams.set("entities", options.controlledEntityIds.join(","));
  }

  const socket = new WebSocket(url.toString());

  socket.addEventListener("open", () => handlers.onOpen?.());
  socket.addEventListener("close", () => handlers.onClose?.());
  socket.addEventListener("error", (e) => handlers.onConnectionError?.(e));

  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;

    try {
      const parsed = JSON.parse(event.data) as {
        type: ServerEventType;
        payload?: Record<string, unknown>;
        timestamp?: string;
        requestId?: string;
      };

      if (!parsed || typeof parsed !== "object") return;

      const payload = parsed.payload ?? {};

      switch (parsed.type) {
        case "STATE_SYNC":
          handlers.onStateSync?.(payload as unknown as StateSyncPayload);
          break;
        case "COMBAT_STARTED":
          handlers.onCombatStarted?.(payload as CombatStartedPayload);
          break;
        case "COMBAT_ENDED":
          handlers.onCombatEnded?.(payload as { reason: string });
          break;
        case "ROUND_STARTED":
          handlers.onRoundStarted?.(payload as { round: number });
          break;
        case "TURN_STARTED":
          handlers.onTurnStarted?.(payload as { entityId: string; round: number; turnIndex: number });
          break;
        case "TURN_ENDED":
          handlers.onTurnEnded?.(payload as { entityId: string; energyGained: number });
          break;
        case "INITIATIVE_UPDATED":
          handlers.onInitiativeUpdated?.(payload as InitiativeUpdatedPayload);
          break;
        case "MOVEMENT_EXECUTED":
          handlers.onMovementExecuted?.(payload as unknown as MovementExecutedPayload);
          break;
        case "ATTACK_RESOLVED":
          handlers.onAttackResolved?.(payload as unknown as AttackResolvedPayload);
          break;
        case "ABILITY_RESOLVED":
          handlers.onAbilityResolved?.(payload as { entityId: string; abilityName: string; effects: unknown });
          break;
        case "REACTION_RESOLVED":
          handlers.onReactionResolved?.(payload as { entityId: string; reactionType: string });
          break;
        case "CHANNELING_STARTED":
          handlers.onChannelingStarted?.(payload as unknown as ChannelingPayload);
          break;
        case "CHANNELING_CONTINUED":
          handlers.onChannelingContinued?.(payload as unknown as ChannelingPayload);
          break;
        case "CHANNELING_RELEASED":
          handlers.onChannelingReleased?.(payload as unknown as ChannelingPayload);
          break;
        case "CHANNELING_INTERRUPTED":
          handlers.onChannelingInterrupted?.(payload as unknown as ChannelingPayload);
          break;
        case "ENTITY_UPDATED":
          handlers.onEntityUpdated?.(payload as unknown as EntityUpdatedPayload);
          break;
        case "ENTITY_UNCONSCIOUS":
          handlers.onEntityUnconscious?.(payload as { entityId: string; message: string });
          break;
        case "ENTITY_DIED":
          handlers.onEntityDied?.(payload as { entityId: string; message: string });
          break;
        case "ENDURE_ROLL_REQUIRED":
          handlers.onEndureRollRequired?.(payload as unknown as EndureRollRequiredPayload);
          break;
        case "DEATH_CHECK_REQUIRED":
          handlers.onDeathCheckRequired?.(payload as unknown as DeathCheckRequiredPayload);
          break;
        case "ACTION_REJECTED":
          console.warn(`[CombatWS] Action rejected:`, payload);
          handlers.onActionRejected?.(payload as { reason: string });
          break;
        case "ERROR":
          console.error(`[CombatWS] Server error:`, payload);
          handlers.onError?.(payload as { message: string });
          break;
      }
    } catch {
      // Silently ignore parse errors
    }
  });

  const send = <T extends ClientMessageType>(type: T, payload?: Record<string, unknown>) => {
    if (socket.readyState === WebSocket.OPEN) {
      const message = {
        type,
        payload: payload ?? {},
        requestId: crypto.randomUUID(),
      };
      console.debug(`[CombatWS] Sending ${type}`, payload);
      socket.send(JSON.stringify(message));
    } else {
      console.warn(`[CombatWS] Cannot send ${type} - socket not open (state: ${socket.readyState})`);
    }
  };

  return {
    socket,
    send,
    close: () => socket.close(),
    requestState: () => send("REQUEST_STATE"),
    isConnected: () => socket.readyState === WebSocket.OPEN,
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// RECONNECTING SOCKET
// ═══════════════════════════════════════════════════════════════════════════

export interface ReconnectingCombatV2Socket extends CombatV2SocketConnection {
  reconnect: () => void;
}

export const createReconnectingCombatV2Socket = (
  combatId: string,
  handlers: CombatV2SocketHandlers,
  options: {
    playerId: string;
    isGM: boolean;
    controlledEntityIds?: string[];
    maxRetries?: number;
    retryDelay?: number;
    onReconnecting?: (attempt: number) => void;
  }
): ReconnectingCombatV2Socket => {
  const maxRetries = options.maxRetries ?? 5;
  const retryDelay = options.retryDelay ?? 2000;
  let connection: CombatV2SocketConnection | null = null;
  let retryCount = 0;
  let isClosedIntentionally = false;

  const connect = () => {
    connection = connectCombatV2Socket(combatId, {
      ...handlers,
      onOpen: () => {
        retryCount = 0;
        connection?.requestState();
        handlers.onOpen?.();
      },
      onClose: () => {
        handlers.onClose?.();
        if (!isClosedIntentionally && retryCount < maxRetries) {
          retryCount++;
          options.onReconnecting?.(retryCount);
          setTimeout(connect, retryDelay * Math.pow(1.5, retryCount - 1));
        }
      },
      onConnectionError: (e) => {
        handlers.onConnectionError?.(e);
      },
    }, options);
  };

  connect();

  return {
    get socket() {
      return connection?.socket ?? (null as unknown as WebSocket);
    },
    send: (type, payload) => connection?.send(type, payload),
    close: () => {
      isClosedIntentionally = true;
      connection?.close();
    },
    requestState: () => connection?.requestState(),
    isConnected: () => connection?.isConnected() ?? false,
    reconnect: () => {
      isClosedIntentionally = false;
      retryCount = 0;
      connection?.close();
      connect();
    },
  };
};
