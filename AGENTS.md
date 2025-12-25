# Repository Guidelines

## Project Structure & Module Organization
- `client/`: React 18 + Vite frontend. Feature modules live in `client/src/modules/`; shared styles are in `client/src/styles/`. Client tests sit in `client/src/__tests__/`.
- `server/`: Express server (legacy, being phased out).
- `shared/`: TypeScript rules engine and shared logic (imported via `@shared/*`).
- `functions/`: Cloudflare Workers Durable Object for real-time campaigns.
- `data/`: Game content (CSV/JSON/TXT) parsed by scripts in `tools/`.
- `tests/`: Python parsing tests (pytest).
- `docs/` and `database/`: reference materials and schema artifacts.
- `dist/`: build output (generated).

## Build, Test, and Development Commands
- `npm run dev:client`: Start the Vite dev server on port 5173.
- `cd server && npm run dev`: Start the Express server on port 4000.
- `npm run build`: Build the client and copy output to `dist/`.
- `cd client && npm test`: Run Vitest tests.
- `cd client && npx vitest run src/__tests__/magicParser.test.ts`: Run a single client test file.
- `npx wrangler dev`: Run Cloudflare Workers locally (Durable Objects).
- `npx wrangler deploy`: Deploy the worker.

## Coding Style & Naming Conventions
- Indentation: 2 spaces; use semicolons and double quotes to match existing files.
- TypeScript/React components use `PascalCase` and hooks use `useThing` naming.
- Prefer `.tsx` for React components and `.ts` for non-UI modules.
- No enforced linter yet (`npm run lint` is a placeholder), so align with nearby file style.

## Testing Guidelines
- Client tests use Vitest in `client/src/__tests__/` with `*.test.ts(x)` naming.
- Parser tests use pytest in `tests/` (example: `pytest tests/test_parse_races.py`).
- Add tests alongside new parser or rules changes where behavior is non-trivial.

## Commit & Pull Request Guidelines
- Commit messages generally follow Conventional Commits (`feat:`, `fix:`); keep them short and scoped.
- PRs should include a concise summary, testing notes, and screenshots/GIFs for UI changes.
- Link related issues or context when available (especially for gameplay rules changes).

## Configuration & Secrets
- Client requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the environment.
- Do not commit real credentials; use `.env` files locally and document new config in `README.md`.
