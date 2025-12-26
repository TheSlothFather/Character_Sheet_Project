-- Combat V2 Migration 3: Ildakar Channeling State
-- Tracks multi-turn spell channeling for mages

CREATE TABLE IF NOT EXISTS combat_channeling (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combat_id UUID NOT NULL,
  entity_id UUID NOT NULL,

  -- Spell being channeled
  spell_template JSONB NOT NULL,

  -- Resources channeled so far
  energy_channeled INTEGER DEFAULT 0,
  ap_channeled INTEGER DEFAULT 0,

  -- Turn tracking
  turns_channeled INTEGER DEFAULT 0,

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Only one active channel per entity
  UNIQUE(combat_id, entity_id)
);

-- Index for quick lookup by combat
CREATE INDEX IF NOT EXISTS idx_combat_channeling_combat_id
ON combat_channeling(combat_id);

-- Index for looking up entity's channeling state
CREATE INDEX IF NOT EXISTS idx_combat_channeling_entity_id
ON combat_channeling(entity_id);

-- Trigger to update updated_at on modification
CREATE OR REPLACE FUNCTION update_channeling_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_channeling_timestamp
BEFORE UPDATE ON combat_channeling
FOR EACH ROW
EXECUTE FUNCTION update_channeling_timestamp();

-- Validate spell_template structure
ALTER TABLE combat_channeling
ADD CONSTRAINT spell_template_valid CHECK (
  jsonb_typeof(spell_template) = 'object' AND
  spell_template->>'name' IS NOT NULL AND
  spell_template->>'id' IS NOT NULL
);

COMMENT ON TABLE combat_channeling IS 'Tracks Ildakar multi-turn spell channeling';
COMMENT ON COLUMN combat_channeling.spell_template IS 'Complete spell definition being channeled';
COMMENT ON COLUMN combat_channeling.energy_channeled IS 'Total Energy invested so far';
COMMENT ON COLUMN combat_channeling.ap_channeled IS 'Total AP invested so far';
COMMENT ON COLUMN combat_channeling.turns_channeled IS 'Number of turns spent channeling';
