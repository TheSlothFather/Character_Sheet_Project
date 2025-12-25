var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-Fh0bng/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// functions/_worker.ts
function getCorsHeaders(request) {
  const origin = request.headers.get("Origin");
  const allowedOrigins = [
    "https://character-sheet-project.pages.dev",
    "http://localhost:5173"
  ];
  const isAllowed = origin && (allowedOrigins.some((allowed) => origin === allowed || origin.startsWith(allowed)) || /^https:\/\/[a-z0-9-]+\.character-sheet-project\.pages\.dev$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin));
  if (isAllowed) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Upgrade, Connection",
      "Access-Control-Max-Age": "86400",
      "Access-Control-Allow-Credentials": "true"
    };
  }
  return {};
}
__name(getCorsHeaders, "getCorsHeaders");
var CampaignDurableObject = class {
  static {
    __name(this, "CampaignDurableObject");
  }
  state;
  env;
  sessions = /* @__PURE__ */ new Map();
  presence = /* @__PURE__ */ new Map();
  lobbyState = null;
  sequence = 0;
  ready;
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const storedSequence = await this.state.storage.get("sequence");
      if (typeof storedSequence === "number") {
        this.sequence = storedSequence;
      }
      const storedLobbyState = await this.state.storage.get("lobbyState");
      if (storedLobbyState) {
        this.lobbyState = storedLobbyState;
      }
    });
  }
  async fetch(request) {
    await this.ready;
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request)
      });
    }
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/(connect|roll|contest)$/);
    const combatMatch = url.pathname.match(
      /^\/api\/campaigns\/([^/]+)\/combat\/([^/]+)$/
    );
    if (!match && !combatMatch) {
      return jsonResponse({ error: "Not found" }, 404);
    }
    const campaignId = decodeURIComponent((match ?? combatMatch)[1]);
    const action = (match ?? combatMatch)[2];
    if (action === "connect") {
      return this.handleConnect(request, campaignId);
    }
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
  async handleConnect(request, campaignId) {
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
      connectedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    server.addEventListener("message", (event) => {
      void this.handleClientMessage(connectionId, campaignId, event.data);
    });
    server.addEventListener("close", () => {
      this.handleDisconnect(connectionId, campaignId);
    });
    server.addEventListener("error", () => {
      this.handleDisconnect(connectionId, campaignId);
    });
    const welcomePayload = {
      type: "welcome",
      campaignId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      payload: {
        connectionId,
        presence: this.currentPresence(),
        sequence: this.sequence
      }
    };
    server.send(JSON.stringify(welcomePayload));
    if (this.lobbyState) {
      const lobbyStateSync = {
        type: "LOBBY_STATE_SYNC",
        campaignId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        payload: {
          lobbyState: this.lobbyState
        }
      };
      server.send(JSON.stringify(lobbyStateSync));
    }
    this.broadcast({
      type: "presence",
      campaignId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      payload: {
        action: "join",
        ...this.serializePresence(connectionId),
        total: this.presence.size
      }
    });
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: getCorsHeaders(request)
    });
  }
  async handleClientMessage(connectionId, campaignId, data) {
    if (typeof data !== "string") {
      return;
    }
    let payload;
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
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        payload: {
          action: "update",
          ...this.serializePresence(connectionId),
          total: this.presence.size
        }
      });
    }
    if (payload?.type === "LOBBY_JOIN" && payload.userId) {
      this.handleLobbyJoin(campaignId, payload.userId, payload.characterId);
    }
    if (payload?.type === "LOBBY_LEAVE" && payload.userId) {
      this.handleLobbyLeave(campaignId, payload.userId);
    }
    if (payload?.type === "LOBBY_TOGGLE_READY" && payload.userId) {
      this.handleLobbyToggleReady(campaignId, payload.userId, payload.isReady ?? false, payload.characterId);
    }
    if (payload?.type === "REQUEST_STATE") {
      const combatState = await this.loadAuthCombatState(campaignId);
      const socket = this.sessions.get(connectionId);
      if (!combatState || !socket) return;
      socket.send(JSON.stringify({
        type: "STATE_SYNC",
        campaignId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        payload: { state: combatState }
      }));
    }
  }
  handleDisconnect(connectionId, campaignId) {
    if (!this.sessions.has(connectionId)) {
      return;
    }
    this.sessions.delete(connectionId);
    const presenceEntry = this.serializePresence(connectionId);
    this.presence.delete(connectionId);
    this.broadcast({
      type: "presence",
      campaignId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      payload: {
        action: "leave",
        ...presenceEntry,
        total: this.presence.size
      }
    });
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // LOBBY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  initializeLobby(campaignId) {
    if (!this.lobbyState) {
      this.lobbyState = {
        campaignId,
        players: {},
        readyCount: 0,
        totalCount: 0
      };
    }
  }
  async saveLobbyState() {
    if (this.lobbyState) {
      await this.state.storage.put("lobbyState", this.lobbyState);
    }
  }
  handleLobbyJoin(campaignId, userId, characterId) {
    this.initializeLobby(campaignId);
    if (!this.lobbyState) return;
    const joinedAt = (/* @__PURE__ */ new Date()).toISOString();
    const wasReady = this.lobbyState.players[userId]?.isReady ?? false;
    this.lobbyState.players[userId] = {
      userId,
      characterId,
      isReady: wasReady,
      // Preserve ready state if rejoining
      joinedAt
    };
    this.lobbyState.totalCount = Object.keys(this.lobbyState.players).length;
    this.lobbyState.readyCount = Object.values(this.lobbyState.players).filter((p) => p.isReady).length;
    this.saveLobbyState();
    this.broadcast({
      type: "LOBBY_PLAYER_JOINED",
      campaignId,
      timestamp: joinedAt,
      payload: {
        userId,
        characterId,
        joinedAt,
        lobbyState: this.lobbyState
      }
    });
  }
  handleLobbyLeave(campaignId, userId) {
    if (!this.lobbyState || !this.lobbyState.players[userId]) return;
    delete this.lobbyState.players[userId];
    this.lobbyState.totalCount = Object.keys(this.lobbyState.players).length;
    this.lobbyState.readyCount = Object.values(this.lobbyState.players).filter((p) => p.isReady).length;
    const leftAt = (/* @__PURE__ */ new Date()).toISOString();
    this.saveLobbyState();
    this.broadcast({
      type: "LOBBY_PLAYER_LEFT",
      campaignId,
      timestamp: leftAt,
      payload: {
        userId,
        leftAt,
        lobbyState: this.lobbyState
      }
    });
  }
  handleLobbyToggleReady(campaignId, userId, isReady, characterId) {
    this.initializeLobby(campaignId);
    if (!this.lobbyState) return;
    if (!this.lobbyState.players[userId]) {
      this.lobbyState.players[userId] = {
        userId,
        characterId,
        isReady: false,
        joinedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    this.lobbyState.players[userId].isReady = isReady;
    if (characterId) {
      this.lobbyState.players[userId].characterId = characterId;
    }
    this.lobbyState.readyCount = Object.values(this.lobbyState.players).filter((p) => p.isReady).length;
    this.saveLobbyState();
    this.broadcast({
      type: "LOBBY_PLAYER_READY",
      campaignId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      payload: {
        userId,
        isReady,
        characterId,
        lobbyState: this.lobbyState
      }
    });
  }
  async nextSequence() {
    const next = this.sequence + 1;
    this.sequence = next;
    await this.state.storage.put("sequence", next);
    return next;
  }
  combatStateKey(campaignId) {
    return `combat_state:${campaignId}`;
  }
  async loadCombatState(campaignId) {
    return this.state.blockConcurrencyWhile(async () => {
      return this.state.storage.get(this.combatStateKey(campaignId));
    });
  }
  async saveCombatState(campaignId, combatState) {
    return this.state.blockConcurrencyWhile(async () => {
      const next = this.sequence + 1;
      this.sequence = next;
      await this.state.storage.put({
        [this.combatStateKey(campaignId)]: combatState,
        sequence: next
      });
      return next;
    });
  }
  async broadcastCombatEvent(campaignId, type, payload) {
    const sequence = await this.saveCombatStateSequence();
    this.broadcast({
      type,
      campaignId,
      sequence,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      payload
    });
  }
  async saveCombatStateSequence() {
    return this.state.blockConcurrencyWhile(async () => {
      const next = this.sequence + 1;
      this.sequence = next;
      await this.state.storage.put("sequence", next);
      return next;
    });
  }
  async handleRollRequest(campaignId, body, request) {
    const parsed = parseRollRequest(body);
    if (parsed instanceof Response) {
      return parsed;
    }
    const requestId = parsed.requestId ?? crypto.randomUUID();
    const roll = rollD100();
    const modifier = parsed.modifier ?? 0;
    const total = roll + modifier;
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const record = {
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
      status: "pending"
    };
    const persistenceError = await this.persistSupabase(
      "roll_requests",
      mapRollRequestForSupabase(record),
      { upsert: true }
    );
    if (persistenceError) {
      return persistenceError;
    }
    await this.state.storage.put(this.rollRequestKey(requestId), record);
    const sequence = await this.nextSequence();
    const event = {
      type: "roll",
      campaignId,
      sequence,
      timestamp: createdAt,
      payload: { request: record }
    };
    this.broadcast(event);
    return jsonResponse({ ok: true, sequence, request: record }, 200, {}, request);
  }
  async handleContestRequest(campaignId, body, request) {
    const parsed = parseContestSelection(body);
    if (parsed instanceof Response) {
      return parsed;
    }
    const requestKey = this.rollRequestKey(parsed.requestId);
    const rollRequest = await this.state.storage.get(requestKey);
    if (!rollRequest) {
      return jsonResponse({ error: "Roll request not found." }, 404, {}, request);
    }
    const contestId = parsed.contestId ?? crypto.randomUUID();
    const npcRoll = rollD100();
    const npcModifier = parsed.npcModifier ?? 0;
    const npcTotal = npcRoll + npcModifier;
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const outcome = rollRequest.total === npcTotal ? "tie" : rollRequest.total > npcTotal ? "player" : "npc";
    const contest = {
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
      createdAt
    };
    const updatedRequest = {
      ...rollRequest,
      status: "contested",
      contestId
    };
    const persistenceError = await this.persistSupabase(
      "roll_contests",
      mapContestForSupabase(contest),
      { upsert: true }
    );
    if (persistenceError) {
      return persistenceError;
    }
    const requestUpdateError = await this.persistSupabase(
      "roll_requests",
      mapRollRequestForSupabase(updatedRequest),
      { upsert: true }
    );
    if (requestUpdateError) {
      return requestUpdateError;
    }
    await this.state.storage.put(requestKey, updatedRequest);
    await this.state.storage.put(this.rollContestKey(contestId), contest);
    const sequence = await this.nextSequence();
    const event = {
      type: "contest",
      campaignId,
      sequence,
      timestamp: createdAt,
      payload: { request: updatedRequest, contest }
    };
    this.broadcast(event);
    return jsonResponse({ ok: true, sequence, contest }, 200, {}, request);
  }
  async handleCombatAction(campaignId, action, body, request) {
    switch (action) {
      // ═══════════════════════════════════════════════════════════════════════
      // AUTHORITATIVE COMBAT SYSTEM (new)
      // ═══════════════════════════════════════════════════════════════════════
      case "auth-state":
        return this.handleAuthoritativeState(campaignId, request);
      case "auth-start":
        return this.handleAuthoritativeStart(campaignId, body, request);
      case "auth-submit-initiative-roll":
        return this.handleSubmitInitiativeRoll(campaignId, body, request);
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
      case "auth-initiate-skill-contest":
        return this.handleInitiateSkillContest(campaignId, body, request);
      case "auth-respond-skill-contest":
        return this.handleRespondSkillContest(campaignId, body, request);
      case "auth-request-skill-check":
        return this.handleRequestSkillCheck(campaignId, body, request);
      case "auth-submit-skill-check":
        return this.handleSubmitSkillCheck(campaignId, body, request);
      case "auth-remove-entity":
        return this.handleRemoveEntity(campaignId, body, request);
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
  async handleCombatState(campaignId, request) {
    const combatState = await this.loadCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }
    return jsonResponse({ ok: true, sequence: this.sequence, state: combatState }, 200, {}, request);
  }
  async handleCombatAmbush(campaignId, body, request) {
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
      hadAmbushPenalty
    });
    combatState.eventLog.push(ambushEntry);
    const sequence = await this.saveCombatState(campaignId, combatState);
    this.broadcast({
      type: "ambush_resolved",
      campaignId,
      sequence,
      timestamp: ambushEntry.timestamp,
      payload: { state: combatState, combatantId: targetId, hadAmbushPenalty }
    });
    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }
  async handleCombatStart(campaignId, body, request) {
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
    const initiativeScores = /* @__PURE__ */ new Map();
    const groupScores = /* @__PURE__ */ new Map();
    combatants.forEach((combatant) => {
      const score = (combatant.initiative ?? 0) + (combatant.initiativeRoll ?? 0) + (combatant.initiativeBonus ?? 0);
      initiativeScores.set(combatant.id, score);
      if (parsed.groupInitiative) {
        const groupKey = combatant.groupId ?? combatant.id;
        const current = groupScores.get(groupKey);
        if (current == null || score > current) {
          groupScores.set(groupKey, score);
        }
      }
    });
    const initiativeOrder = [...combatants].sort((left, right) => {
      const leftScore = parsed.groupInitiative ? groupScores.get(left.groupId ?? left.id) ?? 0 : initiativeScores.get(left.id) ?? 0;
      const rightScore = parsed.groupInitiative ? groupScores.get(right.groupId ?? right.id) ?? 0 : initiativeScores.get(right.id) ?? 0;
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }
      const leftTie = initiativeScores.get(left.id) ?? 0;
      const rightTie = initiativeScores.get(right.id) ?? 0;
      if (leftTie !== rightTie) {
        return rightTie - leftTie;
      }
      return left.id.localeCompare(right.id);
    }).map((combatant) => combatant.id);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const combatState = {
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
      eventLog: []
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
      groupInitiative: parsed.groupInitiative
    });
    combatState.eventLog.push(startedEntry);
    if (combatState.activeCombatantId) {
      combatState.eventLog.push(
        createCombatEventLogEntry("turn_started", {
          combatantId: combatState.activeCombatantId,
          round: combatState.round,
          turnIndex: combatState.turnIndex
        })
      );
    }
    const sequence = await this.saveCombatState(campaignId, combatState);
    this.broadcast({
      type: "combat_started",
      campaignId,
      sequence,
      timestamp: now,
      payload: { state: combatState }
    });
    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }
  async handleCombatAdvance(campaignId, body, request) {
    const parsed = parseCombatAdvance(body);
    if (parsed instanceof Response) {
      return parsed;
    }
    const combatState = await this.loadCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
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
          turnIndex: combatState.turnIndex
        })
      );
    }
    combatState.eventLog.push(
      createCombatEventLogEntry("status_tick", {
        combatantId: previousCombatantId,
        updatedStatusEffects: parsed.statusEffectsById ?? null
      })
    );
    const hadAmbushPenalty = Boolean(
      previousCombatantId != null && combatState.round === 1 && combatState.ambushRoundFlags[previousCombatantId]
    );
    if (previousCombatantId && hadAmbushPenalty) {
      combatState.ambushRoundFlags[previousCombatantId] = false;
      combatState.eventLog.push(
        createCombatEventLogEntry("ambush_applied", {
          skippedCombatants: [previousCombatantId]
        })
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
          turnIndex: combatState.turnIndex
        })
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
        ambushCleared: hadAmbushPenalty
      }
    });
    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }
  async handleCombatSpend(campaignId, body, request) {
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
      metadata: parsed.metadata ?? null
    });
    combatState.eventLog.push(actionEntry);
    const sequence = await this.saveCombatState(campaignId, combatState);
    this.broadcast({
      type: "action_spent",
      campaignId,
      sequence,
      timestamp: actionEntry.timestamp,
      payload: { state: combatState, action: actionEntry.payload }
    });
    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }
  async handleCombatReaction(campaignId, body, request) {
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
    combatState.reactionsUsedById[parsed.combatantId] = (combatState.reactionsUsedById[parsed.combatantId] ?? 0) + 1;
    const reactionEntry = createCombatEventLogEntry("reaction_spent", {
      combatantId: parsed.combatantId,
      actionPointCost: parsed.actionPointCost,
      reactionType: parsed.reactionType,
      metadata: parsed.metadata ?? null
    });
    combatState.eventLog.push(reactionEntry);
    const sequence = await this.saveCombatState(campaignId, combatState);
    this.broadcast({
      type: "reaction_spent",
      campaignId,
      sequence,
      timestamp: reactionEntry.timestamp,
      payload: { state: combatState, reaction: reactionEntry.payload }
    });
    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHORITATIVE COMBAT SYSTEM HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════
  authCombatStateKey(campaignId) {
    return `auth_combat_state:${campaignId}`;
  }
  async loadAuthCombatState(campaignId) {
    return this.state.blockConcurrencyWhile(async () => {
      return this.state.storage.get(this.authCombatStateKey(campaignId));
    });
  }
  async saveAuthCombatState(campaignId, combatState) {
    return this.state.blockConcurrencyWhile(async () => {
      const next = this.sequence + 1;
      this.sequence = next;
      combatState.version = next;
      combatState.lastUpdatedAt = (/* @__PURE__ */ new Date()).toISOString();
      await this.state.storage.put({
        [this.authCombatStateKey(campaignId)]: combatState,
        sequence: next
      });
      return next;
    });
  }
  broadcastAuthEvent(type, campaignId, sequence, payload) {
    this.broadcast({
      type,
      campaignId,
      sequence,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      payload
    });
  }
  createAuthLogEntry(type, sourceEntityId, targetEntityId, data) {
    return {
      id: crypto.randomUUID(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      type,
      sourceEntityId,
      targetEntityId,
      data
    };
  }
  // Validation: Check if entity can take an action
  validateAction(state, entityId, senderId, apCost, energyCost) {
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
  validateReaction(state, entityId, senderId) {
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
    const isGm = senderId === "gm" || senderId.startsWith("gm:");
    if (!isGm && entity.controller !== senderId && entity.controller !== `player:${senderId}`) {
      return { allowed: false, reason: "You do not control this entity" };
    }
    return { allowed: true };
  }
  validateTurnEnd(state, entityId, senderId) {
    const entity = state.entities[entityId];
    if (!entity) {
      return { allowed: false, reason: "Entity not found" };
    }
    if (state.activeEntityId !== entityId) {
      return { allowed: false, reason: "Not the active entity's turn" };
    }
    const isGm = senderId === "gm" || senderId.startsWith("gm:");
    if (!isGm && entity.controller !== senderId && entity.controller !== `player:${senderId}`) {
      return { allowed: false, reason: "You do not control this entity" };
    }
    return { allowed: true };
  }
  validateDiceRoll(roll) {
    if (roll.diceCount < 1 || roll.diceCount > 20) {
      return "Dice count must be between 1 and 20";
    }
    if (roll.diceSize < 2 || roll.diceSize > 100) {
      return "Dice size must be between 2 and 100";
    }
    if (roll.rawValues.length !== roll.diceCount) {
      return "Raw values count does not match dice count";
    }
    for (const value of roll.rawValues) {
      if (value < 1 || value > roll.diceSize) {
        return `Dice value ${value} is out of range [1, ${roll.diceSize}]`;
      }
      if (!Number.isInteger(value)) {
        return "Dice values must be integers";
      }
    }
    return true;
  }
  calculateRollResult(roll, skill, skillModifier) {
    const selectedDie = roll.keepHighest ? Math.max(...roll.rawValues) : Math.min(...roll.rawValues);
    const total = selectedDie + roll.modifier + skillModifier;
    const audit = `${roll.diceCount}d${roll.diceSize} [${roll.rawValues.join(", ")}] ${roll.keepHighest ? "highest" : "lowest"}=${selectedDie} + ${roll.modifier} (modifier) + ${skillModifier} (${skill}) = ${total}`;
    return {
      skill,
      modifier: skillModifier,
      diceCount: roll.diceCount,
      keepHighest: roll.keepHighest,
      rawDice: roll.rawValues,
      selectedDie,
      total,
      audit
    };
  }
  validateAndConvertRoll(roll, skill, skillModifier, request) {
    const validation = this.validateDiceRoll(roll);
    if (validation !== true) {
      return jsonResponse({ error: validation }, 400, {}, request);
    }
    return this.calculateRollResult(roll, skill, skillModifier);
  }
  // Sort initiative with tiebreakers
  sortInitiative(entries) {
    return [...entries].sort((a, b) => {
      if (a.roll !== b.roll) return b.roll - a.roll;
      if (a.skillValue !== b.skillValue) return b.skillValue - a.skillValue;
      if (a.currentEnergy !== b.currentEnergy) return b.currentEnergy - a.currentEnergy;
      return a.entityId.localeCompare(b.entityId);
    }).map((e) => e.entityId);
  }
  // Sort initiative with group mode
  sortGroupInitiative(entries, entities) {
    const groups = { ally: [], enemy: [] };
    for (const entry of entries) {
      const entity = entities[entry.entityId];
      if (entity) {
        groups[entity.faction].push(entry);
      }
    }
    const groupBests = [];
    for (const [faction, factionEntries] of Object.entries(groups)) {
      if (factionEntries.length === 0) continue;
      const sorted = this.sortInitiative(factionEntries);
      const bestEntry = factionEntries.find((e) => e.entityId === sorted[0]);
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
    const result = [];
    for (const { faction } of groupBests) {
      result.push(...this.sortInitiative(groups[faction]));
    }
    return result;
  }
  // Handler: Get current authoritative combat state
  async handleAuthoritativeState(campaignId, request) {
    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }
    return jsonResponse({ ok: true, sequence: this.sequence, state: combatState }, 200, {}, request);
  }
  // Handler: Start authoritative combat
  async handleAuthoritativeStart(campaignId, body, request) {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }
    const initiativeMode = body.initiativeMode === "group" ? "group" : "individual";
    const manualInitiative = body.manualInitiative === true;
    const entities = body.entities;
    if (!entities || Object.keys(entities).length === 0) {
      return jsonResponse({ error: "No entities provided." }, 400, {}, request);
    }
    let initiativeRolls = {};
    let initiativeOrder = [];
    if (manualInitiative) {
      initiativeOrder = [];
    } else {
      for (const [entityId, entity] of Object.entries(entities)) {
        const roll = rollD100();
        const skillValue = entity.skills[entity.initiativeSkill] ?? 0;
        initiativeRolls[entityId] = {
          entityId,
          roll,
          skillValue,
          currentEnergy: entity.energy.current
        };
      }
      initiativeOrder = initiativeMode === "group" ? this.sortGroupInitiative(Object.values(initiativeRolls), entities) : this.sortInitiative(Object.values(initiativeRolls));
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const combatId = crypto.randomUUID();
    const allies = Object.entries(entities).filter(([_, e]) => e.faction === "ally").map(([id]) => id);
    const enemies = Object.entries(entities).filter(([_, e]) => e.faction === "enemy").map(([id]) => id);
    const numberedEntities = this.assignMonsterDisplayNames(entities);
    const combatState = {
      combatId,
      campaignId,
      phase: manualInitiative ? "initiative-rolling" : "active-turn",
      round: 1,
      turnIndex: 0,
      initiativeOrder,
      activeEntityId: manualInitiative ? null : initiativeOrder[0] ?? null,
      initiativeMode,
      initiativeRolls,
      entities: numberedEntities,
      grid: { allies, enemies },
      players: {},
      pendingAction: null,
      pendingReactions: [],
      pendingSkillContests: {},
      pendingSkillChecks: {},
      monsterNameCounters: {},
      log: [],
      version: 0,
      startedAt: now,
      lastUpdatedAt: now
    };
    if (!manualInitiative && combatState.activeEntityId) {
      const activeEntity = combatState.entities[combatState.activeEntityId];
      if (activeEntity) {
        activeEntity.ap.current = activeEntity.ap.max;
        activeEntity.reaction.available = true;
      }
    }
    combatState.log.push(this.createAuthLogEntry("combat_started", void 0, void 0, {
      initiativeOrder,
      initiativeMode,
      entityCount: Object.keys(entities).length,
      manualInitiative
    }));
    if (!manualInitiative && combatState.activeEntityId) {
      combatState.log.push(this.createAuthLogEntry("turn_started", combatState.activeEntityId, void 0, {
        round: 1,
        turnIndex: 0
      }));
    }
    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("COMBAT_STARTED", campaignId, sequence, { state: combatState });
    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }
  // Handler: Submit initiative roll
  async handleSubmitInitiativeRoll(campaignId, body, request) {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }
    const entityId = body.entityId;
    const roll = body.roll;
    if (!entityId || !roll) {
      return jsonResponse({ error: "Missing entityId or roll." }, 400, {}, request);
    }
    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat not found." }, 404, {}, request);
    }
    if (combatState.phase !== "initiative-rolling") {
      return jsonResponse({ error: "Combat is not in initiative-rolling phase." }, 400, {}, request);
    }
    const entity = combatState.entities[entityId];
    if (!entity) {
      return jsonResponse({ error: "Entity not found." }, 404, {}, request);
    }
    const validation = this.validateDiceRoll(roll);
    if (validation !== true) {
      return jsonResponse({ error: validation }, 400, {}, request);
    }
    const skillModifier = entity.skills[entity.initiativeSkill] ?? 0;
    const rollResult = this.calculateRollResult(roll, entity.initiativeSkill, skillModifier);
    combatState.initiativeRolls[entityId] = {
      entityId,
      roll: rollResult.selectedDie,
      skillValue: skillModifier,
      currentEnergy: entity.energy.current
    };
    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("INITIATIVE_ROLL_SUBMITTED", campaignId, sequence, {
      entityId,
      playerId: "",
      // TODO: Get from request
      roll: rollResult
    });
    const allEntityIds = Object.keys(combatState.entities);
    const rolledEntityIds = Object.keys(combatState.initiativeRolls);
    const allRolled = allEntityIds.every((id) => rolledEntityIds.includes(id));
    if (allRolled) {
      const initiativeOrder = combatState.initiativeMode === "group" ? this.sortGroupInitiative(Object.values(combatState.initiativeRolls), combatState.entities) : this.sortInitiative(Object.values(combatState.initiativeRolls));
      combatState.initiativeOrder = initiativeOrder;
      combatState.phase = "active-turn";
      combatState.activeEntityId = initiativeOrder[0] ?? null;
      combatState.turnIndex = 0;
      if (combatState.activeEntityId) {
        const activeEntity = combatState.entities[combatState.activeEntityId];
        if (activeEntity) {
          activeEntity.ap.current = activeEntity.ap.max;
          activeEntity.reaction.available = true;
        }
      }
      if (combatState.activeEntityId) {
        combatState.log.push(this.createAuthLogEntry("turn_started", combatState.activeEntityId, void 0, {
          round: 1,
          turnIndex: 0
        }));
      }
      const finalSequence = await this.saveAuthCombatState(campaignId, combatState);
      this.broadcastAuthEvent("ALL_INITIATIVE_ROLLED", campaignId, finalSequence, {
        initiativeOrder,
        rollResults: Object.fromEntries(
          Object.entries(combatState.initiativeRolls).map(([id, entry]) => [id, {
            skill: combatState.entities[id]?.initiativeSkill || "initiative",
            modifier: entry.skillValue,
            diceCount: 1,
            keepHighest: true,
            rawDice: [entry.roll],
            selectedDie: entry.roll,
            total: entry.roll + entry.skillValue,
            audit: `1d100 [${entry.roll}] + ${entry.skillValue} = ${entry.roll + entry.skillValue}`
          }])
        )
      });
      return jsonResponse({ ok: true, sequence: finalSequence, state: combatState }, 200, {}, request);
    }
    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }
  // Handler: Declare an action
  async handleDeclareAction(campaignId, body, request) {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }
    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }
    const entityId = parseRequiredStringField(body.entityId, "entityId", request);
    if (entityId instanceof Response) return entityId;
    const senderId = parseRequiredStringField(body.senderId, "senderId", request);
    if (senderId instanceof Response) return senderId;
    const actionType = body.type ?? "other";
    const targetEntityId = parseStringField(body.targetEntityId, "targetEntityId", false, request);
    if (targetEntityId instanceof Response) return targetEntityId;
    const apCost = parseNumberField(body.apCost, "apCost", 0, request);
    if (apCost instanceof Response) return apCost;
    const energyCost = parseNumberField(body.energyCost, "energyCost", 0, request);
    if (energyCost instanceof Response) return energyCost;
    const interruptible = body.interruptible !== false;
    const validation = this.validateAction(combatState, entityId, senderId, apCost, energyCost);
    if (!validation.allowed) {
      const sequence2 = await this.saveAuthCombatState(campaignId, combatState);
      this.broadcastAuthEvent("ACTION_REJECTED", campaignId, sequence2, {
        entityId,
        reason: validation.reason
      });
      return jsonResponse({ ok: false, error: validation.reason }, 400, {}, request);
    }
    const entity = combatState.entities[entityId];
    entity.ap.current -= apCost;
    entity.energy.current -= energyCost;
    const pendingAction = {
      actionId: crypto.randomUUID(),
      type: actionType,
      sourceEntityId: entityId,
      targetEntityId: targetEntityId ?? void 0,
      apCost,
      energyCost,
      interruptible,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      metadata: body.metadata
    };
    combatState.pendingAction = pendingAction;
    combatState.log.push(this.createAuthLogEntry("action_declared", entityId, targetEntityId ?? void 0, {
      actionType,
      apCost,
      energyCost,
      interruptible
    }));
    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("ACTION_DECLARED", campaignId, sequence, {
      action: pendingAction,
      phase: combatState.phase,
      state: combatState
    });
    return jsonResponse({ ok: true, sequence, state: combatState, action: pendingAction }, 200, {}, request);
  }
  // Handler: Declare a reaction
  async handleDeclareReaction(campaignId, body, request) {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }
    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }
    const entityId = parseRequiredStringField(body.entityId, "entityId", request);
    if (entityId instanceof Response) return entityId;
    const senderId = parseRequiredStringField(body.senderId, "senderId", request);
    if (senderId instanceof Response) return senderId;
    const reactionType = body.type ?? "other";
    const apCost = parseNumberField(body.apCost, "apCost", 0, request);
    if (apCost instanceof Response) return apCost;
    const energyCost = parseNumberField(body.energyCost, "energyCost", 0, request);
    if (energyCost instanceof Response) return energyCost;
    const validation = this.validateReaction(combatState, entityId, senderId);
    if (!validation.allowed) {
      const sequence2 = await this.saveAuthCombatState(campaignId, combatState);
      this.broadcastAuthEvent("REACTION_REJECTED", campaignId, sequence2, {
        entityId,
        reason: validation.reason
      });
      return jsonResponse({ ok: false, error: validation.reason }, 400, {}, request);
    }
    const entity = combatState.entities[entityId];
    if (entity.ap.current < apCost) {
      return jsonResponse({ ok: false, error: "Insufficient AP for reaction" }, 400, {}, request);
    }
    entity.ap.current -= apCost;
    entity.energy.current = Math.max(0, entity.energy.current - energyCost);
    entity.reaction.available = false;
    const pendingReaction = {
      reactionId: crypto.randomUUID(),
      entityId,
      type: reactionType,
      targetActionId: combatState.pendingAction.actionId,
      skill: body.skill,
      apCost,
      energyCost,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      effects: body.effects
    };
    combatState.pendingReactions.push(pendingReaction);
    if (combatState.phase === "active-turn") {
      combatState.phase = "reaction-interrupt";
    }
    combatState.log.push(this.createAuthLogEntry("reaction_declared", entityId, void 0, {
      reactionType,
      targetActionId: pendingReaction.targetActionId,
      apCost,
      energyCost
    }));
    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("REACTION_DECLARED", campaignId, sequence, {
      reaction: pendingReaction,
      pendingReactionsCount: combatState.pendingReactions.length,
      state: combatState
    });
    return jsonResponse({ ok: true, sequence, state: combatState, reaction: pendingReaction }, 200, {}, request);
  }
  // Handler: Resolve pending reactions (GM triggers this)
  async handleResolveReactions(campaignId, body, request) {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }
    const senderId = parseRequiredStringField(body.senderId, "senderId", request);
    if (senderId instanceof Response) return senderId;
    const isGm = senderId === "gm" || senderId.startsWith("gm:");
    if (!isGm) {
      return jsonResponse({ error: "Only GM can resolve reactions." }, 403, {}, request);
    }
    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }
    if (!combatState.pendingAction) {
      return jsonResponse({ error: "No pending action to resolve." }, 400, {}, request);
    }
    combatState.phase = "resolution";
    const reactorOrder = combatState.initiativeOrder.filter(
      (id) => combatState.pendingReactions.some((r) => r.entityId === id)
    );
    const sortedReactions = reactorOrder.map((id) => combatState.pendingReactions.find((r) => r.entityId === id)).filter(Boolean);
    let actionCancelled = false;
    let actionModified = false;
    const resolvedReactions = [];
    for (const reaction of sortedReactions) {
      const success = true;
      const effects = reaction.effects ?? [];
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
                  const current = target.wounds[woundType] ?? 0;
                  target.wounds[woundType] = current + count;
                }
                combatState.log.push(this.createAuthLogEntry("wounds_applied", reaction.entityId, effect.targetEntityId, {
                  wounds: effect.data.wounds,
                  source: "reaction"
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
                  duration: effect.data.statusDuration ?? null
                });
                combatState.log.push(this.createAuthLogEntry("status_applied", reaction.entityId, effect.targetEntityId, {
                  statusKey: effect.data.statusKey,
                  stacks: effect.data.statusStacks ?? 1,
                  duration: effect.data.statusDuration ?? null
                }));
              }
            }
            break;
        }
      }
      resolvedReactions.push({ reaction, success, effects });
      combatState.log.push(this.createAuthLogEntry("reaction_resolved", reaction.entityId, void 0, {
        reactionId: reaction.reactionId,
        success,
        effectCount: effects.length
      }));
    }
    combatState.pendingReactions = [];
    if (actionCancelled) {
      combatState.log.push(this.createAuthLogEntry("action_cancelled", combatState.pendingAction.sourceEntityId, void 0, {
        actionId: combatState.pendingAction.actionId,
        reason: "cancelled_by_reaction"
      }));
    } else {
      combatState.log.push(this.createAuthLogEntry("action_resolved", combatState.pendingAction.sourceEntityId, combatState.pendingAction.targetEntityId, {
        actionId: combatState.pendingAction.actionId,
        modified: actionModified
      }));
    }
    const resolvedAction = combatState.pendingAction;
    combatState.pendingAction = null;
    combatState.phase = "active-turn";
    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("REACTIONS_RESOLVED", campaignId, sequence, {
      reactions: resolvedReactions,
      action: resolvedAction,
      actionCancelled,
      actionModified,
      state: combatState
    });
    return jsonResponse({
      ok: true,
      sequence,
      state: combatState,
      reactions: resolvedReactions,
      actionCancelled,
      actionModified
    }, 200, {}, request);
  }
  // Handler: End turn (voluntary or forced)
  async handleAuthoritativeEndTurn(campaignId, body, request) {
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
    const entityId = parseRequiredStringField(body.entityId, "entityId", request);
    if (entityId instanceof Response) return entityId;
    const senderId = parseRequiredStringField(body.senderId, "senderId", request);
    if (senderId instanceof Response) return senderId;
    const validation = this.validateTurnEnd(combatState, entityId, senderId);
    if (!validation.allowed) {
      return jsonResponse({ error: validation.reason }, 403, {}, request);
    }
    if (combatState.pendingAction) {
      combatState.pendingAction = null;
      combatState.pendingReactions = [];
    }
    const previousEntityId = combatState.activeEntityId;
    const previousEntity = previousEntityId ? combatState.entities[previousEntityId] : null;
    if (previousEntityId) {
      const voluntary = body.voluntary !== false;
      combatState.log.push(this.createAuthLogEntry("turn_ended", previousEntityId, void 0, {
        round: combatState.round,
        turnIndex: combatState.turnIndex,
        voluntary
      }));
    }
    let nextIndex = combatState.turnIndex + 1;
    let nextRound = combatState.round;
    if (nextIndex >= combatState.initiativeOrder.length) {
      nextIndex = 0;
      nextRound += 1;
      for (const entity of Object.values(combatState.entities)) {
        entity.reaction.available = true;
      }
      combatState.log.push(this.createAuthLogEntry("round_started", void 0, void 0, {
        round: nextRound
      }));
    }
    combatState.turnIndex = nextIndex;
    combatState.round = nextRound;
    combatState.activeEntityId = combatState.initiativeOrder[nextIndex] ?? null;
    combatState.phase = "active-turn";
    if (combatState.activeEntityId) {
      const activeEntity = combatState.entities[combatState.activeEntityId];
      if (activeEntity) {
        activeEntity.ap.current = activeEntity.ap.max;
        combatState.log.push(this.createAuthLogEntry("turn_started", combatState.activeEntityId, void 0, {
          round: combatState.round,
          turnIndex: combatState.turnIndex,
          apRestored: activeEntity.ap.max
        }));
      }
    }
    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("TURN_ENDED", campaignId, sequence, {
      entityId: previousEntityId ?? entityId,
      entityName: previousEntity?.displayName || previousEntity?.name || "Unknown",
      reason: body.voluntary === false ? "no_ap" : "voluntary",
      energyGained: 0
    });
    this.broadcastAuthEvent("STATE_SYNC", campaignId, sequence, {
      state: combatState
    });
    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }
  // Handler: GM Override
  async handleGmOverride(campaignId, body, request) {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }
    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }
    const gmId = parseRequiredStringField(body.gmId, "gmId", request);
    if (gmId instanceof Response) return gmId;
    const overrideType = body.type;
    if (!overrideType) {
      return jsonResponse({ error: "Override type required." }, 400, {}, request);
    }
    const targetEntityId = parseStringField(body.targetEntityId, "targetEntityId", false, request);
    if (targetEntityId instanceof Response) return targetEntityId;
    const reason = parseStringField(body.reason, "reason", false, request);
    if (reason instanceof Response) return reason;
    const override = {
      type: overrideType,
      gmId,
      targetEntityId: targetEntityId ?? void 0,
      data: body.data,
      reason: reason ?? void 0,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    switch (overrideType) {
      case "adjust_ap":
        if (targetEntityId && combatState.entities[targetEntityId]) {
          const delta = parseNumberField(body.data?.delta ?? body.data?.amount, "delta", 0, request);
          if (typeof delta === "number") {
            const entity = combatState.entities[targetEntityId];
            entity.ap.current = Math.max(0, Math.min(entity.ap.max, entity.ap.current + delta));
          }
        }
        break;
      case "adjust_energy":
        if (targetEntityId && combatState.entities[targetEntityId]) {
          const delta = parseNumberField(body.data?.delta ?? body.data?.amount, "delta", 0, request);
          if (typeof delta === "number") {
            const entity = combatState.entities[targetEntityId];
            entity.energy.current = Math.max(0, Math.min(entity.energy.max, entity.energy.current + delta));
          }
        }
        break;
      case "skip_entity":
        if (combatState.activeEntityId === targetEntityId) {
          const nextIndex = (combatState.turnIndex + 1) % combatState.initiativeOrder.length;
          if (nextIndex < combatState.turnIndex) {
            combatState.round += 1;
          }
          combatState.turnIndex = nextIndex;
          combatState.activeEntityId = combatState.initiativeOrder[nextIndex] ?? null;
        }
        break;
      case "end_turn":
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
          combatState.initiativeOrder = body.data.newOrder;
        }
        break;
      case "add_status":
        if (targetEntityId && combatState.entities[targetEntityId] && body.data?.statusKey) {
          combatState.entities[targetEntityId].statusEffects.push({
            key: body.data.statusKey,
            stacks: body.data.stacks ?? 1,
            duration: body.data.duration ?? null
          });
        }
        break;
      case "remove_status":
        if (targetEntityId && combatState.entities[targetEntityId] && body.data?.statusKey) {
          combatState.entities[targetEntityId].statusEffects = combatState.entities[targetEntityId].statusEffects.filter(
            (s) => s.key !== body.data?.statusKey
          );
        }
        break;
      case "modify_wounds":
        if (targetEntityId && combatState.entities[targetEntityId]) {
          if (body.data?.wounds) {
            const wounds = body.data.wounds;
            for (const [woundType, count] of Object.entries(wounds)) {
              combatState.entities[targetEntityId].wounds[woundType] = count;
            }
          } else if (body.data?.woundType && body.data?.count !== void 0) {
            combatState.entities[targetEntityId].wounds[body.data.woundType] = body.data.count;
          }
        }
        break;
      case "set_phase":
        if (body.data?.phase) {
          combatState.phase = body.data.phase;
        }
        break;
      case "cancel_reaction":
        if (body.data?.reactionId) {
          combatState.pendingReactions = combatState.pendingReactions.filter(
            (r) => r.reactionId !== body.data?.reactionId
          );
        }
        break;
      case "end_combat":
        combatState.phase = "completed";
        break;
    }
    combatState.log.push(this.createAuthLogEntry("gm_override", void 0, targetEntityId ?? void 0, {
      overrideType,
      gmId,
      reason: reason ?? void 0,
      data: body.data
    }));
    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("GM_OVERRIDE", campaignId, sequence, {
      override,
      state: combatState
    });
    return jsonResponse({ ok: true, sequence, state: combatState, override }, 200, {}, request);
  }
  // Handler: End combat
  async handleEndCombat(campaignId, body, request) {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }
    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }
    const reason = body.reason ?? "gm_ended";
    combatState.phase = "completed";
    combatState.pendingAction = null;
    combatState.pendingReactions = [];
    combatState.log.push(this.createAuthLogEntry("combat_ended", void 0, void 0, {
      reason,
      round: combatState.round,
      turnIndex: combatState.turnIndex
    }));
    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("COMBAT_ENDED", campaignId, sequence, {
      combatId: combatState.combatId,
      reason,
      finalLog: combatState.log,
      state: combatState
    });
    return jsonResponse({ ok: true, sequence, state: combatState, reason }, 200, {}, request);
  }
  // ───────────────────────────────────────────────────────────────────────────
  // SKILL CONTEST HANDLERS
  // ───────────────────────────────────────────────────────────────────────────
  async handleInitiateSkillContest(campaignId, body, request) {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }
    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }
    const initiatorEntityId = parseRequiredStringField(body.initiatorEntityId, "initiatorEntityId", request);
    if (initiatorEntityId instanceof Response) return initiatorEntityId;
    const targetEntityId = parseRequiredStringField(body.targetEntityId, "targetEntityId", request);
    if (targetEntityId instanceof Response) return targetEntityId;
    const skill = parseRequiredStringField(body.skill, "skill", request);
    if (skill instanceof Response) return skill;
    const initiator = combatState.entities[initiatorEntityId];
    const target = combatState.entities[targetEntityId];
    if (!initiator) {
      return jsonResponse({ error: "Initiator entity not found." }, 404, {}, request);
    }
    if (!target) {
      return jsonResponse({ error: "Target entity not found." }, 404, {}, request);
    }
    const roll = body.roll;
    if (!isRecord(roll)) {
      return jsonResponse({ error: "Invalid roll data." }, 400, {}, request);
    }
    const skillModifier = initiator.skills[skill] ?? 0;
    const rollData = this.validateAndConvertRoll(roll, skill, skillModifier, request);
    if (rollData instanceof Response) return rollData;
    const contestId = crypto.randomUUID();
    const contest = {
      contestId,
      initiatorId: initiatorEntityId,
      initiatorSkill: skill,
      initiatorRoll: rollData,
      targetId: targetEntityId,
      autoRollDefense: target.autoRollDefense ?? false,
      status: "awaiting_defense",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    combatState.pendingSkillContests[contestId] = contest;
    if (contest.autoRollDefense && target.defaultDefenseSkill) {
      return this.autoResolveContest(campaignId, combatState, contest, target, request);
    }
    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("SKILL_CONTEST_INITIATED", campaignId, sequence, {
      contest,
      initiatorName: initiator.displayName || initiator.name,
      targetName: target.displayName || target.name
    });
    if (target.controller.startsWith("player:")) {
      const targetPlayerId = target.controller.replace("player:", "");
      this.broadcastAuthEvent("SKILL_CONTEST_DEFENSE_REQUESTED", campaignId, sequence, {
        contestId,
        targetEntityId,
        targetPlayerId,
        initiatorName: initiator.displayName || initiator.name,
        initiatorSkill: skill,
        initiatorTotal: rollData.total
      });
    }
    return jsonResponse({ ok: true, sequence, state: combatState, contestId }, 200, {}, request);
  }
  async handleRespondSkillContest(campaignId, body, request) {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }
    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }
    const contestId = parseRequiredStringField(body.contestId, "contestId", request);
    if (contestId instanceof Response) return contestId;
    const entityId = parseRequiredStringField(body.entityId, "entityId", request);
    if (entityId instanceof Response) return entityId;
    const skill = parseRequiredStringField(body.skill, "skill", request);
    if (skill instanceof Response) return skill;
    const contest = combatState.pendingSkillContests[contestId];
    if (!contest) {
      return jsonResponse({ error: "Contest not found." }, 404, {}, request);
    }
    if (contest.status !== "awaiting_defense") {
      return jsonResponse({ error: "Contest already resolved." }, 400, {}, request);
    }
    const defender = combatState.entities[entityId];
    if (!defender) {
      return jsonResponse({ error: "Defender entity not found." }, 404, {}, request);
    }
    const roll = body.roll;
    if (!isRecord(roll)) {
      return jsonResponse({ error: "Invalid roll data." }, 400, {}, request);
    }
    const skillModifier = defender.skills[skill] ?? 0;
    const rollData = this.validateAndConvertRoll(roll, skill, skillModifier, request);
    if (rollData instanceof Response) return rollData;
    const outcome = this.resolveSkillContest(contest.initiatorRoll, rollData);
    contest.defenderSkill = skill;
    contest.defenderRoll = rollData;
    contest.outcome = outcome;
    contest.status = "resolved";
    contest.resolvedAt = (/* @__PURE__ */ new Date()).toISOString();
    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    const initiator = combatState.entities[contest.initiatorId];
    const audit = `${initiator.displayName || initiator.name} (${contest.initiatorRoll.total}) vs ${defender.displayName || defender.name} (${rollData.total}) - ${outcome.isTie ? "TIE" : outcome.winnerId === "initiator" ? "Initiator wins" : "Defender wins"} [${outcome.criticalTier.toUpperCase()}]`;
    this.broadcastAuthEvent("SKILL_CONTEST_RESOLVED", campaignId, sequence, {
      contest,
      outcome,
      initiatorName: initiator.displayName || initiator.name,
      targetName: defender.displayName || defender.name,
      audit
    });
    return jsonResponse({ ok: true, sequence, state: combatState, outcome }, 200, {}, request);
  }
  async handleRequestSkillCheck(campaignId, body, request) {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }
    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }
    const targetPlayerId = parseRequiredStringField(body.targetPlayerId, "targetPlayerId", request);
    if (targetPlayerId instanceof Response) return targetPlayerId;
    const targetEntityId = parseRequiredStringField(body.targetEntityId, "targetEntityId", request);
    if (targetEntityId instanceof Response) return targetEntityId;
    const skill = parseRequiredStringField(body.skill, "skill", request);
    if (skill instanceof Response) return skill;
    const targetNumber = body.targetNumber !== void 0 ? parseNumberField(body.targetNumber, "targetNumber", void 0, request) : void 0;
    const entity = combatState.entities[targetEntityId];
    if (!entity) {
      return jsonResponse({ error: "Entity not found." }, 404, {}, request);
    }
    const checkId = crypto.randomUUID();
    const check = {
      checkId,
      requesterId: "gm",
      // Always GM for now
      targetPlayerId,
      targetEntityId,
      skill,
      targetNumber: typeof targetNumber === "number" ? targetNumber : void 0,
      status: "pending",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    combatState.pendingSkillChecks[checkId] = check;
    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("SKILL_CHECK_REQUESTED", campaignId, sequence, {
      check,
      targetPlayerName: targetPlayerId,
      entityName: entity.displayName || entity.name,
      skill,
      targetNumber
      // Only GM sees this
    });
    return jsonResponse({ ok: true, sequence, state: combatState, checkId }, 200, {}, request);
  }
  async handleSubmitSkillCheck(campaignId, body, request) {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }
    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }
    const checkId = parseRequiredStringField(body.checkId, "checkId", request);
    if (checkId instanceof Response) return checkId;
    const check = combatState.pendingSkillChecks[checkId];
    if (!check) {
      return jsonResponse({ error: "Skill check not found." }, 404, {}, request);
    }
    if (check.status !== "pending") {
      return jsonResponse({ error: "Skill check already completed." }, 400, {}, request);
    }
    const entity = combatState.entities[check.targetEntityId];
    if (!entity) {
      return jsonResponse({ error: "Entity not found." }, 404, {}, request);
    }
    const roll = body.roll;
    if (!isRecord(roll)) {
      return jsonResponse({ error: "Invalid roll data." }, 400, {}, request);
    }
    const skillModifier = entity.skills[check.skill] ?? 0;
    const rollData = this.validateAndConvertRoll(roll, check.skill, skillModifier, request);
    if (rollData instanceof Response) return rollData;
    check.rollData = rollData;
    check.status = "rolled";
    check.resolvedAt = (/* @__PURE__ */ new Date()).toISOString();
    const success = check.targetNumber !== void 0 ? rollData.total >= check.targetNumber : void 0;
    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("SKILL_CHECK_ROLLED", campaignId, sequence, {
      check,
      rollData,
      success
    });
    return jsonResponse({ ok: true, sequence, state: combatState, rollData, success }, 200, {}, request);
  }
  async handleRemoveEntity(campaignId, body, request) {
    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid payload." }, 400, {}, request);
    }
    const combatState = await this.loadAuthCombatState(campaignId);
    if (!combatState) {
      return jsonResponse({ error: "Combat state not found." }, 404, {}, request);
    }
    const entityId = parseRequiredStringField(body.entityId, "entityId", request);
    if (entityId instanceof Response) return entityId;
    const entity = combatState.entities[entityId];
    if (!entity) {
      return jsonResponse({ error: "Entity not found." }, 404, {}, request);
    }
    if (combatState.activeEntityId === entityId) {
      return jsonResponse({ error: "Cannot remove active entity. End their turn first." }, 400, {}, request);
    }
    const reason = body.reason ?? "gm_removed";
    const entityName = entity.displayName || entity.name;
    delete combatState.entities[entityId];
    combatState.initiativeOrder = combatState.initiativeOrder.filter((id) => id !== entityId);
    combatState.grid.allies = combatState.grid.allies.filter((id) => id !== entityId);
    combatState.grid.enemies = combatState.grid.enemies.filter((id) => id !== entityId);
    const removedIndex = combatState.initiativeOrder.indexOf(entityId);
    if (removedIndex !== -1 && removedIndex < combatState.turnIndex) {
      combatState.turnIndex = Math.max(0, combatState.turnIndex - 1);
    }
    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    this.broadcastAuthEvent("ENTITY_REMOVED", campaignId, sequence, {
      entityId,
      entityName,
      reason
    });
    return jsonResponse({ ok: true, sequence, state: combatState }, 200, {}, request);
  }
  // ───────────────────────────────────────────────────────────────────────────
  // SKILL CONTEST HELPER METHODS
  // ───────────────────────────────────────────────────────────────────────────
  calculateCriticalTier(winnerTotal, loserTotal) {
    if (loserTotal <= 0) return "brutal";
    const ratio = winnerTotal / loserTotal;
    if (ratio >= 3) return "brutal";
    if (ratio >= 2) return "vicious";
    if (ratio >= 1.5) return "wicked";
    return "normal";
  }
  resolveSkillContest(initiatorRoll, defenderRoll) {
    const initiatorTotal = initiatorRoll.total;
    const defenderTotal = defenderRoll.total;
    if (initiatorTotal === defenderTotal) {
      return {
        winnerId: null,
        loserId: null,
        winnerTotal: initiatorTotal,
        loserTotal: defenderTotal,
        criticalTier: "normal",
        isTie: true
      };
    }
    const initiatorWins = initiatorTotal > defenderTotal;
    const winnerTotal = initiatorWins ? initiatorTotal : defenderTotal;
    const loserTotal = initiatorWins ? defenderTotal : initiatorTotal;
    return {
      winnerId: initiatorWins ? "initiator" : "defender",
      loserId: initiatorWins ? "defender" : "initiator",
      winnerTotal,
      loserTotal,
      criticalTier: this.calculateCriticalTier(winnerTotal, loserTotal),
      isTie: false
    };
  }
  async autoResolveContest(campaignId, combatState, contest, defender, request) {
    const defenseSkill = defender.defaultDefenseSkill;
    const skillModifier = defender.skills[defenseSkill] ?? 0;
    const diceRoll = Math.floor(Math.random() * 100) + 1;
    const defenderRoll = {
      skill: defenseSkill,
      modifier: skillModifier,
      diceCount: 1,
      keepHighest: true,
      rawDice: [diceRoll],
      selectedDie: diceRoll,
      total: diceRoll + skillModifier,
      audit: `1d100 [${diceRoll}] + ${skillModifier} = ${diceRoll + skillModifier}`
    };
    const outcome = this.resolveSkillContest(contest.initiatorRoll, defenderRoll);
    contest.defenderSkill = defenseSkill;
    contest.defenderRoll = defenderRoll;
    contest.outcome = outcome;
    contest.status = "resolved";
    contest.resolvedAt = (/* @__PURE__ */ new Date()).toISOString();
    const sequence = await this.saveAuthCombatState(campaignId, combatState);
    const initiator = combatState.entities[contest.initiatorId];
    const audit = `${initiator.displayName || initiator.name} (${contest.initiatorRoll.total}) vs ${defender.displayName || defender.name} (${defenderRoll.total}) [AUTO] - ${outcome.isTie ? "TIE" : outcome.winnerId === "initiator" ? "Initiator wins" : "Defender wins"} [${outcome.criticalTier.toUpperCase()}]`;
    this.broadcastAuthEvent("SKILL_CONTEST_RESOLVED", campaignId, sequence, {
      contest,
      outcome,
      initiatorName: initiator.displayName || initiator.name,
      targetName: defender.displayName || defender.name,
      audit
    });
    return jsonResponse({ ok: true, sequence, state: combatState, outcome }, 200, {}, request);
  }
  assignMonsterDisplayNames(entities) {
    const result = {};
    const nameCounts = {};
    const monsterCounts = {};
    for (const entity of Object.values(entities)) {
      if (entity.controller === "gm") {
        const baseName = entity.baseNameForNumbering ?? entity.name;
        monsterCounts[baseName] = (monsterCounts[baseName] ?? 0) + 1;
      }
    }
    for (const [id, entity] of Object.entries(entities)) {
      if (entity.controller === "gm") {
        const baseName = entity.baseNameForNumbering ?? entity.name;
        const count = (nameCounts[baseName] ?? 0) + 1;
        nameCounts[baseName] = count;
        result[id] = {
          ...entity,
          baseNameForNumbering: baseName,
          displayName: monsterCounts[baseName] > 1 ? `${baseName} ${count}` : baseName
        };
      } else {
        result[id] = entity;
      }
    }
    return result;
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // END AUTHORITATIVE COMBAT SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════
  broadcast(event) {
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
  currentPresence() {
    return Array.from(this.presence.keys()).map(
      (connectionId) => this.serializePresence(connectionId)
    );
  }
  serializePresence(connectionId) {
    const presence = this.presence.get(connectionId);
    return {
      connectionId,
      userId: presence?.userId ?? connectionId,
      connectedAt: presence?.connectedAt ?? (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  rollRequestKey(requestId) {
    return `roll_request:${requestId}`;
  }
  rollContestKey(contestId) {
    return `roll_contest:${contestId}`;
  }
  supabaseConfig() {
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Supabase configuration missing." }, 500);
    }
    return { url: this.env.SUPABASE_URL, key: this.env.SUPABASE_SERVICE_ROLE_KEY };
  }
  async persistSupabase(table, payload, options) {
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
        Prefer: options?.upsert ? "resolution=merge-duplicates, return=minimal" : "return=minimal"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errorText = await response.text();
      return jsonResponse(
        { error: `Supabase insert failed for ${table}.`, details: errorText },
        500
      );
    }
    return null;
  }
  async loadCombatantsFromSupabase(campaignId) {
    const config = this.supabaseConfig();
    if (config instanceof Response) {
      return config;
    }
    const headers = {
      apikey: config.key,
      authorization: `Bearer ${config.key}`
    };
    const combatantsUrl = new URL("/rest/v1/campaign_combatants", config.url);
    combatantsUrl.searchParams.set(
      "select",
      "id,initiative,ap_max,energy_max,ap_current,energy_current,is_active"
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
      fetch(woundsUrl.toString(), { headers })
    ]);
    if (!combatantRes.ok) {
      const details = await combatantRes.text();
      return jsonResponse(
        { error: "Failed to load combatants from Supabase.", details },
        500
      );
    }
    if (!statusRes.ok) {
      const details = await statusRes.text();
      return jsonResponse(
        { error: "Failed to load combatant status effects from Supabase.", details },
        500
      );
    }
    if (!woundsRes.ok) {
      const details = await woundsRes.text();
      return jsonResponse(
        { error: "Failed to load combatant wounds from Supabase.", details },
        500
      );
    }
    const combatantRows = await combatantRes.json();
    const statusRows = await statusRes.json();
    const woundRows = await woundsRes.json();
    const statusById = /* @__PURE__ */ new Map();
    statusRows.forEach((row) => {
      if (row.is_active === false) return;
      const list = statusById.get(row.combatant_id) ?? [];
      list.push(row.status_key);
      statusById.set(row.combatant_id, list);
    });
    const woundsById = /* @__PURE__ */ new Map();
    woundRows.forEach((row) => {
      const current = woundsById.get(row.combatant_id) ?? 0;
      const increment = typeof row.wound_count === "number" ? row.wound_count : 0;
      woundsById.set(row.combatant_id, current + increment);
    });
    const readNumber = /* @__PURE__ */ __name((value) => typeof value === "number" && Number.isFinite(value) ? value : 0, "readNumber");
    return combatantRows.map((row) => ({
      id: row.id,
      initiative: readNumber(row.initiative),
      actionPoints: typeof row.ap_max === "number" && Number.isFinite(row.ap_max) ? row.ap_max : readNumber(row.ap_current),
      energy: typeof row.energy_max === "number" && Number.isFinite(row.energy_max) ? row.energy_max : readNumber(row.energy_current),
      statusEffects: statusById.get(row.id) ?? [],
      wounds: woundsById.get(row.id) ?? 0
    }));
  }
};
function jsonResponse(body, status = 200, headers, request) {
  const corsHeaders = request ? getCorsHeaders(request) : {};
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders,
      ...headers
    }
  });
}
__name(jsonResponse, "jsonResponse");
async function readJsonBody(request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonResponse({ error: "Expected JSON body" }, 415, {}, request);
  }
  try {
    return await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, {}, request);
  }
}
__name(readJsonBody, "readJsonBody");
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
__name(isRecord, "isRecord");
function parseStringField(value, field, required = false, request) {
  if (value == null) {
    if (required) {
      return jsonResponse({ error: `Missing ${field}.` }, 400, {}, request);
    }
    return void 0;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return jsonResponse({ error: `Invalid ${field}.` }, 400, {}, request);
  }
  return value;
}
__name(parseStringField, "parseStringField");
function parseRequiredStringField(value, field, request) {
  const parsed = parseStringField(value, field, true, request);
  if (parsed instanceof Response) {
    return parsed;
  }
  return parsed;
}
__name(parseRequiredStringField, "parseRequiredStringField");
function parseNumberField(value, field, fallback = 0, request) {
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
  return jsonResponse({ error: `Invalid ${field}.` }, 400, {}, request);
}
__name(parseNumberField, "parseNumberField");
function parseBooleanField(value, field, fallback = false, request) {
  if (value == null) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return jsonResponse({ error: `Invalid ${field}.` }, 400, {}, request);
}
__name(parseBooleanField, "parseBooleanField");
function parseStringArrayField(value, field, request) {
  if (value == null) {
    return void 0;
  }
  if (!Array.isArray(value)) {
    return jsonResponse({ error: `Invalid ${field}.` }, 400, {}, request);
  }
  for (const entry of value) {
    if (typeof entry !== "string") {
      return jsonResponse({ error: `Invalid ${field}.` }, 400, {}, request);
    }
  }
  return value;
}
__name(parseStringArrayField, "parseStringArrayField");
function parseCombatStart(body) {
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
  const combatants = [];
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
      "combatants.initiativeBonus"
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
      "combatants.statusEffects"
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
      groupId
    });
  }
  return {
    combatants,
    groupInitiative,
    ambushedIds
  };
}
__name(parseCombatStart, "parseCombatStart");
function parseCombatAdvance(body) {
  if (!isRecord(body)) {
    return jsonResponse({ error: "Invalid payload." }, 400);
  }
  let statusEffectsById;
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
__name(parseCombatAdvance, "parseCombatAdvance");
function parseCombatAmbush(body) {
  if (!isRecord(body)) {
    return jsonResponse({ error: "Invalid payload." }, 400);
  }
  const combatantId = parseStringField(body.combatantId, "combatantId");
  if (combatantId instanceof Response) {
    return combatantId;
  }
  return { combatantId };
}
__name(parseCombatAmbush, "parseCombatAmbush");
function parseCombatSpend(body) {
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
    metadata
  };
}
__name(parseCombatSpend, "parseCombatSpend");
function parseCombatReaction(body) {
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
    metadata
  };
}
__name(parseCombatReaction, "parseCombatReaction");
function createCombatEventLogEntry(type, payload) {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    payload
  };
}
__name(createCombatEventLogEntry, "createCombatEventLogEntry");
function parseRollRequest(body) {
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
    requestId
  };
}
__name(parseRollRequest, "parseRollRequest");
function parseContestSelection(body) {
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
    contestId
  };
}
__name(parseContestSelection, "parseContestSelection");
function rollD100() {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % 100 + 1;
}
__name(rollD100, "rollD100");
function mapRollRequestForSupabase(record) {
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
    created_at: record.createdAt
  };
}
__name(mapRollRequestForSupabase, "mapRollRequestForSupabase");
function mapContestForSupabase(record) {
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
    created_at: record.createdAt
  };
}
__name(mapContestForSupabase, "mapContestForSupabase");
var worker_default = {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/(connect|roll|contest)$/);
    const combatMatch = url.pathname.match(
      /^\/api\/campaigns\/([^/]+)\/combat\/[^/]+$/
    );
    if (!match && !combatMatch) {
      return new Response(
        JSON.stringify({ error: "Not found" }),
        {
          status: 404,
          headers: {
            "content-type": "application/json",
            ...corsHeaders
          }
        }
      );
    }
    const campaignId = decodeURIComponent((match ?? combatMatch)[1]);
    const id = env.CAMPAIGN_DO.idFromName(campaignId);
    const stub = env.CAMPAIGN_DO.get(id);
    return stub.fetch(request);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-Fh0bng/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-Fh0bng/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  CampaignDurableObject,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=_worker.js.map
