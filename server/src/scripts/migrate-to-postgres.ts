import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { Client } from "pg";
import { loadContentPackFromFile } from "../content/import";
import type { ContentModifier, ContentPack } from "../content/content-types";

interface WeaponCsvRow {
  [key: string]: string;
  Category: string;
  "Energy Cost": string;
  "Action Point Cost": string;
  Damage: string;
  Type: string;
  Range: string;
  MP: string;
  "Two-Handed?": string;
  "Ability Name": string;
  "Ability Type": string;
  Description: string;
}

interface ArmorCsvRow {
  [key: string]: string;
  Category: string;
  "Energy Cost": string;
  "Action Point Cost": string;
  Damage: string;
  Type: string;
  Range: string;
  MP: string;
  "Ability Name": string;
  "Ability Type": string;
  Description: string;
}

interface PsionicCsvRow {
  [key: string]: string;
  "Ability Tree": string;
  Ability: string;
  Tier: string;
  Prerequisite: string;
  Description: string;
  "Energy Cost": string;
  Formula: string;
}

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? process.env.SUPABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Set DATABASE_URL (or SUPABASE_DB_URL) to a Postgres connection string before running."
    );
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await createTables(client);

    const projectRoot = path.resolve(__dirname, "../../../");
    const contentPath = path.join(projectRoot, "data", "race-content.json");
    const contentPack = loadContentPackFromFile(contentPath);
    await importContentPack(client, contentPack);

    const psionicsPath = path.join(projectRoot, "data", "psionics.csv");
    await importPsionics(client, psionicsPath);

    const weaponsPath = path.join(projectRoot, "weapons.csv");
    await importWeapons(client, weaponsPath);

    const armorPath = path.join(projectRoot, "armor.csv");
    await importArmor(client, armorPath);

    const deityPath = path.join(projectRoot, "data", "deity_relationships.json");
    await importReferenceDocument(client, "deity_relationships", deityPath);

    console.info("Migration finished successfully.");
  } finally {
    await client.end();
  }
}

