/**
 * Campaign WebSocket Connection
 *
 * Handles real-time communication with the Durable Object for combat and presence events.
 */

import type {
  CombatState,
  CombatEntity,
  PendingAction,
  PendingReaction,
  CombatLogEntry,
  GmOverride,
} from "@shared/rules/combat";

import type {
  ServerEventType,
  StateSyncPayload,
  CombatStartedPayload,
  CombatEndedPayload,
  TurnStartedPayload,
  TurnEndedPayload,
  ActionDeclaredPayload,
  ActionRejectedPayload,
  ActionResolvedPayload,
  ReactionDeclaredPayload,
  ReactionRejectedPayload,
  ReactionsResolvedPayload,
  EntityUpdatedPayload,
  WoundsAppliedPayload,
  StatusAppliedPayload,
  StatusRemovedPayload,
  GmOverridePayload,
  InitiativeModifiedPayload,
  SkillContestInitiatedPayload,
  SkillContestDefenseRequestedPayload,
  SkillContestResolvedPayload,
  SkillCheckRequestedPayload,
  SkillCheckRolledPayload,
  EntityRemovedPayload,
} from "@shared/rules/combatEvents";

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY EVENT TYPES (for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════

export type LegacyCampaignEvent = {
  type: string;
  campaignId: string;
  sequence?: number;
  timestamp: string;
  payload?: unknown;
};

// Alias for backward compatibility
export type CampaignEvent = LegacyCampaignEvent;

// ═══════════════════════════════════════════════════════════════════════════
// AUTHORITATIVE COMBAT EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CombatEvent {
  type: ServerEventType;
  campaignId: string;
  combatId?: string;
  sequence: number;
  timestamp: string;
  payload: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// SOCKET HANDLER TYPES
// ═══════════════════════════════════════════════════════════════════════════

type SocketHandlers = {
  onEvent: (event: CampaignEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
};

/**
 * Typed combat event handlers for the authoritative combat system
 */
export interface CombatSocketHandlers {
  // State sync
  onStateSync?: (payload: StateSyncPayload) => void;
  onCombatStarted?: (payload: CombatStartedPayload) => void;
  onCombatEnded?: (payload: CombatEndedPayload) => void;

  // Turn management
  onTurnStarted?: (payload: TurnStartedPayload) => void;
  onTurnEnded?: (payload: TurnEndedPayload) => void;

  // Actions & Reactions
  onActionDeclared?: (payload: ActionDeclaredPayload) => void;
  onActionRejected?: (payload: ActionRejectedPayload) => void;
  onActionResolved?: (payload: ActionResolvedPayload) => void;
  onReactionDeclared?: (payload: ReactionDeclaredPayload) => void;
  onReactionRejected?: (payload: ReactionRejectedPayload) => void;
  onReactionsResolved?: (payload: ReactionsResolvedPayload) => void;

  // Entity updates
  onEntityUpdated?: (payload: EntityUpdatedPayload) => void;
  onWoundsApplied?: (payload: WoundsAppliedPayload) => void;
  onStatusApplied?: (payload: StatusAppliedPayload) => void;
  onStatusRemoved?: (payload: StatusRemovedPayload) => void;

  // GM actions
  onGmOverride?: (payload: GmOverridePayload) => void;
  onInitiativeModified?: (payload: InitiativeModifiedPayload) => void;

  // Skill contests
  onSkillContestInitiated?: (payload: SkillContestInitiatedPayload) => void;
  onSkillContestDefenseRequested?: (payload: SkillContestDefenseRequestedPayload) => void;
  onSkillContestResolved?: (payload: SkillContestResolvedPayload) => void;

  // Skill checks
  onSkillCheckRequested?: (payload: SkillCheckRequestedPayload) => void;
  onSkillCheckRolled?: (payload: SkillCheckRolledPayload) => void;

  // Entity management
  onEntityRemoved?: (payload: EntityRemovedPayload) => void;

  // Connection lifecycle
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;

  // Raw event handler (for legacy compatibility)
  onRawEvent?: (event: CampaignEvent) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the Worker URL for API/WebSocket connections.
 * In production, this points to the separate Cloudflare Worker with Durable Objects.
 * In development, it uses the local origin (proxied via Vite).
 */
const getWorkerBaseUrl = () => {
  const workerUrl = import.meta.env.VITE_WORKER_URL;
  if (workerUrl) {
    return workerUrl;
  }
  // Fallback to current origin for local development
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

/**
 * Connect to campaign WebSocket (legacy interface)
 */
export const connectCampaignSocket = (
  campaignId: string,
  handlers: SocketHandlers,
  userId?: string
): WebSocket => {
  const url = buildWebSocketUrl(`/api/campaigns/${encodeURIComponent(campaignId)}/connect`);
  if (userId) {
    url.searchParams.set("user", userId);
  }

  const socket = new WebSocket(url.toString());
  socket.addEventListener("open", () => handlers.onOpen?.());
  socket.addEventListener("close", () => handlers.onClose?.());
  socket.addEventListener("error", () => handlers.onError?.());
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    try {
      const parsed = JSON.parse(event.data) as CampaignEvent;
      if (!parsed || typeof parsed !== "object") return;
      handlers.onEvent(parsed);
    } catch {
      return;
    }
  });

  return socket;
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTHORITATIVE COMBAT SOCKET
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Combat socket connection with typed handlers
 */
export interface CombatSocketConnection {
  socket: WebSocket;
  send: (message: unknown) => void;
  close: () => void;
  requestState: () => void;
}

/**
 * Connect to campaign WebSocket with typed combat event handlers
 */
export const connectCombatSocket = (
  campaignId: string,
  handlers: CombatSocketHandlers,
  userId?: string
): CombatSocketConnection => {
  const url = buildWebSocketUrl(`/api/campaigns/${encodeURIComponent(campaignId)}/connect`);
  if (userId) {
    url.searchParams.set("user", userId);
  }

  const socket = new WebSocket(url.toString());

  socket.addEventListener("open", () => handlers.onOpen?.());
  socket.addEventListener("close", () => handlers.onClose?.());
  socket.addEventListener("error", (e) => handlers.onError?.(e));

  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;

    try {
      const parsed = JSON.parse(event.data) as CampaignEvent;
      if (!parsed || typeof parsed !== "object") return;

      // Call raw event handler if provided
      handlers.onRawEvent?.(parsed);

      // Route to typed handlers based on event type
      const payload = parsed.payload as Record<string, unknown> | undefined;

      switch (parsed.type) {
        case "STATE_SYNC":
          handlers.onStateSync?.(payload as unknown as StateSyncPayload);
          break;

        case "COMBAT_STARTED":
          handlers.onCombatStarted?.(payload as unknown as CombatStartedPayload);
          break;

        case "COMBAT_ENDED":
          handlers.onCombatEnded?.(payload as unknown as CombatEndedPayload);
          break;

        case "TURN_STARTED":
          handlers.onTurnStarted?.(payload as unknown as TurnStartedPayload);
          break;

        case "TURN_ENDED":
          handlers.onTurnEnded?.(payload as unknown as TurnEndedPayload);
          break;

        case "ACTION_DECLARED":
          handlers.onActionDeclared?.(payload as unknown as ActionDeclaredPayload);
          break;

        case "ACTION_REJECTED":
          handlers.onActionRejected?.(payload as unknown as ActionRejectedPayload);
          break;

        case "ACTION_RESOLVED":
          handlers.onActionResolved?.(payload as unknown as ActionResolvedPayload);
          break;

        case "REACTION_DECLARED":
          handlers.onReactionDeclared?.(payload as unknown as ReactionDeclaredPayload);
          break;

        case "REACTION_REJECTED":
          handlers.onReactionRejected?.(payload as unknown as ReactionRejectedPayload);
          break;

        case "REACTIONS_RESOLVED":
          handlers.onReactionsResolved?.(payload as unknown as ReactionsResolvedPayload);
          break;

        case "ENTITY_UPDATED":
          handlers.onEntityUpdated?.(payload as unknown as EntityUpdatedPayload);
          break;

        case "WOUNDS_APPLIED":
          handlers.onWoundsApplied?.(payload as unknown as WoundsAppliedPayload);
          break;

        case "STATUS_APPLIED":
          handlers.onStatusApplied?.(payload as unknown as StatusAppliedPayload);
          break;

        case "STATUS_REMOVED":
          handlers.onStatusRemoved?.(payload as unknown as StatusRemovedPayload);
          break;

        case "GM_OVERRIDE":
          handlers.onGmOverride?.(payload as unknown as GmOverridePayload);
          break;

        case "INITIATIVE_MODIFIED":
          handlers.onInitiativeModified?.(payload as unknown as InitiativeModifiedPayload);
          break;

        case "SKILL_CONTEST_INITIATED":
          handlers.onSkillContestInitiated?.(payload as unknown as SkillContestInitiatedPayload);
          break;

        case "SKILL_CONTEST_DEFENSE_REQUESTED":
          handlers.onSkillContestDefenseRequested?.(payload as unknown as SkillContestDefenseRequestedPayload);
          break;

        case "SKILL_CONTEST_RESOLVED":
          handlers.onSkillContestResolved?.(payload as unknown as SkillContestResolvedPayload);
          break;

        case "SKILL_CHECK_REQUESTED":
          handlers.onSkillCheckRequested?.(payload as unknown as SkillCheckRequestedPayload);
          break;

        case "SKILL_CHECK_ROLLED":
          handlers.onSkillCheckRolled?.(payload as unknown as SkillCheckRolledPayload);
          break;

        case "ENTITY_REMOVED":
          handlers.onEntityRemoved?.(payload as unknown as EntityRemovedPayload);
          break;
      }
    } catch {
      // Silently ignore parse errors
      return;
    }
  });

  const send = (message: unknown) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const requestState = () => {
    send({ type: "REQUEST_STATE" });
  };

  return {
    socket,
    send,
    close: () => socket.close(),
    requestState,
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// RECONNECTION HELPER
// ═══════════════════════════════════════════════════════════════════════════

export interface ReconnectingCombatSocket extends CombatSocketConnection {
  isConnected: () => boolean;
  reconnect: () => void;
}

/**
 * Create a combat socket with automatic reconnection
 */
export const createReconnectingCombatSocket = (
  campaignId: string,
  handlers: CombatSocketHandlers,
  userId?: string,
  options?: {
    maxRetries?: number;
    retryDelay?: number;
    onReconnecting?: (attempt: number) => void;
  }
): ReconnectingCombatSocket => {
  const maxRetries = options?.maxRetries ?? 5;
  const retryDelay = options?.retryDelay ?? 2000;
  let connection: CombatSocketConnection | null = null;
  let retryCount = 0;
  let isClosedIntentionally = false;

  const connect = () => {
    connection = connectCombatSocket(campaignId, {
      ...handlers,
      onOpen: () => {
        retryCount = 0;
        // Request current state on connect/reconnect
        connection?.requestState();
        handlers.onOpen?.();
      },
      onClose: () => {
        handlers.onClose?.();
        if (!isClosedIntentionally && retryCount < maxRetries) {
          retryCount++;
          options?.onReconnecting?.(retryCount);
          setTimeout(connect, retryDelay * Math.pow(1.5, retryCount - 1));
        }
      },
      onError: (e) => {
        handlers.onError?.(e);
      },
    }, userId);
  };

  connect();

  return {
    get socket() {
      return connection?.socket ?? null as unknown as WebSocket;
    },
    send: (message: unknown) => connection?.send(message),
    close: () => {
      isClosedIntentionally = true;
      connection?.close();
    },
    requestState: () => connection?.requestState(),
    isConnected: () => connection?.socket?.readyState === WebSocket.OPEN,
    reconnect: () => {
      isClosedIntentionally = false;
      retryCount = 0;
      connection?.close();
      connect();
    },
  };
};
