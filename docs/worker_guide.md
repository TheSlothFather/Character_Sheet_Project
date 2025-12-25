# _worker.ts Guide (Cloudflare Durable Object)

This guide is a map of `functions/_worker.ts` so Claude/Codex can navigate the file quickly.

## What this worker does
- Hosts the Cloudflare Durable Object for campaign real-time state.
- Accepts WebSocket connections for presence + lobby events.
- Provides REST endpoints for rolls, contests, and combat state changes.
- Maintains both a **new authoritative combat system** and a **legacy combat system** for backward compatibility.
- Persists roll/contest records to Supabase and stores campaign state in Durable Object storage.

## File map (high-level)
- CORS helper: `getCorsHeaders` (allows prod Pages + localhost).
- Type definitions: combat, lobby, roll/contest, legacy types.
- `CampaignDurableObject` class: main logic (fetch, WebSocket, lobby, combat, helpers).
- Parse/validation helpers: `parse*` functions, JSON body handling.
- Supabase helpers: `persistSupabase`, `map*ForSupabase`.
- Entry export: default handler routes `/api/campaigns/:id/*` to the DO.

## Request routing
Top-level `export default` handler:
- Validates route: `/api/campaigns/:campaignId/(connect|roll|contest)` or `/api/campaigns/:campaignId/combat/:action`.
- Instantiates the DO via `env.CAMPAIGN_DO.idFromName(campaignId)` and forwards the request.

Inside `CampaignDurableObject.fetch`:
- `OPTIONS` returns CORS preflight immediately.
- `/connect` upgrades to WebSocket (before POST check).
- All other endpoints require `POST`.
- Routes to:
  - `handleRollRequest` for `/roll`
  - `handleContestRequest` for `/contest`
  - `handleCombatAction` for `/combat/:action`

## WebSocket + lobby flow
WebSocket upgrade: `handleConnect`
- Assigns `connectionId`, uses `user` query param if present.
- Stores active sockets in `sessions`, presence in `presence`.
- Sends `welcome` event + current lobby state.
- Broadcasts `presence` events on join/leave/update.

Client -> server messages (JSON):
- `presence` with `userId`: updates presence entry.
- `LOBBY_JOIN`, `LOBBY_LEAVE`, `LOBBY_TOGGLE_READY`: lobby management.

Lobby storage:
- Stored as `lobbyState` in Durable Object storage.
- Tracks `players`, `readyCount`, `totalCount`.
- Broadcasts lobby updates via `LOBBY_*` events.

## State persistence + sequence
- `sequence` is stored in DO storage and incremented on each update.
- Roll requests and contests are stored in DO storage:
  - `roll_request:${id}`
  - `roll_contest:${id}`
- Legacy combat state: `combat_state:${campaignId}`
- Authoritative combat state: `auth_combat_state:${campaignId}`

## Roll + contest endpoints
Roll request (`/roll`):
- Validates payload via `parseRollRequest`.
- Rolls a d100 + modifier, persists to Supabase and DO storage.
- Broadcasts `CampaignEvent` type `roll`.

Contest request (`/contest`):
- Validates payload via `parseContestSelection`.
- Rolls NPC d100, computes outcome, persists to Supabase + DO storage.
- Broadcasts `CampaignEvent` type `contest`.

Supabase:
- Uses service role key (`SUPABASE_SERVICE_ROLE_KEY`).
- Tables: `roll_requests`, `roll_contests`.
- Failure response includes Supabase error text.

## Authoritative combat system (new)
Entry point: `/combat/auth-*` actions inside `handleCombatAction`.

Key phases:
`setup` → `initiative-rolling` → `initiative` → `active-turn` ↔ `reaction-interrupt` → `resolution` → `completed`

Main handlers:
- `auth-state`: fetch current state.
- `auth-start`: initialize `AuthoritativeCombatState` (auto-roll or manual initiative).
- `auth-submit-initiative-roll`: submit roll for manual initiative.
- `auth-declare-action`: validate AP/energy + create `pendingAction`.
- `auth-declare-reaction`: validate reaction + add to `pendingReactions`.
- `auth-resolve-reactions`: resolve reactions + pending action.
- `auth-end-turn`: advances turn, resets AP/reactions, starts new rounds.
- `auth-gm-override`: GM adjustments (initiative, AP/energy, status, wounds, phase).
- `auth-end-combat`: marks `completed` and clears pending actions.
- Skill flow:
  - `auth-initiate-skill-contest`
  - `auth-respond-skill-contest`
  - `auth-request-skill-check`
  - `auth-submit-skill-check`
  - `auth-remove-entity`

State structure highlights:
- `entities`: full combatants with AP, energy, wounds, statusEffects, controller.
- `initiativeOrder` + `initiativeRolls`.
- `pendingAction` and `pendingReactions`.
- `pendingSkillContests` and `pendingSkillChecks`.
- `log`: list of `CombatLogEntry`.
- `version` tracks the same incrementing `sequence`.

Important validation helpers:
- `validateAction` and `validateReaction` enforce phase, turn ownership, and resources.
- `validateDiceRoll` + `calculateRollResult` + `validateAndConvertRoll` ensure roll integrity.

## Legacy combat system (backward compatibility)
Entry point: `/combat/(state|start|advance|resolve-ambush|spend|reaction)`
- Uses `LegacyCombatState` and `LegacyCombatEventType`.
- Loads combatants from Supabase if not provided.
- Tracks AP/energy/status/wounds in simple maps keyed by combatant id.

Keep in mind:
- New features should go to authoritative system unless you’re patching legacy clients.
- Event types differ between legacy and authoritative systems.

## WebSocket event types
`CampaignEvent.type` can be:
- `welcome`, `presence`, `roll`, `contest`
- Legacy combat event types (e.g. `combat_started`, `turn_started`)
- Authoritative events (e.g. `COMBAT_STARTED`, `TURN_STARTED`, `ACTION_DECLARED`)

`broadcastAuthEvent` is the helper for authoritative events; `broadcast` sends to all sockets.

## Tips for making changes
- Prefer editing the authoritative handlers under `CampaignDurableObject` for new work.
- Update type definitions first (e.g. `ServerEventType`, `CombatLogType`) when adding new events.
- If you add new state fields, persist them via `saveAuthCombatState` (do not bypass it).
- Any new endpoints must be added in two places:
  1) `handleCombatAction` switch
  2) Client-side callers in `client/src/api` (not in this file)
- Reuse parse helpers (`parseRequiredStringField`, `parseNumberField`, etc.) to keep errors consistent.

## Local dev reminder
- Worker runs via `npx wrangler dev`.
- Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` for roll/contest persistence.
