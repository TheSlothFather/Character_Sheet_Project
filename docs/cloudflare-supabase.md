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

## Live campaign events via Durable Objects
This repo includes a Cloudflare Worker with a Durable Object per campaign for WebSocket live updates.

### Files
- `functions/_worker.ts` defines the Durable Object (`CampaignDurableObject`) and routes:
  - `GET /api/campaigns/:id/connect` (WebSocket upgrade)
  - `POST /api/campaigns/:id/roll`
  - `POST /api/campaigns/:id/contest`
- `wrangler.toml` registers the Durable Object binding (`CAMPAIGN_DO`).

### Local dev
```bash
npx wrangler dev
```

### Deploy
```bash
npx wrangler deploy
```

### Example usage
```bash
# WebSocket connect (with optional ?user= handle)
wscat -c "ws://localhost:8787/api/campaigns/demo/connect?user=gm"

# Broadcast a roll
curl -X POST "http://localhost:8787/api/campaigns/demo/roll" \
  -H "content-type: application/json" \
  -d '{"roller":"gm","result":17}'
```

The Durable Object guarantees ordered event sequencing, tracks presence, and broadcasts updates to every
connected client for the same campaign ID.

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
