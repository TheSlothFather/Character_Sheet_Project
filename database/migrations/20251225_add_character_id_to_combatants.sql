/**
 * Migration: Add character_id support to campaign_combatants
 *
 * Date: 2025-12-25
 * Issue: ApiError - column campaign_combatants.character_id does not exist
 * Enables: Player characters in combat alongside NPCs (commit 0d937fd)
 * Safety: Fully idempotent, non-destructive, backwards compatible
 *
 * How to apply:
 * 1. Open Supabase Dashboard → SQL Editor
 * 2. Copy and paste this entire file
 * 3. Click Run (or Cmd/Ctrl + Enter)
 * 4. Verify success message in output
 */

-- ============================================================================
-- STEP 1: Add character_id column
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaign_combatants'
      AND column_name = 'character_id'
  ) THEN
    ALTER TABLE campaign_combatants
      ADD COLUMN character_id UUID;

    RAISE NOTICE 'Added character_id column to campaign_combatants';
  ELSE
    RAISE NOTICE 'character_id column already exists, skipping';
  END IF;
END $$;


-- ============================================================================
-- STEP 2: Add foreign key to characters table
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name = 'fk_campaign_combatants_character'
      AND table_name = 'campaign_combatants'
  ) THEN
    ALTER TABLE campaign_combatants
      ADD CONSTRAINT fk_campaign_combatants_character
      FOREIGN KEY (character_id)
      REFERENCES characters(id)
      ON DELETE CASCADE;

    RAISE NOTICE 'Added foreign key constraint fk_campaign_combatants_character';
  ELSE
    RAISE NOTICE 'Foreign key constraint already exists, skipping';
  END IF;
END $$;


-- ============================================================================
-- STEP 3: Add foreign key to campaigns table (if missing)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name = 'fk_campaign_combatants_campaign'
      AND table_name = 'campaign_combatants'
  ) THEN
    ALTER TABLE campaign_combatants
      ADD CONSTRAINT fk_campaign_combatants_campaign
      FOREIGN KEY (campaign_id)
      REFERENCES campaigns(id)
      ON DELETE CASCADE;

    RAISE NOTICE 'Added foreign key constraint fk_campaign_combatants_campaign';
  ELSE
    RAISE NOTICE 'Campaign foreign key already exists, skipping';
  END IF;
END $$;


-- ============================================================================
-- STEP 4: Add foreign key to bestiary_entries (if missing)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name = 'fk_campaign_combatants_bestiary'
      AND table_name = 'campaign_combatants'
  ) THEN
    ALTER TABLE campaign_combatants
      ADD CONSTRAINT fk_campaign_combatants_bestiary
      FOREIGN KEY (bestiary_entry_id)
      REFERENCES bestiary_entries(id)
      ON DELETE CASCADE;

    RAISE NOTICE 'Added foreign key constraint fk_campaign_combatants_bestiary';
  ELSE
    RAISE NOTICE 'Bestiary foreign key already exists, skipping';
  END IF;
END $$;


-- ============================================================================
-- STEP 5: Add check constraint (must have either bestiary OR character)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name = 'campaign_combatants_entity_check'
      AND table_name = 'campaign_combatants'
  ) THEN
    ALTER TABLE campaign_combatants
      ADD CONSTRAINT campaign_combatants_entity_check
      CHECK (bestiary_entry_id IS NOT NULL OR character_id IS NOT NULL);

    RAISE NOTICE 'Added check constraint campaign_combatants_entity_check';
  ELSE
    RAISE NOTICE 'Check constraint already exists, skipping';
  END IF;
END $$;


-- ============================================================================
-- STEP 6: Add performance indexes
-- ============================================================================

-- Index on character_id for quick lookups
CREATE INDEX IF NOT EXISTS idx_campaign_combatants_character_id
  ON campaign_combatants(character_id)
  WHERE character_id IS NOT NULL;

-- Composite index for common query: "get all character combatants in campaign"
CREATE INDEX IF NOT EXISTS idx_campaign_combatants_campaign_character
  ON campaign_combatants(campaign_id, character_id)
  WHERE character_id IS NOT NULL;

-- Composite index for initiative ordering (used by listCombatants)
CREATE INDEX IF NOT EXISTS idx_campaign_combatants_campaign_initiative
  ON campaign_combatants(campaign_id, initiative DESC)
  WHERE is_active = true;


-- ============================================================================
-- STEP 7: Add helpful documentation
-- ============================================================================

COMMENT ON COLUMN campaign_combatants.character_id IS
  'Reference to player character. Either character_id or bestiary_entry_id must be set.';

COMMENT ON COLUMN campaign_combatants.bestiary_entry_id IS
  'Reference to NPC from bestiary. Either bestiary_entry_id or character_id must be set.';


-- ============================================================================
-- STEP 8: Verify migration success
-- ============================================================================

DO $$
DECLARE
  v_column_exists boolean;
  v_fk_count integer;
  v_check_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'campaign_combatants'
      AND column_name = 'character_id'
  ) INTO v_column_exists;

  SELECT COUNT(*) INTO v_fk_count
  FROM information_schema.table_constraints
  WHERE table_name = 'campaign_combatants'
    AND constraint_type = 'FOREIGN KEY';

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'campaign_combatants'
      AND constraint_name = 'campaign_combatants_entity_check'
  ) INTO v_check_exists;

  RAISE NOTICE '=== Migration Verification ===';
  RAISE NOTICE 'character_id column exists: %', v_column_exists;
  RAISE NOTICE 'Foreign key constraints: %', v_fk_count;
  RAISE NOTICE 'Entity check constraint exists: %', v_check_exists;

  IF v_column_exists AND v_fk_count >= 1 AND v_check_exists THEN
    RAISE NOTICE '✅ Migration completed successfully!';
  ELSE
    RAISE WARNING '⚠️  Migration may have issues. Please verify manually.';
  END IF;
END $$;


-- ============================================================================
-- VERIFICATION QUERY (run separately to confirm)
-- ============================================================================

-- Uncomment and run this query separately to verify the migration:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'campaign_combatants'
--   AND column_name = 'character_id';
-- Expected: 1 row showing character_id as uuid, nullable YES


-- ============================================================================
-- ROLLBACK (if needed - WARNING: will break current app)
-- ============================================================================

-- Uncomment to rollback (removes constraints but keeps column):
-- ALTER TABLE campaign_combatants
--   DROP CONSTRAINT IF EXISTS campaign_combatants_entity_check,
--   DROP CONSTRAINT IF EXISTS fk_campaign_combatants_character;

-- Full rollback (WARNING: will break app - only use if reverting commit):
-- ALTER TABLE campaign_combatants
--   DROP CONSTRAINT IF EXISTS campaign_combatants_entity_check,
--   DROP CONSTRAINT IF EXISTS fk_campaign_combatants_character,
--   DROP COLUMN IF EXISTS character_id;
