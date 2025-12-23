/**
 * Authoritative Combat System - Cloudflare Durable Object
 *
 * This Durable Object is the ONLY authority for combat state.
 * All clients are untrusted - validation happens server-side.
 *
 * Combat phases: setup -> initiative -> active-turn <-> reaction-interrupt -> resolution -> completed
 */

interface Env {
  CAMPAIGN_DO: DurableObjectNamespace;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORS HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate CORS headers for cross-origin requests
 * Allows requests from production, preview deployments, and localhost
 */
function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin");

  const allowedOrigins = [
    "https://character-sheet-project.pages.dev",
    "http://localhost:5173",
  ];

  const isAllowed = origin && (
    allowedOrigins.some(allowed => origin === allowed || origin.startsWith(allowed)) ||
    /^https:\/\/[a-z0-9-]+\.character-sheet-project\.pages\.dev$/.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/.test(origin)
  );

  if (isAllowed) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Upgrade, Connection",
      "Access-Control-Max-Age": "86400",
      "Access-Control-Allow-Credentials": "true",
    };
  }

  return {};
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTHORITATIVE COMBAT TYPES (inline for Cloudflare Worker compatibility)
// ═══════════════════════════════════════════════════════════════════════════

type WoundType = "blunt" | "burn" | "freeze" | "laceration" | "mental" | "necrosis" | "spiritual";
type WoundCounts = Partial<Record<WoundType, number>>;
type StatusKey = string; // Allowing dynamic status keys

type CombatPhase =
  | "setup"
  | "initiative"
  | "active-turn"
  | "reaction-interrupt"
  | "resolution"
  | "completed";

type EntityController = "gm" | `player:${string}`;
type EntityFaction = "ally" | "enemy";
type InitiativeMode = "individual" | "group";
type ActionType = "attack" | "spell" | "ability" | "movement" | "item" | "other";
type ReactionType = "parry" | "dodge" | "counterspell" | "opportunity" | "other";

type CombatLogType =
  | "combat_started"
  | "combat_ended"
  | "round_started"
  | "turn_started"
  | "turn_ended"
  | "action_declared"
  | "action_resolved"
  | "action_cancelled"
  | "reaction_declared"
  | "reaction_resolved"
  | "wounds_applied"
  | "status_applied"
  | "status_removed"
  | "status_tick"
  | "resources_updated"
  | "gm_override";

type GmOverrideType =
  | "modify_initiative"
  | "adjust_ap"
  | "adjust_energy"
  | "force_reaction"
  | "cancel_reaction"
  | "skip_entity"
  | "end_turn"
  | "add_status"
  | "remove_status"
  | "modify_wounds"
  | "set_phase"
  | "end_combat";

interface CombatStatusEffect {
  key: StatusKey;
  stacks: number;
  duration: number | null;
  tickDamage?: { woundType: WoundType; amount: number };
}

interface CombatEntity {
  id: string;
  name: string;
  controller: EntityController;
  faction: EntityFaction;
  skills: Record<string, number>;
  initiativeSkill: string;
  energy: { current: number; max: number };
  ap: { current: number; max: number };
  tier: number;
  reaction: { available: boolean };
  statusEffects: CombatStatusEffect[];
  wounds: WoundCounts;
  alive: boolean;
  bestiaryEntryId?: string;
}

interface InitiativeEntry {
  entityId: string;
  roll: number;
  skillValue: number;
  currentEnergy: number;
  groupId?: string;
}

interface RollData {
  skill: string;
  modifier: number;
  diceCount: number;
  keepHighest: boolean;
  rawDice: number[];
  selectedDie: number;
  total: number;
  audit: string;
}

