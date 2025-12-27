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
  type GridPosition,
  type GridConfig,
  type MapConfig,
  type InitiativeEntry,
  type ClientMessageType,
  type SkillContestInitiatedPayload,
  type SkillContestResponseRequestedPayload,
  type SkillContestResolvedPayload,
  type PendingSkillContest,
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
  gridPositions: Record<string, GridPosition>;
  gridConfig: GridConfig;
  mapConfig: MapConfig;
  controlledEntityIds: string[];

  // Version for optimistic updates
  version: number;

  // UI state
  selectedEntityId: string | null;
  targetEntityId: string | null;
  pendingEndureRoll: { entityId: string; damage: number } | null;
  pendingDeathCheck: { entityId: string; damage: number } | null;
  lastError: string | null;

  // Skill contests
  pendingSkillContests: PendingSkillContest[];
  activeContest: SkillContestInitiatedPayload | null;
  lastContestResult: SkillContestResolvedPayload | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export type GmAddEntityPayload = {
  entity: Partial<CombatV2Entity> & { id: string; name: string };
  initiativeRoll?: number;
  initiativeTiebreaker?: number;
  initiativeTiming?: "immediate" | "end";
  combatId?: string;
  campaignId?: string;
};

type CombatAction =
  | { type: "SET_CONNECTION_STATUS"; status: ConnectionStatus; attempt?: number }
  | { type: "STATE_SYNC"; state: CombatV2State; controlledEntityIds: string[] }
  | { type: "COMBAT_STARTED"; combatId: string; campaignId?: string; phase?: CombatV2State["phase"] }
  | { type: "COMBAT_ENDED" }
  | { type: "ROUND_STARTED"; round: number }
  | { type: "TURN_STARTED"; entityId: string; turnIndex: number }
  | { type: "TURN_ENDED"; entityId: string; energyGained: number }
  | { type: "INITIATIVE_UPDATED"; initiative: InitiativeEntry[] }
  | { type: "ENTITY_ADDED"; entity: CombatV2Entity; position?: GridPosition; initiative?: InitiativeEntry[] }
  | { type: "ENTITY_REMOVED"; entityId: string; initiative?: InitiativeEntry[] }
  | { type: "ENTITY_UPDATED"; entityId: string; updates: Partial<CombatV2Entity> }
  | { type: "ENTITY_POSITION_UPDATED"; entityId: string; position: GridPosition }
  | { type: "GRID_CONFIG_UPDATED"; config: Partial<GridConfig> }
  | { type: "MAP_CONFIG_UPDATED"; config: Partial<MapConfig> }
  | { type: "SET_PENDING_ENDURE"; entityId: string; damage: number }
  | { type: "SET_PENDING_DEATH_CHECK"; entityId: string; damage: number }
  | { type: "CLEAR_PENDING_ROLLS" }
  | { type: "SELECT_ENTITY"; entityId: string | null }
  | { type: "SET_TARGET"; entityId: string | null }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "INCREMENT_VERSION" }
  | { type: "SKILL_CONTEST_INITIATED"; contest: SkillContestInitiatedPayload }
  | { type: "SKILL_CONTEST_RESPONSE_REQUESTED"; contest: PendingSkillContest }
  | { type: "SKILL_CONTEST_RESOLVED"; result: SkillContestResolvedPayload }
  | { type: "CLEAR_CONTEST" };

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
  gridPositions: {},
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
  controlledEntityIds: [],
  version: 0,
  selectedEntityId: null,
  targetEntityId: null,
  pendingEndureRoll: null,
  pendingDeathCheck: null,
  lastError: null,
  pendingSkillContests: [],
  activeContest: null,
  lastContestResult: null,
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
        gridPositions: action.state.gridPositions,
        gridConfig: action.state.gridConfig,
        mapConfig: action.state.mapConfig,
        controlledEntityIds: action.controlledEntityIds,
        version: action.state.version,
      };

    case "COMBAT_STARTED":
      return {
        ...state,
        combatId: action.combatId,
        campaignId: action.campaignId ?? state.campaignId,
        phase: action.phase ?? "initiative",
      };

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
      // Default energyGained to 0 if undefined to prevent NaN
      const gained = action.energyGained ?? 0;
      if (entity?.energy && gained > 0) {
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
                  entity.energy.current + gained
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

    case "ENTITY_ADDED":
      return {
        ...state,
        entities: {
          ...state.entities,
          [action.entity.id]: action.entity,
        },
        gridPositions: action.position
          ? {
              ...state.gridPositions,
              [action.entity.id]: action.position,
            }
          : state.gridPositions,
        initiative: action.initiative ?? state.initiative,
        version: state.version + 1,
      };

    case "ENTITY_REMOVED": {
      const { [action.entityId]: _removed, ...rest } = state.entities;
      const { [action.entityId]: _removedPos, ...remainingPositions } = state.gridPositions;
      return {
        ...state,
        entities: rest,
        gridPositions: remainingPositions,
        initiative: action.initiative ?? state.initiative,
        version: state.version + 1,
      };
    }

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
        gridPositions: {
          ...state.gridPositions,
          [action.entityId]: action.position,
        },
        version: state.version + 1,
      };

    case "GRID_CONFIG_UPDATED":
      return {
        ...state,
        gridConfig: {
          ...state.gridConfig,
          ...action.config,
        },
        version: state.version + 1,
      };

    case "MAP_CONFIG_UPDATED":
      return {
        ...state,
        mapConfig: {
          ...state.mapConfig,
          ...action.config,
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

    case "SKILL_CONTEST_INITIATED":
      return {
        ...state,
        activeContest: action.contest,
        lastContestResult: null,
      };

    case "SKILL_CONTEST_RESPONSE_REQUESTED":
      return {
        ...state,
        pendingSkillContests: [...state.pendingSkillContests, action.contest],
      };

    case "SKILL_CONTEST_RESOLVED":
      return {
        ...state,
        activeContest: null,
        pendingSkillContests: state.pendingSkillContests.filter(
          (c) => c.contestId !== action.result.contestId
        ),
        lastContestResult: action.result,
      };

    case "CLEAR_CONTEST":
      return {
        ...state,
        activeContest: null,
        lastContestResult: null,
      };

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
  declareMovement: (entityId: string, targetRow: number, targetCol: number, path?: GridPosition[]) => void;

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
  gmMoveEntity: (
    entityId: string,
    targetRow: number,
    targetCol: number,
    options?: { force?: boolean; ignoreApCost?: boolean }
  ) => void;
  gmApplyDamage: (entityId: string, damage: number, damageType: string) => void;
  gmModifyResources: (entityId: string, ap?: number, energy?: number) => void;
  gmAddEntity: (payload: GmAddEntityPayload) => void;
  gmRemoveEntity: (entityId: string) => void;
  gmUpdateMapConfig: (config: Partial<MapConfig>) => void;
  gmUpdateGridConfig: (config: Partial<GridConfig>) => void;

  // UI actions
  selectEntity: (entityId: string | null) => void;
  setTarget: (entityId: string | null) => void;
  clearError: () => void;

  // Skill contests
  initiateSkillContest: (params: {
    initiatorEntityId: string;
    targetEntityId?: string;
    targetPlayerId?: string;
    skill: string;
    skillModifier: number;
    diceCount: number;
    keepHighest: boolean;
    rawRolls?: number[];
    selectedRoll?: number;
  }) => void;
  respondToSkillContest: (params: {
    contestId: string;
    entityId: string;
    skill: string;
    skillModifier: number;
    diceCount: number;
    keepHighest: boolean;
    rawRolls?: number[];
    selectedRoll?: number;
  }) => void;
  clearContest: () => void;

  // Attack contests (attacks as skill contests)
  initiateAttackContest: (params: {
    initiatorEntityId: string;
    targetEntityId: string;
    targetPlayerId?: string;
    skill: string;
    skillModifier: number;
    diceCount: number;
    keepHighest: boolean;
    baseDamage: number;
    damageType: string;
    physicalAttribute: number;
    apCost: number;
    energyCost: number;
    rawRolls?: number[];
    selectedRoll?: number;
  }) => void;
}

export interface CombatContextValue {
  state: CombatContextState;
  actions: CombatContextActions;
  isGM: boolean;

  // Computed helpers
  isMyTurn: boolean;
  canControlEntity: (entityId: string) => boolean;
  getEntity: (entityId: string) => CombatV2Entity | undefined;
  getEntityPosition: (entityId: string) => GridPosition | undefined;
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
          dispatch({
            type: "COMBAT_STARTED",
            combatId: payload.combatId,
            campaignId: payload.campaignId,
            phase: payload.phase,
          });
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
          if (Array.isArray(payload.initiative)) {
            dispatch({ type: "INITIATIVE_UPDATED", initiative: payload.initiative });
            return;
          }
        },
        onEntityUpdated: (payload) => {
          if (payload.action === "removed" && payload.entityId) {
            dispatch({ type: "ENTITY_REMOVED", entityId: payload.entityId, initiative: payload.initiative });
            return;
          }

          if (payload.action === "added" && payload.entity) {
            dispatch({
              type: "ENTITY_ADDED",
              entity: payload.entity,
              position: payload.gridPosition,
              initiative: payload.initiative,
            });
            return;
          }

          if (payload.entity && payload.entity.id) {
            dispatch({
              type: "ENTITY_UPDATED",
              entityId: payload.entity.id,
              updates: payload.entity,
            });
            return;
          }
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
          // Update target's energy and wounds
          dispatch({
            type: "ENTITY_UPDATED",
            entityId: payload.targetId,
            updates: {
              energy: { current: payload.targetEnergy, max: state.entities[payload.targetId]?.energy?.max ?? 100 },
              wounds: payload.targetWounds,
            },
          });
          // Update attacker's AP and energy
          dispatch({
            type: "ENTITY_UPDATED",
            entityId: payload.attackerId,
            updates: {
              ap: { current: payload.attackerAp, max: state.entities[payload.attackerId]?.ap?.max ?? 6 },
              energy: { current: payload.attackerEnergy, max: state.entities[payload.attackerId]?.energy?.max ?? 100 },
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
        onSkillContestInitiated: (payload) => {
          dispatch({ type: "SKILL_CONTEST_INITIATED", contest: payload });
        },
        onSkillContestResponseRequested: (payload) => {
          dispatch({
            type: "SKILL_CONTEST_RESPONSE_REQUESTED",
            contest: {
              contestId: payload.contestId,
              initiatorEntityId: payload.initiatorEntityId,
              initiatorName: payload.initiatorName,
              initiatorSkill: payload.initiatorSkill,
              initiatorTotal: payload.initiatorTotal,
              targetEntityId: payload.targetEntityId,
            },
          });
        },
        onSkillContestResolved: (payload) => {
          dispatch({ type: "SKILL_CONTEST_RESOLVED", result: payload });
        },
        onAttackContestInitiated: (payload) => {
          // Attack contests use the same UI as skill contests
          dispatch({ type: "SKILL_CONTEST_INITIATED", contest: payload });
        },
        onAttackContestResolved: (payload) => {
          dispatch({ type: "SKILL_CONTEST_RESOLVED", result: payload });

          // If this was an attack that hit, update the target entity
          if (payload.attack && payload.attack.hit && payload.defenderEntityId) {
            dispatch({
              type: "ENTITY_UPDATED",
              entityId: payload.defenderEntityId,
              updates: {
                energy: {
                  current: payload.attack.targetEnergy,
                  max: state.entities[payload.defenderEntityId]?.energy?.max ?? 100,
                },
                wounds: payload.attack.targetWounds,
              },
            });
          }
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

    declareMovement: (entityId, targetRow, targetCol, path) =>
      send("DECLARE_MOVEMENT", { entityId, targetRow, targetCol, path }),

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
    gmMoveEntity: (entityId, targetRow, targetCol, options) =>
      send("GM_MOVE_ENTITY", { entityId, targetRow, targetCol, ...options }),
    gmApplyDamage: (entityId, damage, damageType) =>
      send("GM_APPLY_DAMAGE", { entityId, damage, damageType }),
    gmModifyResources: (entityId, ap, energy) =>
      send("GM_MODIFY_RESOURCES", { entityId, ap, energy }),
    gmAddEntity: (payload) => send("GM_ADD_ENTITY", payload),
    gmRemoveEntity: (entityId) => send("GM_REMOVE_ENTITY", { entityId }),
    gmUpdateMapConfig: (config) => send("UPDATE_MAP_CONFIG", config),
    gmUpdateGridConfig: (config) => send("UPDATE_GRID_CONFIG", config),

    selectEntity: (entityId) => dispatch({ type: "SELECT_ENTITY", entityId }),
    setTarget: (entityId) => dispatch({ type: "SET_TARGET", entityId }),
    clearError: () => dispatch({ type: "SET_ERROR", error: null }),

    initiateSkillContest: (params) => send("INITIATE_SKILL_CONTEST", params),
    respondToSkillContest: (params) => send("RESPOND_SKILL_CONTEST", params),
    clearContest: () => dispatch({ type: "CLEAR_CONTEST" }),

    initiateAttackContest: (params) => send("INITIATE_ATTACK_CONTEST", params),
  }), [send]);

  // Computed helpers
  const canControlEntity = useCallback((entityId: string) => {
    if (isGM) return true;
    const entity = state.entities[entityId];
    if (entity?.controller) {
      return entity.controller === `player:${playerId}`;
    }
    return state.controlledEntityIds.includes(entityId);
  }, [isGM, playerId, state.controlledEntityIds, state.entities]);

  const isMyTurn = useMemo(() => {
    if (!state.currentEntityId) return false;
    return canControlEntity(state.currentEntityId);
  }, [state.currentEntityId, canControlEntity]);

  const getEntity = useCallback((entityId: string) => {
    return state.entities[entityId];
  }, [state.entities]);

  const getEntityPosition = useCallback((entityId: string) => {
    return state.gridPositions[entityId];
  }, [state.gridPositions]);

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
