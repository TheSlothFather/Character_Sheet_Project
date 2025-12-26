/**
 * Diagnostic Query: Find all foreign keys on campaign_combatants
 *
 * Purpose: Identify duplicate foreign key relationships causing PostgREST embed error
 * Error: "Could not embed because more than one relationship was found for
 *         'campaign_combatants' and 'bestiary_entries'"
 *
 * Run this in Supabase SQL Editor to see what foreign keys exist
 */

SELECT
  tc.constraint_name,
  tc.table_name AS source_table,
  kcu.column_name AS source_column,
  ccu.table_name AS target_table,
  ccu.column_name AS target_column,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
  LEFT JOIN information_schema.referential_constraints AS rc
    ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name = 'campaign_combatants'
ORDER BY tc.constraint_name;