interface PendingAction {
  actionId: string;
  type: ActionType;
  sourceEntityId: string;
  targetEntityId?: string;
  rollData?: RollData;
  apCost: number;
  energyCost: number;
  interruptible: boolean;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface ReactionEffect {
  type: "cancel_action" | "modify_action" | "apply_wounds" | "apply_status" | "reduce_damage";
  targetEntityId: string;
  data?: {
    wounds?: WoundCounts;
    statusKey?: StatusKey;
    statusStacks?: number;
    statusDuration?: number;
    damageReduction?: number;
  };
}

interface PendingReaction {
  reactionId: string;
  entityId: string;
  type: ReactionType;
  targetActionId: string;
  skill?: string;
  rollData?: RollData;
  apCost: number;
  energyCost: number;
  timestamp: string;
  effects?: ReactionEffect[];
}

interface CombatLogEntry {
  id: string;
  timestamp: string;
  type: CombatLogType;
  sourceEntityId?: string;
  targetEntityId?: string;
  data?: Record<string, unknown>;
}

interface PlayerCombatState {
  playerId: string;
  connectionId: string;
  controlledEntities: string[];
  connected: boolean;
  lastSeen: string;
}

interface AuthoritativeCombatState {
  combatId: string;
  campaignId: string;
  phase: CombatPhase;
  round: number;
  turnIndex: number;
  initiativeOrder: string[];
  activeEntityId: string | null;
  initiativeMode: InitiativeMode;
  initiativeRolls: Record<string, InitiativeEntry>;
  entities: Record<string, CombatEntity>;
  grid: { allies: string[]; enemies: string[] };
  players: Record<string, PlayerCombatState>;
  pendingAction: PendingAction | null;
  pendingReactions: PendingReaction[];
  log: CombatLogEntry[];
  version: number;
  startedAt: string;
  lastUpdatedAt: string;
}

interface GmOverride {
  type: GmOverrideType;
  gmId: string;
  targetEntityId?: string;
  data?: Record<string, unknown>;
  reason?: string;
  timestamp: string;
}

// Legacy types for backward compatibility
type LegacyCombatEventType =
  | "combat_started"
  | "turn_started"
  | "turn_ended"
  | "combat_updated"
  | "ambush_applied"
  | "ambush_resolved"
  | "status_tick"
  | "reaction_spent"
  | "action_spent";

type LegacyCombatEventLogEntry = {
  id: string;
  type: LegacyCombatEventType;
  timestamp: string;
  payload?: unknown;
};

type LegacyCombatState = {
  round: number;
  turnIndex: number;
  initiativeOrder: string[];
  activeCombatantId: string | null;
  ambushRoundFlags: Record<string, boolean>;
  actionPointsById: Record<string, number>;
  actionPointsMaxById: Record<string, number>;
  energyById: Record<string, number>;
  statusEffectsById: Record<string, string[]>;
  woundsById: Record<string, number>;
  reactionsUsedById: Record<string, number>;
  eventLog: LegacyCombatEventLogEntry[];
};

// Server event types for WebSocket broadcast
type ServerEventType =
  | "STATE_SYNC"
  | "COMBAT_STARTED"
  | "COMBAT_ENDED"
  | "ROUND_STARTED"
  | "TURN_STARTED"
  | "TURN_ENDED"
  | "ACTION_DECLARED"
  | "ACTION_REJECTED"
  | "ACTION_RESOLVED"
  | "REACTION_DECLARED"
  | "REACTION_REJECTED"
  | "REACTIONS_RESOLVED"
  | "ENTITY_UPDATED"
  | "WOUNDS_APPLIED"
  | "STATUS_APPLIED"
  | "STATUS_REMOVED"
  | "STATUS_TICK"
  | "GM_OVERRIDE"
  | "INITIATIVE_MODIFIED";

type CampaignEvent = {
  type: "roll" | "contest" | "presence" | "welcome" | LegacyCombatEventType | ServerEventType;
  sequence?: number;
  campaignId: string;
  timestamp: string;
  payload?: unknown;
};

type PresenceEntry = {
  connectionId: string;
  userId: string;
  connectedAt: string;
};

type StoredPresence = {
  userId: string;
  connectedAt: string;
};

type RollRequestPayload = {
  playerId: string;
  playerName?: string;
  modifier?: number;
  label?: string;
  skill?: string;
  requestId?: string;
};

type CombatantStartPayload = {
  id: string;
  initiative?: number;
  initiativeRoll?: number;
  initiativeBonus?: number;
  actionPoints?: number;
  energy?: number;
  statusEffects?: string[];
  wounds?: number;
  ambushed?: boolean;
  groupId?: string;
};

type CombatStartPayload = {
  combatants: CombatantStartPayload[];
  groupInitiative: boolean;
  ambushedIds?: string[];
};

type CombatAdvancePayload = {
  statusEffectsById?: Record<string, string[]>;
};

type CombatAmbushPayload = {
  combatantId?: string;
};

type CombatSpendPayload = {
  combatantId: string;
  actionPointCost: number;
  energyCost: number;
  actionType?: string;
  targetId?: string;
  rollResults?: unknown;
  metadata?: unknown;
};

type CombatReactionPayload = {
  combatantId: string;
  actionPointCost: number;
  reactionType?: string;
  metadata?: unknown;
};

type ContestSelectionPayload = {
  requestId: string;
  gmId: string;
  gmName?: string;
  npcName?: string;
  npcModifier?: number;
  contestId?: string;
};

type RollRequestRecord = {
  id: string;
  campaignId: string;
  playerId: string;
  playerName?: string;
  modifier: number;
  roll: number;
  total: number;
  label?: string;
  skill?: string;
  createdAt: string;
  status: "pending" | "contested";
  contestId?: string;
};

type ContestRecord = {
  id: string;
  campaignId: string;
  requestId: string;
  gmId: string;
  gmName?: string;
  npcName?: string;
  npcModifier: number;
  npcRoll: number;
  npcTotal: number;
  playerRoll: number;
  playerModifier: number;
  playerTotal: number;
  outcome: "player" | "npc" | "tie";
  createdAt: string;
};

export class CampaignDurableObject {
  private state: DurableObjectState;
  private env: Env;
  private sessions = new Map<string, WebSocket>();
  private presence = new Map<string, StoredPresence>();
  private sequence = 0;
  private ready: Promise<void>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const storedSequence = await this.state.storage.get<number>("sequence");
      if (typeof storedSequence === "number") {
        this.sequence = storedSequence;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;

    // Handle CORS preflight requests FIRST
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request),
      });
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/(connect|roll|contest)$/);
    const combatMatch = url.pathname.match(
      /^\/api\/campaigns\/([^/]+)\/combat\/([^/]+)$/,
    );
    if (!match && !combatMatch) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    const campaignId = decodeURIComponent((match ?? combatMatch)![1]);
    const action = (match ?? combatMatch)![2];

    // Handle WebSocket upgrades (before POST check)
    if (action === "connect") {
      return this.handleConnect(request, campaignId);
    }

    // Now check POST requirement for other endpoints
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, { Allow: "POST" }, request);
    }

    const body = await readJsonBody(request);
    if (body instanceof Response) {
      return body;
    }

    if (action === "roll") {
      return this.handleRollRequest(campaignId, body, request);
    }

    if (action === "contest") {
      return this.handleContestRequest(campaignId, body, request);
    }

    if (combatMatch) {
      return this.handleCombatAction(campaignId, action, body, request);
    }

    return jsonResponse({ error: "Not found" }, 404, {}, request);
  }

  private async handleConnect(request: Request, campaignId: string): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return jsonResponse({ error: "Expected WebSocket upgrade" }, 426, {}, request);
    }

    const url = new URL(request.url);
    const connectionId = crypto.randomUUID();
    const userId = url.searchParams.get("user") ?? connectionId;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    this.sessions.set(connectionId, server);
    this.presence.set(connectionId, {
      userId,
      connectedAt: new Date().toISOString(),
    });

    server.addEventListener("message", (event) => {
      this.handleClientMessage(connectionId, campaignId, event.data);
    });

    server.addEventListener("close", () => {
      this.handleDisconnect(connectionId, campaignId);
    });

    server.addEventListener("error", () => {
      this.handleDisconnect(connectionId, campaignId);
    });

    const welcomePayload: CampaignEvent = {
      type: "welcome",
      campaignId,
      timestamp: new Date().toISOString(),
      payload: {
        connectionId,
        presence: this.currentPresence(),
        sequence: this.sequence,
      },
    };
    server.send(JSON.stringify(welcomePayload));

    this.broadcast({
      type: "presence",
      campaignId,
      timestamp: new Date().toISOString(),
      payload: {
        action: "join",
        ...this.serializePresence(connectionId),
        total: this.presence.size,
      },
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: getCorsHeaders(request),
    });
  }

  private handleClientMessage(connectionId: string, campaignId: string, data: unknown) {
    if (typeof data !== "string") {
      return;
    }

    let payload: { type?: string; userId?: string } | undefined;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }

    if (payload?.type === "presence" && payload.userId) {
      const current = this.presence.get(connectionId);
      if (!current || current.userId === payload.userId) {
        return;
      }

      this.presence.set(connectionId, { ...current, userId: payload.userId });
      this.broadcast({
        type: "presence",
        campaignId,
        timestamp: new Date().toISOString(),
        payload: {
          action: "update",
          ...this.serializePresence(connectionId),
          total: this.presence.size,
        },
      });
    }
  }

  private handleDisconnect(connectionId: string, campaignId: string) {
    if (!this.sessions.has(connectionId)) {
      return;
    }

    this.sessions.delete(connectionId);
    const presenceEntry = this.serializePresence(connectionId);
    this.presence.delete(connectionId);

    this.broadcast({
      type: "presence",
      campaignId,
      timestamp: new Date().toISOString(),
      payload: {
        action: "leave",
        ...presenceEntry,
        total: this.presence.size,
      },
    });
  }

  private async nextSequence() {
    const next = this.sequence + 1;
    this.sequence = next;
    await this.state.storage.put("sequence", next);
    return next;
  }

  private combatStateKey(campaignId: string) {
    return `combat_state:${campaignId}`;
  }

  private async loadCombatState(campaignId: string): Promise<CombatState | null> {
    return this.state.blockConcurrencyWhile(async () => {
      return this.state.storage.get<CombatState>(this.combatStateKey(campaignId));
    });
  }

  private async saveCombatState(campaignId: string, combatState: CombatState): Promise<number> {
    return this.state.blockConcurrencyWhile(async () => {
      const next = this.sequence + 1;
      this.sequence = next;
      await this.state.storage.put({
        [this.combatStateKey(campaignId)]: combatState,
        sequence: next,
      });
      return next;
    });
  }

  private async broadcastCombatEvent(
    campaignId: string,
    type: CombatEventType,
    payload?: unknown,
  ) {
    const sequence = await this.saveCombatStateSequence();
    this.broadcast({
      type,
      campaignId,
      sequence,
      timestamp: new Date().toISOString(),
      payload,
    });
  }

  private async saveCombatStateSequence(): Promise<number> {
    return this.state.blockConcurrencyWhile(async () => {
      const next = this.sequence + 1;
      this.sequence = next;
      await this.state.storage.put("sequence", next);
      return next;
    });
  }

  private async handleRollRequest(campaignId: string, body: unknown, request: Request): Promise<Response> {
    const parsed = parseRollRequest(body);
    if (parsed instanceof Response) {
      return parsed;
    }

    const requestId = parsed.requestId ?? crypto.randomUUID();
    const roll = rollD100();
    const modifier = parsed.modifier ?? 0;
    const total = roll + modifier;
    const createdAt = new Date().toISOString();

    const record: RollRequestRecord = {
      id: requestId,
      campaignId,
      playerId: parsed.playerId,
      playerName: parsed.playerName,
      modifier,
      roll,
      total,
      label: parsed.label,
      skill: parsed.skill,
      createdAt,
      status: "pending",
    };

    const persistenceError = await this.persistSupabase(
      "roll_requests",
      mapRollRequestForSupabase(record),
      { upsert: true },
    );
    if (persistenceError) {
      return persistenceError;
    }

    await this.state.storage.put(this.rollRequestKey(requestId), record);

    const sequence = await this.nextSequence();
    const event: CampaignEvent = {
      type: "roll",
      campaignId,
      sequence,
      timestamp: createdAt,
      payload: { request: record },
    };

    this.broadcast(event);

    return jsonResponse({ ok: true, sequence, request: record }, 200, {}, request);
  }

  private async handleContestRequest(campaignId: string, body: unknown, request: Request): Promise<Response> {
    const parsed = parseContestSelection(body);
    if (parsed instanceof Response) {
      return parsed;
    }

    const requestKey = this.rollRequestKey(parsed.requestId);
    const rollRequest = await this.state.storage.get<RollRequestRecord>(requestKey);
    if (!rollRequest) {
      return jsonResponse({ error: "Roll request not found." }, 404, {}, request);
    }

    const contestId = parsed.contestId ?? crypto.randomUUID();
    const npcRoll = rollD100();
    const npcModifier = parsed.npcModifier ?? 0;
    const npcTotal = npcRoll + npcModifier;
    const createdAt = new Date().toISOString();
    const outcome =
      rollRequest.total === npcTotal ? "tie" : rollRequest.total > npcTotal ? "player" : "npc";

    const contest: ContestRecord = {
      id: contestId,
      campaignId,
      requestId: rollRequest.id,
      gmId: parsed.gmId,
      gmName: parsed.gmName,
      npcName: parsed.npcName,
      npcModifier,
      npcRoll,
      npcTotal,
      playerRoll: rollRequest.roll,
      playerModifier: rollRequest.modifier,
      playerTotal: rollRequest.total,
      outcome,
      createdAt,
    };

    const updatedRequest: RollRequestRecord = {
      ...rollRequest,
      status: "contested",
      contestId,
    };

    const persistenceError = await this.persistSupabase(
      "roll_contests",
      mapContestForSupabase(contest),
      { upsert: true },
    );
    if (persistenceError) {
      return persistenceError;
    }

    const requestUpdateError = await this.persistSupabase(
      "roll_requests",
      mapRollRequestForSupabase(updatedRequest),
      { upsert: true },
    );
    if (requestUpdateError) {
      return requestUpdateError;
    }

    await this.state.storage.put(requestKey, updatedRequest);
    await this.state.storage.put(this.rollContestKey(contestId), contest);

    const sequence = await this.nextSequence();
    const event: CampaignEvent = {
      type: "contest",
      campaignId,
      sequence,
      timestamp: createdAt,
      payload: { request: updatedRequest, contest },
    };

    this.broadcast(event);

    return jsonResponse({ ok: true, sequence, contest }, 200, {}, request);
  }

  private async handleCombatAction(
    campaignId: string,
    action: string,
    body: unknown,
    request: Request,
  ): Promise<Response> {
    switch (action) {
      // ═══════════════════════════════════════════════════════════════════════
      // AUTHORITATIVE COMBAT SYSTEM (new)
      // ═══════════════════════════════════════════════════════════════════════
      case "auth-state":
        return this.handleAuthoritativeState(campaignId, request);
      case "auth-start":
        return this.handleAuthoritativeStart(campaignId, body, request);
      case "auth-declare-action":
        return this.handleDeclareAction(campaignId, body, request);
      case "auth-declare-reaction":
        return this.handleDeclareReaction(campaignId, body, request);
      case "auth-resolve-reactions":
        return this.handleResolveReactions(campaignId, body, request);
      case "auth-end-turn":
        return this.handleAuthoritativeEndTurn(campaignId, body, request);
      case "auth-gm-override":
        return this.handleGmOverride(campaignId, body, request);
      case "auth-end-combat":
        return this.handleEndCombat(campaignId, body, request);

      // ═══════════════════════════════════════════════════════════════════════
      // LEGACY COMBAT SYSTEM (preserved for backward compatibility)
      // ═══════════════════════════════════════════════════════════════════════
      case "state":
        return this.handleCombatState(campaignId, request);
      case "start":
        return this.handleCombatStart(campaignId, body, request);
      case "advance":
      case "advance-turn":
        return this.handleCombatAdvance(campaignId, body, request);
      case "resolve-ambush":
        return this.handleCombatAmbush(campaignId, body, request);
      case "spend":
        return this.handleCombatSpend(campaignId, body, request);
      case "reaction":
        return this.handleCombatReaction(campaignId, body, request);
      default:
        return jsonResponse({ error: "Not found" }, 404, {}, request);
    }
  }

  private async handleCombatState(campaignId: string, request: Request): Promise<Response> {
    const combatState = await this.loadCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }

    return jsonResponse({ ok: true, sequence: this.sequence, state: combatState }, 200, {}, request);
  }

  private async handleCombatAmbush(campaignId: string, body: unknown, request: Request): Promise<Response> {
    const parsed = parseCombatAmbush(body);
    if (parsed instanceof Response) {
      return parsed;
    }

    const combatState = await this.loadCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }

    const targetId = parsed.combatantId ?? combatState.activeCombatantId;
    if (!targetId) {
      return jsonResponse({ error: "Combatant not available for ambush resolution." }, 400, {}, request);
    }

    const hadAmbushPenalty = combatState.ambushRoundFlags[targetId] ?? false;
    if (hadAmbushPenalty) {
      combatState.ambushRoundFlags[targetId] = false;
    }

    const ambushEntry = createCombatEventLogEntry("ambush_resolved", {
      combatantId: targetId,
      hadAmbushPenalty,
    });
    combatState.eventLog.push(ambushEntry);

    const sequence = await this.saveCombatState(campaignId, combatState);
    this.broadcast({
      type: "ambush_resolved",
      campaignId,
      sequence,
      timestamp: ambushEntry.timestamp,
      payload: { state: combatState, combatantId: targetId, hadAmbushPenalty },
    });

    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }

  private async handleCombatStart(campaignId: string, body: unknown, request: Request): Promise<Response> {
    const parsed = parseCombatStart(body);
    if (parsed instanceof Response) {
      return parsed;
    }

    let combatants = parsed.combatants;
    if (combatants.length === 0) {
      const loaded = await this.loadCombatantsFromSupabase(campaignId);
      if (loaded instanceof Response) {
        return loaded;
      }
      combatants = loaded;
    }

    if (combatants.length === 0) {
      return jsonResponse({ error: "No combatants available to start combat." }, 400, {}, request);
    }

    const ambushedSet = new Set(parsed.ambushedIds ?? []);
    const initiativeScores = new Map<string, number>();
    const groupScores = new Map<string, number>();

    combatants.forEach((combatant) => {
      const score =
        (combatant.initiative ?? 0) +
        (combatant.initiativeRoll ?? 0) +
        (combatant.initiativeBonus ?? 0);
      initiativeScores.set(combatant.id, score);
      if (parsed.groupInitiative) {
        const groupKey = combatant.groupId ?? combatant.id;
        const current = groupScores.get(groupKey);
        if (current == null || score > current) {
          groupScores.set(groupKey, score);
        }
      }
    });

    const initiativeOrder = [...combatants]
      .sort((left, right) => {
        const leftScore = parsed.groupInitiative
          ? groupScores.get(left.groupId ?? left.id) ?? 0
          : initiativeScores.get(left.id) ?? 0;
        const rightScore = parsed.groupInitiative
          ? groupScores.get(right.groupId ?? right.id) ?? 0
          : initiativeScores.get(right.id) ?? 0;
        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }
        const leftTie = initiativeScores.get(left.id) ?? 0;
        const rightTie = initiativeScores.get(right.id) ?? 0;
        if (leftTie !== rightTie) {
          return rightTie - leftTie;
        }
        return left.id.localeCompare(right.id);
      })
      .map((combatant) => combatant.id);

    const now = new Date().toISOString();
    const combatState: CombatState = {
      round: 1,
      turnIndex: 0,
      initiativeOrder,
      activeCombatantId: initiativeOrder[0] ?? null,
      ambushRoundFlags: {},
      actionPointsById: {},
      actionPointsMaxById: {},
      energyById: {},
      statusEffectsById: {},
      woundsById: {},
      reactionsUsedById: {},
      eventLog: [],
    };

    for (const combatant of combatants) {
      const id = combatant.id;
      const actionPoints = combatant.actionPoints ?? 0;
      combatState.actionPointsById[id] = actionPoints;
      combatState.actionPointsMaxById[id] = actionPoints;
      combatState.energyById[id] = combatant.energy ?? 0;
      combatState.statusEffectsById[id] = combatant.statusEffects ?? [];
      combatState.woundsById[id] = combatant.wounds ?? 0;
      combatState.reactionsUsedById[id] = 0;
      if (combatant.ambushed || ambushedSet.has(id)) {
        combatState.ambushRoundFlags[id] = true;
      }
    }

    const startedEntry = createCombatEventLogEntry("combat_started", {
      initiativeOrder,
      groupInitiative: parsed.groupInitiative,
    });
    combatState.eventLog.push(startedEntry);

    if (combatState.activeCombatantId) {
      combatState.eventLog.push(
        createCombatEventLogEntry("turn_started", {
          combatantId: combatState.activeCombatantId,
          round: combatState.round,
          turnIndex: combatState.turnIndex,
        }),
      );
    }

    const sequence = await this.saveCombatState(campaignId, combatState);
    this.broadcast({
      type: "combat_started",
      campaignId,
      sequence,
      timestamp: now,
      payload: { state: combatState },
    });

    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }

  private async handleCombatAdvance(campaignId: string, body: unknown, request: Request): Promise<Response> {
    const parsed = parseCombatAdvance(body);
    if (parsed instanceof Response) {
      return parsed;
    }

    const combatState = await this.loadCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }

    const now = new Date().toISOString();
    const previousCombatantId = combatState.activeCombatantId;

    if (parsed.statusEffectsById) {
      for (const [combatantId, statusEffects] of Object.entries(parsed.statusEffectsById)) {
        combatState.statusEffectsById[combatantId] = statusEffects;
      }
    }

    if (previousCombatantId) {
      combatState.eventLog.push(
        createCombatEventLogEntry("turn_ended", {
          combatantId: previousCombatantId,
          round: combatState.round,
          turnIndex: combatState.turnIndex,
        }),
      );
    }

    combatState.eventLog.push(
      createCombatEventLogEntry("status_tick", {
        combatantId: previousCombatantId,
        updatedStatusEffects: parsed.statusEffectsById ?? null,
      }),
    );

    const hadAmbushPenalty = Boolean(
      previousCombatantId != null &&
        combatState.round === 1 &&
        combatState.ambushRoundFlags[previousCombatantId],
    );
    if (previousCombatantId && hadAmbushPenalty) {
      combatState.ambushRoundFlags[previousCombatantId] = false;
      combatState.eventLog.push(
        createCombatEventLogEntry("ambush_applied", {
          skippedCombatants: [previousCombatantId],
        }),
      );
    }

    const order = combatState.initiativeOrder;
    let nextIndex = combatState.turnIndex + 1;
    let nextRound = combatState.round;
    if (order.length === 0) {
      combatState.turnIndex = 0;
      combatState.activeCombatantId = null;
    } else {
      if (nextIndex >= order.length) {
        nextIndex = 0;
        nextRound += 1;
      }
      combatState.turnIndex = nextIndex;
      combatState.round = nextRound;
      combatState.activeCombatantId = order[nextIndex] ?? null;
    }

    if (combatState.activeCombatantId) {
      const activeId = combatState.activeCombatantId;
      const maxActionPoints = combatState.actionPointsMaxById[activeId];
      if (typeof maxActionPoints === "number") {
        combatState.actionPointsById[activeId] = maxActionPoints;
      }
      combatState.eventLog.push(
        createCombatEventLogEntry("turn_started", {
          combatantId: activeId,
          round: combatState.round,
          turnIndex: combatState.turnIndex,
        }),
      );
    }

    const sequence = await this.saveCombatState(campaignId, combatState);
    this.broadcast({
      type: "turn_started",
      campaignId,
      sequence,
      timestamp: now,
      payload: {
        state: combatState,
        previousCombatantId,
        ambushCleared: hadAmbushPenalty,
      },
    });

    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }

  private async handleCombatSpend(campaignId: string, body: unknown, request: Request): Promise<Response> {
    const parsed = parseCombatSpend(body);
    if (parsed instanceof Response) {
      return parsed;
    }

    if (parsed.actionPointCost < 0) {
      return jsonResponse({ error: "Action point costs must be non-negative." }, 400, {}, request);
    }

    const combatState = await this.loadCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }

    const currentAp = combatState.actionPointsById[parsed.combatantId] ?? 0;
    const nextAp = currentAp - parsed.actionPointCost;
    if (nextAp < 0) {
      return jsonResponse({ error: "Insufficient action points." }, 400, {}, request);
    }

    const currentEnergy = combatState.energyById[parsed.combatantId] ?? 0;
    const nextEnergy = currentEnergy - parsed.energyCost;
    if (nextEnergy < 0) {
      return jsonResponse({ error: "Insufficient energy." }, 400, {}, request);
    }

    combatState.actionPointsById[parsed.combatantId] = nextAp;
    combatState.energyById[parsed.combatantId] = nextEnergy;

    const actionEntry = createCombatEventLogEntry("action_spent", {
      combatantId: parsed.combatantId,
      actionPointCost: parsed.actionPointCost,
      energyCost: parsed.energyCost,
      actionType: parsed.actionType,
      targetId: parsed.targetId,
      rollResults: parsed.rollResults ?? null,
      metadata: parsed.metadata ?? null,
    });
    combatState.eventLog.push(actionEntry);

    const sequence = await this.saveCombatState(campaignId, combatState);
    this.broadcast({
      type: "action_spent",
      campaignId,
      sequence,
      timestamp: actionEntry.timestamp,
      payload: { state: combatState, action: actionEntry.payload },
    });

    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }

  private async handleCombatReaction(campaignId: string, body: unknown, request: Request): Promise<Response> {
    const parsed = parseCombatReaction(body);
    if (parsed instanceof Response) {
      return parsed;
    }

    if (parsed.actionPointCost < 0) {
      return jsonResponse({ error: "Costs must be non-negative." }, 400, {}, request);
    }

    const combatState = await this.loadCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }

    const currentAp = combatState.actionPointsById[parsed.combatantId] ?? 0;
    const nextAp = currentAp - parsed.actionPointCost;
    if (nextAp < 0) {
      return jsonResponse({ error: "Insufficient action points." }, 400, {}, request);
    }

    combatState.actionPointsById[parsed.combatantId] = nextAp;
    combatState.reactionsUsedById[parsed.combatantId] =
      (combatState.reactionsUsedById[parsed.combatantId] ?? 0) + 1;

    const reactionEntry = createCombatEventLogEntry("reaction_spent", {
      combatantId: parsed.combatantId,
      actionPointCost: parsed.actionPointCost,
      reactionType: parsed.reactionType,
      metadata: parsed.metadata ?? null,
    });
    combatState.eventLog.push(reactionEntry);

    const sequence = await this.saveCombatState(campaignId, combatState);
    this.broadcast({
      type: "reaction_spent",
      campaignId,
      sequence,
      timestamp: reactionEntry.timestamp,
      payload: { state: combatState, reaction: reactionEntry.payload },
    });

    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHORITATIVE COMBAT SYSTEM HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  private authCombatStateKey(campaignId: string): string {
    return `auth_combat_state:${campaignId}`;
  }

  private async loadAuthCombatState(campaignId: string): Promise<AuthoritativeCombatState | null> {
    return this.state.blockConcurrencyWhile(async () => {
      return this.state.storage.get<AuthoritativeCombatState>(this.authCombatStateKey(campaignId));
    });
  }

  private async saveAuthCombatState(
    campaignId: string,
    combatState: AuthoritativeCombatState
  ): Promise<number> {
    return this.state.blockConcurrencyWhile(async () => {
      const next = this.sequence + 1;
      this.sequence = next;
      combatState.version = next;
      combatState.lastUpdatedAt = new Date().toISOString();
      await this.state.storage.put({
        [this.authCombatStateKey(campaignId)]: combatState,
        sequence: next,
      });
      return next;
    });
  }

  private broadcastAuthEvent(
    type: ServerEventType,
    campaignId: string,
    sequence: number,
    payload: unknown
  ): void {
    this.broadcast({
      type,
      campaignId,
      sequence,
      timestamp: new Date().toISOString(),
      payload,
    });
  }

  private createAuthLogEntry(
    type: CombatLogType,
    sourceEntityId?: string,
    targetEntityId?: string,
    data?: Record<string, unknown>
  ): CombatLogEntry {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      sourceEntityId,
      targetEntityId,
      data,
    };
  }

  // Validation: Check if entity can take an action
  private validateAction(
    state: AuthoritativeCombatState,
    entityId: string,
    senderId: string,
    apCost: number,
    energyCost: number
  ): { allowed: boolean; reason?: string } {
    if (state.phase !== "active-turn") {
      return { allowed: false, reason: "Not in active-turn phase" };
    }

    if (state.activeEntityId !== entityId) {
      return { allowed: false, reason: "Not your turn" };
    }

    const entity = state.entities[entityId];
    if (!entity) {
      return { allowed: false, reason: "Entity not found" };
    }

    if (!entity.alive) {
      return { allowed: false, reason: "Entity is not alive" };
    }

    // Check controller matches (GM can control any entity)
    const isGm = senderId === "gm" || senderId.startsWith("gm:");
    if (!isGm && entity.controller !== senderId && entity.controller !== `player:${senderId}`) {
      return { allowed: false, reason: "You do not control this entity" };
    }

    if (entity.ap.current < apCost) {
      return { allowed: false, reason: `Insufficient AP (have ${entity.ap.current}, need ${apCost})` };
    }

    if (entity.energy.current < energyCost) {
      return { allowed: false, reason: `Insufficient energy (have ${entity.energy.current}, need ${energyCost})` };
    }

    return { allowed: true };
  }

  // Validation: Check if entity can declare a reaction
  private validateReaction(
    state: AuthoritativeCombatState,
    entityId: string,
    senderId: string
  ): { allowed: boolean; reason?: string } {
    const entity = state.entities[entityId];

    if (!entity) {
      return { allowed: false, reason: "Entity not found" };
    }

    if (!entity.alive) {
      return { allowed: false, reason: "Entity is not alive" };
    }

    if (!entity.reaction.available) {
      return { allowed: false, reason: "Reaction already used this round" };
    }

    if (state.activeEntityId === entityId) {
      return { allowed: false, reason: "Cannot react during your own turn" };
    }

    if (state.phase !== "active-turn" && state.phase !== "reaction-interrupt") {
      return { allowed: false, reason: "Cannot declare reactions in current phase" };
    }

    if (!state.pendingAction) {
      return { allowed: false, reason: "No pending action to react to" };
    }

    if (!state.pendingAction.interruptible) {
      return { allowed: false, reason: "Pending action cannot be interrupted" };
    }

    // Check controller matches (GM can control any entity)
    const isGm = senderId === "gm" || senderId.startsWith("gm:");
    if (!isGm && entity.controller !== senderId && entity.controller !== `player:${senderId}`) {
      return { allowed: false, reason: "You do not control this entity" };
    }

    return { allowed: true };
  }

  // Sort initiative with tiebreakers
  private sortInitiative(entries: InitiativeEntry[]): string[] {
    return [...entries]
      .sort((a, b) => {
        if (a.roll !== b.roll) return b.roll - a.roll;
        if (a.skillValue !== b.skillValue) return b.skillValue - a.skillValue;
        if (a.currentEnergy !== b.currentEnergy) return b.currentEnergy - a.currentEnergy;
        return a.entityId.localeCompare(b.entityId);
      })
      .map(e => e.entityId);
  }

  // Sort initiative with group mode
  private sortGroupInitiative(
    entries: InitiativeEntry[],
    entities: Record<string, CombatEntity>
  ): string[] {
    const groups: Record<EntityFaction, InitiativeEntry[]> = { ally: [], enemy: [] };

    for (const entry of entries) {
      const entity = entities[entry.entityId];
      if (entity) {
        groups[entity.faction].push(entry);
      }
    }

    const groupBests: { faction: EntityFaction; bestEntry: InitiativeEntry }[] = [];

    for (const [faction, factionEntries] of Object.entries(groups) as [EntityFaction, InitiativeEntry[]][]) {
      if (factionEntries.length === 0) continue;
      const sorted = this.sortInitiative(factionEntries);
      const bestEntry = factionEntries.find(e => e.entityId === sorted[0])!;
      groupBests.push({ faction, bestEntry });
    }

    groupBests.sort((a, b) => {
      const aE = a.bestEntry;
      const bE = b.bestEntry;
      if (aE.roll !== bE.roll) return bE.roll - aE.roll;
      if (aE.skillValue !== bE.skillValue) return bE.skillValue - aE.skillValue;
      if (aE.currentEnergy !== bE.currentEnergy) return bE.currentEnergy - aE.currentEnergy;
      return aE.entityId.localeCompare(bE.entityId);
    });

    const result: string[] = [];
    for (const { faction } of groupBests) {
      result.push(...this.sortInitiative(groups[faction]));
    }
    return result;
  }

  // Handler: Get current authoritative combat state
  private async handleAuthoritativeState(campaignId: string, request: Request): Promise<Response> {
    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }

    return jsonResponse({ ok: true, sequence: this.sequence, state: combatState }, 200, {}, request);
  }

  // Handler: Start authoritative combat
  private async handleAuthoritativeStart(campaignId: string, body: unknown, request: Request): Promise<Response> {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }

    const initiativeMode = body.initiativeMode === "group" ? "group" : "individual";
    const entities = body.entities as Record<string, CombatEntity> | undefined;

    if (!entities || Object.keys(entities).length === 0) {
      return jsonResponse({ error: "No entities provided." }, 400, {}, request);
    }

    // Roll initiative for each entity
    const initiativeRolls: Record<string, InitiativeEntry> = {};
    for (const [entityId, entity] of Object.entries(entities)) {
      const roll = rollD100();
      const skillValue = entity.skills[entity.initiativeSkill] ?? 0;
      initiativeRolls[entityId] = {
        entityId,
        roll,
        skillValue,
        currentEnergy: entity.energy.current,
      };
    }

    // Sort initiative
    const initiativeOrder = initiativeMode === "group"
      ? this.sortGroupInitiative(Object.values(initiativeRolls), entities)
      : this.sortInitiative(Object.values(initiativeRolls));

    const now = new Date().toISOString();
    const combatId = crypto.randomUUID();

    // Build grid
    const allies = Object.entries(entities)
      .filter(([_, e]) => e.faction === "ally")
      .map(([id]) => id);
    const enemies = Object.entries(entities)
      .filter(([_, e]) => e.faction === "enemy")
      .map(([id]) => id);

    const combatState: AuthoritativeCombatState = {
      combatId,
      campaignId,
      phase: "active-turn",
      round: 1,
      turnIndex: 0,
      initiativeOrder,
      activeEntityId: initiativeOrder[0] ?? null,
      initiativeMode,
      initiativeRolls,
      entities,
      grid: { allies, enemies },
      players: {},
      pendingAction: null,
      pendingReactions: [],
      log: [],
      version: 0,
      startedAt: now,
      lastUpdatedAt: now,
    };

    // Reset AP and reaction for first entity
    if (combatState.activeEntityId) {
      const activeEntity = combatState.entities[combatState.activeEntityId];
      if (activeEntity) {
        activeEntity.ap.current = activeEntity.ap.max;
        activeEntity.reaction.available = true;
      }
    }

    // Add combat started log
    combatState.log.push(this.createAuthLogEntry("combat_started", undefined, undefined, {
      initiativeOrder,
      initiativeMode,
      entityCount: Object.keys(entities).length,
    }));

    // Add turn started log
    if (combatState.activeEntityId) {
      combatState.log.push(this.createAuthLogEntry("turn_started", combatState.activeEntityId, undefined, {
        round: 1,
        turnIndex: 0,
      }));
    }

    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("COMBAT_STARTED", campaignId, sequence, { state: combatState });

    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }

  // Handler: Declare an action
  private async handleDeclareAction(campaignId: string, body: unknown, request: Request): Promise<Response> {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }

    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }

    const entityId = parseRequiredStringField(body.entityId, "entityId");
    if (entityId instanceof Response) return entityId;

    const senderId = parseRequiredStringField(body.senderId, "senderId");
    if (senderId instanceof Response) return senderId;

    const actionType = (body.type as ActionType) ?? "other";
    const targetEntityId = parseStringField(body.targetEntityId, "targetEntityId");
    if (targetEntityId instanceof Response) return targetEntityId;

    const apCost = parseNumberField(body.apCost, "apCost");
    if (apCost instanceof Response) return apCost;

    const energyCost = parseNumberField(body.energyCost, "energyCost");
    if (energyCost instanceof Response) return energyCost;

    const interruptible = body.interruptible !== false;

    // Validate the action
    const validation = this.validateAction(combatState, entityId, senderId, apCost, energyCost);
    if (!validation.allowed) {
      const sequence = await this.saveAuthCombatState(campaignId, combatState);
      this.broadcastAuthEvent("ACTION_REJECTED", campaignId, sequence, {
        entityId,
        reason: validation.reason,
      });
      return jsonResponse({ ok: false, error: validation.reason }, 400, {}, request);
    }

    // Deduct resources
    const entity = combatState.entities[entityId];
    entity.ap.current -= apCost;
    entity.energy.current -= energyCost;

    // Create pending action
    const pendingAction: PendingAction = {
      actionId: crypto.randomUUID(),
      type: actionType,
      sourceEntityId: entityId,
      targetEntityId: targetEntityId ?? undefined,
      apCost,
      energyCost,
      interruptible,
      timestamp: new Date().toISOString(),
      metadata: body.metadata as Record<string, unknown> | undefined,
    };

    combatState.pendingAction = pendingAction;
    combatState.log.push(this.createAuthLogEntry("action_declared", entityId, targetEntityId ?? undefined, {
      actionType,
      apCost,
      energyCost,
      interruptible,
    }));

    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("ACTION_DECLARED", campaignId, sequence, {
      action: pendingAction,
      phase: combatState.phase,
      state: combatState,
    });

    return jsonResponse({ ok: true, sequence, state: combatState, action: pendingAction }, 200, {}, request);
  }

  // Handler: Declare a reaction
  private async handleDeclareReaction(campaignId: string, body: unknown, request: Request): Promise<Response> {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }

    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }

    const entityId = parseRequiredStringField(body.entityId, "entityId");
    if (entityId instanceof Response) return entityId;

    const senderId = parseRequiredStringField(body.senderId, "senderId");
    if (senderId instanceof Response) return senderId;

    const reactionType = (body.type as ReactionType) ?? "other";

    const apCost = parseNumberField(body.apCost, "apCost");
    if (apCost instanceof Response) return apCost;

    const energyCost = parseNumberField(body.energyCost, "energyCost");
    if (energyCost instanceof Response) return energyCost;

    // Validate the reaction
    const validation = this.validateReaction(combatState, entityId, senderId);
    if (!validation.allowed) {
      const sequence = await this.saveAuthCombatState(campaignId, combatState);
      this.broadcastAuthEvent("REACTION_REJECTED", campaignId, sequence, {
        entityId,
        reason: validation.reason,
      });
      return jsonResponse({ ok: false, error: validation.reason }, 400, {}, request);
    }

    // Check AP cost
    const entity = combatState.entities[entityId];
    if (entity.ap.current < apCost) {
      return jsonResponse({ ok: false, error: "Insufficient AP for reaction" }, 400, {}, request);
    }

    // Deduct resources and mark reaction as used
    entity.ap.current -= apCost;
    entity.energy.current = Math.max(0, entity.energy.current - energyCost);
    entity.reaction.available = false;

    // Create pending reaction
    const pendingReaction: PendingReaction = {
      reactionId: crypto.randomUUID(),
      entityId,
      type: reactionType,
      targetActionId: combatState.pendingAction!.actionId,
      skill: body.skill as string | undefined,
      apCost,
      energyCost,
      timestamp: new Date().toISOString(),
      effects: body.effects as ReactionEffect[] | undefined,
    };

    combatState.pendingReactions.push(pendingReaction);

    // Transition to reaction-interrupt phase if not already there
    if (combatState.phase === "active-turn") {
      combatState.phase = "reaction-interrupt";
    }

    combatState.log.push(this.createAuthLogEntry("reaction_declared", entityId, undefined, {
      reactionType,
      targetActionId: pendingReaction.targetActionId,
      apCost,
      energyCost,
    }));

    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("REACTION_DECLARED", campaignId, sequence, {
      reaction: pendingReaction,
      pendingReactionsCount: combatState.pendingReactions.length,
      state: combatState,
    });

    return jsonResponse({ ok: true, sequence, state: combatState, reaction: pendingReaction }, 200, {}, request);
  }

  // Handler: Resolve pending reactions (GM triggers this)
  private async handleResolveReactions(campaignId: string, body: unknown, request: Request): Promise<Response> {
    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }

    if (!combatState.pendingAction) {
      return jsonResponse({ error: "No pending action to resolve." }, 400, {}, request);
    }

    // Transition to resolution phase
    combatState.phase = "resolution";

    // Sort reactions by initiative order
    const reactorOrder = combatState.initiativeOrder.filter(id =>
      combatState.pendingReactions.some(r => r.entityId === id)
    );

    const sortedReactions = reactorOrder
      .map(id => combatState.pendingReactions.find(r => r.entityId === id)!)
      .filter(Boolean);

    let actionCancelled = false;
    let actionModified = false;
    const resolvedReactions: Array<{ reaction: PendingReaction; success: boolean; effects: ReactionEffect[] }> = [];

    // Resolve each reaction in initiative order
    for (const reaction of sortedReactions) {
      // For now, assume all reactions succeed (actual contest logic would go here)
      const success = true;
      const effects = reaction.effects ?? [];

      // Apply reaction effects
      for (const effect of effects) {
        switch (effect.type) {
          case "cancel_action":
            actionCancelled = true;
            break;
          case "modify_action":
            actionModified = true;
            break;
          case "apply_wounds":
            if (effect.data?.wounds) {
              const target = combatState.entities[effect.targetEntityId];
              if (target) {
                for (const [woundType, count] of Object.entries(effect.data.wounds)) {
                  const current = target.wounds[woundType as WoundType] ?? 0;
                  target.wounds[woundType as WoundType] = current + (count as number);
                }
                combatState.log.push(this.createAuthLogEntry("wounds_applied", reaction.entityId, effect.targetEntityId, {
                  wounds: effect.data.wounds,
                  source: "reaction",
                }));
              }
            }
            break;
          case "apply_status":
            if (effect.data?.statusKey) {
              const target = combatState.entities[effect.targetEntityId];
              if (target) {
                target.statusEffects.push({
                  key: effect.data.statusKey,
                  stacks: effect.data.statusStacks ?? 1,
                  duration: effect.data.statusDuration ?? null,
                });
                combatState.log.push(this.createAuthLogEntry("status_applied", reaction.entityId, effect.targetEntityId, {
                  statusKey: effect.data.statusKey,
                  stacks: effect.data.statusStacks ?? 1,
                  duration: effect.data.statusDuration ?? null,
                }));
              }
            }
            break;
        }
      }

      resolvedReactions.push({ reaction, success, effects });

      combatState.log.push(this.createAuthLogEntry("reaction_resolved", reaction.entityId, undefined, {
        reactionId: reaction.reactionId,
        success,
        effectCount: effects.length,
      }));
    }

    // Clear pending reactions
    combatState.pendingReactions = [];

    // Resolve or cancel the original action
    if (actionCancelled) {
      combatState.log.push(this.createAuthLogEntry("action_cancelled", combatState.pendingAction.sourceEntityId, undefined, {
        actionId: combatState.pendingAction.actionId,
        reason: "cancelled_by_reaction",
      }));
    } else {
      combatState.log.push(this.createAuthLogEntry("action_resolved", combatState.pendingAction.sourceEntityId, combatState.pendingAction.targetEntityId, {
        actionId: combatState.pendingAction.actionId,
        modified: actionModified,
      }));
    }

    // Clear pending action
    const resolvedAction = combatState.pendingAction;
    combatState.pendingAction = null;

    // Transition back to active-turn
    combatState.phase = "active-turn";

    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("REACTIONS_RESOLVED", campaignId, sequence, {
      reactions: resolvedReactions,
      action: resolvedAction,
      actionCancelled,
      actionModified,
      state: combatState,
    });

    return jsonResponse({
      ok: true,
      sequence,
      state: combatState,
      reactions: resolvedReactions,
      actionCancelled,
      actionModified,
    }, 200, {}, request);
  }

  // Handler: End turn (voluntary or forced)
  private async handleAuthoritativeEndTurn(campaignId: string, body: unknown, request: Request): Promise<Response> {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }

    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }

    if (combatState.phase === "completed") {
      return jsonResponse({ error: "Combat has already ended." }, 400, {}, request);
    }

    // Resolve any pending action/reactions first
    if (combatState.pendingAction) {
      combatState.pendingAction = null;
      combatState.pendingReactions = [];
    }

    const previousEntityId = combatState.activeEntityId;
    const previousEntity = previousEntityId ? combatState.entities[previousEntityId] : null;

    // Log turn end
    if (previousEntityId) {
      combatState.log.push(this.createAuthLogEntry("turn_ended", previousEntityId, undefined, {
        round: combatState.round,
        turnIndex: combatState.turnIndex,
        voluntary: body.voluntary !== false,
      }));
    }

    // Advance to next entity
    let nextIndex = combatState.turnIndex + 1;
    let nextRound = combatState.round;

    if (nextIndex >= combatState.initiativeOrder.length) {
      nextIndex = 0;
      nextRound += 1;

      // Reset reactions for all entities at round start
      for (const entity of Object.values(combatState.entities)) {
        entity.reaction.available = true;
      }

      combatState.log.push(this.createAuthLogEntry("round_started", undefined, undefined, {
        round: nextRound,
      }));
    }

    combatState.turnIndex = nextIndex;
    combatState.round = nextRound;
    combatState.activeEntityId = combatState.initiativeOrder[nextIndex] ?? null;
    combatState.phase = "active-turn";

    // Reset AP for new active entity
    if (combatState.activeEntityId) {
      const activeEntity = combatState.entities[combatState.activeEntityId];
      if (activeEntity) {
        activeEntity.ap.current = activeEntity.ap.max;

        combatState.log.push(this.createAuthLogEntry("turn_started", combatState.activeEntityId, undefined, {
          round: combatState.round,
          turnIndex: combatState.turnIndex,
          apRestored: activeEntity.ap.max,
        }));
      }
    }

    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("TURN_ENDED", campaignId, sequence, {
      previousEntityId,
      newActiveEntityId: combatState.activeEntityId,
      round: combatState.round,
      turnIndex: combatState.turnIndex,
      state: combatState,
    });

    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }

  // Handler: GM Override
  private async handleGmOverride(campaignId: string, body: unknown, request: Request): Promise<Response> {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }

    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }

    const gmId = parseRequiredStringField(body.gmId, "gmId");
    if (gmId instanceof Response) return gmId;

    const overrideType = body.type as GmOverrideType;
    if (!overrideType) {
      return jsonResponse({ error: "Override type required." }, 400, {}, request);
    }

    const targetEntityId = parseStringField(body.targetEntityId, "targetEntityId");
    if (targetEntityId instanceof Response) return targetEntityId;

    const reason = parseStringField(body.reason, "reason");
    if (reason instanceof Response) return reason;

    const override: GmOverride = {
      type: overrideType,
      gmId,
      targetEntityId: targetEntityId ?? undefined,
      data: body.data as Record<string, unknown> | undefined,
      reason: reason ?? undefined,
      timestamp: new Date().toISOString(),
    };

    // Apply the override
    switch (overrideType) {
      case "adjust_ap":
        if (targetEntityId && combatState.entities[targetEntityId]) {
          const newAp = parseNumberField(body.data?.ap ?? body.data?.value, "ap");
          if (typeof newAp === "number") {
            combatState.entities[targetEntityId].ap.current = newAp;
          }
        }
        break;

      case "adjust_energy":
        if (targetEntityId && combatState.entities[targetEntityId]) {
          const newEnergy = parseNumberField(body.data?.energy ?? body.data?.value, "energy");
          if (typeof newEnergy === "number") {
            combatState.entities[targetEntityId].energy.current = newEnergy;
          }
        }
        break;

      case "skip_entity":
        if (combatState.activeEntityId === targetEntityId) {
          // Force end turn for this entity
          const nextIndex = (combatState.turnIndex + 1) % combatState.initiativeOrder.length;
          if (nextIndex < combatState.turnIndex) {
            combatState.round += 1;
          }
          combatState.turnIndex = nextIndex;
          combatState.activeEntityId = combatState.initiativeOrder[nextIndex] ?? null;
        }
        break;

      case "end_turn":
        // Just advance the turn
        const nextIdx = (combatState.turnIndex + 1) % combatState.initiativeOrder.length;
        if (nextIdx < combatState.turnIndex) {
          combatState.round += 1;
          for (const entity of Object.values(combatState.entities)) {
            entity.reaction.available = true;
          }
        }
        combatState.turnIndex = nextIdx;
        combatState.activeEntityId = combatState.initiativeOrder[nextIdx] ?? null;
        if (combatState.activeEntityId) {
          const activeEntity = combatState.entities[combatState.activeEntityId];
          if (activeEntity) {
            activeEntity.ap.current = activeEntity.ap.max;
          }
        }
        break;

      case "modify_initiative":
        if (Array.isArray(body.data?.newOrder)) {
          combatState.initiativeOrder = body.data.newOrder as string[];
        }
        break;

      case "add_status":
        if (targetEntityId && combatState.entities[targetEntityId] && body.data?.statusKey) {
          combatState.entities[targetEntityId].statusEffects.push({
            key: body.data.statusKey as string,
            stacks: (body.data.stacks as number) ?? 1,
            duration: (body.data.duration as number) ?? null,
          });
        }
        break;

      case "remove_status":
        if (targetEntityId && combatState.entities[targetEntityId] && body.data?.statusKey) {
          combatState.entities[targetEntityId].statusEffects =
            combatState.entities[targetEntityId].statusEffects.filter(
              s => s.key !== body.data?.statusKey
            );
        }
        break;

      case "modify_wounds":
        if (targetEntityId && combatState.entities[targetEntityId] && body.data?.wounds) {
          const wounds = body.data.wounds as WoundCounts;
          for (const [woundType, count] of Object.entries(wounds)) {
            combatState.entities[targetEntityId].wounds[woundType as WoundType] = count as number;
          }
        }
        break;

      case "set_phase":
        if (body.data?.phase) {
          combatState.phase = body.data.phase as CombatPhase;
        }
        break;

      case "cancel_reaction":
        if (body.data?.reactionId) {
          combatState.pendingReactions = combatState.pendingReactions.filter(
            r => r.reactionId !== body.data?.reactionId
          );
        }
        break;

      case "end_combat":
        combatState.phase = "completed";
        break;
    }

    // Log the override
    combatState.log.push(this.createAuthLogEntry("gm_override", undefined, targetEntityId ?? undefined, {
      overrideType,
      gmId,
      reason: reason ?? undefined,
      data: body.data,
    }));

    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("GM_OVERRIDE", campaignId, sequence, {
      override,
      state: combatState,
    });

    return jsonResponse({ ok: true, sequence, state: combatState, override }, 200, {}, request);
  }

  // Handler: End combat
  private async handleEndCombat(campaignId: string, body: unknown, request: Request): Promise<Response> {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }

    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }

    const reason = (body.reason as "victory" | "defeat" | "gm_ended") ?? "gm_ended";

    combatState.phase = "completed";
    combatState.pendingAction = null;
    combatState.pendingReactions = [];

    combatState.log.push(this.createAuthLogEntry("combat_ended", undefined, undefined, {
      reason,
      round: combatState.round,
      turnIndex: combatState.turnIndex,
    }));

    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("COMBAT_ENDED", campaignId, sequence, {
      combatId: combatState.combatId,
      reason,
      finalLog: combatState.log,
      state: combatState,
    });

    return jsonResponse({ ok: true, sequence, state: combatState, reason }, 200, {}, request);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // END AUTHORITATIVE COMBAT SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════

  private broadcast(event: CampaignEvent) {
    const message = JSON.stringify(event);
    for (const [connectionId, socket] of this.sessions) {
      try {
        socket.send(message);
      } catch {
        socket.close();
        this.sessions.delete(connectionId);
        this.presence.delete(connectionId);
      }
    }
  }

  private currentPresence(): PresenceEntry[] {
    return Array.from(this.presence.keys()).map((connectionId) =>
      this.serializePresence(connectionId),
    );
  }

  private serializePresence(connectionId: string): PresenceEntry {
    const presence = this.presence.get(connectionId);
    return {
      connectionId,
      userId: presence?.userId ?? connectionId,
      connectedAt: presence?.connectedAt ?? new Date().toISOString(),
    };
  }

  private rollRequestKey(requestId: string) {
    return `roll_request:${requestId}`;
  }

  private rollContestKey(contestId: string) {
    return `roll_contest:${contestId}`;
  }

  private supabaseConfig(): { url: string; key: string } | Response {
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Supabase configuration missing." }, 500);
    }

    return { url: this.env.SUPABASE_URL, key: this.env.SUPABASE_SERVICE_ROLE_KEY };
  }

  private async persistSupabase(
    table: "roll_requests" | "roll_contests",
    payload: Record<string, unknown>,
    options?: { upsert?: boolean },
  ): Promise<Response | null> {
    const config = this.supabaseConfig();
    if (config instanceof Response) {
      return config;
    }

    const url = new URL(`/rest/v1/${table}`, config.url);
    if (options?.upsert) {
      url.searchParams.set("on_conflict", "id");
    }
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        Prefer: options?.upsert
          ? "resolution=merge-duplicates, return=minimal"
          : "return=minimal",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return jsonResponse(
        { error: `Supabase insert failed for ${table}.`, details: errorText },
        500,
      );
    }

    return null;
  }

  private async loadCombatantsFromSupabase(
    campaignId: string,
  ): Promise<CombatantStartPayload[] | Response> {
    const config = this.supabaseConfig();
    if (config instanceof Response) {
      return config;
    }

    const headers = {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
    };

    const combatantsUrl = new URL("/rest/v1/campaign_combatants", config.url);
    combatantsUrl.searchParams.set(
      "select",
      "id,initiative,ap_max,energy_max,ap_current,energy_current,is_active",
    );
    combatantsUrl.searchParams.set("campaign_id", `eq.${campaignId}`);
    combatantsUrl.searchParams.set("is_active", "eq.true");

    const statusUrl = new URL("/rest/v1/campaign_combatant_status_effects", config.url);
    statusUrl.searchParams.set("select", "combatant_id,status_key,is_active");
    statusUrl.searchParams.set("campaign_id", `eq.${campaignId}`);

    const woundsUrl = new URL("/rest/v1/campaign_combatant_wounds", config.url);
    woundsUrl.searchParams.set("select", "combatant_id,wound_count");
    woundsUrl.searchParams.set("campaign_id", `eq.${campaignId}`);

    const [combatantRes, statusRes, woundsRes] = await Promise.all([
      fetch(combatantsUrl.toString(), { headers }),
      fetch(statusUrl.toString(), { headers }),
      fetch(woundsUrl.toString(), { headers }),
    ]);

    if (!combatantRes.ok) {
      const details = await combatantRes.text();
      return jsonResponse(
        { error: "Failed to load combatants from Supabase.", details },
        500,
      );
    }
    if (!statusRes.ok) {
      const details = await statusRes.text();
      return jsonResponse(
        { error: "Failed to load combatant status effects from Supabase.", details },
        500,
      );
    }
    if (!woundsRes.ok) {
      const details = await woundsRes.text();
      return jsonResponse(
        { error: "Failed to load combatant wounds from Supabase.", details },
        500,
      );
    }

    const combatantRows = (await combatantRes.json()) as {
      id: string;
      initiative?: number | null;
      ap_max?: number | null;
      energy_max?: number | null;
      ap_current?: number | null;
      energy_current?: number | null;
      is_active?: boolean | null;
    }[];
    const statusRows = (await statusRes.json()) as {
      combatant_id: string;
      status_key: string;
      is_active?: boolean | null;
    }[];
    const woundRows = (await woundsRes.json()) as {
      combatant_id: string;
      wound_count?: number | null;
    }[];

    const statusById = new Map<string, string[]>();
    statusRows.forEach((row) => {
      if (row.is_active === false) return;
      const list = statusById.get(row.combatant_id) ?? [];
      list.push(row.status_key);
      statusById.set(row.combatant_id, list);
    });

    const woundsById = new Map<string, number>();
    woundRows.forEach((row) => {
      const current = woundsById.get(row.combatant_id) ?? 0;
      const increment = typeof row.wound_count === "number" ? row.wound_count : 0;
      woundsById.set(row.combatant_id, current + increment);
    });

    const readNumber = (value?: number | null) =>
      typeof value === "number" && Number.isFinite(value) ? value : 0;

    return combatantRows.map((row) => ({
      id: row.id,
      initiative: readNumber(row.initiative),
      actionPoints:
        typeof row.ap_max === "number" && Number.isFinite(row.ap_max)
          ? row.ap_max
          : readNumber(row.ap_current),
      energy:
        typeof row.energy_max === "number" && Number.isFinite(row.energy_max)
          ? row.energy_max
          : readNumber(row.energy_current),
      statusEffects: statusById.get(row.id) ?? [],
      wounds: woundsById.get(row.id) ?? 0,
    }));
  }
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit, request?: Request) {
  const corsHeaders = request ? getCorsHeaders(request) : {};
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders,
      ...headers,
    },
  });
}

