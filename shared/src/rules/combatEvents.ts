/**
 * Combat Event Types
 *
 * Defines the WebSocket message protocol between client and server.
 * Server -> Client events are authoritative state updates.
 * Client -> Server messages are requests that the server validates.
 */

import {
  CombatState,
  CombatEntity,
  PendingAction,
  PendingReaction,
  CombatLogEntry,
  ActionType,
  ReactionType,
  GmOverrideType,
  DiceRoll,
  InitiativeMode,
  SkillContestRequest,
  SkillCheckRequest,
  ContestOutcome,
  RollData
} from "./combat";
import { WoundCounts, StatusKey } from "./wounds";

// ═══════════════════════════════════════════════════════════════════════════
// SERVER -> CLIENT EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Event type identifiers for server -> client messages
 */
export type ServerEventType =
  // State sync
  | "STATE_SYNC"
  | "COMBAT_STARTED"
  | "COMBAT_ENDED"

  // Turn management
  | "ROUND_STARTED"
  | "TURN_STARTED"
  | "TURN_ENDED"

  // Actions & Reactions
  | "ACTION_DECLARED"
  | "ACTION_REJECTED"
  | "ACTION_RESOLVED"
  | "REACTION_DECLARED"
  | "REACTION_REJECTED"
  | "REACTIONS_RESOLVED"

  // Resource changes
  | "ENTITY_UPDATED"
  | "WOUNDS_APPLIED"
  | "STATUS_APPLIED"
  | "STATUS_REMOVED"
  | "STATUS_TICK"

  // GM actions
  | "GM_OVERRIDE"
  | "INITIATIVE_MODIFIED"

  // Skill contests
  | "SKILL_CONTEST_INITIATED"
  | "SKILL_CONTEST_DEFENSE_REQUESTED"
  | "SKILL_CONTEST_RESOLVED"

  // Skill checks
  | "SKILL_CHECK_REQUESTED"
  | "SKILL_CHECK_ROLLED"

  // Entity management
  | "ENTITY_REMOVED"

  // Lobby events
  | "LOBBY_PLAYER_JOINED"
  | "LOBBY_PLAYER_LEFT"
  | "LOBBY_PLAYER_READY"
  | "LOBBY_STATE_SYNC";

// ─────────────────────────────────────────────────────────────────────────────
// State Sync Events
// ─────────────────────────────────────────────────────────────────────────────

export interface StateSyncPayload {
  state: CombatState;
}

export interface CombatStartedPayload {
  state: CombatState;
  initiativeMode: InitiativeMode;
}

