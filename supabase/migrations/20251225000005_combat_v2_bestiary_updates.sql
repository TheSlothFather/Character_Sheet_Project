-- Combat V2 Migration 5: Bestiary Updates
-- Adds damage modifiers and entity tier to bestiary entries

-- Add damage modifier columns
ALTER TABLE bestiary_entries
ADD COLUMN IF NOT EXISTS immunities JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS resistances JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS weaknesses JSONB DEFAULT '[]'::jsonb;

-- Add entity tier column (minion, full, lieutenant, hero)
ALTER TABLE bestiary_entries
ADD COLUMN IF NOT EXISTS entity_tier TEXT DEFAULT 'minion';

-- Add constraints for damage modifier arrays
ALTER TABLE bestiary_entries
ADD CONSTRAINT bestiary_immunities_valid_json CHECK (
  immunities IS NULL OR jsonb_typeof(immunities) = 'array'
),
ADD CONSTRAINT bestiary_resistances_valid_json CHECK (
  resistances IS NULL OR jsonb_typeof(resistances) = 'array'
),
ADD CONSTRAINT bestiary_weaknesses_valid_json CHECK (
  weaknesses IS NULL OR jsonb_typeof(weaknesses) = 'array'
);

-- Add constraint for entity_tier valid values
ALTER TABLE bestiary_entries
ADD CONSTRAINT entity_tier_valid CHECK (
  entity_tier IN ('minion', 'full', 'lieutenant', 'hero')
);

-- Index for filtering by entity tier
CREATE INDEX IF NOT EXISTS idx_bestiary_entries_entity_tier
ON bestiary_entries(entity_tier);

-- Index for finding entities with immunities
CREATE INDEX IF NOT EXISTS idx_bestiary_entries_has_immunities
ON bestiary_entries USING gin(immunities)
WHERE immunities != '[]'::jsonb;

-- Index for finding entities with resistances
CREATE INDEX IF NOT EXISTS idx_bestiary_entries_has_resistances
ON bestiary_entries USING gin(resistances)
WHERE resistances != '[]'::jsonb;

-- Index for finding entities with weaknesses
CREATE INDEX IF NOT EXISTS idx_bestiary_entries_has_weaknesses
ON bestiary_entries USING gin(weaknesses)
WHERE weaknesses != '[]'::jsonb;

COMMENT ON COLUMN bestiary_entries.immunities IS 'Array of damage types this creature is immune to';
COMMENT ON COLUMN bestiary_entries.resistances IS 'Array of damage types this creature resists (50% damage)';
COMMENT ON COLUMN bestiary_entries.weaknesses IS 'Array of damage types this creature is weak to (200% damage)';
COMMENT ON COLUMN bestiary_entries.entity_tier IS 'Complexity tier: minion (1-hit), full, lieutenant, hero';