async function readJsonBody(request: Request): Promise<unknown | Response> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonResponse({ error: "Expected JSON body" }, 415, {}, request);
  }

  try {
    return await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, {}, request);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStringField(
  value: unknown,
  field: string,
  required = false,
): string | Response | undefined {
  if (value == null) {
    if (required) {
      return jsonResponse({ error: `Missing ${field}.` }, 400);
    }
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return jsonResponse({ error: `Invalid ${field}.` }, 400);
  }

  return value;
}

function parseRequiredStringField(value: unknown, field: string): string | Response {
  const parsed = parseStringField(value, field, true);
  if (parsed instanceof Response) {
    return parsed;
  }
  return parsed as string;
}

function parseNumberField(
  value: unknown,
  field: string,
  fallback = 0,
): number | Response {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return jsonResponse({ error: `Invalid ${field}.` }, 400);
}

function parseBooleanField(
  value: unknown,
  field: string,
  fallback = false,
): boolean | Response {
  if (value == null) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return jsonResponse({ error: `Invalid ${field}.` }, 400);
}

function parseStringArrayField(
  value: unknown,
  field: string,
): string[] | Response | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return jsonResponse({ error: `Invalid ${field}.` }, 400);
  }
  for (const entry of value) {
    if (typeof entry !== "string") {
      return jsonResponse({ error: `Invalid ${field}.` }, 400);
    }
  }
  return value;
}