export interface CombatEndedPayload {
  combatId: string;
  reason: "victory" | "defeat" | "gm_ended" | "abandoned";
  finalLog: CombatLogEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Turn Management Events
// ─────────────────────────────────────────────────────────────────────────────

export interface RoundStartedPayload {
  round: number;
  initiativeOrder: string[];
}

export interface TurnStartedPayload {
  entityId: string;
  entityName: string;
  round: number;
  turnIndex: number;
  apRestored: number;
}

export interface TurnEndedPayload {
  entityId: string;
  entityName: string;
  reason: "voluntary" | "no_ap" | "gm_override" | "incapacitated";
  energyGained: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Events
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionDeclaredPayload {
  action: PendingAction;
  phase: "active-turn" | "reaction-interrupt";
}

export interface ActionRejectedPayload {
  actionId?: string;
  reason: string;
  entityId: string;
}

export interface ActionResolvedPayload {
  action: PendingAction;
  success: boolean;
  effects: ActionEffect[];
  log: CombatLogEntry;
}

export interface ActionEffect {
  type: "damage" | "heal" | "status" | "movement" | "other";
  targetEntityId: string;
  data: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reaction Events
// ─────────────────────────────────────────────────────────────────────────────

export interface ReactionDeclaredPayload {
  reaction: PendingReaction;
  pendingReactionsCount: number;
}

export interface ReactionRejectedPayload {
  reactionId?: string;
  reason: string;
  entityId: string;
}

export interface ReactionsResolvedPayload {
  reactions: Array<{
    reaction: PendingReaction;
    success: boolean;
    effects: ActionEffect[];
  }>;
  actionModified: boolean;
  actionCancelled: boolean;
  log: CombatLogEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity Update Events
// ─────────────────────────────────────────────────────────────────────────────

export interface EntityUpdatedPayload {
  entityId: string;
  changes: Partial<CombatEntity>;
  reason: string;
}

export interface WoundsAppliedPayload {
  entityId: string;
  wounds: WoundCounts;
  source: "action" | "reaction" | "status_tick" | "gm_override";
  sourceEntityId?: string;
}

export interface StatusAppliedPayload {
  entityId: string;
  statusKey: StatusKey;
  stacks: number;
  duration: number | null;
  source: "action" | "reaction" | "gm_override";
  sourceEntityId?: string;
}

export interface StatusRemovedPayload {
  entityId: string;
  statusKey: StatusKey;
  reason: "expired" | "removed" | "gm_override";
}

export interface StatusTickPayload {
  entityId: string;
  statusKey: StatusKey;
  wounds?: WoundCounts;
  durationRemaining: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GM Override Events
// ─────────────────────────────────────────────────────────────────────────────

export interface GmOverridePayload {
  type: GmOverrideType;
  gmId: string;
  targetEntityId?: string;
  data?: Record<string, unknown>;
  reason?: string;
}

export interface InitiativeModifiedPayload {
  newOrder: string[];
  gmId: string;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill Contest Events
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillContestInitiatedPayload {
  contest: SkillContestRequest;
  initiatorName: string;
  targetName: string;
}

export interface SkillContestDefenseRequestedPayload {
  contestId: string;
  targetEntityId: string;
  targetPlayerId: string;
  initiatorName: string;
  initiatorSkill: string;
  initiatorTotal: number;
  suggestedDefenseSkill?: string;
}

export interface SkillContestResolvedPayload {
  contest: SkillContestRequest;
  outcome: ContestOutcome;
  initiatorName: string;
  targetName: string;
  audit: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill Check Events
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillCheckRequestedPayload {
  check: SkillCheckRequest;
  targetPlayerName: string;
  entityName: string;
  skill: string;
  targetNumber?: number;  // Only visible to GM
}

export interface SkillCheckRolledPayload {
  check: SkillCheckRequest;
  rollData: RollData;
  success?: boolean;  // Only if targetNumber was set
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity Management Events
// ─────────────────────────────────────────────────────────────────────────────

export interface EntityRemovedPayload {
  entityId: string;
  entityName: string;
  reason: "gm_removed" | "defeated" | "fled";
}

// ─────────────────────────────────────────────────────────────────────────────
// Lobby Events
// ─────────────────────────────────────────────────────────────────────────────

export interface LobbyPlayerState {
  userId: string;
  characterId?: string;
  isReady: boolean;
  joinedAt: string;
}

export interface LobbyState {
  campaignId: string;
  players: Record<string, LobbyPlayerState>;
  readyCount: number;
  totalCount: number;
}

export interface LobbyPlayerJoinedPayload {
  userId: string;
  characterId?: string;
  joinedAt: string;
  lobbyState: LobbyState;
}

export interface LobbyPlayerLeftPayload {
  userId: string;
  leftAt: string;
  lobbyState: LobbyState;
}

export interface LobbyPlayerReadyPayload {
  userId: string;
  isReady: boolean;
  characterId?: string;
  lobbyState: LobbyState;
}

export interface LobbyStateSyncPayload {
  lobbyState: LobbyState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Server Event Union Type
// ─────────────────────────────────────────────────────────────────────────────

export type ServerEvent =
  | { type: "STATE_SYNC"; payload: StateSyncPayload }
  | { type: "COMBAT_STARTED"; payload: CombatStartedPayload }
  | { type: "COMBAT_ENDED"; payload: CombatEndedPayload }
  | { type: "ROUND_STARTED"; payload: RoundStartedPayload }
  | { type: "TURN_STARTED"; payload: TurnStartedPayload }
  | { type: "TURN_ENDED"; payload: TurnEndedPayload }
  | { type: "ACTION_DECLARED"; payload: ActionDeclaredPayload }
  | { type: "ACTION_REJECTED"; payload: ActionRejectedPayload }
  | { type: "ACTION_RESOLVED"; payload: ActionResolvedPayload }
  | { type: "REACTION_DECLARED"; payload: ReactionDeclaredPayload }
  | { type: "REACTION_REJECTED"; payload: ReactionRejectedPayload }
  | { type: "REACTIONS_RESOLVED"; payload: ReactionsResolvedPayload }
  | { type: "ENTITY_UPDATED"; payload: EntityUpdatedPayload }
  | { type: "WOUNDS_APPLIED"; payload: WoundsAppliedPayload }
  | { type: "STATUS_APPLIED"; payload: StatusAppliedPayload }
  | { type: "STATUS_REMOVED"; payload: StatusRemovedPayload }
  | { type: "STATUS_TICK"; payload: StatusTickPayload }
  | { type: "GM_OVERRIDE"; payload: GmOverridePayload }
  | { type: "INITIATIVE_MODIFIED"; payload: InitiativeModifiedPayload }
  | { type: "SKILL_CONTEST_INITIATED"; payload: SkillContestInitiatedPayload }
  | { type: "SKILL_CONTEST_DEFENSE_REQUESTED"; payload: SkillContestDefenseRequestedPayload }
  | { type: "SKILL_CONTEST_RESOLVED"; payload: SkillContestResolvedPayload }
  | { type: "SKILL_CHECK_REQUESTED"; payload: SkillCheckRequestedPayload }
  | { type: "SKILL_CHECK_ROLLED"; payload: SkillCheckRolledPayload }
  | { type: "ENTITY_REMOVED"; payload: EntityRemovedPayload }
  | { type: "LOBBY_PLAYER_JOINED"; payload: LobbyPlayerJoinedPayload }
  | { type: "LOBBY_PLAYER_LEFT"; payload: LobbyPlayerLeftPayload }
  | { type: "LOBBY_PLAYER_READY"; payload: LobbyPlayerReadyPayload }
  | { type: "LOBBY_STATE_SYNC"; payload: LobbyStateSyncPayload };

/**
 * Full server message with metadata
 */
export interface ServerMessage {
  type: ServerEventType;
  payload: unknown;
  sequence: number;
  timestamp: string;
  combatId: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT -> SERVER MESSAGE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Message type identifiers for client -> server messages
 */
export type ClientMessageType =
  | "REQUEST_STATE"
  | "DECLARE_ACTION"
  | "DECLARE_REACTION"
  | "END_TURN"
  | "GM_OVERRIDE"
  | "GM_START_COMBAT"
  | "GM_END_COMBAT"
  | "GM_RESOLVE_REACTIONS"
  | "INITIATE_SKILL_CONTEST"
  | "RESPOND_SKILL_CONTEST"
  | "REQUEST_SKILL_CHECK"
  | "SUBMIT_SKILL_CHECK"
  | "REMOVE_ENTITY"
  | "LOBBY_JOIN"
  | "LOBBY_LEAVE"
  | "LOBBY_TOGGLE_READY";

// ─────────────────────────────────────────────────────────────────────────────
// Client Request Payloads
// ─────────────────────────────────────────────────────────────────────────────

export interface RequestStatePayload {
  // No data needed - just requesting current state
}

export interface DeclareActionPayload {
  entityId: string;
  type: ActionType;
  targetEntityId?: string;
  roll?: DiceRoll;
  apCost: number;
  energyCost: number;
  interruptible: boolean;
  metadata?: Record<string, unknown>;
}

export interface DeclareReactionPayload {
  entityId: string;
  type: ReactionType;
  targetActionId: string;
  skill?: string;
  roll?: DiceRoll;
  apCost: number;
  energyCost: number;
}

export interface EndTurnPayload {
  entityId: string;
  voluntary: boolean;  // True if player chose to end, false if forced (no AP)
}

export interface GmStartCombatPayload {
  initiativeMode: InitiativeMode;
  entityIds?: string[];  // Optional subset of entities to include
  entities?: Record<string, CombatEntity>;  // Full entity data for combat
}

export interface GmEndCombatPayload {
  reason: "victory" | "defeat" | "gm_ended";
}

export interface GmResolveReactionsPayload {
  // GM triggers resolution of pending reactions
  // No data needed
}

export interface GmOverrideRequestPayload {
  type: GmOverrideType;
  gmId: string;
  targetEntityId?: string;
  data?: Record<string, unknown>;
  reason?: string;
}

export interface InitiateSkillContestPayload {
  initiatorEntityId: string;
  targetEntityId: string;
  skill: string;
  roll: DiceRoll;
}

export interface RespondSkillContestPayload {
  contestId: string;
  entityId: string;
  skill: string;
  roll: DiceRoll;
}

export interface RequestSkillCheckPayload {
  targetPlayerId: string;
  targetEntityId: string;
  skill: string;
  targetNumber?: number;
}

export interface SubmitSkillCheckPayload {
  checkId: string;
  roll: DiceRoll;
}

export interface RemoveEntityPayload {
  entityId: string;
  reason?: "gm_removed" | "defeated" | "fled";
}

export interface LobbyJoinPayload {
  userId: string;
  characterId?: string;
}

export interface LobbyLeavePayload {
  userId: string;
}

export interface LobbyToggleReadyPayload {
  userId: string;
  isReady: boolean;
  characterId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client Message Union Type
// ─────────────────────────────────────────────────────────────────────────────

export type ClientMessage =
  | { type: "REQUEST_STATE"; payload: RequestStatePayload }
  | { type: "DECLARE_ACTION"; payload: DeclareActionPayload }
  | { type: "DECLARE_REACTION"; payload: DeclareReactionPayload }
  | { type: "END_TURN"; payload: EndTurnPayload }
  | { type: "GM_START_COMBAT"; payload: GmStartCombatPayload }
  | { type: "GM_END_COMBAT"; payload: GmEndCombatPayload }
  | { type: "GM_RESOLVE_REACTIONS"; payload: GmResolveReactionsPayload }
  | { type: "GM_OVERRIDE"; payload: GmOverrideRequestPayload }
  | { type: "INITIATE_SKILL_CONTEST"; payload: InitiateSkillContestPayload }
  | { type: "RESPOND_SKILL_CONTEST"; payload: RespondSkillContestPayload }
  | { type: "REQUEST_SKILL_CHECK"; payload: RequestSkillCheckPayload }
  | { type: "SUBMIT_SKILL_CHECK"; payload: SubmitSkillCheckPayload }
  | { type: "REMOVE_ENTITY"; payload: RemoveEntityPayload }
  | { type: "LOBBY_JOIN"; payload: LobbyJoinPayload }
  | { type: "LOBBY_LEAVE"; payload: LobbyLeavePayload }
  | { type: "LOBBY_TOGGLE_READY"; payload: LobbyToggleReadyPayload };

/**
 * Full client message with metadata
 */
export interface ClientRequest {
  type: ClientMessageType;
  payload: unknown;
  requestId: string;       // For request/response correlation
  senderId: string;        // Player or GM ID
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE GUARDS
// ═══════════════════════════════════════════════════════════════════════════

export function isServerEvent(message: unknown): message is ServerMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    "payload" in message &&
    "sequence" in message &&
    "timestamp" in message
  );
}

export function isClientRequest(message: unknown): message is ClientRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    "payload" in message &&
    "requestId" in message &&
    "senderId" in message
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a server message
 */
export function createServerMessage(
  type: ServerEventType,
  payload: unknown,
  sequence: number,
  combatId: string
): ServerMessage {
  return {
    type,
    payload,
    sequence,
    timestamp: new Date().toISOString(),
    combatId
  };
}

/**
 * Create a client request
 */
export function createClientRequest(
  type: ClientMessageType,
  payload: unknown,
  senderId: string
): ClientRequest {
  return {
    type,
    payload,
    requestId: crypto.randomUUID(),
    senderId,
    timestamp: new Date().toISOString()
  };
}
