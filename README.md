# Adûrun Character Sheet

This repo is now ready to ship the Vite React client to Cloudflare Pages and connect it to Supabase.

## Cloudflare Pages configuration
- **Root directory:** repository root.
- **Build command:** `npm run build:client`
- **Build output directory:** `client/dist`
- **Environment variables (production + preview):**
  - `VITE_SUPABASE_URL` – your Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` – the anon public key
  - `SUPABASE_SERVICE_ROLE_KEY` – only if you add Pages Functions that need privileged access (never expose this to the browser)
- **SPA routing:** `_redirects` file is included so direct navigation to React routes does not 404.

## Local development
1. Install dependencies at the repo root: `npm install`.
2. Copy `.env.example` from `client` to `client/.env` and set Supabase values.
3. Run the Vite dev server: `npm run dev:client` (defaults to port 5173).
4. Build locally to verify Pages output: `npm run build:client` then preview with `npm run preview:client`.

## Notes
- Node 20+ is required (matches Cloudflare build image).
- Server code remains in the repo for reference but is not part of the Pages deploy. If you add Pages Functions later, keep secrets there and never in client code.
