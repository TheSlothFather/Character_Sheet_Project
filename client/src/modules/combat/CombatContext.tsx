/**
 * Combat Context Provider
 *
 * Provides authoritative combat state and typed action methods to the component tree.
 * Manages WebSocket connection to the Durable Object with automatic reconnection.
 */

import React from "react";
import {
  connectCombatSocket,
  createReconnectingCombatSocket,
  type CombatSocketHandlers,
  type ReconnectingCombatSocket,
} from "../../api/campaignSocket";
import {
  combatApi,
  type StartCombatParams,
  type SubmitInitiativeRollParams,
  type DeclareActionParams,
  type DeclareReactionParams,
  type EndTurnParams,
  type GmOverrideParams,
  type EndCombatParams,
  type InitiateContestParams,
  type RespondContestParams,
  type RequestSkillCheckParams,
  type SubmitSkillCheckParams,
  type RemoveEntityParams,
} from "../../api/combat";

import type {
  CombatState,
  CombatEntity,
  CombatPhase,
  PendingAction,
  PendingReaction,
  CombatLogEntry,
  InitiativeMode,
  EntityFaction,
  SkillContestRequest,
  SkillCheckRequest,
} from "@shared/rules/combat";

import type {
  StateSyncPayload,
  CombatStartedPayload,
  CombatEndedPayload,
  RoundStartedPayload,
  TurnStartedPayload,
  TurnEndedPayload,
  ActionDeclaredPayload,
  ActionResolvedPayload,
  ReactionDeclaredPayload,
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
  LobbyPlayerJoinedPayload,
  LobbyPlayerLeftPayload,
  LobbyPlayerReadyPayload,
  LobbyStateSyncPayload,
  LobbyState,
} from "@shared/rules/combatEvents";

type DeclareActionInput = Omit<DeclareActionParams, "senderId">;
type DeclareReactionInput = Omit<DeclareReactionParams, "senderId">;
type EndTurnInput = Omit<EndTurnParams, "senderId">;

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type CombatConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface CombatContextValue {
  // Connection state
  campaignId: string | null;
  connectionStatus: CombatConnectionStatus;
  reconnectAttempt: number;

  // Combat state (null if no active combat)
  state: CombatState | null;

  // Lobby state (pre-combat)
  lobbyState: LobbyState | null;

  // Derived state helpers
  phase: CombatPhase | null;
  round: number;
  activeEntity: CombatEntity | null;
  isMyTurn: boolean;
  myControlledEntities: CombatEntity[];
  canDeclareReaction: boolean;
  pendingAction: PendingAction | null;
  pendingReactions: PendingReaction[];

  // Skill contests and checks
  pendingSkillContests: Record<string, SkillContestRequest>;
  pendingSkillChecks: Record<string, SkillCheckRequest>;
  myPendingDefense: SkillContestRequest | null;
  myPendingSkillChecks: SkillCheckRequest[];

  // Entity helpers
  getEntity: (entityId: string) => CombatEntity | undefined;
  getEntitiesByFaction: (faction: EntityFaction) => CombatEntity[];
  getEntitiesInInitiativeOrder: () => CombatEntity[];

  // Combat lifecycle actions
  startCombat: (params: StartCombatParams) => Promise<void>;
  endCombat: (params: EndCombatParams) => Promise<void>;
  refreshState: () => Promise<void>;

  // Initiative rolling
  submitInitiativeRoll: (params: { entityId: string; roll: any }) => Promise<void>;
  myPendingInitiativeRolls: CombatEntity[];

  // Player/GM actions
  declareAction: (params: DeclareActionInput) => Promise<void>;
  declareReaction: (params: DeclareReactionInput) => Promise<void>;
  endTurn: (params: EndTurnInput) => Promise<void>;

  // Skill contest actions
  initiateSkillContest: (params: InitiateContestParams) => Promise<void>;
  respondToSkillContest: (params: RespondContestParams) => Promise<void>;

  // GM skill check actions
  requestSkillCheck: (params: RequestSkillCheckParams) => Promise<void>;
  submitSkillCheck: (params: SubmitSkillCheckParams) => Promise<void>;

  // GM-only actions
  resolveReactions: () => Promise<void>;
  gmOverride: (params: GmOverrideParams) => Promise<void>;
  removeEntity: (params: RemoveEntityParams) => Promise<void>;

  // Lobby actions
  joinLobby: (characterId?: string) => void;
  leaveLobby: () => void;
  toggleReady: (isReady: boolean, characterId?: string) => void;

  // Error handling
  error: string | null;
  clearError: () => void;
}