function parseCombatStart(body: unknown): CombatStartPayload | Response {
  if (!isRecord(body)) {
    return jsonResponse({ error: "Invalid payload." }, 400);
  }

  if (body.combatants != null && !Array.isArray(body.combatants)) {
    return jsonResponse({ error: "Invalid combatants." }, 400);
  }

  const groupInitiative = parseBooleanField(body.groupInitiative, "groupInitiative");
  if (groupInitiative instanceof Response) {
    return groupInitiative;
  }

  const ambushedIds = parseStringArrayField(body.ambushedIds, "ambushedIds");
  if (ambushedIds instanceof Response) {
    return ambushedIds;
  }

  const combatants: CombatantStartPayload[] = [];

  for (const entry of body.combatants ?? []) {
    if (!isRecord(entry)) {
      return jsonResponse({ error: "Invalid combatant entry." }, 400);
    }
    const id = parseRequiredStringField(entry.id, "combatants.id");
    if (id instanceof Response) {
      return id;
    }
    const initiative = parseNumberField(entry.initiative, "combatants.initiative");
    if (initiative instanceof Response) {
      return initiative;
    }
    const initiativeRoll = parseNumberField(entry.initiativeRoll, "combatants.initiativeRoll");
    if (initiativeRoll instanceof Response) {
      return initiativeRoll;
    }
    const initiativeBonus = parseNumberField(
      entry.initiativeBonus,
      "combatants.initiativeBonus",
    );
    if (initiativeBonus instanceof Response) {
      return initiativeBonus;
    }
    const actionPoints = parseNumberField(entry.actionPoints, "combatants.actionPoints");
    if (actionPoints instanceof Response) {
      return actionPoints;
    }
    const energy = parseNumberField(entry.energy, "combatants.energy");
    if (energy instanceof Response) {
      return energy;
    }
    const wounds = parseNumberField(entry.wounds, "combatants.wounds");
    if (wounds instanceof Response) {
      return wounds;
    }
    const statusEffects = parseStringArrayField(
      entry.statusEffects,
      "combatants.statusEffects",
    );
    if (statusEffects instanceof Response) {
      return statusEffects;
    }
    const groupId = parseStringField(entry.groupId, "combatants.groupId");
    if (groupId instanceof Response) {
      return groupId;
    }
    const ambushed = parseBooleanField(entry.ambushed, "combatants.ambushed");
    if (ambushed instanceof Response) {
      return ambushed;
    }

    combatants.push({
      id,
      initiative,
      initiativeRoll,
      initiativeBonus,
      actionPoints,
      energy,
      statusEffects,
      wounds,
      ambushed,
      groupId,
    });
  }

  return {
    combatants,
    groupInitiative,
    ambushedIds,
  };
}

