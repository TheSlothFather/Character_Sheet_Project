/**
 * Combat Lobby Readiness Table
 *
 * Stores player readiness state for pre-combat lobby.
 * Real-time updates are handled via Durable Object WebSockets,
 * but this table provides persistence and recovery.
 */

-- Create table for lobby readiness tracking
CREATE TABLE IF NOT EXISTS campaign_lobby_readiness (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  player_user_id UUID NOT NULL,
  is_ready BOOLEAN NOT NULL DEFAULT FALSE,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (campaign_id, player_user_id)
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_lobby_readiness_campaign
  ON campaign_lobby_readiness(campaign_id);

-- Enable Row Level Security
ALTER TABLE campaign_lobby_readiness ENABLE ROW LEVEL SECURITY;

-- Policy: Players can read all readiness for campaigns they're members of
CREATE POLICY "Players can view lobby readiness for their campaigns"
  ON campaign_lobby_readiness
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_members.campaign_id = campaign_lobby_readiness.campaign_id
      AND campaign_members.player_user_id = auth.uid()
    )
  );

-- Policy: Players can update their own readiness
CREATE POLICY "Players can update their own readiness"
  ON campaign_lobby_readiness
  FOR UPDATE
  USING (player_user_id = auth.uid())
  WITH CHECK (player_user_id = auth.uid());

-- Policy: Players can insert their own readiness
CREATE POLICY "Players can insert their own readiness"
  ON campaign_lobby_readiness
  FOR INSERT
  WITH CHECK (player_user_id = auth.uid());

-- Policy: Players can delete their own readiness
CREATE POLICY "Players can delete their own readiness"
  ON campaign_lobby_readiness
  FOR DELETE
  USING (player_user_id = auth.uid());

-- Policy: GMs can manage all readiness for their campaigns
CREATE POLICY "GMs can manage all lobby readiness"
  ON campaign_lobby_readiness
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_lobby_readiness.campaign_id
      AND campaigns.gm_user_id = auth.uid()
    )
  );

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_lobby_readiness_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamp on changes
CREATE TRIGGER update_lobby_readiness_timestamp
  BEFORE UPDATE ON campaign_lobby_readiness
  FOR EACH ROW
  EXECUTE FUNCTION update_lobby_readiness_timestamp();

-- Function to auto-clean old lobby entries (optional - call periodically)
CREATE OR REPLACE FUNCTION cleanup_old_lobby_entries()
RETURNS void AS $$
BEGIN
  DELETE FROM campaign_lobby_readiness
  WHERE updated_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE campaign_lobby_readiness IS
  'Tracks player readiness state in pre-combat lobby. Real-time updates via WebSocket.';
