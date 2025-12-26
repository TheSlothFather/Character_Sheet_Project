-- Combat V2 Migration 2: Hex Grid Positions
-- Tracks entity positions on the hex grid during combat

CREATE TABLE IF NOT EXISTS combat_hex_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combat_id UUID NOT NULL,
  entity_id UUID NOT NULL,
  hex_q INTEGER NOT NULL,  -- Axial coordinate q
  hex_r INTEGER NOT NULL,  -- Axial coordinate r
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Only one entity per hex in a combat
  UNIQUE(combat_id, hex_q, hex_r),
  -- Only one position per entity in a combat
  UNIQUE(combat_id, entity_id)
);

-- Index for quick lookup by combat
CREATE INDEX IF NOT EXISTS idx_combat_hex_positions_combat_id
ON combat_hex_positions(combat_id);

-- Index for looking up entity position
CREATE INDEX IF NOT EXISTS idx_combat_hex_positions_entity_id
ON combat_hex_positions(entity_id);

-- Index for spatial queries within a combat
CREATE INDEX IF NOT EXISTS idx_combat_hex_positions_coords
ON combat_hex_positions(combat_id, hex_q, hex_r);

-- Trigger to update updated_at on modification
CREATE OR REPLACE FUNCTION update_hex_position_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_hex_position_timestamp
BEFORE UPDATE ON combat_hex_positions
FOR EACH ROW
EXECUTE FUNCTION update_hex_position_timestamp();

COMMENT ON TABLE combat_hex_positions IS 'Tracks entity positions on the hex grid during combat';
COMMENT ON COLUMN combat_hex_positions.hex_q IS 'Axial coordinate Q (column)';
COMMENT ON COLUMN combat_hex_positions.hex_r IS 'Axial coordinate R (row offset)';
