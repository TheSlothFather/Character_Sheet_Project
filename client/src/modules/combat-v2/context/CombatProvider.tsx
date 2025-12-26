/**
 * Combat V2 Provider
 *
 * React context for managing combat state and WebSocket communication
 * with the CombatDurableObject.
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  createReconnectingCombatV2Socket,
  type ReconnectingCombatV2Socket,
  type CombatV2State,
  type CombatV2Entity,
  type HexPosition,
  type InitiativeEntry,
  type ClientMessageType,
} from "../../../api/combatV2Socket";

// ═══════════════════════════════════════════════════════════════════════════
// STATE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface CombatContextState {
  // Connection
  connectionStatus: ConnectionStatus;
  reconnectAttempt: number;

  // Combat state from server
  combatId: string | null;
  campaignId: string | null;
  phase: CombatV2State["phase"] | null;
  round: number;
  currentTurnIndex: number;
  currentEntityId: string | null;

  // Entities
  entities: Record<string, CombatV2Entity>;
  initiative: InitiativeEntry[];
  hexPositions: Record<string, HexPosition>;
  controlledEntityIds: string[];

  // Version for optimistic updates
  version: number;

  // UI state
  selectedEntityId: string | null;
  targetEntityId: string | null;
  pendingEndureRoll: { entityId: string; damage: number } | null;
  pendingDeathCheck: { entityId: string; damage: number } | null;
  lastError: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

type CombatAction =
  | { type: "SET_CONNECTION_STATUS"; status: ConnectionStatus; attempt?: number }
  | { type: "STATE_SYNC"; state: CombatV2State; controlledEntityIds: string[] }
  | { type: "COMBAT_STARTED"; combatId: string }
  | { type: "COMBAT_ENDED" }
  | { type: "ROUND_STARTED"; round: number }
  | { type: "TURN_STARTED"; entityId: string; turnIndex: number }
  | { type: "TURN_ENDED"; entityId: string; energyGained: number }
  | { type: "INITIATIVE_UPDATED"; initiative: InitiativeEntry[] }
  | { type: "ENTITY_UPDATED"; entityId: string; updates: Partial<CombatV2Entity> }
  | { type: "ENTITY_POSITION_UPDATED"; entityId: string; position: HexPosition }
  | { type: "SET_PENDING_ENDURE"; entityId: string; damage: number }
  | { type: "SET_PENDING_DEATH_CHECK"; entityId: string; damage: number }
  | { type: "CLEAR_PENDING_ROLLS" }
  | { type: "SELECT_ENTITY"; entityId: string | null }
  | { type: "SET_TARGET"; entityId: string | null }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "INCREMENT_VERSION" };

// ═══════════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════════

const initialState: CombatContextState = {
  connectionStatus: "disconnected",
  reconnectAttempt: 0,
  combatId: null,
  campaignId: null,
  phase: null,
  round: 0,
  currentTurnIndex: -1,
  currentEntityId: null,
  entities: {},
  initiative: [],
  hexPositions: {},
  controlledEntityIds: [],
  version: 0,
  selectedEntityId: null,
  targetEntityId: null,
  pendingEndureRoll: null,
  pendingDeathCheck: null,
  lastError: null,
};

function combatReducer(state: CombatContextState, action: CombatAction): CombatContextState {
  switch (action.type) {
    case "SET_CONNECTION_STATUS":
      return {
        ...state,
        connectionStatus: action.status,
        reconnectAttempt: action.attempt ?? 0,
      };

    case "STATE_SYNC":
      return {
        ...state,
        combatId: action.state.combatId,
        campaignId: action.state.campaignId,
        phase: action.state.phase,
        round: action.state.round,
        currentTurnIndex: action.state.currentTurnIndex,
        currentEntityId: action.state.currentEntityId,
        entities: action.state.entities,
        initiative: action.state.initiative,
        hexPositions: action.state.hexPositions,
        controlledEntityIds: action.controlledEntityIds,
        version: action.state.version,
      };

    case "COMBAT_STARTED":
      return { ...state, combatId: action.combatId, phase: "setup" };

    case "COMBAT_ENDED":
      return {
        ...state,
        phase: "completed",
        pendingEndureRoll: null,
        pendingDeathCheck: null,
      };

    case "ROUND_STARTED":
      return { ...state, round: action.round };

    case "TURN_STARTED":
      return {
        ...state,
        currentEntityId: action.entityId,
        currentTurnIndex: action.turnIndex,
        phase: "active",
      };

    case "TURN_ENDED": {
      const entity = state.entities[action.entityId];
      if (entity?.energy) {
        return {
          ...state,
          entities: {
            ...state.entities,
            [action.entityId]: {
              ...entity,
              energy: {
                ...entity.energy,
                current: Math.min(
                  entity.energy.max,
                  entity.energy.current + action.energyGained
                ),
              },
            },
          },
        };
      }
      return state;
    }

    case "INITIATIVE_UPDATED":
      return { ...state, initiative: action.initiative };

    case "ENTITY_UPDATED": {
      const existing = state.entities[action.entityId];
      if (!existing) return state;
      return {
        ...state,
        entities: {
          ...state.entities,
          [action.entityId]: { ...existing, ...action.updates },
        },
        version: state.version + 1,
      };
    }

    case "ENTITY_POSITION_UPDATED":
      return {
        ...state,
        hexPositions: {
          ...state.hexPositions,
          [action.entityId]: action.position,
        },
        version: state.version + 1,
      };

    case "SET_PENDING_ENDURE":
      return {
        ...state,
        pendingEndureRoll: { entityId: action.entityId, damage: action.damage },
      };

    case "SET_PENDING_DEATH_CHECK":
      return {
        ...state,
        pendingDeathCheck: { entityId: action.entityId, damage: action.damage },
      };

    case "CLEAR_PENDING_ROLLS":
      return { ...state, pendingEndureRoll: null, pendingDeathCheck: null };

    case "SELECT_ENTITY":
      return { ...state, selectedEntityId: action.entityId };

    case "SET_TARGET":
      return { ...state, targetEntityId: action.entityId };

    case "SET_ERROR":
      return { ...state, lastError: action.error };

    case "INCREMENT_VERSION":
      return { ...state, version: state.version + 1 };

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

interface CombatContextActions {
  // Combat lifecycle
  startCombat: (entities?: { id: string; name: string; faction: "ally" | "enemy" | "neutral" }[]) => void;
  endCombat: () => void;

  // Initiative
  submitInitiativeRoll: (entityId: string, roll: number, tiebreaker: number) => void;

  // Turn management
  endTurn: (entityId: string) => void;
  delayTurn: (entityId: string) => void;
  readyAction: (entityId: string, triggerCondition: string) => void;

  // Movement
  declareMovement: (entityId: string, targetQ: number, targetR: number, path?: HexPosition[]) => void;

  // Combat actions
  declareAttack: (params: {
    attackerId: string;
    targetId: string;
    weaponCategory: string;
    apCost: number;
    energyCost: number;
    baseDamage: number;
    damageType: string;
    attackRoll: number;
  }) => void;

  declareAbility: (params: {
    entityId: string;
    abilityName: string;
    apCost: number;
    energyCost: number;
    effects?: Record<string, unknown>;
  }) => void;

  declareReaction: (params: {
    entityId: string;
    reactionType: string;
    apCost: number;
    triggerActionId?: string;
  }) => void;

  // Channeling
  startChanneling: (params: {
    entityId: string;
    spellName: string;
    totalCost: number;
    damageType: string;
    intensity: number;
    initialEnergy: number;
    initialAP: number;
  }) => void;

  continueChanneling: (entityId: string, additionalEnergy: number, additionalAP: number) => void;
  releaseSpell: (entityId: string, targetId?: string) => void;
  abortChanneling: (entityId: string) => void;

  // Death system
  submitEndureRoll: (entityId: string, rollTotal: number, success: boolean) => void;
  submitDeathCheck: (entityId: string, rollTotal: number, success: boolean) => void;

  // GM controls
  gmOverride: (entityId: string, data: Partial<CombatV2Entity>) => void;
  gmMoveEntity: (entityId: string, targetQ: number, targetR: number) => void;
  gmApplyDamage: (entityId: string, damage: number, damageType: string) => void;
  gmModifyResources: (entityId: string, ap?: number, energy?: number) => void;
  gmAddEntity: (entity: Partial<CombatV2Entity> & { id: string; name: string }) => void;
  gmRemoveEntity: (entityId: string) => void;

  // UI actions
  selectEntity: (entityId: string | null) => void;
  setTarget: (entityId: string | null) => void;
  clearError: () => void;
}

export interface CombatContextValue {
  state: CombatContextState;
  actions: CombatContextActions;
  isGM: boolean;

  // Computed helpers
  isMyTurn: boolean;
  canControlEntity: (entityId: string) => boolean;
  getEntity: (entityId: string) => CombatV2Entity | undefined;
  getEntityPosition: (entityId: string) => HexPosition | undefined;
  getCurrentTurnEntity: () => CombatV2Entity | undefined;
  getInitiativeOrder: () => (CombatV2Entity & { initiativeRoll: number })[];
}

const CombatContext = createContext<CombatContextValue | null>(null);

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════════════════

export interface CombatProviderProps {
  children: React.ReactNode;
  combatId: string;
  playerId: string;
  isGM: boolean;
  controlledCharacterIds?: string[];
}

const EMPTY_CONTROLLED_IDS: string[] = [];

export function CombatProvider({
  children,
  combatId,
  playerId,
  isGM,
  controlledCharacterIds = EMPTY_CONTROLLED_IDS,
}: CombatProviderProps) {
  const [state, dispatch] = useReducer(combatReducer, initialState);
  const socketRef = useRef<ReconnectingCombatV2Socket | null>(null);
  const controlledEntityKey = controlledCharacterIds.join(",");

  // Connect to WebSocket
  useEffect(() => {
    dispatch({ type: "SET_CONNECTION_STATUS", status: "connecting" });

    const socket = createReconnectingCombatV2Socket(
      combatId,
      {
        onOpen: () => {
          dispatch({ type: "SET_CONNECTION_STATUS", status: "connected" });
        },
        onClose: () => {
          dispatch({ type: "SET_CONNECTION_STATUS", status: "disconnected" });
        },
        onConnectionError: () => {
          dispatch({ type: "SET_ERROR", error: "Connection error" });
        },
        onStateSync: (payload) => {
          dispatch({
            type: "STATE_SYNC",
            state: payload.state,
            controlledEntityIds: payload.yourControlledEntities,
          });
        },
        onCombatStarted: (payload) => {
          dispatch({ type: "COMBAT_STARTED", combatId: payload.combatId });
        },
        onCombatEnded: () => {
          dispatch({ type: "COMBAT_ENDED" });
        },
        onRoundStarted: (payload) => {
          dispatch({ type: "ROUND_STARTED", round: payload.round });
        },
        onTurnStarted: (payload) => {
          dispatch({
            type: "TURN_STARTED",
            entityId: payload.entityId,
            turnIndex: payload.turnIndex,
          });
        },
        onTurnEnded: (payload) => {
          dispatch({
            type: "TURN_ENDED",
            entityId: payload.entityId,
            energyGained: payload.energyGained,
          });
        },
        onInitiativeUpdated: (payload) => {
          dispatch({ type: "INITIATIVE_UPDATED", initiative: payload.initiative });
        },
        onMovementExecuted: (payload) => {
          dispatch({
            type: "ENTITY_POSITION_UPDATED",
            entityId: payload.entityId,
            position: payload.to,
          });
          dispatch({
            type: "ENTITY_UPDATED",
            entityId: payload.entityId,
            updates: { ap: { current: payload.remainingAP, max: state.entities[payload.entityId]?.ap?.max ?? 6 } },
          });
        },
        onAttackResolved: (payload) => {
          dispatch({
            type: "ENTITY_UPDATED",
            entityId: payload.targetId,
            updates: {
              energy: { current: payload.targetEnergy, max: state.entities[payload.targetId]?.energy?.max ?? 100 },
              wounds: payload.targetWounds,
            },
          });
        },
        onChannelingStarted: (payload) => {
          dispatch({
            type: "ENTITY_UPDATED",
            entityId: payload.entityId,
            updates: {
              channeling: {
                spellName: payload.spellName,
                energyChanneled: payload.energyChanneled ?? 0,
                apChanneled: payload.apChanneled ?? 0,
                totalCost: payload.totalCost ?? 0,
                progress: payload.progress ?? 0,
              },
            },
          });
        },
        onChannelingContinued: (payload) => {
          dispatch({
            type: "ENTITY_UPDATED",
            entityId: payload.entityId,
            updates: {
              channeling: {
                spellName: payload.spellName,
                energyChanneled: payload.energyChanneled ?? 0,
                apChanneled: payload.apChanneled ?? 0,
                totalCost: payload.totalCost ?? 0,
                progress: payload.progress ?? 0,
              },
            },
          });
        },
        onChannelingReleased: (payload) => {
          dispatch({
            type: "ENTITY_UPDATED",
            entityId: payload.entityId,
            updates: { channeling: undefined },
          });
        },
        onChannelingInterrupted: (payload) => {
          dispatch({
            type: "ENTITY_UPDATED",
            entityId: payload.entityId,
            updates: { channeling: undefined },
          });
        },
        onEntityUnconscious: (payload) => {
          dispatch({
            type: "ENTITY_UPDATED",
            entityId: payload.entityId,
            updates: { unconscious: true },
          });
        },
        onEntityDied: (payload) => {
          dispatch({
            type: "ENTITY_UPDATED",
            entityId: payload.entityId,
            updates: { alive: false, unconscious: false },
          });
        },
        onEndureRollRequired: (payload) => {
          dispatch({
            type: "SET_PENDING_ENDURE",
            entityId: payload.entityId,
            damage: payload.triggeringDamage,
          });
        },
        onDeathCheckRequired: (payload) => {
          dispatch({
            type: "SET_PENDING_DEATH_CHECK",
            entityId: payload.entityId,
            damage: payload.triggeringDamage,
          });
        },
        onActionRejected: (payload) => {
          dispatch({ type: "SET_ERROR", error: payload.reason });
        },
        onError: (payload) => {
          dispatch({ type: "SET_ERROR", error: payload.message });
        },
      },
      {
        playerId,
        isGM,
        controlledEntityIds: controlledCharacterIds,
        onReconnecting: (attempt) => {
          dispatch({ type: "SET_CONNECTION_STATUS", status: "reconnecting", attempt });
        },
      }
    );

    socketRef.current = socket;

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [combatId, playerId, isGM, controlledEntityKey]);

  // Send helper
  const send = useCallback(<T extends ClientMessageType>(type: T, payload?: Record<string, unknown>) => {
    socketRef.current?.send(type, payload);
  }, []);

  // Actions
  const actions: CombatContextActions = useMemo(() => ({
    startCombat: (entities) => send("START_COMBAT", entities ? { entities } : {}),
    endCombat: () => send("END_COMBAT"),

    submitInitiativeRoll: (entityId, roll, tiebreaker) =>
      send("SUBMIT_INITIATIVE_ROLL", { entityId, roll, tiebreaker }),

    endTurn: (entityId) => send("END_TURN", { entityId }),
    delayTurn: (entityId) => send("DELAY_TURN", { entityId }),
    readyAction: (entityId, triggerCondition) =>
      send("READY_ACTION", { entityId, triggerCondition }),

    declareMovement: (entityId, targetQ, targetR, path) =>
      send("DECLARE_MOVEMENT", { entityId, targetQ, targetR, path }),

    declareAttack: (params) => send("DECLARE_ATTACK", params),
    declareAbility: (params) => send("DECLARE_ABILITY", params),
    declareReaction: (params) => send("DECLARE_REACTION", params),

    startChanneling: (params) => send("START_CHANNELING", params),
    continueChanneling: (entityId, additionalEnergy, additionalAP) =>
      send("CONTINUE_CHANNELING", { entityId, additionalEnergy, additionalAP }),
    releaseSpell: (entityId, targetId) => send("RELEASE_SPELL", { entityId, targetId }),
    abortChanneling: (entityId) => send("ABORT_CHANNELING", { entityId }),

    submitEndureRoll: (entityId, rollTotal, success) => {
      send("SUBMIT_ENDURE_ROLL", { entityId, rollTotal, success });
      dispatch({ type: "CLEAR_PENDING_ROLLS" });
    },
    submitDeathCheck: (entityId, rollTotal, success) => {
      send("SUBMIT_DEATH_CHECK", { entityId, rollTotal, success });
      dispatch({ type: "CLEAR_PENDING_ROLLS" });
    },

    gmOverride: (entityId, data) => send("GM_OVERRIDE", { entityId, updates: data }),
    gmMoveEntity: (entityId, targetQ, targetR) =>
      send("GM_MOVE_ENTITY", { entityId, targetQ, targetR }),
    gmApplyDamage: (entityId, damage, damageType) =>
      send("GM_APPLY_DAMAGE", { entityId, damage, damageType }),
    gmModifyResources: (entityId, ap, energy) =>
      send("GM_MODIFY_RESOURCES", { entityId, ap, energy }),
    gmAddEntity: (entity) => send("GM_ADD_ENTITY", { entity }),
    gmRemoveEntity: (entityId) => send("GM_REMOVE_ENTITY", { entityId }),

    selectEntity: (entityId) => dispatch({ type: "SELECT_ENTITY", entityId }),
    setTarget: (entityId) => dispatch({ type: "SET_TARGET", entityId }),
    clearError: () => dispatch({ type: "SET_ERROR", error: null }),
  }), [send]);

  // Computed helpers
  const canControlEntity = useCallback((entityId: string) => {
    if (isGM) return true;
    return state.controlledEntityIds.includes(entityId);
  }, [isGM, state.controlledEntityIds]);

  const isMyTurn = useMemo(() => {
    if (!state.currentEntityId) return false;
    return canControlEntity(state.currentEntityId);
  }, [state.currentEntityId, canControlEntity]);

  const getEntity = useCallback((entityId: string) => {
    return state.entities[entityId];
  }, [state.entities]);

  const getEntityPosition = useCallback((entityId: string) => {
    return state.hexPositions[entityId];
  }, [state.hexPositions]);

  const getCurrentTurnEntity = useCallback(() => {
    if (!state.currentEntityId) return undefined;
    return state.entities[state.currentEntityId];
  }, [state.currentEntityId, state.entities]);

  const getInitiativeOrder = useCallback(() => {
    return state.initiative
      .map((entry) => ({
        ...state.entities[entry.entityId],
        initiativeRoll: entry.roll,
      }))
      .filter((e): e is CombatV2Entity & { initiativeRoll: number } => !!e.id);
  }, [state.initiative, state.entities]);

  const value: CombatContextValue = useMemo(() => ({
    state,
    actions,
    isGM,
    isMyTurn,
    canControlEntity,
    getEntity,
    getEntityPosition,
    getCurrentTurnEntity,
    getInitiativeOrder,
  }), [state, actions, isGM, isMyTurn, canControlEntity, getEntity, getEntityPosition, getCurrentTurnEntity, getInitiativeOrder]);

  return (
    <CombatContext.Provider value={value}>
      {children}
    </CombatContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export function useCombat() {
  const context = useContext(CombatContext);
  if (!context) {
    throw new Error("useCombat must be used within a CombatProvider");
  }
  return context;
}

export function useCombatState() {
  return useCombat().state;
}

export function useCombatActions() {
  return useCombat().actions;
}

export function useCurrentTurnEntity() {
  const { getCurrentTurnEntity } = useCombat();
  return getCurrentTurnEntity();
}

export function useIsMyTurn() {
  return useCombat().isMyTurn;
}
