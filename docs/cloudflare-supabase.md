# Hooking Supabase into Cloudflare deployment

You do **not** need to run the Express server on Cloudflare to use Supabase. Deploy the React client to Cloudflare Pages and talk directly to Supabase over HTTPS.

## What you need from Supabase
- Project URL (the `https://<project>.supabase.co` value).
- Anon/public API key (for browser use).
- Direct Postgres connection string (for migrations/seeding only).

## Configure Cloudflare Pages
1) Build command: `npm run build`
2) Build output: `dist`
3) Node version: `20` (set `NODE_VERSION` or use the Cloudflare UI).

## Set environment variables in Cloudflare Pages
Set these in **Production** and **Preview**:
- `VITE_SUPABASE_URL` = your Supabase project URL.
- `VITE_SUPABASE_ANON_KEY` = your Supabase anon/public key.

If you want Cloudflare to run the migration during CI (not recommended in the runtime):
- `DATABASE_URL` = Supabase **direct Postgres** connection string. Keep it a secret environment variable; do not expose it to the client.

## Deployment flow that works
- Run the migration locally or in CI (GitHub Actions, etc.) **before** a deploy:
  ```bash
  export DATABASE_URL="postgresql://<user>:<password>@<host>:5432/postgres"
  npm run migrate:data --workspace server
  ```
- Deploy the client to Pages; it will read the `VITE_SUPABASE_*` vars at build time and call Supabase directly from the browser.

## Avoid
- Trying to open a Postgres TCP connection from Cloudflare Workers/Pages Functions with `pg`; Workers cannot open raw sockets. Use HTTPS via `@supabase/supabase-js` from the client instead.
- Injecting the Postgres connection string into the client bundle. Keep it server-side only for migrations.

## Cloudflare Pages Functions + Durable Object for campaigns
This repo includes a Pages Functions worker (`functions/_worker.ts`) with a Durable Object named `CampaignSession` for real-time campaign sessions.

### What it does
- Tracks connected players/GM per campaign.
- Receives roll/contest submissions.
- Computes outcomes in-order inside the Durable Object and broadcasts results to every connected participant.

### API routes
The Pages Function routes requests to the Durable Object based on campaign ID:
- `GET /api/campaigns/:id/connect` → upgrades to WebSocket.
- `POST /api/campaigns/:id/roll` → roll payload (HTTP fallback).
- `POST /api/campaigns/:id/contest` → contest payload (HTTP fallback).

### WebSocket usage (recommended)
Connect once and send messages over the socket for strict ordering:
```json
{ "type": "join", "userId": "player-1", "role": "player" }
{ "type": "roll", "userId": "player-1", "dice": { "sides": 20, "count": 1 }, "modifier": 3 }
{ "type": "contest", "challengerId": "player-1", "defenderId": "npc-1", "dice": { "sides": 20 }, "challengerModifier": 2, "defenderModifier": 1 }
```

### Wrangler/Pages setup
The Durable Object binding lives in `wrangler.toml`:
```toml
name = "adurun-character-sheet"
compatibility_date = "2024-10-01"
pages_build_output_dir = "dist"

[[durable_objects.bindings]]
name = "CAMPAIGN_SESSION"
class_name = "CampaignSession"

[[migrations]]
tag = "v1"
new_classes = ["CampaignSession"]
```

### Local dev
Use Wrangler to run Pages Functions + DO locally (Pages build output stays the same):
```bash
npx wrangler pages dev dist --compatibility-date=2024-10-01 --d1=false
```

### Notes
- The client should prefer WebSockets (`/connect`) for real-time updates and strict ordering.
- `POST /roll` and `POST /contest` are provided for non-WS clients or testing.
