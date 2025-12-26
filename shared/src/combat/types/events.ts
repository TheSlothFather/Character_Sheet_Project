/**
 * Combat V2 - WebSocket Event Types
 *
 * Complete message protocol for client-server communication.
 */

import type { CombatState, LobbyState, ContestOutcome, SkillContestRequest, SkillCheckRequest } from "./state";
import type { CombatEntity, HexPosition, WoundCounts, StatusEffect } from "./entity";
import type { CombatAction, RollData, ActionCost } from "./actions";
import type { ChannelingProgress, BlowbackResult, IntensityThresholds } from "./channeling";
import type { DamageType, DamageResult, CriticalTier } from "./damage";

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT -> SERVER MESSAGE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ClientMessageType =
  // Presence
  | "PRESENCE"
  | "REQUEST_STATE"

  // Lobby
  | "LOBBY_JOIN"
  | "LOBBY_LEAVE"
  | "LOBBY_TOGGLE_READY"

  // Combat Lifecycle
  | "START_COMBAT"
  | "END_COMBAT"

  // Initiative
  | "SUBMIT_INITIATIVE_ROLL"

  // Turn Actions
  | "DECLARE_MOVEMENT"
  | "DECLARE_ATTACK"
  | "DECLARE_ABILITY"
  | "DECLARE_ITEM"
  | "END_TURN"

  // Ildakar Channeling
  | "START_CHANNELING"
  | "CONTINUE_CHANNELING"
  | "RELEASE_SPELL"
  | "ABORT_CHANNELING"

  // Reactions
  | "DECLARE_REACTION"

  // Endure/Death Rolls
  | "SUBMIT_ENDURE_ROLL"
  | "SUBMIT_DEATH_CHECK"

  // Skill Contests & Checks
  | "INITIATE_CONTEST"
  | "RESPOND_CONTEST"
  | "REQUEST_SKILL_CHECK"
  | "SUBMIT_SKILL_CHECK"

  // GM Overrides
  | "GM_OVERRIDE"
  | "GM_MOVE_ENTITY"
  | "GM_APPLY_DAMAGE"
  | "GM_HEAL_ENTITY"
  | "GM_ADD_STATUS"
  | "GM_REMOVE_STATUS"
  | "GM_MODIFY_WOUNDS"
  | "GM_REMOVE_ENTITY"
  | "GM_FORCE_INITIATIVE"
  | "GM_SET_PHASE"
  | "GM_ADJUST_RESOURCES";

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT MESSAGE PAYLOADS
// ═══════════════════════════════════════════════════════════════════════════