function parseCombatAdvance(body: unknown): CombatAdvancePayload | Response {
  if (!isRecord(body)) {
    return jsonResponse({ error: "Invalid payload." }, 400);
  }

  let statusEffectsById: Record<string, string[]> | undefined;
  if (body.statusEffectsById != null) {
    if (!isRecord(body.statusEffectsById)) {
      return jsonResponse({ error: "Invalid statusEffectsById." }, 400);
    }
    statusEffectsById = {};
    for (const [combatantId, statusList] of Object.entries(body.statusEffectsById)) {
      const parsed = parseStringArrayField(statusList, "statusEffectsById");
      if (parsed instanceof Response) {
        return parsed;
      }
      statusEffectsById[combatantId] = parsed ?? [];
    }
  }

  return { statusEffectsById };
}

function parseCombatAmbush(body: unknown): CombatAmbushPayload | Response {
  if (!isRecord(body)) {
    return jsonResponse({ error: "Invalid payload." }, 400);
  }

  const combatantId = parseStringField(body.combatantId, "combatantId");
  if (combatantId instanceof Response) {
    return combatantId;
  }

  return { combatantId };
}

function parseCombatSpend(body: unknown): CombatSpendPayload | Response {
  if (!isRecord(body)) {
    return jsonResponse({ error: "Invalid payload." }, 400);
  }

  const combatantId = parseRequiredStringField(body.combatantId, "combatantId");
  if (combatantId instanceof Response) {
    return combatantId;
  }
  const actionPointCost = parseNumberField(body.actionPointCost, "actionPointCost");
  if (actionPointCost instanceof Response) {
    return actionPointCost;
  }
  const energyCost = parseNumberField(body.energyCost, "energyCost");
  if (energyCost instanceof Response) {
    return energyCost;
  }
  const actionType = parseStringField(body.actionType, "actionType");
  if (actionType instanceof Response) {
    return actionType;
  }
  const targetId = parseStringField(body.targetId, "targetId");
  if (targetId instanceof Response) {
    return targetId;
  }
  const rollResults = body.rollResults;
  const metadata = body.metadata;

  return {
    combatantId,
    actionPointCost,
    energyCost,
    actionType,
    targetId,
    rollResults,
    metadata,
  };
}

