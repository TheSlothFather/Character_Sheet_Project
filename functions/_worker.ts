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
    if (!match) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    const campaignId = decodeURIComponent(match[1]);
    const action = match[2];

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
    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const campaignId = decodeURIComponent(match[1]);
    const id = env.CAMPAIGN_DO.idFromName(campaignId);
    const stub = env.CAMPAIGN_DO.get(id);

    return stub.fetch(request);
  },
};