export interface ClientPresencePayload {
  userId: string;
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

export interface StartCombatPayload {
  initiativeMode: "individual" | "group";
  combatants: CombatEntity[];
  gridConfig?: {
    width: number;
    height: number;
    terrain?: Record<string, { type: string; movementCost: number }>;
  };
}

export interface EndCombatPayload {
  gmId: string;
  reason: "victory" | "defeat" | "gm_ended" | "abandoned";
}

export interface InitiativeRollPayload {
  entityId: string;
  playerId: string;
  roll: RollData;
}

export interface MovementPayload {
  entityId: string;
  senderId: string;
  targetHex: HexPosition;
  pathHexes: HexPosition[];
}

export interface AttackPayload {
  entityId: string;
  senderId: string;
  targetEntityId: string;
  weaponCategory: string;
  attackSkill: string;
  abilityKey?: string;
  roll: RollData;
}

export interface AbilityPayload {
  entityId: string;
  senderId: string;
  abilityKey: string;
  abilityType: "psionic" | "divine" | "martial";
  targetEntityId?: string;
  targetHex?: HexPosition;
  roll?: RollData;
  cost: ActionCost;
}

export interface ItemPayload {
  entityId: string;
  senderId: string;
  itemKey: string;
  targetEntityId?: string;
}

export interface EndTurnPayload {
  entityId: string;
  senderId: string;
}

export interface StartChannelingPayload {
  entityId: string;
  senderId: string;
  spellTemplateId: string;
  spellName: string;
  damageType?: DamageType;
  requiredEnergy: number;
  requiredAP: number;
  intensity: number;
  channelAmount: { ap: number; energy: number };
}

export interface ContinueChannelingPayload {
  entityId: string;
  senderId: string;
  channelAmount: { ap: number; energy: number };
}

export interface ReleaseSpellPayload {
  entityId: string;
  senderId: string;
  targetEntityId?: string;
  targetHex?: HexPosition;
}

export interface AbortChannelingPayload {
  entityId: string;
  senderId: string;
}

export interface ReactionPayload {
  entityId: string;
  senderId: string;
  reactionType: "parry" | "dodge" | "counterspell" | "opportunity" | "counter" | "other";
  targetActionId: string;
  skill?: string;
  roll?: RollData;
  cost: ActionCost;
}

export interface EndureRollPayload {
  entityId: string;
  senderId: string;
  roll: RollData;
}

export interface DeathCheckPayload {
  entityId: string;
  senderId: string;
  roll: RollData;
}

export interface InitiateContestPayload {
  initiatorEntityId: string;
  targetEntityId: string;
  skill: string;
  gmCanResolve: boolean;
  roll: RollData;
}

export interface RespondContestPayload {
  contestId: string;
  entityId: string;
  skill: string;
  roll: RollData;
}

export interface RequestSkillCheckPayload {
  targetPlayerId: string;
  targetEntityId: string;
  skill: string;
  targetNumber?: number;
  gmCanResolve: boolean;
  diceCount?: number;
  keepHighest?: boolean;
}

export interface SubmitSkillCheckPayload {
  checkId: string;
  roll: RollData;
}

// GM Override Payloads
export interface GmOverridePayload {
  gmId: string;
  type: string;
  targetEntityId?: string;
  data?: Record<string, unknown>;
  reason?: string;
}

export interface GmMoveEntityPayload {
  gmId: string;
  entityId: string;
  targetHex: HexPosition;
}

export interface GmApplyDamagePayload {
  gmId: string;
  entityId: string;
  amount: number;
  damageType: DamageType;
}

export interface GmHealEntityPayload {
  gmId: string;
  entityId: string;
  energyAmount?: number;
  woundsToHeal?: Partial<WoundCounts>;
}

export interface GmAddStatusPayload {
  gmId: string;
  entityId: string;
  statusKey: string;
  stacks: number;
  duration: number | null;
}

export interface GmRemoveStatusPayload {
  gmId: string;
  entityId: string;
  statusKey: string;
}

export interface GmModifyWoundsPayload {
  gmId: string;
  entityId: string;
  wounds: Partial<WoundCounts>;
  mode: "set" | "add" | "subtract";
}

export interface GmRemoveEntityPayload {
  gmId: string;
  entityId: string;
  reason: string;
}

export interface GmAdjustResourcesPayload {
  gmId: string;
  entityId: string;
  resource: "energy" | "ap";
  delta: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT MESSAGE (Union)
// ═══════════════════════════════════════════════════════════════════════════

export interface ClientMessage<T extends ClientMessageType = ClientMessageType> {
  type: T;
  payload: unknown;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVER -> CLIENT EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ServerEventType =
  // Connection
  | "WELCOME"
  | "PRESENCE_UPDATE"

  // State Sync
  | "STATE_SYNC"
  | "LOBBY_STATE_SYNC"

  // Lobby
  | "LOBBY_PLAYER_JOINED"
  | "LOBBY_PLAYER_LEFT"
  | "LOBBY_PLAYER_READY"

  // Combat Lifecycle
  | "COMBAT_STARTED"
  | "COMBAT_ENDED"

  // Initiative
  | "INITIATIVE_ROLL_REQUIRED"
  | "INITIATIVE_ROLL_RECEIVED"
  | "INITIATIVE_COMPLETE"

  // Turn Flow
  | "ROUND_STARTED"
  | "TURN_STARTED"
  | "TURN_ENDED"

  // Movement
  | "MOVEMENT_EXECUTED"

  // Actions
  | "ATTACK_DECLARED"
  | "ATTACK_RESOLVED"
  | "ABILITY_DECLARED"
  | "ABILITY_RESOLVED"
  | "ITEM_USED"

  // Channeling
  | "CHANNELING_STARTED"
  | "CHANNELING_CONTINUED"
  | "SPELL_RELEASED"
  | "CHANNELING_INTERRUPTED"
  | "BLOWBACK_APPLIED"

