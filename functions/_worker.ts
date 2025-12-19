export interface Env {
  CAMPAIGN_SESSION: DurableObjectNamespace;
}

type ParticipantRole = "gm" | "player";

type ParticipantInfo = {
  userId: string;
  role: ParticipantRole;
};

type RollPayload = {
  type: "roll";
  userId: string;
  dice?: {
    sides?: number;
    count?: number;
  };
  modifier?: number;
};

type ContestPayload = {
  type: "contest";
  challengerId: string;
  defenderId: string;
  dice?: {
    sides?: number;
  };
  challengerModifier?: number;
  defenderModifier?: number;
};

type JoinPayload = {
  type: "join";
  userId: string;
  role?: ParticipantRole;
};

type IncomingMessage = RollPayload | ContestPayload | JoinPayload;

type RollResult = {
  type: "roll_result";
  userId: string;
  dice: {
    sides: number;
    count: number;
    rolls: number[];
  };
  modifier: number;
  total: number;
};

type ContestResult = {
  type: "contest_result";
  challengerId: string;
  defenderId: string;
  challengerRoll: number;
  defenderRoll: number;
  challengerModifier: number;
  defenderModifier: number;
  winner: "challenger" | "defender" | "tie";
};

type PresenceUpdate = {
  type: "presence";
  participants: ParticipantInfo[];
};

type ErrorMessage = {
  type: "error";
  message: string;
};

type Connection = {
  socket: WebSocket;
  participant?: ParticipantInfo;
};

const diceDefaults = {
  sides: 20,
  count: 1,
};

function clampSides(value: number) {
  if (!Number.isFinite(value) || value < 2) {
    return diceDefaults.sides;
  }
  return Math.min(Math.floor(value), 1000);
}

function clampCount(value: number) {
  if (!Number.isFinite(value) || value < 1) {
    return diceDefaults.count;
  }
  return Math.min(Math.floor(value), 100);
}

function rollDice(sides: number, count: number) {
  const rolls: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    rolls.push((random % sides) + 1);
  }
  return rolls;
}

export class CampaignSession {
  private connections = new Set<Connection>();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/connect") {
      return this.handleConnect(request);
    }

    if (url.pathname === "/roll" && request.method === "POST") {
      return this.handleRollRequest(request);
    }

    if (url.pathname === "/contest" && request.method === "POST") {
      return this.handleContestRequest(request);
    }

    return new Response("Not found", { status: 404 });
  }

  private handleConnect(request: Request) {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    const connection: Connection = { socket: server };
    this.connections.add(connection);

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const role = url.searchParams.get("role");
    if (userId) {
      connection.participant = {
        userId,
        role: role === "gm" ? "gm" : "player",
      };
    }

    this.broadcastPresence();

    server.addEventListener("message", (event) => {
      this.handleSocketMessage(connection, event.data);
    });

    server.addEventListener("close", () => {
      this.connections.delete(connection);
      this.broadcastPresence();
    });

    server.addEventListener("error", () => {
      this.connections.delete(connection);
      this.broadcastPresence();
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleRollRequest(request: Request) {
    const payload = (await request.json()) as Omit<RollPayload, "type"> & {
      type?: string;
    };
    const result = this.processRoll({
      type: "roll",
      userId: payload.userId,
      dice: payload.dice,
      modifier: payload.modifier,
    });

    this.broadcast(result);

    return Response.json(result);
  }

  private async handleContestRequest(request: Request) {
    const payload = (await request.json()) as Omit<ContestPayload, "type"> & {
      type?: string;
    };
    const result = this.processContest({
      type: "contest",
      challengerId: payload.challengerId,
      defenderId: payload.defenderId,
      dice: payload.dice,
      challengerModifier: payload.challengerModifier,
      defenderModifier: payload.defenderModifier,
    });

    this.broadcast(result);

    return Response.json(result);
  }

  private handleSocketMessage(connection: Connection, data: string | ArrayBuffer) {
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    let parsed: IncomingMessage;
    try {
      parsed = JSON.parse(text) as IncomingMessage;
    } catch (error) {
      this.send(connection.socket, { type: "error", message: "Invalid JSON payload." });
      return;
    }

    if (parsed.type === "join") {
      connection.participant = {
        userId: parsed.userId,
        role: parsed.role ?? "player",
      };
      this.broadcastPresence();
      return;
    }

    if (parsed.type === "roll") {
      const result = this.processRoll(parsed);
      this.broadcast(result);
      return;
    }

    if (parsed.type === "contest") {
      const result = this.processContest(parsed);
      this.broadcast(result);
      return;
    }

    this.send(connection.socket, { type: "error", message: "Unknown message type." });
  }

  private processRoll(payload: RollPayload): RollResult {
    const sides = clampSides(payload.dice?.sides ?? diceDefaults.sides);
    const count = clampCount(payload.dice?.count ?? diceDefaults.count);
    const rolls = rollDice(sides, count);
    const modifier = payload.modifier ?? 0;
    const total = rolls.reduce((sum, roll) => sum + roll, 0) + modifier;

    return {
      type: "roll_result",
      userId: payload.userId,
      dice: {
        sides,
        count,
        rolls,
      },
      modifier,
      total,
    };
  }

  private processContest(payload: ContestPayload): ContestResult {
    const sides = clampSides(payload.dice?.sides ?? diceDefaults.sides);
    const challengerRoll = rollDice(sides, 1)[0] ?? 1;
    const defenderRoll = rollDice(sides, 1)[0] ?? 1;
    const challengerModifier = payload.challengerModifier ?? 0;
    const defenderModifier = payload.defenderModifier ?? 0;
    const challengerTotal = challengerRoll + challengerModifier;
    const defenderTotal = defenderRoll + defenderModifier;

    let winner: ContestResult["winner"] = "tie";
    if (challengerTotal > defenderTotal) {
      winner = "challenger";
    } else if (defenderTotal > challengerTotal) {
      winner = "defender";
    }

    return {
      type: "contest_result",
      challengerId: payload.challengerId,
      defenderId: payload.defenderId,
      challengerRoll,
      defenderRoll,
      challengerModifier,
      defenderModifier,
      winner,
    };
  }

  private broadcastPresence() {
    const participants: ParticipantInfo[] = [];
    for (const connection of this.connections) {
      if (connection.participant) {
        participants.push(connection.participant);
      }
    }

    this.broadcast({
      type: "presence",
      participants,
    });
  }

  private broadcast(message: RollResult | ContestResult | PresenceUpdate) {
    const payload = JSON.stringify(message);
    for (const connection of this.connections) {
      this.sendRaw(connection.socket, payload);
    }
  }

  private send(socket: WebSocket, message: ErrorMessage) {
    this.sendRaw(socket, JSON.stringify(message));
  }

  private sendRaw(socket: WebSocket, payload: string) {
    try {
      socket.send(payload);
    } catch (error) {
      // Ignore send errors for closed sockets.
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/(connect|roll|contest)$/);

    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const campaignId = match[1] ?? "";
    const action = match[2] ?? "";

    const durableId = env.CAMPAIGN_SESSION.idFromName(campaignId);
    const stub = env.CAMPAIGN_SESSION.get(durableId);

    const forwardedUrl = new URL(request.url);
    forwardedUrl.pathname = `/${action}`;

    const forwardedRequest = new Request(forwardedUrl.toString(), request);
    return stub.fetch(forwardedRequest);
  },
};
