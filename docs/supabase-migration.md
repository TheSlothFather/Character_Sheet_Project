# Supabase/Postgres data migration

This repository now ships a repeatable migration script that normalizes the JSON/CSV source files into Postgres tables that Supabase can host. It is idempotent (uses `ON CONFLICT` upserts), so you can rerun it whenever the data changes.

## Prerequisites
- Node 20+ and npm installed.
- A Postgres connection string for your Supabase project (from **Settings → Database → Connection string**). Use the direct connection string, not the pooled one.
- The repo dependencies installed at the root (`npm install`).

## Running the migration
1. Export the database URL (or pass it inline). Either `DATABASE_URL` or `SUPABASE_DB_URL` is accepted.
   ```bash
   export DATABASE_URL="postgresql://<user>:<password>@<host>:5432/postgres"
   ```
2. Run the migration script from the repo root:
   ```bash
   npm run migrate:data --workspace server
   ```
3. The script will:
   - Create content tables for rulesets, attributes, skills, races/subraces, derived stats, and modifiers.
   - Load `data/race-content.json` into those tables.
   - Load `data/psionics.csv` into `psionic_abilities`.
   - Load `weapons.csv` and `armor.csv` into `weapon_abilities` and `armor_abilities`.
   - Store `data/deity_relationships.json` in `reference_documents` as `deity_relationships`.

If you rerun the script, it will update existing rows instead of duplicating them.

## Characters table for the app

The client now saves characters straight to Supabase. Create a `characters` table with these columns so the UI can read/write d
ata:

```sql
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level integer not null,
  race_key text,
  subrace_key text,
  notes text,
  attribute_points_available integer,
  skill_points integer not null default 0,
  skill_allocations jsonb not null default '{}',
  skill_allocation_minimums jsonb,
  skill_bonuses jsonb,
  backgrounds jsonb,
  attributes jsonb,
  fate_points integer,
  weapon_notes text,
  defense_notes text,
  gear_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

If you use Row Level Security, add policies that allow the anon key to read and write these rows for your project.