const CombatContext = React.createContext<CombatContextValue | undefined>(
  undefined
);

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER PROPS
// ═══════════════════════════════════════════════════════════════════════════

export interface CombatProviderProps {
  children: React.ReactNode;
  campaignId: string;
  userId: string;
  isGm?: boolean;
  onCombatStarted?: (payload: CombatStartedPayload) => void;
  onCombatEnded?: (payload: CombatEndedPayload) => void;
  onRoundStarted?: (payload: RoundStartedPayload) => void;
  onTurnStarted?: (payload: TurnStartedPayload) => void;
  onTurnEnded?: (payload: TurnEndedPayload) => void;
  onActionDeclared?: (payload: ActionDeclaredPayload) => void;
  onActionResolved?: (payload: ActionResolvedPayload) => void;
  onReactionDeclared?: (payload: ReactionDeclaredPayload) => void;
  onReactionsResolved?: (payload: ReactionsResolvedPayload) => void;
  onEntityUpdated?: (payload: EntityUpdatedPayload) => void;
  onWoundsApplied?: (payload: WoundsAppliedPayload) => void;
  onStatusApplied?: (payload: StatusAppliedPayload) => void;
  onStatusRemoved?: (payload: StatusRemovedPayload) => void;
  onGmOverride?: (payload: GmOverridePayload) => void;
  onInitiativeModified?: (payload: InitiativeModifiedPayload) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export const CombatProvider: React.FC<CombatProviderProps> = ({
  children,
  campaignId,
  userId,
  isGm = false,
  onCombatStarted,
  onCombatEnded,
  onRoundStarted,
  onTurnStarted,
  onTurnEnded,
  onActionDeclared,
  onActionResolved,
  onReactionDeclared,
  onReactionsResolved,
  onEntityUpdated,
  onWoundsApplied,
  onStatusApplied,
  onStatusRemoved,
  onGmOverride,
  onInitiativeModified,
}) => {
  // State
  const [connectionStatus, setConnectionStatus] =
    React.useState<CombatConnectionStatus>("disconnected");
  const [reconnectAttempt, setReconnectAttempt] = React.useState(0);
  const [state, setState] = React.useState<CombatState | null>(null);
  const [lobbyState, setLobbyState] = React.useState<LobbyState | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Skill contest and check state
  const [pendingSkillContests, setPendingSkillContests] = React.useState<
    Record<string, SkillContestRequest>
  >({});
  const [pendingSkillChecks, setPendingSkillChecks] = React.useState<
    Record<string, SkillCheckRequest>
  >({});

  // Socket ref
  const socketRef = React.useRef<ReconnectingCombatSocket | null>(null);

  // Controller ID for ownership checks
  const controllerId = isGm ? "gm" : `player:${userId}`;
  const senderId = isGm ? "gm" : userId;

  // ─────────────────────────────────────────────────────────────────────────
  // WebSocket Connection
  // ─────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!campaignId) return;

    setConnectionStatus("connecting");
    setError(null);

    const handlers: CombatSocketHandlers = {
      onStateSync: (payload: StateSyncPayload) => {
        setState(payload.state);
      },

      onOpen: () => {
        setConnectionStatus("connected");
        setReconnectAttempt(0);
      },

      onClose: () => {
        setConnectionStatus("disconnected");
      },

      onError: () => {
        setConnectionStatus("error");
        setError("WebSocket connection error");
      },

      onCombatStarted: (payload: CombatStartedPayload) => {
        setState(payload.state);
        onCombatStarted?.(payload);
      },

      onCombatEnded: (payload: CombatEndedPayload) => {
        setState(null);
        onCombatEnded?.(payload);
      },

      onRoundStarted: (payload: RoundStartedPayload) => {
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            round: payload.round,
            initiativeOrder: payload.initiativeOrder,
            lastUpdatedAt: new Date().toISOString(),
          };
        });
        onRoundStarted?.(payload);
      },

      onTurnStarted: (payload: TurnStartedPayload) => {
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            activeEntityId: payload.entityId,
            round: payload.round,
            turnIndex: payload.turnIndex,
            phase: "active-turn",
            lastUpdatedAt: new Date().toISOString(),
          };
        });
        onTurnStarted?.(payload);
      },

      onTurnEnded: (payload: TurnEndedPayload) => {
        setState((prev) => {
          if (!prev) return prev;
          const entity = prev.entities[payload.entityId];
          if (!entity) return prev;

          return {
            ...prev,
            entities: {
              ...prev.entities,
              [payload.entityId]: {
                ...entity,
                energy: {
                  ...entity.energy,
                  current: Math.min(
                    entity.energy.max,
                    entity.energy.current + payload.energyGained
                  ),
                },
              },
            },
            lastUpdatedAt: new Date().toISOString(),
          };
        });
        onTurnEnded?.(payload);
      },

      onActionDeclared: (payload: ActionDeclaredPayload) => {
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pendingAction: payload.action,
            phase: payload.phase,
            lastUpdatedAt: new Date().toISOString(),
          };
        });
        onActionDeclared?.(payload);
      },

      onActionResolved: (payload) => {
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pendingAction: null,
            log: [...prev.log, payload.log],
            lastUpdatedAt: new Date().toISOString(),
          };
        });
        onActionResolved?.(payload);
      },

      onReactionDeclared: (payload: ReactionDeclaredPayload) => {
        setState((prev) => {
          if (!prev) return prev;
          const entity = prev.entities[payload.reaction.entityId];
          return {
            ...prev,
            pendingReactions: [...prev.pendingReactions, payload.reaction],
            phase: "reaction-interrupt",
            entities: entity
              ? {
                  ...prev.entities,
                  [payload.reaction.entityId]: {
                    ...entity,
                    reaction: { available: false },
                  },
                }
              : prev.entities,
            lastUpdatedAt: new Date().toISOString(),
          };
        });
        onReactionDeclared?.(payload);
      },

      onReactionsResolved: (payload: ReactionsResolvedPayload) => {
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pendingAction: null,
            pendingReactions: [],
            phase: "active-turn",
            log: [...prev.log, ...(payload.log ?? [])],
            lastUpdatedAt: new Date().toISOString(),
          };
        });
        onReactionsResolved?.(payload);
      },

      onEntityUpdated: (payload: EntityUpdatedPayload) => {
        setState((prev) => {
          if (!prev) return prev;
          const entity = prev.entities[payload.entityId];
          if (!entity) return prev;

          return {
            ...prev,
            entities: {
              ...prev.entities,
              [payload.entityId]: {
                ...entity,
                ...payload.changes,
              },
            },
            lastUpdatedAt: new Date().toISOString(),
          };
        });
        onEntityUpdated?.(payload);
      },

      onWoundsApplied: (payload: WoundsAppliedPayload) => {
        setState((prev) => {
          if (!prev) return prev;
          const entity = prev.entities[payload.entityId];
          if (!entity) return prev;

          // Merge wound counts
          const newWounds = { ...entity.wounds };
          for (const [type, count] of Object.entries(payload.wounds)) {
            newWounds[type as keyof typeof newWounds] =
              (newWounds[type as keyof typeof newWounds] ?? 0) + (count ?? 0);
          }

          return {
            ...prev,
            entities: {
              ...prev.entities,
              [payload.entityId]: {
                ...entity,
                wounds: newWounds,
              },
            },
            lastUpdatedAt: new Date().toISOString(),
          };
        });
        onWoundsApplied?.(payload);
      },

      onStatusApplied: (payload: StatusAppliedPayload) => {
        setState((prev) => {
          if (!prev) return prev;
          const entity = prev.entities[payload.entityId];
          if (!entity) return prev;

          const existingIndex = entity.statusEffects.findIndex(
            (s) => s.key === payload.statusKey
          );

          const newStatusEffects =
            existingIndex >= 0
              ? entity.statusEffects.map((s, i) =>
                  i === existingIndex
                    ? {
                        ...s,
                        stacks: payload.stacks,
                        duration: payload.duration,
                      }
                    : s
                )
              : [
                  ...entity.statusEffects,
                  {
                    key: payload.statusKey,
                    stacks: payload.stacks,
                    duration: payload.duration,
                  },
                ];

          return {
            ...prev,
            entities: {
              ...prev.entities,
              [payload.entityId]: {
                ...entity,
                statusEffects: newStatusEffects,
              },
            },
            lastUpdatedAt: new Date().toISOString(),
          };
        });
        onStatusApplied?.(payload);
      },

      onStatusRemoved: (payload: StatusRemovedPayload) => {
        setState((prev) => {
          if (!prev) return prev;
          const entity = prev.entities[payload.entityId];
          if (!entity) return prev;

          return {
            ...prev,
            entities: {
              ...prev.entities,
              [payload.entityId]: {
                ...entity,
                statusEffects: entity.statusEffects.filter(
                  (s) => s.key !== payload.statusKey
                ),
              },
            },
            lastUpdatedAt: new Date().toISOString(),
          };
        });
        onStatusRemoved?.(payload);
      },

      onGmOverride: (payload: GmOverridePayload) => {
        // State sync will handle the actual state update
        onGmOverride?.(payload);
      },

      onInitiativeModified: (payload: InitiativeModifiedPayload) => {
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            initiativeOrder: payload.newOrder,
            lastUpdatedAt: new Date().toISOString(),
          };
        });
        onInitiativeModified?.(payload);
      },

      onSkillContestInitiated: (payload: SkillContestInitiatedPayload) => {
        setPendingSkillContests((prev) => ({
          ...prev,
          [payload.contest.contestId]: payload.contest,
        }));
      },

      onSkillContestDefenseRequested: (payload: SkillContestDefenseRequestedPayload) => {
        // Defense request is implicitly handled via pendingSkillContests state
        // The UI will check if targetPlayerId matches current player
      },

      onSkillContestResolved: (payload: SkillContestResolvedPayload) => {
        setPendingSkillContests((prev) => {
          const updated = { ...prev };
          delete updated[payload.contest.contestId];
          return updated;
        });
      },

      onSkillCheckRequested: (payload: SkillCheckRequestedPayload) => {
        setPendingSkillChecks((prev) => ({
          ...prev,
          [payload.check.checkId]: payload.check,
        }));
      },

      onSkillCheckRolled: (payload: SkillCheckRolledPayload) => {
        setPendingSkillChecks((prev) => {
          const updated = { ...prev };
          // Update the check with roll data
          if (updated[payload.check.checkId]) {
            updated[payload.check.checkId] = {
              ...updated[payload.check.checkId],
              rollData: payload.rollData,
              status: "rolled",
            };
          }
          return updated;
        });
      },

      onEntityRemoved: (payload: EntityRemovedPayload) => {
        setState((prev) => {
          if (!prev) return prev;
          const entities = { ...prev.entities };
          delete entities[payload.entityId];
          return {
            ...prev,
            entities,
            initiativeOrder: prev.initiativeOrder.filter((id) => id !== payload.entityId),
            lastUpdatedAt: new Date().toISOString(),
          };
        });
      },

      onLobbyPlayerJoined: (payload: LobbyPlayerJoinedPayload) => {
        setLobbyState(payload.lobbyState);
      },

      onLobbyPlayerLeft: (payload: LobbyPlayerLeftPayload) => {
        setLobbyState(payload.lobbyState);
      },

      onLobbyPlayerReady: (payload: LobbyPlayerReadyPayload) => {
        setLobbyState(payload.lobbyState);
      },

      onLobbyStateSync: (payload: LobbyStateSyncPayload) => {
        setLobbyState(payload.lobbyState);
      },
    };

    const socket = createReconnectingCombatSocket(campaignId, handlers, userId, {
      maxRetries: 10,
      retryDelay: 2000,
      onReconnecting: (attempt) => {
        setConnectionStatus("reconnecting");
        setReconnectAttempt(attempt);
      },
    });

    socketRef.current = socket;

    return () => {
      socket.close();
      socketRef.current = null;
      setConnectionStatus("disconnected");
    };
  }, [campaignId, userId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived State
  // ─────────────────────────────────────────────────────────────────────────

  const phase = state?.phase ?? null;
  const round = state?.round ?? 0;

  const activeEntity = React.useMemo(() => {
    if (!state?.activeEntityId) return null;
    return state.entities[state.activeEntityId] ?? null;
  }, [state?.activeEntityId, state?.entities]);

  const isMyTurn = React.useMemo(() => {
    if (!activeEntity) return false;
    return activeEntity.controller === controllerId;
  }, [activeEntity, controllerId]);

  const myControlledEntities = React.useMemo(() => {
    if (!state) return [];
    return Object.values(state.entities).filter(
      (entity) => entity.controller === controllerId
    );
  }, [state?.entities, controllerId]);

  const canDeclareReaction = React.useMemo(() => {
    if (!state) return false;
    if (state.phase !== "active-turn" && state.phase !== "reaction-interrupt") {
      return false;
    }
    if (!state.pendingAction?.interruptible) return false;

    // Check if any of my entities can react
    return myControlledEntities.some(
      (entity) =>
        entity.reaction.available &&
        entity.alive &&
        entity.id !== state.activeEntityId
    );
  }, [state, myControlledEntities]);

  const pendingAction = state?.pendingAction ?? null;
  const pendingReactions = state?.pendingReactions ?? [];

  // Skill contest and check derived state
  const myPendingDefense = React.useMemo(() => {
    const contests = Object.values(pendingSkillContests);
    // Find a contest where I need to defend (target is one of my entities)
    return contests.find(
      (contest) =>
        contest.status === "awaiting_defense" &&
        state?.entities[contest.targetId]?.controller === controllerId
    ) ?? null;
  }, [pendingSkillContests, state?.entities, controllerId]);

  const myPendingSkillChecks = React.useMemo(() => {
    const checks = Object.values(pendingSkillChecks);
    // Find checks that are pending for me
    return checks.filter(
      (check) =>
        check.status === "pending" &&
        check.targetPlayerId === userId
    );
  }, [pendingSkillChecks, userId]);

  const myPendingInitiativeRolls = React.useMemo(() => {
    if (!state || state.phase !== "initiative-rolling") return [];
    // Find my entities that haven't rolled initiative yet
    return myControlledEntities.filter(
      (entity) => !state.initiativeRolls?.[entity.id]
    );
  }, [state, myControlledEntities]);

  // ─────────────────────────────────────────────────────────────────────────
  // Entity Helpers
  // ─────────────────────────────────────────────────────────────────────────

  const getEntity = React.useCallback(
    (entityId: string): CombatEntity | undefined => {
      return state?.entities[entityId];
    },
    [state?.entities]
  );

  const getEntitiesByFaction = React.useCallback(
    (faction: EntityFaction): CombatEntity[] => {
      if (!state) return [];
      return Object.values(state.entities).filter((e) => e.faction === faction);
    },
    [state?.entities]
  );

  const getEntitiesInInitiativeOrder = React.useCallback((): CombatEntity[] => {
    if (!state) return [];
    return state.initiativeOrder
      .map((id) => state.entities[id])
      .filter((e): e is CombatEntity => e !== undefined);
  }, [state?.initiativeOrder, state?.entities]);

  // ─────────────────────────────────────────────────────────────────────────
  // Combat Lifecycle Actions
  // ─────────────────────────────────────────────────────────────────────────

  const startCombat = React.useCallback(
    async (params: StartCombatParams) => {
      try {
        setError(null);
        const response = await combatApi.startCombat(campaignId, params);
        setState(response.state);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to start combat";
        setError(message);
        throw err;
      }
    },
    [campaignId, senderId]
  );

  const endCombat = React.useCallback(
    async (params: EndCombatParams) => {
      try {
        setError(null);
        await combatApi.endCombat(campaignId, params);
        setState(null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to end combat";
        setError(message);
        throw err;
      }
    },
    [campaignId, senderId]
  );

  const refreshState = React.useCallback(async () => {
    try {
      setError(null);
      const response = await combatApi.getAuthoritativeState(campaignId);
      setState(response.state);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to refresh state";
      setError(message);
      throw err;
    }
  }, [campaignId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Initiative Rolling
  // ─────────────────────────────────────────────────────────────────────────

  const submitInitiativeRoll = React.useCallback(
    async (params: SubmitInitiativeRollParams) => {
      try {
        setError(null);
        const response = await combatApi.submitInitiativeRoll(campaignId, params);
        setState(response.state);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to submit initiative roll";
        setError(message);
        throw err;
      }
    },
    [campaignId, senderId]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Player/GM Actions
  // ─────────────────────────────────────────────────────────────────────────

  const declareAction = React.useCallback(
    async (params: DeclareActionInput) => {
      try {
        setError(null);
        const response = await combatApi.declareAction(campaignId, {
          ...params,
          senderId,
        });
        setState(response.state);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to declare action";
        setError(message);
        throw err;
      }
    },
    [campaignId]
  );

  const declareReaction = React.useCallback(
    async (params: DeclareReactionInput) => {
      try {
        setError(null);
        const response = await combatApi.declareReaction(campaignId, {
          ...params,
          senderId,
        });
        setState(response.state);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to declare reaction";
        setError(message);
        throw err;
      }
    },
    [campaignId]
  );

  const endTurn = React.useCallback(
    async (params: EndTurnInput) => {
      try {
        setError(null);
        const response = await combatApi.endTurn(campaignId, {
          ...params,
          senderId,
        });
        setState(response.state);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to end turn";
        setError(message);
        throw err;
      }
    },
    [campaignId]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GM-Only Actions
  // ─────────────────────────────────────────────────────────────────────────

  const resolveReactions = React.useCallback(async () => {
    try {
      setError(null);
      const response = await combatApi.resolveReactions(campaignId, senderId);
      setState(response.state);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to resolve reactions";
      setError(message);
      throw err;
    }
  }, [campaignId, senderId]);

  const gmOverride = React.useCallback(
    async (params: GmOverrideParams) => {
      try {
        setError(null);
        const response = await combatApi.gmOverride(campaignId, {
          ...params,
          gmId: userId,
        });
        setState(response.state);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to apply GM override";
        setError(message);
        throw err;
      }
    },
    [campaignId, userId]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Skill Contest Actions
  // ─────────────────────────────────────────────────────────────────────────

  const initiateSkillContest = React.useCallback(
    async (params: InitiateContestParams) => {
      try {
        setError(null);
        await combatApi.initiateSkillContest(campaignId, params);
        // State will be updated via WebSocket event
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to initiate skill contest";
        setError(message);
        throw err;
      }
    },
    [campaignId]
  );

  const respondToSkillContest = React.useCallback(
    async (params: RespondContestParams) => {
      try {
        setError(null);
        await combatApi.respondToSkillContest(campaignId, params);
        // State will be updated via WebSocket event
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to respond to skill contest";
        setError(message);
        throw err;
      }
    },
    [campaignId]
  );

  const requestSkillCheck = React.useCallback(
    async (params: RequestSkillCheckParams) => {
      try {
        setError(null);
        await combatApi.requestSkillCheck(campaignId, params);
        // State will be updated via WebSocket event
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to request skill check";
        setError(message);
        throw err;
      }
    },
    [campaignId]
  );

  const submitSkillCheck = React.useCallback(
    async (params: SubmitSkillCheckParams) => {
      try {
        setError(null);
        await combatApi.submitSkillCheck(campaignId, params);
        // State will be updated via WebSocket event
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to submit skill check";
        setError(message);
        throw err;
      }
    },
    [campaignId]
  );

  const removeEntity = React.useCallback(
    async (params: RemoveEntityParams) => {
      try {
        setError(null);
        await combatApi.removeEntity(campaignId, params);
        // State will be updated via WebSocket event
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to remove entity";
        setError(message);
        throw err;
      }
    },
    [campaignId]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Lobby Actions
  // ─────────────────────────────────────────────────────────────────────────

  const joinLobby = React.useCallback(
    (characterId?: string) => {
      if (!socketRef.current?.socket) return;
      socketRef.current.socket.send(
        JSON.stringify({
          type: "LOBBY_JOIN",
          userId,
          characterId,
        })
      );
    },
    [userId]
  );

  const leaveLobby = React.useCallback(() => {
    if (!socketRef.current?.socket) return;
    socketRef.current.socket.send(
      JSON.stringify({
        type: "LOBBY_LEAVE",
        userId,
      })
    );
  }, [userId]);

  const toggleReady = React.useCallback(
    (isReady: boolean, characterId?: string) => {
      if (!socketRef.current?.socket) return;
      socketRef.current.socket.send(
        JSON.stringify({
          type: "LOBBY_TOGGLE_READY",
          userId,
          isReady,
          characterId,
        })
      );
    },
    [userId]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Error Handling
  // ─────────────────────────────────────────────────────────────────────────

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Context Value
  // ─────────────────────────────────────────────────────────────────────────

  const value = React.useMemo<CombatContextValue>(
    () => ({
      // Connection state
      campaignId,
      connectionStatus,
      reconnectAttempt,

      // Combat state
      state,

      // Lobby state
      lobbyState,

      // Derived state
      phase,
      round,
      activeEntity,
      isMyTurn,
      myControlledEntities,
      canDeclareReaction,
      pendingAction,
      pendingReactions,

      // Skill contests and checks
      pendingSkillContests,
      pendingSkillChecks,
      myPendingDefense,
      myPendingSkillChecks,

      // Entity helpers
      getEntity,
      getEntitiesByFaction,
      getEntitiesInInitiativeOrder,

      // Combat lifecycle
      startCombat,
      endCombat,
      refreshState,

      // Initiative rolling
      submitInitiativeRoll,
      myPendingInitiativeRolls,

      // Player/GM actions
      declareAction,
      declareReaction,
      endTurn,

      // Skill contest actions
      initiateSkillContest,
      respondToSkillContest,

      // GM skill check actions
      requestSkillCheck,
      submitSkillCheck,

      // GM-only actions
      resolveReactions,
      gmOverride,
      removeEntity,

      // Lobby actions
      joinLobby,
      leaveLobby,
      toggleReady,

      // Error handling
      error,
      clearError,
    }),
    [
      campaignId,
      connectionStatus,
      reconnectAttempt,
      state,
      lobbyState,
      phase,
      round,
      activeEntity,
      isMyTurn,
      myControlledEntities,
      canDeclareReaction,
      pendingAction,
      pendingReactions,
      pendingSkillContests,
      pendingSkillChecks,
      myPendingDefense,
      myPendingSkillChecks,
      getEntity,
      getEntitiesByFaction,
      getEntitiesInInitiativeOrder,
      startCombat,
      endCombat,
      refreshState,
      submitInitiativeRoll,
      myPendingInitiativeRolls,
      declareAction,
      declareReaction,
      endTurn,
      initiateSkillContest,
      respondToSkillContest,
      requestSkillCheck,
      submitSkillCheck,
      resolveReactions,
      gmOverride,
      removeEntity,
      joinLobby,
      leaveLobby,
      toggleReady,
      error,
      clearError,
    ]
  );

  return (
    <CombatContext.Provider value={value}>{children}</CombatContext.Provider>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

export const useCombat = (): CombatContextValue => {
  const ctx = React.useContext(CombatContext);
  if (!ctx) {
    throw new Error("useCombat must be used within CombatProvider");
  }
  return ctx;
};

// ═══════════════════════════════════════════════════════════════════════════
// OPTIONAL HOOKS FOR SPECIFIC CONCERNS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook for just the connection status
 */
export const useCombatConnection = () => {
  const { connectionStatus, reconnectAttempt, error, clearError } = useCombat();
  return { connectionStatus, reconnectAttempt, error, clearError };
};

/**
 * Hook for turn-related state
 */
export const useCombatTurn = () => {
  const { phase, round, activeEntity, isMyTurn, endTurn, pendingAction } =
    useCombat();
  return { phase, round, activeEntity, isMyTurn, endTurn, pendingAction };
};

/**
 * Hook for reaction-related state
 */
export const useCombatReactions = () => {
  const {
    canDeclareReaction,
    pendingReactions,
    declareReaction,
    resolveReactions,
  } = useCombat();
  return {
    canDeclareReaction,
    pendingReactions,
    declareReaction,
    resolveReactions,
  };
};

/**
 * Hook for entity lookup
 */
export const useCombatEntities = () => {
  const {
    state,
    getEntity,
    getEntitiesByFaction,
    getEntitiesInInitiativeOrder,
    myControlledEntities,
  } = useCombat();
  return {
    entities: state?.entities ?? {},
    getEntity,
    getEntitiesByFaction,
    getEntitiesInInitiativeOrder,
    myControlledEntities,
  };
};
