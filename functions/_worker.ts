interface Env {
  CAMPAIGN_DO: DurableObjectNamespace;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

type CombatEventType =
  | "combat_started"
  | "turn_started"
  | "turn_ended"
  | "combat_updated"
  | "ambush_applied"
  | "status_tick"
  | "reaction_spent"
  | "action_spent";

type CombatEventLogEntry = {
  id: string;
  type: CombatEventType;
  timestamp: string;
  payload?: unknown;
};

type CombatState = {
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
  eventLog: CombatEventLogEntry[];
};

type CampaignEvent = {
  type: "roll" | "contest" | "presence" | "welcome" | CombatEventType;
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

    if (action === "connect") {
      return this.handleConnect(request, campaignId);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, { Allow: "POST" });
    }

    const body = await readJsonBody(request);
    if (body instanceof Response) {
      return body;
    }

    if (action === "roll") {
      return this.handleRollRequest(campaignId, body);
    }

    if (action === "contest") {
      return this.handleContestRequest(campaignId, body);
    }

    if (combatMatch) {
      return this.handleCombatAction(campaignId, action, body);
    }

    return jsonResponse({ error: "Not found" }, 404);
  }

  private async handleConnect(request: Request, campaignId: string): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return jsonResponse({ error: "Expected WebSocket upgrade" }, 426);
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

    return new Response(null, { status: 101, webSocket: client });
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

  private async handleRollRequest(campaignId: string, body: unknown): Promise<Response> {
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

    return jsonResponse({ ok: true, sequence, request: record });
  }

  private async handleContestRequest(campaignId: string, body: unknown): Promise<Response> {
    const parsed = parseContestSelection(body);
    if (parsed instanceof Response) {
      return parsed;
    }

    const requestKey = this.rollRequestKey(parsed.requestId);
    const request = await this.state.storage.get<RollRequestRecord>(requestKey);
    if (!request) {
      return jsonResponse({ error: "Roll request not found." }, 404);
    }

    const contestId = parsed.contestId ?? crypto.randomUUID();
    const npcRoll = rollD100();
    const npcModifier = parsed.npcModifier ?? 0;
    const npcTotal = npcRoll + npcModifier;
    const createdAt = new Date().toISOString();
    const outcome =
      request.total === npcTotal ? "tie" : request.total > npcTotal ? "player" : "npc";

    const contest: ContestRecord = {
      id: contestId,
      campaignId,
      requestId: request.id,
      gmId: parsed.gmId,
      gmName: parsed.gmName,
      npcName: parsed.npcName,
      npcModifier,
      npcRoll,
      npcTotal,
      playerRoll: request.roll,
      playerModifier: request.modifier,
      playerTotal: request.total,
      outcome,
      createdAt,
    };

    const updatedRequest: RollRequestRecord = {
      ...request,
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

    return jsonResponse({ ok: true, sequence, contest });
  }

  private async handleCombatAction(
    campaignId: string,
    action: string,
    body: unknown,
  ): Promise<Response> {
    switch (action) {
      case "start":
        return this.handleCombatStart(campaignId, body);
      case "advance":
        return this.handleCombatAdvance(campaignId, body);
      case "spend":
        return this.handleCombatSpend(campaignId, body);
      case "reaction":
        return this.handleCombatReaction(campaignId, body);
      default:
        return jsonResponse({ error: "Not found" }, 404);
    }
  }

  private async handleCombatStart(campaignId: string, body: unknown): Promise<Response> {
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
      return jsonResponse({ error: "No combatants available to start combat." }, 400);
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

    const ambushResult = this.resolveNextTurn(combatState, 0, 1);
    combatState.turnIndex = ambushResult.nextIndex;
    combatState.round = ambushResult.nextRound;
    combatState.activeCombatantId = ambushResult.activeCombatantId;

    const startedEntry = createCombatEventLogEntry("combat_started", {
      initiativeOrder,
      groupInitiative: parsed.groupInitiative,
    });
    combatState.eventLog.push(startedEntry);

    if (ambushResult.skippedAmbushIds.length > 0) {
      combatState.eventLog.push(
        createCombatEventLogEntry("ambush_applied", {
          skippedCombatants: ambushResult.skippedAmbushIds,
        }),
      );
    }

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

    return jsonResponse({ ok: true, sequence, state: combatState });
  }

  private async handleCombatAdvance(campaignId: string, body: unknown): Promise<Response> {
    const parsed = parseCombatAdvance(body);
    if (parsed instanceof Response) {
      return parsed;
    }

    const combatState = await this.loadCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404);
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

    let nextIndex = combatState.turnIndex + 1;
    let nextRound = combatState.round;
    if (nextIndex >= combatState.initiativeOrder.length) {
      nextIndex = 0;
      nextRound += 1;
    }

    const nextTurn = this.resolveNextTurn(combatState, nextIndex, nextRound);
    combatState.turnIndex = nextTurn.nextIndex;
    combatState.round = nextTurn.nextRound;
    combatState.activeCombatantId = nextTurn.activeCombatantId;

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

    if (nextTurn.skippedAmbushIds.length > 0) {
      combatState.eventLog.push(
        createCombatEventLogEntry("ambush_applied", {
          skippedCombatants: nextTurn.skippedAmbushIds,
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
        skippedAmbushIds: nextTurn.skippedAmbushIds,
      },
    });

    return jsonResponse({ ok: true, sequence, state: combatState });
  }

  private async handleCombatSpend(campaignId: string, body: unknown): Promise<Response> {
    const parsed = parseCombatSpend(body);
    if (parsed instanceof Response) {
      return parsed;
    }

    if (parsed.actionPointCost < 0) {
      return jsonResponse({ error: "Action point costs must be non-negative." }, 400);
    }

    const combatState = await this.loadCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404);
    }

    const currentAp = combatState.actionPointsById[parsed.combatantId] ?? 0;
    const nextAp = currentAp - parsed.actionPointCost;
    if (nextAp < 0) {
      return jsonResponse({ error: "Insufficient action points." }, 400);
    }

    const currentEnergy = combatState.energyById[parsed.combatantId] ?? 0;
    const nextEnergy = currentEnergy - parsed.energyCost;
    if (nextEnergy < 0) {
      return jsonResponse({ error: "Insufficient energy." }, 400);
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

    return jsonResponse({ ok: true, sequence, state: combatState });
  }

  private async handleCombatReaction(campaignId: string, body: unknown): Promise<Response> {
    const parsed = parseCombatReaction(body);
    if (parsed instanceof Response) {
      return parsed;
    }

    if (parsed.actionPointCost < 0) {
      return jsonResponse({ error: "Costs must be non-negative." }, 400);
    }

    const combatState = await this.loadCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404);
    }

    const currentAp = combatState.actionPointsById[parsed.combatantId] ?? 0;
    const nextAp = currentAp - parsed.actionPointCost;
    if (nextAp < 0) {
      return jsonResponse({ error: "Insufficient action points." }, 400);
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

    return jsonResponse({ ok: true, sequence, state: combatState });
  }

  private resolveNextTurn(
    combatState: CombatState,
    startIndex: number,
    startRound: number,
  ): {
    nextIndex: number;
    nextRound: number;
    activeCombatantId: string | null;
    skippedAmbushIds: string[];
  } {
    const order = combatState.initiativeOrder;
    if (order.length === 0) {
      return {
        nextIndex: 0,
        nextRound: startRound,
        activeCombatantId: null,
        skippedAmbushIds: [],
      };
    }

    let index = startIndex;
    let round = startRound;
    const skippedAmbushIds: string[] = [];

    for (let step = 0; step < order.length; step += 1) {
      const combatantId = order[index];
      if (round === 1 && combatState.ambushRoundFlags[combatantId]) {
        combatState.ambushRoundFlags[combatantId] = false;
        skippedAmbushIds.push(combatantId);
        index += 1;
        if (index >= order.length) {
          index = 0;
          round += 1;
        }
        continue;
      }

      return {
        nextIndex: index,
        nextRound: round,
        activeCombatantId: combatantId,
        skippedAmbushIds,
      };
    }

    return {
      nextIndex: index,
      nextRound: round,
      activeCombatantId: null,
      skippedAmbushIds,
    };
  }

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

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

async function readJsonBody(request: Request): Promise<unknown | Response> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonResponse({ error: "Expected JSON body" }, 415);
  }

  try {
    return await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
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
