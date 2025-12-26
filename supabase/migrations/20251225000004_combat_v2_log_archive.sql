-- Combat V2 Migration 4: Combat Log Archive
-- Persists combat logs for historical review and analysis

CREATE TABLE IF NOT EXISTS combat_log_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combat_id UUID NOT NULL,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  -- Log entry details
  round INTEGER NOT NULL,
  turn_index INTEGER NOT NULL DEFAULT 0,
  log_type TEXT NOT NULL,

  -- Entity references
  source_entity_id UUID,
  target_entity_id UUID,

  -- Flexible data payload
  data JSONB,

  -- Human-readable message
  message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying logs by combat
CREATE INDEX IF NOT EXISTS idx_combat_log_archive_combat_id
ON combat_log_archive(combat_id);

-- Index for querying logs by campaign
CREATE INDEX IF NOT EXISTS idx_combat_log_archive_campaign_id
ON combat_log_archive(campaign_id);

-- Index for chronological queries within a combat
CREATE INDEX IF NOT EXISTS idx_combat_log_archive_order
ON combat_log_archive(combat_id, round, turn_index, created_at);

-- Index for filtering by log type
CREATE INDEX IF NOT EXISTS idx_combat_log_archive_type
ON combat_log_archive(combat_id, log_type);

-- Validate log_type is one of expected values
ALTER TABLE combat_log_archive
ADD CONSTRAINT log_type_valid CHECK (
  log_type IN (
    'combat_started',
    'combat_ended',
    'round_started',
    'turn_started',
    'turn_ended',
    'movement_executed',
    'action_declared',
    'action_resolved',
    'action_cancelled',
    'reaction_declared',
    'reaction_resolved',
    'damage_applied',
    'wounds_inflicted',
    'status_applied',
    'status_removed',
    'status_tick',
    'channeling_started',
    'channeling_continued',
    'spell_released',
    'channeling_interrupted',
    'blowback_applied',
    'energy_depleted',
    'endure_roll',
    'unconscious',
    'death_check',
    'entity_died',
    'entity_removed',
    'initiative_rolled',
    'skill_contest',
    'skill_check',
    'gm_override'
  )
);

COMMENT ON TABLE combat_log_archive IS 'Persistent archive of combat events for historical review';
COMMENT ON COLUMN combat_log_archive.log_type IS 'Type of combat event logged';
COMMENT ON COLUMN combat_log_archive.data IS 'Event-specific data payload';
COMMENT ON COLUMN combat_log_archive.message IS 'Human-readable description of the event';