async function createTables(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS content_rulesets (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS content_attributes (
      id SERIAL PRIMARY KEY,
      ruleset_id INTEGER NOT NULL REFERENCES content_rulesets(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      UNIQUE(ruleset_id, key)
    );

    CREATE TABLE IF NOT EXISTS content_skills (
      id SERIAL PRIMARY KEY,
      ruleset_id INTEGER NOT NULL REFERENCES content_rulesets(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      attribute_key TEXT,
      description TEXT,
      UNIQUE(ruleset_id, key)
    );

    CREATE TABLE IF NOT EXISTS content_races (
      id SERIAL PRIMARY KEY,
      ruleset_id INTEGER NOT NULL REFERENCES content_rulesets(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      UNIQUE(ruleset_id, key)
    );

    CREATE TABLE IF NOT EXISTS content_subraces (
      id SERIAL PRIMARY KEY,
      ruleset_id INTEGER NOT NULL REFERENCES content_rulesets(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      race_key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      UNIQUE(ruleset_id, key)
    );

    CREATE TABLE IF NOT EXISTS content_feats (
      id SERIAL PRIMARY KEY,
      ruleset_id INTEGER NOT NULL REFERENCES content_rulesets(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      prereq_expression JSONB,
      UNIQUE(ruleset_id, key)
    );

    CREATE TABLE IF NOT EXISTS content_items (
      id SERIAL PRIMARY KEY,
      ruleset_id INTEGER NOT NULL REFERENCES content_rulesets(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      slot TEXT,
      description TEXT,
      UNIQUE(ruleset_id, key)
    );

    CREATE TABLE IF NOT EXISTS content_status_effects (
      id SERIAL PRIMARY KEY,
      ruleset_id INTEGER NOT NULL REFERENCES content_rulesets(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      default_duration_type TEXT,
      UNIQUE(ruleset_id, key)
    );

    CREATE TABLE IF NOT EXISTS content_derived_stats (
      id SERIAL PRIMARY KEY,
      ruleset_id INTEGER NOT NULL REFERENCES content_rulesets(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      expression JSONB NOT NULL,
      UNIQUE(ruleset_id, key)
    );

    CREATE TABLE IF NOT EXISTS content_modifiers (
      id TEXT PRIMARY KEY,
      ruleset_id INTEGER NOT NULL REFERENCES content_rulesets(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_key TEXT NOT NULL,
      target_path TEXT NOT NULL,
      operation TEXT NOT NULL,
      stacking_key TEXT,
      priority INTEGER,
      value_expression JSONB NOT NULL,
      condition_expression JSONB
    );

    CREATE TABLE IF NOT EXISTS content_race_details (
      id SERIAL PRIMARY KEY,
      ruleset_id INTEGER NOT NULL REFERENCES content_rulesets(id) ON DELETE CASCADE,
      race_key TEXT NOT NULL,
      attributes JSONB,
      skills JSONB,
      disciplines JSONB,
      deity_cap_per_spirit INTEGER,
      UNIQUE(ruleset_id, race_key)
    );

    CREATE TABLE IF NOT EXISTS psionic_abilities (
      id SERIAL PRIMARY KEY,
      ability_tree TEXT NOT NULL,
      ability TEXT NOT NULL,
      tier INTEGER,
      prerequisite TEXT,
      description TEXT,
      energy_cost NUMERIC,
      formula TEXT,
      UNIQUE(ability_tree, ability)
    );

    CREATE TABLE IF NOT EXISTS weapon_abilities (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      energy_cost NUMERIC,
      action_point_cost NUMERIC,
      damage TEXT,
      damage_type TEXT,
      range TEXT,
      mp NUMERIC,
      two_handed BOOLEAN,
      ability_name TEXT NOT NULL,
      ability_type TEXT,
      description TEXT,
      UNIQUE(category, ability_name, ability_type)
    );

    CREATE TABLE IF NOT EXISTS armor_abilities (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      energy_cost NUMERIC,
      action_point_cost NUMERIC,
      damage TEXT,
      damage_type TEXT,
      range TEXT,
      mp NUMERIC,
      ability_name TEXT NOT NULL,
      ability_type TEXT,
      description TEXT,
      UNIQUE(category, ability_name, ability_type)
    );

    CREATE TABLE IF NOT EXISTS reference_documents (
      slug TEXT PRIMARY KEY,
      payload JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bestiary_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL,
      name TEXT NOT NULL,
      stats_skills JSONB,
      attributes JSONB,
      skills JSONB,
      abilities JSONB,
      actions JSONB,
      immunities JSONB,
      resistances JSONB,
      weaknesses JSONB,
      tags JSONB,
      dr INTEGER,
      armor_type TEXT,
      energy_bars INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS character_status_effects (
      id SERIAL PRIMARY KEY,
      character_id TEXT NOT NULL,
      status_key TEXT NOT NULL,
      duration_type TEXT,
      duration_remaining INTEGER,
      stacks INTEGER NOT NULL DEFAULT 1,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(character_id, status_key)
    );

    CREATE TABLE IF NOT EXISTS character_wounds (
      id SERIAL PRIMARY KEY,
      character_id TEXT NOT NULL,
      wound_type TEXT NOT NULL,
      wound_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(character_id, wound_type)
    );

    CREATE TABLE IF NOT EXISTS campaign_combatants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL,
      bestiary_entry_id UUID,
      character_id UUID,
      faction TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      initiative INTEGER,
      notes TEXT,
      energy_current INTEGER,
      ap_current INTEGER,
      tier INTEGER,
      energy_max INTEGER,
      ap_max INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CHECK (bestiary_entry_id IS NOT NULL OR character_id IS NOT NULL)
    );

    CREATE TABLE IF NOT EXISTS campaign_combatant_status_effects (
      id SERIAL PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      combatant_id TEXT NOT NULL,
      status_key TEXT NOT NULL,
      duration_type TEXT,
      duration_remaining INTEGER,
      stacks INTEGER NOT NULL DEFAULT 1,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(combatant_id, status_key)
    );

    CREATE TABLE IF NOT EXISTS campaign_combatant_wounds (
      id SERIAL PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      combatant_id TEXT NOT NULL,
      wound_type TEXT NOT NULL,
      wound_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(combatant_id, wound_type)
    );
  `);
}

async function importContentPack(client: Client, pack: ContentPack): Promise<void> {
  const rulesetId = await upsertRuleset(client, pack);
  await Promise.all([
    upsertAttributes(client, rulesetId, pack),
    upsertSkills(client, rulesetId, pack),
    upsertRaces(client, rulesetId, pack),
    upsertSubraces(client, rulesetId, pack),
    upsertFeats(client, rulesetId, pack),
    upsertItems(client, rulesetId, pack),
    upsertStatusEffects(client, rulesetId, pack),
    upsertDerivedStats(client, rulesetId, pack),
    upsertModifiers(client, rulesetId, pack.modifiers ?? []),
    upsertRaceDetails(client, rulesetId, pack)
  ]);
}

async function upsertRuleset(client: Client, pack: ContentPack): Promise<number> {
  const result = await client.query(
    `
    INSERT INTO content_rulesets (key, name, description)
    VALUES ($1, $2, $3)
    ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
    RETURNING id
  `,
    [pack.ruleset.key, pack.ruleset.name, pack.ruleset.description ?? null]
  );
  return result.rows[0].id as number;
}

async function upsertAttributes(client: Client, rulesetId: number, pack: ContentPack): Promise<void> {
  for (const attribute of pack.attributes) {
    await client.query(
      `
      INSERT INTO content_attributes (ruleset_id, key, name, description)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (ruleset_id, key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
    `,
      [rulesetId, attribute.key, attribute.name, attribute.description ?? null]
    );
  }
}

async function upsertSkills(client: Client, rulesetId: number, pack: ContentPack): Promise<void> {
  for (const skill of pack.skills) {
    await client.query(
      `
      INSERT INTO content_skills (ruleset_id, key, name, attribute_key, description)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (ruleset_id, key) DO UPDATE
        SET name = EXCLUDED.name,
            attribute_key = EXCLUDED.attribute_key,
            description = EXCLUDED.description
    `,
      [rulesetId, skill.key, skill.name, skill.attributeKey ?? null, skill.description ?? null]
    );
  }
}

async function upsertRaces(client: Client, rulesetId: number, pack: ContentPack): Promise<void> {
  for (const race of pack.races) {
    await client.query(
      `
      INSERT INTO content_races (ruleset_id, key, name, description)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (ruleset_id, key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
    `,
      [rulesetId, race.key, race.name, race.description ?? null]
    );
  }
}

async function upsertSubraces(client: Client, rulesetId: number, pack: ContentPack): Promise<void> {
  for (const subrace of pack.subraces) {
    await client.query(
      `
      INSERT INTO content_subraces (ruleset_id, key, race_key, name, description)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (ruleset_id, key) DO UPDATE
        SET race_key = EXCLUDED.race_key,
            name = EXCLUDED.name,
            description = EXCLUDED.description
    `,
      [rulesetId, subrace.key, subrace.raceKey, subrace.name, subrace.description ?? null]
    );
  }
}

async function upsertFeats(client: Client, rulesetId: number, pack: ContentPack): Promise<void> {
  for (const feat of pack.feats) {
    await client.query(
      `
      INSERT INTO content_feats (ruleset_id, key, name, description, prereq_expression)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (ruleset_id, key) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            prereq_expression = EXCLUDED.prereq_expression
    `,
      [rulesetId, feat.key, feat.name, feat.description ?? null, feat.prereqExpression ?? null]
    );
    if (feat.modifiers?.length) {
      await upsertModifiers(client, rulesetId, feat.modifiers, feat.key);
    }
  }
}

async function upsertItems(client: Client, rulesetId: number, pack: ContentPack): Promise<void> {
  for (const item of pack.items) {
    await client.query(
      `
      INSERT INTO content_items (ruleset_id, key, name, slot, description)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (ruleset_id, key) DO UPDATE
        SET name = EXCLUDED.name,
            slot = EXCLUDED.slot,
            description = EXCLUDED.description
    `,
      [rulesetId, item.key, item.name, item.slot ?? null, item.description ?? null]
    );
    if (item.modifiers?.length) {
      await upsertModifiers(client, rulesetId, item.modifiers, item.key);
    }
  }
}

async function upsertStatusEffects(
  client: Client,
  rulesetId: number,
  pack: ContentPack
): Promise<void> {
  for (const effect of pack.statusEffects) {
    await client.query(
      `
      INSERT INTO content_status_effects (ruleset_id, key, name, description, default_duration_type)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (ruleset_id, key) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            default_duration_type = EXCLUDED.default_duration_type
    `,
      [rulesetId, effect.key, effect.name, effect.description ?? null, effect.defaultDurationType ?? null]
    );
    if (effect.modifiers?.length) {
      await upsertModifiers(client, rulesetId, effect.modifiers, effect.key);
    }
  }
}

async function upsertDerivedStats(client: Client, rulesetId: number, pack: ContentPack): Promise<void> {
  for (const stat of pack.derivedStats) {
    await client.query(
      `
      INSERT INTO content_derived_stats (ruleset_id, key, name, description, expression)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (ruleset_id, key) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            expression = EXCLUDED.expression
    `,
      [rulesetId, stat.key, stat.name, stat.description ?? null, stat.expression as any]
    );
  }
}

async function upsertModifiers(
  client: Client,
  rulesetId: number,
  modifiers: ContentModifier[],
  parentKey?: string
): Promise<void> {
  for (const modifier of modifiers) {
    await client.query(
      `
      INSERT INTO content_modifiers (
        id,
        ruleset_id,
        source_type,
        source_key,
        target_path,
        operation,
        stacking_key,
        priority,
        value_expression,
        condition_expression
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE
        SET source_type = EXCLUDED.source_type,
            source_key = EXCLUDED.source_key,
            target_path = EXCLUDED.target_path,
            operation = EXCLUDED.operation,
            stacking_key = EXCLUDED.stacking_key,
            priority = EXCLUDED.priority,
            value_expression = EXCLUDED.value_expression,
            condition_expression = EXCLUDED.condition_expression
    `,
      [
        modifier.id ?? `${parentKey ?? "unknown"}::${modifier.targetPath}`,
        rulesetId,
        modifier.sourceType,
        modifier.sourceKey,
        modifier.targetPath,
        modifier.operation,
        modifier.stackingKey ?? null,
        modifier.priority ?? null,
        modifier.valueExpression as any,
        modifier.conditionExpression ?? null
      ]
    );
  }
}

async function upsertRaceDetails(client: Client, rulesetId: number, pack: ContentPack): Promise<void> {
  if (!pack.raceDetails) return;
  for (const [raceKey, details] of Object.entries(pack.raceDetails)) {
    await client.query(
      `
      INSERT INTO content_race_details (
        ruleset_id,
        race_key,
        attributes,
        skills,
        disciplines,
        deity_cap_per_spirit
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (ruleset_id, race_key) DO UPDATE
        SET attributes = EXCLUDED.attributes,
            skills = EXCLUDED.skills,
            disciplines = EXCLUDED.disciplines,
            deity_cap_per_spirit = EXCLUDED.deity_cap_per_spirit
    `,
      [
        rulesetId,
        raceKey,
        JSON.stringify(details.attributes ?? {}),
        JSON.stringify(details.skills ?? {}),
        JSON.stringify(details.disciplines ?? {}),
        details.deityCapPerSpirit ?? details.disciplines?.deityCapPerSpirit ?? null
      ]
    );
  }
}

async function importPsionics(client: Client, filePath: string): Promise<void> {
  const rows = parseCsv<PsionicCsvRow>(filePath);
  for (const row of rows) {
    await client.query(
      `
      INSERT INTO psionic_abilities (
        ability_tree,
        ability,
        tier,
        prerequisite,
        description,
        energy_cost,
        formula
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (ability_tree, ability) DO UPDATE
        SET tier = EXCLUDED.tier,
            prerequisite = EXCLUDED.prerequisite,
            description = EXCLUDED.description,
            energy_cost = EXCLUDED.energy_cost,
            formula = EXCLUDED.formula
    `,
      [
        row["Ability Tree"],
        row.Ability,
        toInteger(row.Tier),
        row.Prerequisite || null,
        row.Description || null,
        toNumber(row["Energy Cost"]),
        row.Formula || null
      ]
    );
  }
}

async function importWeapons(client: Client, filePath: string): Promise<void> {
  const rows = parseCsv<WeaponCsvRow>(filePath);
  for (const row of rows) {
    await client.query(
      `
      INSERT INTO weapon_abilities (
        category,
        energy_cost,
        action_point_cost,
        damage,
        damage_type,
        range,
        mp,
        two_handed,
        ability_name,
        ability_type,
        description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (category, ability_name, ability_type) DO UPDATE
        SET energy_cost = EXCLUDED.energy_cost,
            action_point_cost = EXCLUDED.action_point_cost,
            damage = EXCLUDED.damage,
            damage_type = EXCLUDED.damage_type,
            range = EXCLUDED.range,
            mp = EXCLUDED.mp,
            two_handed = EXCLUDED.two_handed,
            description = EXCLUDED.description
    `,
      [
        row.Category,
        toNumber(row["Energy Cost"]),
        toNumber(row["Action Point Cost"]),
        cleanDash(row.Damage),
        cleanDash(row.Type),
        cleanDash(row.Range),
        toNumber(row.MP),
        parseBoolean(row["Two-Handed?"]),
        row["Ability Name"],
        row["Ability Type"],
        row.Description || null
      ]
    );
  }
}

async function importArmor(client: Client, filePath: string): Promise<void> {
  const rows = parseCsv<ArmorCsvRow>(filePath);
  for (const row of rows) {
    await client.query(
      `
      INSERT INTO armor_abilities (
        category,
        energy_cost,
        action_point_cost,
        damage,
        damage_type,
        range,
        mp,
        ability_name,
        ability_type,
        description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (category, ability_name, ability_type) DO UPDATE
        SET energy_cost = EXCLUDED.energy_cost,
            action_point_cost = EXCLUDED.action_point_cost,
            damage = EXCLUDED.damage,
            damage_type = EXCLUDED.damage_type,
            range = EXCLUDED.range,
            mp = EXCLUDED.mp,
            description = EXCLUDED.description
    `,
      [
        row.Category,
        toNumber(row["Energy Cost"]),
        toNumber(row["Action Point Cost"]),
        cleanDash(row.Damage),
        cleanDash(row.Type),
        cleanDash(row.Range),
        toNumber(row.MP),
        row["Ability Name"],
        row["Ability Type"],
        row.Description || null
      ]
    );
  }
}

async function importReferenceDocument(client: Client, slug: string, filePath: string): Promise<void> {
  const payloadRaw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(payloadRaw);
  await client.query(
    `
    INSERT INTO reference_documents (slug, payload)
    VALUES ($1, $2)
    ON CONFLICT (slug) DO UPDATE SET payload = EXCLUDED.payload
  `,
    [slug, json]
  );
}

function parseCsv<T extends Record<string, string>>(filePath: string): T[] {
  const csvRaw = fs.readFileSync(filePath, "utf8");
  return parse(csvRaw, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as T[];
}

function toNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[–—]/g, "-").replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toInteger(value: string | null | undefined): number | null {
  const num = toNumber(value);
  return Number.isFinite(num ?? NaN) ? Math.trunc(num!) : null;
}

function parseBoolean(value: string | null | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (["yes", "true", "y", "1"].includes(normalized)) return true;
  if (["no", "false", "n", "0"].includes(normalized)) return false;
  return null;
}

function cleanDash(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "—" || trimmed === "-" || trimmed === "–" || trimmed === "") return null;
  return trimmed;
}

main().catch((err) => {
  console.error("Migration failed", err);
  process.exitCode = 1;
});
