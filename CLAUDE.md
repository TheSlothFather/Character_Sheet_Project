# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Adûrun Character Sheet is a TTRPG character builder and campaign management application for the Adûrun tabletop role-playing game. It supports character creation, combat tracking, spell creation, and real-time multiplayer campaigns.

## Commands

### Development
```bash
npm run dev:client          # Start Vite dev server (port 5173)
cd server && npm run dev    # Start Express server (port 4000)
```

### Testing
```bash
cd client && npm test       # Run Vitest tests
cd client && npx vitest run src/__tests__/magicParser.test.ts  # Run single test file
```

### Build
```bash
npm run build               # Build client (outputs to dist/)
```

### Cloudflare Workers (Real-time campaigns)
```bash
npx wrangler dev            # Local development with Durable Objects
npx wrangler deploy         # Deploy to Cloudflare
```

## Architecture

### Monorepo Structure (npm workspaces)
- **client/**: React 18 + Vite frontend with react-router-dom v7
- **server/**: Express server with PostgreSQL (legacy, being phased out)
- **shared/**: TypeScript rules engine shared between client and server
- **functions/**: Cloudflare Workers Durable Object for real-time campaigns

### Data Layer
- **Supabase**: Primary database (PostgreSQL) accessed via `@supabase/supabase-js`
- **Cloudflare Durable Objects**: Real-time campaign state and WebSocket connections
- Client requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables

### Client Modules (`client/src/modules/`)
Each module is a feature area with its own pages and components:
- **characters/**: Character sheets, creation, combat tracking
- **campaigns/**: Campaign hub, real-time multiplayer features
- **gm/**: Game Master tools including bestiary and combat management
- **magic/**, **psionics/**, **martial/**: Character ability systems
- **ancillaries/**: Ancestry and background traits
- **deity/**: Divine relationship tracking
- **definitions/**: Shared type definitions and context providers

### Shared Rules Engine (`shared/src/rules/`)
TypeScript modules for game mechanics calculations:
- **expressions.ts**: DSL for evaluating game rule expressions
- **modifiers.ts**: Stacking modifier system (add/mul/set/max/min operations)
- **wounds.ts**: Wound threshold calculations

Import in client via `@shared/*` path alias (configured in vite.config.ts).

### Real-time System (`functions/_worker.ts`)
Cloudflare Durable Object handling:
- WebSocket connections for campaign events
- Combat state management (initiative, action points, status effects)
- Roll requests and contests between players and NPCs
- Presence tracking for connected players

### API Layer (`client/src/api/`)
- **supabaseClient.ts**: Singleton Supabase client
- **campaigns.ts**: Campaign CRUD operations
- **campaignSocket.ts**: WebSocket connection to Durable Object
- **gm.ts**: GM-specific API calls

## Key Patterns

### Context Providers
- `DefinitionsProvider`: Game rules and reference data
- `SelectedCharacterProvider`: Currently selected character state
- `ThemeProvider`: Parchment/Dark Fantasy theme switching

### Vite Proxy
Dev server proxies `/api/*` requests to Express server at localhost:4000.

## Data Parsing Tools (`tools/`)
Python and JavaScript scripts for parsing TTRPG content from source documents:
- `parse_races.py`: Parse race/ancestry data
- `parse_backgrounds.py`: Parse background data
- `parse_ancillaries.js`: Parse trait data

Game content files are in `data/` directory (JSON, CSV, TXT formats).