function parseCombatReaction(body: unknown): CombatReactionPayload | Response {
  if (!isRecord(body)) {
    return jsonResponse({ error: "Invalid payload." }, 400);
  }

  const combatantId = parseRequiredStringField(body.combatantId, "combatantId");
  if (combatantId instanceof Response) {
    return combatantId;
  }
  const actionPointCost = parseNumberField(body.actionPointCost, "actionPointCost");
  if (actionPointCost instanceof Response) {
    return actionPointCost;
  }
  const reactionType = parseStringField(body.reactionType, "reactionType");
  if (reactionType instanceof Response) {
    return reactionType;
  }
  const metadata = body.metadata;

  return {
    combatantId,
    actionPointCost,
    reactionType,
    metadata,
  };
}

function createCombatEventLogEntry(type: CombatEventType, payload?: unknown): CombatEventLogEntry {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    payload,
  };
}

function parseRollRequest(body: unknown): RollRequestPayload | Response {
  if (!isRecord(body)) {
    return jsonResponse({ error: "Invalid payload." }, 400);
  }

  const playerId = parseRequiredStringField(body.playerId, "playerId");
  if (playerId instanceof Response) {
    return playerId;
  }

  const modifier = parseNumberField(body.modifier, "modifier");
  if (modifier instanceof Response) {
    return modifier;
  }

  const playerName = parseStringField(body.playerName, "playerName");
  if (playerName instanceof Response) {
    return playerName;
  }

  const label = parseStringField(body.label, "label");
  if (label instanceof Response) {
    return label;
  }

  const skill = parseStringField(body.skill, "skill");
  if (skill instanceof Response) {
    return skill;
  }

  const requestId = parseStringField(body.requestId, "requestId");
  if (requestId instanceof Response) {
    return requestId;
  }

  return {
    playerId,
    playerName,
    modifier,
    label,
    skill,
    requestId,
  };
}

