/**
 * Authoritative Combat API Client
 *
 * Provides typed methods for interacting with the authoritative combat system
 * running on the Durable Object. All combat state mutations go through these
 * endpoints - the client is untrusted and the server validates all requests.
 */

import { ApiError } from "./client";

import type {
  CombatState,
  CombatEntity,
  CombatPhase,
  InitiativeMode,
  ActionType,
  ReactionType,
  GmOverrideType,
  DiceRoll,
  InitiativeEntry,
} from "@shared/rules/combat";

import type {
  StateSyncPayload,
  DeclareActionPayload,
  DeclareReactionPayload,
  GmStartCombatPayload,
  GmEndCombatPayload,
  GmOverrideRequestPayload,
  EndTurnPayload,
} from "@shared/rules/combatEvents";

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CombatActionResponse {
  ok: boolean;
  sequence?: number;
  state: CombatState;
  error?: string;
}

export interface CombatStartResponse extends CombatActionResponse {
  combatId: string;
  initiativeOrder: InitiativeEntry[];
}

export interface ActionDeclareResponse extends CombatActionResponse {
  actionId: string;
  phase: CombatPhase;
}

export interface ReactionDeclareResponse extends CombatActionResponse {
  reactionId: string;
  pendingReactionsCount: number;
}

export interface TurnEndResponse extends CombatActionResponse {
  nextEntityId: string | null;
  round: number;
  turnIndex: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST PAYLOAD TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface StartCombatParams {
  initiativeMode: InitiativeMode;
  manualInitiative?: boolean;
  entityIds?: string[];
  entities?: Record<string, CombatEntity>;
}

export interface SubmitInitiativeRollParams {
  entityId: string;
  roll: DiceRoll;
}

export interface DeclareActionParams {
  entityId: string;
  type: ActionType;
  targetEntityId?: string;
  roll?: DiceRoll;
  apCost: number;
  energyCost: number;
  interruptible?: boolean;
  metadata?: Record<string, unknown>;
}

export interface DeclareReactionParams {
  entityId: string;
  type: ReactionType;
  targetActionId: string;
  skill?: string;
  roll?: DiceRoll;
  apCost: number;
  energyCost: number;
}

export interface EndTurnParams {
  entityId: string;
  voluntary?: boolean;
}

export interface GmOverrideParams {
  type: GmOverrideType;
  gmId: string;
  targetEntityId?: string;
  data?: Record<string, unknown>;
  reason?: string;
}

export interface EndCombatParams {
  reason: "victory" | "defeat" | "gm_ended";
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP REQUEST HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the Worker URL for API connections.
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

/**
 * Post to the authoritative combat endpoints on the Durable Object
 */
async function postAuthoritativeCombatAction<T>(
  campaignId: string,
  action: string,
  payload: unknown
): Promise<T> {
  const baseUrl = getWorkerBaseUrl();
  const url = `${baseUrl}/api/campaigns/${encodeURIComponent(campaignId)}/combat/${action}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload ?? {}),
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof parsed === "object" &&
      parsed &&
      "error" in (parsed as Record<string, unknown>)
        ? String((parsed as Record<string, unknown>).error)
        : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, parsed);
  }

  return parsed as T;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBAT STATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the current authoritative combat state
 */
export async function getAuthoritativeState(
  campaignId: string
): Promise<CombatActionResponse> {
  return postAuthoritativeCombatAction<CombatActionResponse>(
    campaignId,
    "auth-state",
    {}
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBAT LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start a new combat encounter
 *
 * @param campaignId - The campaign ID
 * @param params - Combat initialization parameters
 * @returns The initial combat state with rolled initiative
 */
export async function startCombat(
  campaignId: string,
  params: StartCombatParams
): Promise<CombatStartResponse> {
  const payload: GmStartCombatPayload = {
    initiativeMode: params.initiativeMode,
    manualInitiative: params.manualInitiative,
    entityIds: params.entityIds,
    entities: params.entities,
  };
  return postAuthoritativeCombatAction<CombatStartResponse>(
    campaignId,
    "auth-start",
    payload
  );
}

/**
 * Submit an initiative roll for an entity
 *
 * @param campaignId - The campaign ID
 * @param params - Initiative roll parameters
 * @returns The updated combat state
 */
export async function submitInitiativeRoll(
  campaignId: string,
  params: SubmitInitiativeRollParams
): Promise<CombatActionResponse> {
  return postAuthoritativeCombatAction<CombatActionResponse>(
    campaignId,
    "auth-submit-initiative-roll",
    params
  );
}

/**
 * End the current combat encounter
 *
 * @param campaignId - The campaign ID
 * @param params - Combat end parameters
 * @returns The final combat state
 */
export async function endCombat(
  campaignId: string,
  params: EndCombatParams
): Promise<CombatActionResponse> {
  const payload: GmEndCombatPayload = {
    reason: params.reason,
  };
  return postAuthoritativeCombatAction<CombatActionResponse>(
    campaignId,
    "auth-end-combat",
    payload
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Declare an action during the active entity's turn
 *
 * The server will validate:
 * - It is the entity's turn
 * - The entity has sufficient AP and energy
 * - The action type is valid for the entity
 *
 * @param campaignId - The campaign ID
 * @param params - Action declaration parameters
 * @returns The action ID and updated state
 */
export async function declareAction(
  campaignId: string,
  params: DeclareActionParams
): Promise<ActionDeclareResponse> {
  const payload: DeclareActionPayload = {
    entityId: params.entityId,
    type: params.type,
    targetEntityId: params.targetEntityId,
    roll: params.roll,
    apCost: params.apCost,
    energyCost: params.energyCost,
    interruptible: params.interruptible ?? true,
    metadata: params.metadata,
  };
  return postAuthoritativeCombatAction<ActionDeclareResponse>(
    campaignId,
    "auth-declare-action",
    payload
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Declare a reaction to a pending action
 *
 * The server will validate:
 * - The entity has a reaction available
 * - The entity has sufficient AP and energy
 * - The target action exists and is interruptible
 *
 * @param campaignId - The campaign ID
 * @param params - Reaction declaration parameters
 * @returns The reaction ID and updated state
 */
export async function declareReaction(
  campaignId: string,
  params: DeclareReactionParams
): Promise<ReactionDeclareResponse> {
  const payload: DeclareReactionPayload = {
    entityId: params.entityId,
    type: params.type,
    targetActionId: params.targetActionId,
    skill: params.skill,
    roll: params.roll,
    apCost: params.apCost,
    energyCost: params.energyCost,
  };
  return postAuthoritativeCombatAction<ReactionDeclareResponse>(
    campaignId,
    "auth-declare-reaction",
    payload
  );
}

/**
 * Resolve all pending reactions (GM action)
 *
 * This triggers the resolution phase where reactions are processed
 * in initiative order and the original action is modified/resolved.
 *
 * @param campaignId - The campaign ID
 * @returns The updated state after all reactions are resolved
 */
export async function resolveReactions(
  campaignId: string
): Promise<CombatActionResponse> {
  return postAuthoritativeCombatAction<CombatActionResponse>(
    campaignId,
    "auth-resolve-reactions",
    {}
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TURN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * End the current entity's turn
 *
 * The server will validate:
 * - It is the entity's turn
 * - The entity is controlled by the requesting player (or is GM)
 *
 * @param campaignId - The campaign ID
 * @param params - Turn end parameters
 * @returns The updated state with next entity's turn started
 */
export async function endTurn(
  campaignId: string,
  params: EndTurnParams
): Promise<TurnEndResponse> {
  const payload: EndTurnPayload = {
    entityId: params.entityId,
    voluntary: params.voluntary ?? true,
  };
  return postAuthoritativeCombatAction<TurnEndResponse>(
    campaignId,
    "auth-end-turn",
    payload
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GM OVERRIDES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply a GM override to the combat state
 *
 * GM overrides are logged and can:
 * - Adjust entity resources (HP, AP, energy)
 * - Apply/remove status effects
 * - Skip turns or force turn changes
 * - Modify initiative order
 *
 * @param campaignId - The campaign ID
 * @param params - Override parameters
 * @returns The updated state after the override
 */
export async function gmOverride(
  campaignId: string,
  params: GmOverrideParams
): Promise<CombatActionResponse> {
  const payload: GmOverrideRequestPayload = {
    type: params.type,
    gmId: params.gmId,
    targetEntityId: params.targetEntityId,
    data: params.data,
    reason: params.reason,
  };
  return postAuthoritativeCombatAction<CombatActionResponse>(
    campaignId,
    "auth-gm-override",
    payload
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL CONTESTS
// ═══════════════════════════════════════════════════════════════════════════

export interface InitiateContestParams {
  initiatorEntityId: string;
  targetEntityId: string;
  skill: string;
  roll: DiceRoll;
}

export interface RespondContestParams {
  contestId: string;
  entityId: string;
  skill: string;
  roll: DiceRoll;
}

export interface RequestSkillCheckParams {
  targetPlayerId: string;
  targetEntityId: string;
  skill: string;
  targetNumber?: number;
}

export interface SubmitSkillCheckParams {
  checkId: string;
  roll: DiceRoll;
}

export interface RemoveEntityParams {
  entityId: string;
  reason?: "gm_removed" | "defeated" | "fled";
}

/**
 * Initiate a skill contest (attack) against another entity
 */
export async function initiateSkillContest(
  campaignId: string,
  params: InitiateContestParams
): Promise<CombatActionResponse> {
  return postAuthoritativeCombatAction<CombatActionResponse>(
    campaignId,
    "auth-initiate-skill-contest",
    params
  );
}

/**
 * Respond to a skill contest with a defensive roll
 */
export async function respondToSkillContest(
  campaignId: string,
  params: RespondContestParams
): Promise<CombatActionResponse> {
  return postAuthoritativeCombatAction<CombatActionResponse>(
    campaignId,
    "auth-respond-skill-contest",
    params
  );
}

/**
 * GM requests a skill check from a player
 */
export async function requestSkillCheck(
  campaignId: string,
  params: RequestSkillCheckParams
): Promise<CombatActionResponse> {
  return postAuthoritativeCombatAction<CombatActionResponse>(
    campaignId,
    "auth-request-skill-check",
    params
  );
}

/**
 * Player submits a skill check roll
 */
export async function submitSkillCheck(
  campaignId: string,
  params: SubmitSkillCheckParams
): Promise<CombatActionResponse> {
  return postAuthoritativeCombatAction<CombatActionResponse>(
    campaignId,
    "auth-submit-skill-check",
    params
  );
}

/**
 * GM removes an entity from combat
 */
export async function removeEntity(
  campaignId: string,
  params: RemoveEntityParams
): Promise<CombatActionResponse> {
  return postAuthoritativeCombatAction<CombatActionResponse>(
    campaignId,
    "auth-remove-entity",
    params
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if an entity can take an action based on current state
 */
export function canEntityAct(state: CombatState, entityId: string): boolean {
  if (state.phase !== "active-turn") return false;
  if (state.activeEntityId !== entityId) return false;

  const entity = state.entities[entityId];
  if (!entity) return false;

  return entity.ap.current > 0;
}

/**
 * Check if an entity can declare a reaction
 */
export function canEntityReact(
  state: CombatState,
  entityId: string
): boolean {
  // Can only react during reaction-interrupt or active-turn phases
  if (state.phase !== "reaction-interrupt" && state.phase !== "active-turn") {
    return false;
  }

  // Cannot react on own turn
  if (state.activeEntityId === entityId) return false;

  const entity = state.entities[entityId];
  if (!entity) return false;

  // Must have reaction available
  return entity.reaction.available;
}

/**
 * Get the active entity from combat state
 */
export function getActiveEntity(state: CombatState): CombatEntity | null {
  if (!state.activeEntityId) return null;
  return state.entities[state.activeEntityId] ?? null;
}

/**
 * Get entities sorted by initiative order
 */
export function getEntitiesInInitiativeOrder(
  state: CombatState
): CombatEntity[] {
  return state.initiativeOrder
    .map((id) => state.entities[id])
    .filter((e): e is CombatEntity => e !== undefined);
}

/**
 * Get entities by faction
 */
export function getEntitiesByFaction(
  state: CombatState,
  faction: string
): CombatEntity[] {
  return Object.values(state.entities).filter(
    (entity) => entity.faction === faction
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED API OBJECT
// ═══════════════════════════════════════════════════════════════════════════

export const combatApi = {
  // State
  getAuthoritativeState,

  // Combat lifecycle
  startCombat,
  endCombat,

  // Actions & Reactions
  declareAction,
  declareReaction,
  resolveReactions,

  // Turn management
  endTurn,

  // GM overrides
  gmOverride,

  // Skill contests
  initiateSkillContest,
  respondToSkillContest,
  requestSkillCheck,
  submitSkillCheck,
  removeEntity,

  // Utilities
  canEntityAct,
  canEntityReact,
  getActiveEntity,
  getEntitiesInInitiativeOrder,
  getEntitiesByFaction,
};
