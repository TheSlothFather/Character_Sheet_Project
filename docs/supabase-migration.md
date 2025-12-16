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
