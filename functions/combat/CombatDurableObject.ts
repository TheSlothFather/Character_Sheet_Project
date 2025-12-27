/**
 * Combat V2 - Durable Object
 *
 * Server-authoritative combat system using Cloudflare Durable Objects.
 * - SQLite for fast real-time combat state
 * - Supabase/PostgreSQL for persistent character/campaign data
 * - WebSocket hibernation for scalable connections
 */

import { DurableObject } from "cloudflare:workers";
import type { DurableObjectState } from "cloudflare:workers";

// ═══════════════════════════════════════════════════════════════════════════
// CORS HELPER (copied from _worker.ts for standalone use)
// ═══════════════════════════════════════════════════════════════════════════

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

// Import handlers
import { handleCombatLifecycle } from "./handlers/combat-lifecycle";
import { handleTurnManagement } from "./handlers/turn-management";
import { handleActionProcessing } from "./handlers/action-processing";
import { handleDamageProcessing } from "./handlers/damage-processing";
import { handleChanneling } from "./handlers/channeling";
import { handleMovement } from "./handlers/movement";
import { handleSkillContest } from "./handlers/skill-contest";

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Env {
  COMBAT_DO: DurableObjectNamespace<CombatDurableObject>;
  COMBAT_MAPS_BUCKET: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBSOCKET METADATA (survives hibernation)
// ═══════════════════════════════════════════════════════════════════════════

export interface WebSocketMetadata {
  connectionId: string;
  playerId: string;
  isGM: boolean;
  controlledEntityIds: string[];
  connectedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT MESSAGE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ClientMessageType =
  // Combat lifecycle
  | "START_COMBAT"
  | "END_COMBAT"
  | "REQUEST_STATE"
  // Initiative
  | "SUBMIT_INITIATIVE_ROLL"
  // Turn management
  | "END_TURN"
  | "DELAY_TURN"
  | "READY_ACTION"
  // Actions
  | "DECLARE_MOVEMENT"
  | "DECLARE_ATTACK"
  | "DECLARE_ABILITY"
  | "DECLARE_REACTION"
  // Channeling
  | "START_CHANNELING"
  | "CONTINUE_CHANNELING"
  | "RELEASE_SPELL"
  | "ABORT_CHANNELING"
  // Death system
  | "SUBMIT_ENDURE_ROLL"
  | "SUBMIT_DEATH_CHECK"
  // GM overrides
  | "GM_OVERRIDE"
  | "GM_MOVE_ENTITY"
  | "GM_APPLY_DAMAGE"
  | "GM_MODIFY_RESOURCES"
  | "GM_ADD_ENTITY"
  | "GM_REMOVE_ENTITY"
  // Map and grid management
  | "UPDATE_MAP_CONFIG"
  | "UPDATE_GRID_CONFIG"
  // Skill contests
  | "INITIATE_SKILL_CONTEST"
  | "INITIATE_ATTACK_CONTEST"
  | "RESPOND_SKILL_CONTEST";

export interface ClientMessage {
  type: ClientMessageType;
  payload: Record<string, unknown>;
  requestId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVER EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ServerEventType =
  | "STATE_SYNC"
  | "COMBAT_STARTED"
  | "COMBAT_ENDED"
  | "ROUND_STARTED"
  | "TURN_STARTED"
  | "TURN_ENDED"
  | "INITIATIVE_UPDATED"
  | "MOVEMENT_EXECUTED"
  | "ATTACK_RESOLVED"
  | "ABILITY_RESOLVED"
  | "REACTION_RESOLVED"
  | "CHANNELING_STARTED"
  | "CHANNELING_CONTINUED"
  | "CHANNELING_RELEASED"
  | "CHANNELING_INTERRUPTED"
  | "BLOWBACK_APPLIED"
  | "DAMAGE_APPLIED"
  | "WOUNDS_INFLICTED"
  | "HEALING_APPLIED"
  | "ENDURE_ROLL_REQUIRED"
  | "DEATH_CHECK_REQUIRED"
  | "ENTITY_UNCONSCIOUS"
  | "ENTITY_DIED"
  | "ENTITY_UPDATED"
  | "GM_OVERRIDE_APPLIED"
  | "ACTION_REJECTED"
  | "ERROR"
  // Map and grid management
  | "MAP_CONFIG_UPDATED"
  | "GRID_CONFIG_UPDATED"
  // Skill contests
  | "SKILL_CONTEST_INITIATED"
  | "SKILL_CONTEST_RESPONSE_REQUESTED"
  | "SKILL_CONTEST_RESOLVED";

export interface ServerEvent {
  type: ServerEventType;
  payload: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBAT DURABLE OBJECT
// ═══════════════════════════════════════════════════════════════════════════

export class CombatDurableObject extends DurableObject<Env> {
  private sql: SqlStorage;
  private sessions: Map<WebSocket, WebSocketMetadata>;
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.sql = ctx.storage.sql;
    this.sessions = new Map();
    this.supabaseUrl = env.SUPABASE_URL;
    this.supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

    // Initialize SQL schema
    this.initializeSchema();

    // Restore WebSocket sessions after hibernation
    ctx.getWebSockets().forEach((ws) => {
      const metadata = ws.deserializeAttachment() as WebSocketMetadata;
      if (metadata) {
        this.sessions.set(ws, metadata);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHEMA INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  private initializeSchema(): void {
    this.sql.exec(`
      -- Combat state (single row per combat)
      CREATE TABLE IF NOT EXISTS combat_state (
        id TEXT PRIMARY KEY DEFAULT 'current',
        combat_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        phase TEXT NOT NULL DEFAULT 'setup',
        round INTEGER NOT NULL DEFAULT 0,
        turn_index INTEGER NOT NULL DEFAULT 0,
        active_entity_id TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        started_at TEXT NOT NULL,
        last_updated_at TEXT NOT NULL
      );

      -- Entities in combat
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- Initiative order
      CREATE TABLE IF NOT EXISTS initiative (
        entity_id TEXT PRIMARY KEY,
        roll INTEGER NOT NULL,
        skill_value INTEGER NOT NULL,
        current_energy INTEGER NOT NULL,
        position INTEGER NOT NULL
      );

      -- Square grid positions
      CREATE TABLE IF NOT EXISTS grid_positions (
        entity_id TEXT PRIMARY KEY,
        row INTEGER NOT NULL,
        col INTEGER NOT NULL,
        UNIQUE(row, col)
      );

      -- Map configuration
      CREATE TABLE IF NOT EXISTS map_config (
        id TEXT PRIMARY KEY DEFAULT 'current',
        image_url TEXT,
        image_key TEXT,
        image_width INTEGER,
        image_height INTEGER,
        grid_rows INTEGER NOT NULL DEFAULT 20,
        grid_cols INTEGER NOT NULL DEFAULT 30,
        cell_size INTEGER NOT NULL DEFAULT 40,
        offset_x INTEGER NOT NULL DEFAULT 0,
        offset_y INTEGER NOT NULL DEFAULT 0,
        grid_visible INTEGER NOT NULL DEFAULT 1,
        grid_opacity REAL NOT NULL DEFAULT 0.5,
        template_id TEXT
      );

      -- Channeling state
      CREATE TABLE IF NOT EXISTS channeling (
        entity_id TEXT PRIMARY KEY,
        spell_data TEXT NOT NULL,
        started_at TEXT NOT NULL
      );

      -- Combat log
      CREATE TABLE IF NOT EXISTS combat_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        data TEXT,
        created_at TEXT NOT NULL
      );

      -- Pending actions/reactions
      CREATE TABLE IF NOT EXISTS pending_actions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_initiative_position ON initiative(position);
      CREATE INDEX IF NOT EXISTS idx_grid_positions ON grid_positions(row, col);
      CREATE INDEX IF NOT EXISTS idx_log_created ON combat_log(created_at);

      PRAGMA optimize;
    `);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HTTP HANDLER (WebSocket upgrades)
  // ═══════════════════════════════════════════════════════════════════════════

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade(request, url);
    }

    // HTTP endpoints for debugging/admin
    if (url.pathname === "/state") {
      return this.handleGetState(corsHeaders);
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBSOCKET UPGRADE
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleWebSocketUpgrade(request: Request, url: URL): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Extract connection metadata from query params
    const playerId = url.searchParams.get("playerId") || "";
    const isGM = url.searchParams.get("isGM") === "true";
    const requestedEntityIds = url.searchParams.get("entities")?.split(",").filter(Boolean) || [];
    const resolvedEntityIds = playerId ? this.getControlledEntitiesForPlayer(playerId) : [];
    const controlledEntityIds = resolvedEntityIds.length > 0 ? resolvedEntityIds : requestedEntityIds;

    const metadata: WebSocketMetadata = {
      connectionId: crypto.randomUUID(),
      playerId,
      isGM,
      controlledEntityIds,
      connectedAt: new Date().toISOString(),
    };

    // Accept WebSocket with hibernation support
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(metadata);
    this.sessions.set(server, metadata);

    // Send initial state sync
    this.sendStateSync(server, metadata);

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: getCorsHeaders(request),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBSOCKET MESSAGE HANDLER
  // ═══════════════════════════════════════════════════════════════════════════

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session) {
      ws.close(1008, "Session not found");
      return;
    }

    try {
      const msg: ClientMessage = JSON.parse(
        typeof message === "string" ? message : new TextDecoder().decode(message)
      );

      await this.handleMessage(ws, session, msg);
    } catch (error) {
      console.error("Message handling error:", error);
      this.sendToSocket(ws, {
        type: "ERROR",
        payload: { message: error instanceof Error ? error.message : "Unknown error" },
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE ROUTING
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleMessage(
    ws: WebSocket,
    session: WebSocketMetadata,
    msg: ClientMessage
  ): Promise<void> {
    const { type, payload, requestId } = msg;

    // Route to appropriate handler
    switch (type) {
      // Combat lifecycle
      case "START_COMBAT":
      case "END_COMBAT":
        await handleCombatLifecycle(this, ws, session, type, payload, requestId);
        break;
      case "REQUEST_STATE":
        this.sendStateSync(ws, session);
        break;

      // Initiative & turns
      case "SUBMIT_INITIATIVE_ROLL":
      case "END_TURN":
      case "DELAY_TURN":
      case "READY_ACTION":
        await handleTurnManagement(this, ws, session, type, payload, requestId);
        break;

      // Actions
      case "DECLARE_ATTACK":
      case "DECLARE_ABILITY":
      case "DECLARE_REACTION":
        await handleActionProcessing(this, ws, session, type, payload, requestId);
        break;

      // Movement
      case "DECLARE_MOVEMENT":
      case "GM_MOVE_ENTITY":
        await handleMovement(this, ws, session, type, payload, requestId);
        break;

      // Channeling
      case "START_CHANNELING":
      case "CONTINUE_CHANNELING":
      case "RELEASE_SPELL":
      case "ABORT_CHANNELING":
        await handleChanneling(this, ws, session, type, payload, requestId);
        break;

      // Death system
      case "SUBMIT_ENDURE_ROLL":
      case "SUBMIT_DEATH_CHECK":
        await handleDamageProcessing(this, ws, session, type, payload, requestId);
        break;

      // Skill contests (including attack contests)
      case "INITIATE_SKILL_CONTEST":
      case "INITIATE_ATTACK_CONTEST":
      case "RESPOND_SKILL_CONTEST":
        await handleSkillContest(this, ws, session, type, payload, requestId);
        break;

      // GM overrides
      case "GM_OVERRIDE":
      case "GM_APPLY_DAMAGE":
      case "GM_MODIFY_RESOURCES":
      case "GM_ADD_ENTITY":
      case "GM_REMOVE_ENTITY":
        if (!session.isGM) {
          this.sendToSocket(ws, {
            type: "ACTION_REJECTED",
            payload: { reason: "GM privileges required" },
            timestamp: new Date().toISOString(),
            requestId,
          });
          return;
        }
        await handleCombatLifecycle(this, ws, session, type, payload, requestId);
        break;

      // Map and grid configuration (GM only)
      case "UPDATE_MAP_CONFIG":
      case "UPDATE_GRID_CONFIG":
        if (!session.isGM) {
          this.sendToSocket(ws, {
            type: "ACTION_REJECTED",
            payload: { reason: "GM privileges required" },
            timestamp: new Date().toISOString(),
            requestId,
          });
          return;
        }
        await this.handleMapGridConfig(ws, session, type, payload, requestId);
        break;

      default:
        this.sendToSocket(ws, {
          type: "ACTION_REJECTED",
          payload: { reason: "Unknown message type" },
          timestamp: new Date().toISOString(),
          requestId,
        });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAP AND GRID CONFIGURATION HANDLER
  // ═══════════════════════════════════════════════════════════════════════════

  async handleMapGridConfig(
    ws: WebSocket,
    session: WebSocketMetadata,
    type: "UPDATE_MAP_CONFIG" | "UPDATE_GRID_CONFIG",
    payload: Record<string, unknown>,
    requestId?: string
  ): Promise<void> {
    try {
      if (type === "UPDATE_MAP_CONFIG") {
        // Update map config in storage
        const currentConfig = (await this.ctx.storage.get<Record<string, unknown>>("mapConfig")) || {};
        const newConfig = { ...currentConfig, ...payload };
        await this.ctx.storage.put("mapConfig", newConfig);

        // Broadcast to all clients
        this.broadcast({
          type: "MAP_CONFIG_UPDATED",
          payload: { config: newConfig },
          timestamp: new Date().toISOString(),
          requestId,
        });
      } else if (type === "UPDATE_GRID_CONFIG") {
        // Update grid config in storage
        const currentConfig = (await this.ctx.storage.get<Record<string, unknown>>("gridConfig")) || {};
        const newConfig = { ...currentConfig, ...payload };
        await this.ctx.storage.put("gridConfig", newConfig);

        // Broadcast to all clients
        this.broadcast({
          type: "GRID_CONFIG_UPDATED",
          payload: { config: newConfig },
          timestamp: new Date().toISOString(),
          requestId,
        });
      }
    } catch (error) {
      console.error(`Error handling ${type}:`, error);
      this.sendToSocket(ws, {
        type: "ERROR",
        payload: { error: `Failed to update configuration: ${error instanceof Error ? error.message : "Unknown error"}` },
        timestamp: new Date().toISOString(),
        requestId,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBSOCKET LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const session = this.sessions.get(ws);
    if (session) {
      this.sessions.delete(ws);
      // Broadcast player disconnection
      this.broadcast({
        type: "ENTITY_UPDATED",
        payload: {
          playerId: session.playerId,
          connected: false,
        },
        timestamp: new Date().toISOString(),
      });
    }
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("WebSocket error:", error);
    this.sessions.delete(ws);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALARM HANDLER (for turn timers, status ticks, etc.)
  // ═══════════════════════════════════════════════════════════════════════════

  async alarm(): Promise<void> {
    // Process status effect ticks, turn timers, etc.
    const state = this.getCombatState();
    if (!state) return;

    // Could be used for:
    // - Auto-ending turns after timeout
    // - Processing status effect ticks
    // - Cleanup of stale connections
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API FOR HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  public getSql(): SqlStorage {
    return this.sql;
  }

  public getStorage(): DurableObjectStorage {
    return this.ctx.storage;
  }

  public getSessions(): Map<WebSocket, WebSocketMetadata> {
    return this.sessions;
  }

  public getSupabaseConfig(): { url: string; key: string } {
    return { url: this.supabaseUrl, key: this.supabaseKey };
  }

  public sendToSocket(ws: WebSocket, event: ServerEvent): void {
    try {
      ws.send(JSON.stringify(event));
    } catch (error) {
      console.error("Failed to send to socket:", error);
    }
  }

  public broadcast(event: ServerEvent, excludeSocket?: WebSocket): void {
    for (const [ws] of this.sessions) {
      if (ws !== excludeSocket) {
        this.sendToSocket(ws, event);
      }
    }
  }

  public broadcastToPlayer(playerId: string, event: ServerEvent): void {
    for (const [ws, session] of this.sessions) {
      if (session.playerId === playerId) {
        this.sendToSocket(ws, event);
      }
    }
  }

  public broadcastToGMs(event: ServerEvent): void {
    for (const [ws, session] of this.sessions) {
      if (session.isGM) {
        this.sendToSocket(ws, event);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  public getCombatState(): Record<string, unknown> | null {
    const rows = this.sql.exec("SELECT * FROM combat_state WHERE id = 'current'").toArray();
    return rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
  }

  public getFullState(): Record<string, unknown> {
    const combatState = this.getCombatState();

    // Return empty state when no combat exists
    if (!combatState) {
      return {
        combat: null,
        entities: [],
        initiative: [],
        gridPositions: [],
        mapConfig: null,
        channeling: [],
      };
    }

    const entities = this.sql.exec("SELECT * FROM entities").toArray();
    const initiative = this.sql.exec("SELECT * FROM initiative ORDER BY position").toArray();
    const gridPositions = this.sql.exec("SELECT * FROM grid_positions").toArray();
    const channeling = this.sql.exec("SELECT * FROM channeling").toArray();
    const mapConfig = this.sql.exec("SELECT * FROM map_config WHERE id = 'current'").toArray();

    return {
      combat: combatState,
      entities: entities.map((e: any) => ({ id: e.id, ...JSON.parse(e.data) })),
      initiative,
      gridPositions,
      mapConfig: mapConfig.length > 0 ? mapConfig[0] : null,
      channeling: channeling.map((c: any) => ({
        entityId: c.entity_id,
        ...JSON.parse(c.spell_data),
      })),
    };
  }

  /**
   * Build CombatV2State in the format expected by the client
   */
  public buildCombatV2State(): Record<string, unknown> {
    const combatState = this.getCombatState();

    // Return empty state when no combat exists
    if (!combatState) {
      return {
        combatId: "",
        campaignId: "",
        phase: "setup",
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
        version: 0,
      };
    }

    const entitiesRaw = this.sql.exec("SELECT * FROM entities").toArray();
    const initiativeRaw = this.sql.exec("SELECT * FROM initiative ORDER BY position").toArray();
    const gridPositionsRaw = this.sql.exec("SELECT * FROM grid_positions").toArray();
    const channelingRaw = this.sql.exec("SELECT * FROM channeling").toArray();
    const mapConfigRaw = this.sql.exec("SELECT * FROM map_config WHERE id = 'current'").toArray();

    // Build entities record with channeling merged in
    const channelingMap = new Map<string, Record<string, unknown>>();
    for (const c of channelingRaw as any[]) {
      channelingMap.set(c.entity_id, JSON.parse(c.spell_data));
    }

    const entities: Record<string, Record<string, unknown>> = {};
    for (const e of entitiesRaw as any[]) {
      const entityData = JSON.parse(e.data);
      // Ensure AP and energy have valid defaults to prevent NaN in client
      const ap = entityData.ap || { current: 6, max: 6 };
      ap.current = ap.current ?? ap.max ?? 6;
      ap.max = ap.max ?? 6;
      const energy = entityData.energy || { current: 100, max: 100 };
      energy.current = energy.current ?? 100;
      energy.max = energy.max ?? 100;
      entities[e.id] = {
        id: e.id,
        ...entityData,
        ap,
        energy,
        channeling: channelingMap.get(e.id) || null,
      };
    }

    // Build initiative array
    const initiative = (initiativeRaw as any[]).map((row) => ({
      entityId: row.entity_id,
      roll: row.roll,
      tiebreaker: row.skill_value || 0,
      delayed: false,
      readied: false,
    }));

    // Build grid positions record
    const gridPositions: Record<string, { row: number; col: number }> = {};
    for (const pos of gridPositionsRaw as any[]) {
      gridPositions[pos.entity_id] = { row: pos.row, col: pos.col };
    }

    // Extract map config
    const mapConfigData = mapConfigRaw.length > 0 ? (mapConfigRaw[0] as any) : null;
    const gridConfig = mapConfigData ? {
      rows: mapConfigData.grid_rows,
      cols: mapConfigData.grid_cols,
      cellSize: mapConfigData.cell_size,
      offsetX: mapConfigData.offset_x,
      offsetY: mapConfigData.offset_y,
      visible: mapConfigData.grid_visible === 1,
      opacity: mapConfigData.grid_opacity,
    } : {
      rows: 20,
      cols: 30,
      cellSize: 40,
      offsetX: 0,
      offsetY: 0,
      visible: true,
      opacity: 0.5,
    };

    const mapConfig = mapConfigData ? {
      imageUrl: mapConfigData.image_url,
      imageKey: mapConfigData.image_key,
      imageWidth: mapConfigData.image_width,
      imageHeight: mapConfigData.image_height,
      templateId: mapConfigData.template_id,
    } : {
      imageUrl: null,
      imageKey: null,
      imageWidth: null,
      imageHeight: null,
      templateId: null,
    };

    // Get current entity from initiative order
    const currentTurnIndex = (combatState as any)?.turn_index ?? -1;
    const currentEntityId = initiative[currentTurnIndex]?.entityId ?? null;

    const rawPhase = (combatState as any)?.phase ?? "setup";
    const phase = rawPhase === "active-turn" ? "active" : rawPhase;

    return {
      combatId: (combatState as any)?.combat_id ?? "",
      campaignId: (combatState as any)?.campaign_id ?? "",
      phase,
      round: (combatState as any)?.round ?? 0,
      currentTurnIndex,
      currentEntityId,
      entities,
      initiative,
      gridPositions,
      gridConfig,
      mapConfig,
      version: (combatState as any)?.version ?? 0,
    };
  }

  public sendStateSync(ws: WebSocket, session: WebSocketMetadata, stateOverride?: Record<string, unknown>): void {
    const state = stateOverride ?? this.buildCombatV2State();
    this.sendToSocket(ws, {
      type: "STATE_SYNC",
      payload: {
        state,
        yourControlledEntities: session.controlledEntityIds,
      },
      timestamp: new Date().toISOString(),
    });
  }

  public broadcastStateSync(stateOverride?: Record<string, unknown>): void {
    const state = stateOverride ?? this.buildCombatV2State();
    const timestamp = new Date().toISOString();
    for (const [ws, session] of this.sessions) {
      this.sendToSocket(ws, {
        type: "STATE_SYNC",
        payload: {
          state,
          yourControlledEntities: session.controlledEntityIds,
        },
        timestamp,
      });
    }
  }

  public incrementVersion(): number {
    this.sql.exec(
      "UPDATE combat_state SET version = version + 1, last_updated_at = ? WHERE id = 'current'",
      new Date().toISOString()
    );

    const row = this.sql.exec("SELECT version FROM combat_state WHERE id = 'current'").one();
    return (row as { version: number }).version;
  }

  public addLogEntry(type: string, data?: Record<string, unknown>): void {
    this.sql.exec(
      "INSERT INTO combat_log (type, data, created_at) VALUES (?, ?, ?)",
      type,
      data ? JSON.stringify(data) : null,
      new Date().toISOString()
    );
  }

  private getControlledEntitiesForPlayer(playerId: string): string[] {
    const entitiesRaw = this.sql.exec("SELECT * FROM entities").toArray();
    const ids: string[] = [];
    for (const row of entitiesRaw as any[]) {
      try {
        const data = JSON.parse(row.data);
        if (data?.controller === `player:${playerId}`) {
          ids.push(row.id);
        }
      } catch {
        // Ignore malformed entity data
      }
    }
    return ids;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPABASE SYNC
  // ═══════════════════════════════════════════════════════════════════════════

  public async syncToSupabase(table: string, data: Record<string, unknown>): Promise<void> {
    if (!this.supabaseUrl || !this.supabaseKey) return;

    try {
      const response = await fetch(this.supabaseUrl + "/rest/v1/" + table, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": this.supabaseKey,
          "Authorization": "Bearer " + this.supabaseKey,
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        console.error("Supabase sync failed:", await response.text());
      }
    } catch (error) {
      console.error("Supabase sync error:", error);
    }
  }

  public async fetchFromSupabase(
    table: string,
    query: string
  ): Promise<unknown[]> {
    if (!this.supabaseUrl || !this.supabaseKey) return [];

    try {
      const response = await fetch(this.supabaseUrl + "/rest/v1/" + table + "?" + query, {
        headers: {
          "apikey": this.supabaseKey,
          "Authorization": "Bearer " + this.supabaseKey,
        },
      });

      if (!response.ok) {
        console.error("Supabase fetch failed:", await response.text());
        return [];
      }

      return await response.json();
    } catch (error) {
      console.error("Supabase fetch error:", error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEBUG ENDPOINT
  // ═══════════════════════════════════════════════════════════════════════════

  private handleGetState(corsHeaders: HeadersInit = {}): Response {
    return new Response(JSON.stringify(this.getFullState(), null, 2), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}

// Export the DO class (REQUIRED for Cloudflare)
export default CombatDurableObject;
