/**
 * Migration: Fix Duplicate Foreign Keys on campaign_combatants
 *
 * Date: 2025-12-25
 * Issue: PostgREST error - "more than one relationship was found for
 *        'campaign_combatants' and 'bestiary_entries'"
 * Cause: Migration added foreign keys that may already exist with different names
 * Fix: Remove all foreign keys and re-add them with standard names
 * Safety: Fully idempotent, preserves data, only affects constraint metadata
 *
 * How to apply:
 * 1. Open Supabase Dashboard → SQL Editor
 * 2. First run: 20251225_diagnose_foreign_keys.sql to see current state
 * 3. Copy and paste this entire file
 * 4. Click Run (or Cmd/Ctrl + Enter)
 * 5. Verify success message in output
 */

-- ============================================================================
-- STEP 1: Drop ALL existing foreign keys on campaign_combatants
-- ============================================================================

DO $$
DECLARE
  constraint_record RECORD;
  constraints_dropped INTEGER := 0;
BEGIN
  FOR constraint_record IN
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'campaign_combatants'
      AND constraint_type = 'FOREIGN KEY'
  LOOP
    EXECUTE format('ALTER TABLE campaign_combatants DROP CONSTRAINT IF EXISTS %I CASCADE',
                   constraint_record.constraint_name);
    constraints_dropped := constraints_dropped + 1;
    RAISE NOTICE 'Dropped constraint: %', constraint_record.constraint_name;
  END LOOP;

  RAISE NOTICE 'Dropped % foreign key constraint(s)', constraints_dropped;
END $$;


-- ============================================================================
-- STEP 2: Re-add foreign keys with standard names
-- ============================================================================

-- Foreign key to campaigns
ALTER TABLE campaign_combatants
  ADD CONSTRAINT fk_campaign_combatants_campaign
  FOREIGN KEY (campaign_id)
  REFERENCES campaigns(id)
  ON DELETE CASCADE;

RAISE NOTICE 'Added foreign key: fk_campaign_combatants_campaign';

-- Foreign key to bestiary_entries
ALTER TABLE campaign_combatants
  ADD CONSTRAINT fk_campaign_combatants_bestiary
  FOREIGN KEY (bestiary_entry_id)
  REFERENCES bestiary_entries(id)
  ON DELETE CASCADE;

RAISE NOTICE 'Added foreign key: fk_campaign_combatants_bestiary';

-- Foreign key to characters
ALTER TABLE campaign_combatants
  ADD CONSTRAINT fk_campaign_combatants_character
  FOREIGN KEY (character_id)
  REFERENCES characters(id)
  ON DELETE CASCADE;

RAISE NOTICE 'Added foreign key: fk_campaign_combatants_character';


-- ============================================================================
-- STEP 3: Verify exactly 3 foreign keys exist
-- ============================================================================

DO $$
DECLARE
  fk_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fk_count
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'campaign_combatants'
    AND constraint_type = 'FOREIGN KEY';

  RAISE NOTICE '=== Foreign Key Verification ===';
  RAISE NOTICE 'Foreign keys on campaign_combatants: %', fk_count;

  IF fk_count = 3 THEN
    RAISE NOTICE '✅ Cleanup completed successfully! Exactly 3 foreign keys exist.';
  ELSE
    RAISE WARNING '⚠️  Expected 3 foreign keys, found %. Please verify manually.', fk_count;
  END IF;
END $$;


-- ============================================================================
-- STEP 4: Show final foreign key configuration
-- ============================================================================

SELECT
  tc.constraint_name,
  kcu.column_name AS source_column,
  ccu.table_name AS target_table,
  ccu.column_name AS target_column
FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name = 'campaign_combatants'
ORDER BY tc.constraint_name;
