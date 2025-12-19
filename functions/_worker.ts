interface Env {
  CAMPAIGN_DO: DurableObjectNamespace;
}

type CampaignEvent = {
  type: "roll" | "contest" | "presence" | "welcome";
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

export class CampaignDurableObject {
  private state: DurableObjectState;
  private sessions = new Map<string, WebSocket>();
  private presence = new Map<string, StoredPresence>();
  private sequence = 0;
  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
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

    const sequence = await this.nextSequence();
    const event: CampaignEvent = {
      type: action,
      campaignId,
      sequence,
      timestamp: new Date().toISOString(),
      payload: body,
    };

    this.broadcast(event);

    return jsonResponse({ ok: true, sequence });
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
