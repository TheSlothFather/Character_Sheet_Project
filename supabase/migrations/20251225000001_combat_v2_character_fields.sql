-- Combat V2 Migration 1: Character Combat Fields
-- Adds combat resource tracking to characters table

-- Add new columns to characters table for combat persistence
ALTER TABLE characters
ADD COLUMN IF NOT EXISTS energy_current INTEGER,
ADD COLUMN IF NOT EXISTS energy_max INTEGER,
ADD COLUMN IF NOT EXISTS ap_current INTEGER DEFAULT 6,
ADD COLUMN IF NOT EXISTS ap_max INTEGER DEFAULT 6;

-- Add damage modifier columns (JSONB arrays of damage types)
ALTER TABLE characters
ADD COLUMN IF NOT EXISTS immunities JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS resistances JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS weaknesses JSONB DEFAULT '[]'::jsonb;

-- Add wound tracking with 8 types (including Holy/Unholy Spiritual split)
ALTER TABLE characters
ADD COLUMN IF NOT EXISTS wounds JSONB DEFAULT '{
  "blunt": 0,
  "burn": 0,
  "freeze": 0,
  "laceration": 0,
  "mental": 0,
  "necrosis": 0,
  "holy_spiritual": 0,
  "unholy_spiritual": 0
}'::jsonb;

-- Add constraint to validate wounds structure
ALTER TABLE characters
ADD CONSTRAINT wounds_valid_json CHECK (
  wounds IS NULL OR (
    jsonb_typeof(wounds) = 'object' AND
    (wounds->>'blunt' IS NULL OR (wounds->>'blunt')::int >= 0) AND
    (wounds->>'burn' IS NULL OR (wounds->>'burn')::int >= 0) AND
    (wounds->>'freeze' IS NULL OR (wounds->>'freeze')::int >= 0) AND
    (wounds->>'laceration' IS NULL OR (wounds->>'laceration')::int >= 0) AND
    (wounds->>'mental' IS NULL OR (wounds->>'mental')::int >= 0) AND
    (wounds->>'necrosis' IS NULL OR (wounds->>'necrosis')::int >= 0) AND
    (wounds->>'holy_spiritual' IS NULL OR (wounds->>'holy_spiritual')::int >= 0) AND
    (wounds->>'unholy_spiritual' IS NULL OR (wounds->>'unholy_spiritual')::int >= 0)
  )
);

-- Add constraint for damage modifier arrays
ALTER TABLE characters
ADD CONSTRAINT immunities_valid_json CHECK (
  immunities IS NULL OR jsonb_typeof(immunities) = 'array'
),
ADD CONSTRAINT resistances_valid_json CHECK (
  resistances IS NULL OR jsonb_typeof(resistances) = 'array'
),
ADD CONSTRAINT weaknesses_valid_json CHECK (
  weaknesses IS NULL OR jsonb_typeof(weaknesses) = 'array'
);

-- Create index on wounds for efficient querying of wounded characters
CREATE INDEX IF NOT EXISTS idx_characters_has_wounds ON characters
USING btree ((
  COALESCE((wounds->>'blunt')::int, 0) +
  COALESCE((wounds->>'burn')::int, 0) +
  COALESCE((wounds->>'freeze')::int, 0) +
  COALESCE((wounds->>'laceration')::int, 0) +
  COALESCE((wounds->>'mental')::int, 0) +
  COALESCE((wounds->>'necrosis')::int, 0) +
  COALESCE((wounds->>'holy_spiritual')::int, 0) +
  COALESCE((wounds->>'unholy_spiritual')::int, 0)
))
WHERE wounds IS NOT NULL;

COMMENT ON COLUMN characters.energy_current IS 'Current Energy (combat resource)';
COMMENT ON COLUMN characters.energy_max IS 'Maximum Energy: 100 + 10*(level-1)';
COMMENT ON COLUMN characters.ap_current IS 'Current Action Points';
COMMENT ON COLUMN characters.ap_max IS 'Maximum AP: 6 + 2*floor((level-1)/5)';
COMMENT ON COLUMN characters.immunities IS 'Array of damage types this character is immune to';
COMMENT ON COLUMN characters.resistances IS 'Array of damage types this character has resistance to (50% damage)';
COMMENT ON COLUMN characters.weaknesses IS 'Array of damage types this character is weak to (200% damage)';
COMMENT ON COLUMN characters.wounds IS 'Wound counts by type: blunt, burn, freeze, laceration, mental, necrosis, holy_spiritual, unholy_spiritual';