function parseContestSelection(body: unknown): ContestSelectionPayload | Response {
  if (!isRecord(body)) {
    return jsonResponse({ error: "Invalid payload." }, 400);
  }

  const requestId = parseRequiredStringField(body.requestId, "requestId");
  if (requestId instanceof Response) {
    return requestId;
  }

  const gmId = parseRequiredStringField(body.gmId, "gmId");
  if (gmId instanceof Response) {
    return gmId;
  }

  const npcModifier = parseNumberField(body.npcModifier, "npcModifier");
  if (npcModifier instanceof Response) {
    return npcModifier;
  }

  const gmName = parseStringField(body.gmName, "gmName");
  if (gmName instanceof Response) {
    return gmName;
  }

  const npcName = parseStringField(body.npcName, "npcName");
  if (npcName instanceof Response) {
    return npcName;
  }

  const contestId = parseStringField(body.contestId, "contestId");
  if (contestId instanceof Response) {
    return contestId;
  }

  return {
    requestId,
    gmId,
    gmName,
    npcName,
    npcModifier,
    contestId,
  };
}

function rollD100(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] % 100) + 1;
}

function mapRollRequestForSupabase(record: RollRequestRecord): Record<string, unknown> {
  return {
    id: record.id,
    campaign_id: record.campaignId,
    player_id: record.playerId,
    player_name: record.playerName ?? null,
    roll: record.roll,
    modifier: record.modifier,
    total: record.total,
    label: record.label ?? null,
    skill: record.skill ?? null,
    status: record.status,
    contest_id: record.contestId ?? null,
    created_at: record.createdAt,
  };
}

function mapContestForSupabase(record: ContestRecord): Record<string, unknown> {
  return {
    id: record.id,
    campaign_id: record.campaignId,
    roll_request_id: record.requestId,
    gm_id: record.gmId,
    gm_name: record.gmName ?? null,
    npc_name: record.npcName ?? null,
    npc_modifier: record.npcModifier,
    npc_roll: record.npcRoll,
    npc_total: record.npcTotal,
    player_roll: record.playerRoll,
    player_modifier: record.playerModifier,
    player_total: record.playerTotal,
    outcome: record.outcome,
    created_at: record.createdAt,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request),
      });
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/(connect|roll|contest)$/);
    const combatMatch = url.pathname.match(
      /^\/api\/campaigns\/([^/]+)\/combat\/[^/]+$/,
    );
    if (!match && !combatMatch) {
      return new Response("Not found", { status: 404 });
    }

    const campaignId = decodeURIComponent((match ?? combatMatch)![1]);
    const id = env.CAMPAIGN_DO.idFromName(campaignId);
    const stub = env.CAMPAIGN_DO.get(id);

    return stub.fetch(request);
  },
};
