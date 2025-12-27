/**
 * Combat Map Templates Migration
 *
 * Creates table for storing reusable combat map templates with grid configurations.
 * Templates can be saved by GMs and reused across combats in the same campaign.
 */

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: combat_map_templates
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS combat_map_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),

  -- Template metadata
  name TEXT NOT NULL,
  description TEXT,

  -- Map image (stored in R2)
  image_key TEXT,
  image_url TEXT,
  image_width INTEGER,
  image_height INTEGER,

  -- Grid configuration
  grid_rows INTEGER NOT NULL DEFAULT 20,
  grid_cols INTEGER NOT NULL DEFAULT 30,
  cell_size INTEGER NOT NULL DEFAULT 40,
  offset_x INTEGER NOT NULL DEFAULT 0,
  offset_y INTEGER NOT NULL DEFAULT 0,
  grid_visible BOOLEAN NOT NULL DEFAULT true,
  grid_opacity REAL NOT NULL DEFAULT 0.5,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_template_name_per_campaign UNIQUE(campaign_id, name),
  CONSTRAINT valid_grid_rows CHECK (grid_rows >= 5 AND grid_rows <= 100),
  CONSTRAINT valid_grid_cols CHECK (grid_cols >= 5 AND grid_cols <= 100),
  CONSTRAINT valid_cell_size CHECK (cell_size >= 20 AND cell_size <= 80),
  CONSTRAINT valid_offset_x CHECK (offset_x >= -200 AND offset_x <= 200),
  CONSTRAINT valid_offset_y CHECK (offset_y >= -200 AND offset_y <= 200),
  CONSTRAINT valid_opacity CHECK (grid_opacity >= 0.1 AND grid_opacity <= 1.0)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_combat_map_templates_campaign
  ON combat_map_templates(campaign_id);

CREATE INDEX idx_combat_map_templates_created_by
  ON combat_map_templates(created_by);

CREATE INDEX idx_combat_map_templates_created_at
  ON combat_map_templates(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE combat_map_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view templates for campaigns they're members of
CREATE POLICY "Users can view campaign map templates"
  ON combat_map_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_members cm
      WHERE cm.campaign_id = combat_map_templates.campaign_id
        AND cm.player_user_id = auth.uid()
    )
  );

-- Policy: GMs can create templates for their campaigns
CREATE POLICY "GMs can create map templates"
  ON combat_map_templates
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = combat_map_templates.campaign_id
        AND c.gm_user_id = auth.uid()
    )
  );

-- Policy: GMs can update their own templates
CREATE POLICY "GMs can update their map templates"
  ON combat_map_templates
  FOR UPDATE
  USING (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = combat_map_templates.campaign_id
        AND c.gm_user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = combat_map_templates.campaign_id
        AND c.gm_user_id = auth.uid()
    )
  );

-- Policy: GMs can delete their own templates
CREATE POLICY "GMs can delete their map templates"
  ON combat_map_templates
  FOR DELETE
  USING (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = combat_map_templates.campaign_id
        AND c.gm_user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: Update updated_at timestamp
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_combat_map_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_combat_map_templates_updated_at
  BEFORE UPDATE ON combat_map_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_combat_map_templates_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE combat_map_templates IS
  'Reusable battle map templates with grid configurations for combat encounters';

COMMENT ON COLUMN combat_map_templates.image_key IS
  'R2 object key for the uploaded map image';

COMMENT ON COLUMN combat_map_templates.grid_rows IS
  'Number of rows in the square grid (5-100)';

COMMENT ON COLUMN combat_map_templates.grid_cols IS
  'Number of columns in the square grid (5-100)';

COMMENT ON COLUMN combat_map_templates.cell_size IS
  'Size of each grid cell in pixels (20-80)';

COMMENT ON COLUMN combat_map_templates.offset_x IS
  'Horizontal offset for grid alignment in pixels (-200 to 200)';

COMMENT ON COLUMN combat_map_templates.offset_y IS
  'Vertical offset for grid alignment in pixels (-200 to 200)';