  // Reactions
  | "REACTION_WINDOW_OPENED"
  | "REACTION_DECLARED"
  | "REACTIONS_RESOLVED"

  // Damage/Effects
  | "DAMAGE_APPLIED"
  | "WOUNDS_INFLICTED"
  | "STATUS_APPLIED"
  | "STATUS_REMOVED"
  | "STATUS_TICK"

  // Energy/Death
  | "ENERGY_DEPLETED"
  | "ENDURE_ROLL_REQUIRED"
  | "ENDURE_ROLL_RESULT"
  | "UNCONSCIOUS"
  | "DEATH_CHECK_REQUIRED"
  | "DEATH_CHECK_RESULT"
  | "ENTITY_DIED"
  | "ENTITY_REMOVED"

  // Skill Contests/Checks
  | "CONTEST_INITIATED"
  | "CONTEST_DEFENSE_REQUIRED"
  | "CONTEST_RESOLVED"
  | "SKILL_CHECK_REQUESTED"
  | "SKILL_CHECK_RESULT"

  // GM
  | "GM_OVERRIDE_APPLIED"

  // Errors
  | "ACTION_REJECTED"
  | "ERROR";

// ═══════════════════════════════════════════════════════════════════════════
// SERVER EVENT PAYLOADS
// ═══════════════════════════════════════════════════════════════════════════

export interface WelcomePayload {
  connectionId: string;
  presence: Record<string, string>;
  sequence: number;
}

export interface PresenceUpdatePayload {
  action: "join" | "update" | "leave";
  connectionId: string;
  userId: string;
  total: number;
}

export interface StateSyncPayload {
  state: CombatState;
}

export interface LobbySyncPayload {
  lobbyState: LobbyState;
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

export interface CombatStartedPayload {
  state: CombatState;
  initiativeMode: "individual" | "group";
}

export interface CombatEndedPayload {
  combatId: string;
  reason: "victory" | "defeat" | "gm_ended" | "abandoned";
  finalLog: CombatState["log"];
  state: CombatState;
}

export interface InitiativeRollRequiredPayload {
  entityId: string;
  playerId: string;
  skillToUse: string;
}

export interface InitiativeRollReceivedPayload {
  entityId: string;
  playerId: string;
  roll: RollData;
}

export interface InitiativeCompletePayload {
  initiativeOrder: string[];
  rollResults: Record<string, RollData>;
}

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
  unspentAP: number;
}

export interface MovementExecutedPayload {
  entityId: string;
  fromHex: HexPosition;
  toHex: HexPosition;
  pathHexes: HexPosition[];
  apSpent: number;
  state: CombatState;
}

export interface AttackDeclaredPayload {
  action: CombatAction;
  state: CombatState;
}

export interface AttackResolvedPayload {
  action: CombatAction;
  success: boolean;
  damageResult?: DamageResult;
  state: CombatState;
}

export interface ChannelingStartedPayload {
  entityId: string;
  spellName: string;
  progress: ChannelingProgress;
  thresholds: IntensityThresholds;
  state: CombatState;
}

export interface ChannelingContinuedPayload {
  entityId: string;
  progress: ChannelingProgress;
  thresholds: IntensityThresholds;
  state: CombatState;
}

export interface SpellReleasedPayload {
  entityId: string;
  spellName: string;
  finalIntensity: number;
  targetEntityId?: string;
  targetHex?: HexPosition;
  effects: unknown[];
  state: CombatState;
}

export interface ChannelingInterruptedPayload {
  entityId: string;
  spellName: string;
  reason: "damage" | "stun" | "abort" | "death";
  blowback: BlowbackResult;
  state: CombatState;
}

export interface BlowbackAppliedPayload {
  entityId: string;
  blowback: BlowbackResult;
  newWounds: WoundCounts;
  newEnergy: number;
  state: CombatState;
}

export interface ReactionWindowOpenedPayload {
  action: CombatAction;
  eligibleEntities: string[];
  timeoutSeconds?: number;
}

export interface ReactionDeclaredPayload {
  reactionId: string;
  entityId: string;
  reactionType: string;
  targetActionId: string;
  pendingReactionsCount: number;
  state: CombatState;
}

export interface ReactionsResolvedPayload {
  reactions: Array<{
    reactionId: string;
    entityId: string;
    success: boolean;
    effects: unknown[];
  }>;
  action: CombatAction;
  actionCancelled: boolean;
  actionModified: boolean;
  state: CombatState;
}

export interface DamageAppliedPayload {
  entityId: string;
  result: DamageResult;
  sourceEntityId: string;
  sourceAbility?: string;
  state: CombatState;
}

export interface WoundsInflictedPayload {
  entityId: string;
  wounds: Partial<WoundCounts>;
  source: string;
  sourceEntityId?: string;
  newTotalWounds: WoundCounts;
  state: CombatState;
}

export interface StatusAppliedPayload {
  entityId: string;
  status: StatusEffect;
  source: string;
  sourceEntityId?: string;
  state: CombatState;
}

export interface StatusRemovedPayload {
  entityId: string;
  statusKey: string;
  reason: "expired" | "cured" | "gm_removed";
  state: CombatState;
}

export interface StatusTickPayload {
  entityId: string;
  statusKey: string;
  woundType?: DamageType;
  woundCount?: number;
  state: CombatState;
}

export interface EnergyDepletedPayload {
  entityId: string;
  reason: "own_action" | "damage";
  requiresEndureRoll: boolean;
  state: CombatState;
}

export interface EndureRollRequiredPayload {
  entityId: string;
  playerId: string;
  reason: "own_action" | "damage";
}

export interface EndureRollResultPayload {
  entityId: string;
  roll: RollData;
  success: boolean;
  becameUnconscious: boolean;
  state: CombatState;
}

export interface UnconsciousPayload {
  entityId: string;
  entityName: string;
  state: CombatState;
}

export interface DeathCheckRequiredPayload {
  entityId: string;
  playerId: string;
  damageSource: string;
}

export interface DeathCheckResultPayload {
  entityId: string;
  roll: RollData;
  success: boolean;
  entityDied: boolean;
  state: CombatState;
}

export interface EntityDiedPayload {
  entityId: string;
  entityName: string;
  killedBy?: string;
  state: CombatState;
}

export interface EntityRemovedPayload {
  entityId: string;
  entityName: string;
  reason: string;
  state: CombatState;
}

export interface ContestInitiatedPayload {
  contest: SkillContestRequest;
  initiatorName: string;
  targetName: string;
}

export interface ContestDefenseRequiredPayload {
  contestId: string;
  targetEntityId: string;
  targetPlayerId: string;
  initiatorName: string;
  initiatorSkill: string;
  initiatorTotal: number;
  suggestedDefenseSkill?: string;
}

export interface ContestResolvedPayload {
  contest: SkillContestRequest;
  outcome: ContestOutcome;
  initiatorName: string;
  targetName: string;
  audit: string;
  state: CombatState;
}

export interface SkillCheckRequestedPayload {
  check: SkillCheckRequest;
  targetPlayerName: string;
  entityName: string;
  skill: string;
  targetNumber?: number;
}

export interface SkillCheckResultPayload {
  check: SkillCheckRequest;
  rollData: RollData;
  success?: boolean;
  state: CombatState;
}

export interface GmOverrideAppliedPayload {
  type: string;
  gmId: string;
  targetEntityId?: string;
  data?: Record<string, unknown>;
  reason?: string;
  state: CombatState;
}

export interface ActionRejectedPayload {
  entityId?: string;
  reason: string;
  actionType?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVER EVENT (Union)
// ═══════════════════════════════════════════════════════════════════════════

export interface ServerEvent<T extends ServerEventType = ServerEventType> {
  type: T;
  campaignId: string;
  sequence: number;
  timestamp: string;
  payload: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE-SAFE EVENT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function createServerEvent<T extends ServerEventType>(
  type: T,
  campaignId: string,
  sequence: number,
  payload: unknown
): ServerEvent<T> {
  return {
    type,
    campaignId,
    sequence,
    timestamp: new Date().toISOString(),
    payload,
  };
}

export function createClientMessage<T extends ClientMessageType>(
  type: T,
  payload: unknown
): ClientMessage<T> {
  return {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
}
