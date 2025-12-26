

    content_rulesets
        columns: id, key, name, description
        policies: none listed

    content_attributes
        columns: id, ruleset_id, key, name, description
        policies: none listed

    content_skills
        columns: id, ruleset_id, key, name, attribute_key, description
        policies: none listed

    content_races
        columns: id, ruleset_id, key, name, description
        policies: none listed

    content_subraces
        columns: id, ruleset_id, key, race_key, name, description
        policies: none listed

    content_feats
        columns: id, ruleset_id, key, name, description, prereq_expression
        policies: none listed

    content_items
        columns: id, ruleset_id, key, name, slot, description
        policies: none listed

    content_status_effects
        columns: id, ruleset_id, key, name, description, default_duration_type
        policies: none listed

    content_derived_stats
        columns: id, ruleset_id, key, name, description, expression
        policies: none listed

    content_modifiers
        columns: id, ruleset_id, source_type, source_key, target_path, operation, stacking_key, priority, value_expression, condition_expression
        policies: none listed

    content_race_details
        columns: id, ruleset_id, race_key, attributes, skills, disciplines, deity_cap_per_spirit
        policies: none listed

    psionic_abilities
        columns: id, ability_tree, ability, tier, prerequisite, description, energy_cost, action_point_cost
        policies: read_auth / read_anon (generic read policies present)

    weapon_abilities
        columns: id, category, energy_cost, action_point_cost, damage, damage_type, range, mp, two_handed, ability_name, ability_type, description
        policies: read_auth / read_anon (generic read policies present)

    armor_abilities
        columns: id, category, energy_cost, action_point_cost, damage, damage_type, range, mp, ability_name, ability_type, description
        policies: read_auth / read_anon (generic read policies present)

    reference_documents
        columns: slug, payload
        policies: read_auth / read_anon (generic read policies present)

    characters
        columns: id, name, level, race_key, subrace_key, notes, attribute_points_available, skill_points, skill_allocations, skill_allocation_minimums, skill_bonuses, backgrounds, attributes, fate_points, weapon_notes, defense_notes, gear_notes, created_at, updated_at, user_id, campaign_id
        policies:
            characters_select_owner_or_gm — SELECT — visible to owner or campaign GM
            characters_insert_owner_member_or_gm — INSERT — checks owner is auth.uid() and campaign membership/GM or null campaign
            characters_update_owner_or_gm — UPDATE — owner or campaign GM
            characters_delete_owner_or_gm — DELETE — owner or campaign GM

    campaigns
        columns: id, name, gm_user_id, created_at
        policies:
            campaigns_select_gm_or_member — SELECT — GM or campaign member
            campaigns_modify_gm_only — INSERT — check gm_user_id = current_user_id()
            campaigns_update_gm_only — UPDATE — GM only
            campaigns_delete_gm_only — DELETE — GM only

    campaign_members
        columns: campaign_id, player_user_id, character_id, role
        policies:
            campaign_members_select_gm_or_member — SELECT — player or GM
            campaign_members_modify_gm_only — INSERT/UPDATE/DELETE — GM-only (exists check on campaigns)
            campaign_members_insert_via_invite — INSERT — authenticated users can insert themselves via valid invite
            campaign_members_update_self — UPDATE — authenticated users can update their own membership

    campaign_invites
        columns: campaign_id, token, expires_at, created_by, created_at
        policies:
            campaign_invites_select_by_token / campaign_invites_select_by_token_anon — SELECT — token present and not expired (authenticated and anon variants)
            campaign_invites_select_gm_only — SELECT — GM-only for campaign
            campaign_invites_modify_gm_only — INSERT/UPDATE/DELETE — GM-only

    bestiary_entries
        columns: id, campaign_id, name, stats_skills, tags, attributes, skills, abilities, energy_max, ap_max, tier, rank, lieutenant_id, hero_id, dr, armor_type, energy_bars, actions, immunities, resistances, weaknesses
        policies:
            bestiary_entries_select_gm_or_member — SELECT — campaign GM or member
            bestiary_entries_modify_gm_only — INSERT/UPDATE/DELETE — GM-only

    npc_pins
        columns: campaign_id, bestiary_entry_id, pinned_order
        policies:
            npc_pins_select_gm_or_member — SELECT — campaign GM or member
            npc_pins_modify_gm_only — INSERT/UPDATE/DELETE — GM-only

    setting_entries
        columns: id, campaign_id, title, body, tags, is_player_visible
        policies:
            setting_entries_select_gm_or_member — SELECT — GM or member (full)
            settings_gm_full_access — ALL — GM can manage all
            settings_player_shared_select — SELECT — visible to players when is_player_visible = true
            setting_entries_modify_gm_only — INSERT/UPDATE/DELETE — GM-only

    roll_requests
        columns: id, campaign_id, player_user_id, character_id, skill_key, skill_total, d100, total, created_at
        policies:
            roll_requests_select_gm_or_member — SELECT — GM or member
            roll_requests_insert_gm_or_player — INSERT — player (owner) or GM
            roll_requests_update_gm_or_player — UPDATE — player or GM
            roll_requests_delete_gm_or_player — DELETE — player or GM

    roll_contests
        columns: id, roll_request_id, npc_id, gm_user_id, npc_skill_key, npc_d100, npc_total, outcome, created_at
        policies:
            roll_contests_select_gm_or_member — SELECT — GM or related member
            roll_contests_insert_gm_only — INSERT — GM-only
            roll_contests_update_gm_only — UPDATE — GM-only
            roll_contests_delete_gm_only — DELETE — GM-only

    psionic_abilities_backup
        columns: id, ability_tree, ability, tier, prerequisite, description, energy_cost, formula
        policies: read_auth / read_anon (generic read policies present)

    campaign_combatants
        columns: id, campaign_id, bestiary_entry_id, character_id, faction, is_active, initiative, notes, energy_current, ap_current, tier, energy_max, ap_max, created_at, updated_at
        constraints:
            - Either bestiary_entry_id OR character_id must be set (campaign_combatants_entity_check)
            - Foreign keys: campaign_id → campaigns(id), bestiary_entry_id → bestiary_entries(id), character_id → characters(id)
        policies:
            "gm can manage combatants" — ALL — GM-only
            "players can read active combatants" — SELECT — players can read active combatants in their campaigns

    gear
        columns: id, item_name, description, inventory_slots
        policies: none listed (table has RLS disabled)

    tools
        columns: id, tool_name, contents, inventory_slots
        policies: none listed (RLS disabled)

    weapons
        columns: id, weapon_name, category, inventory_slots
        policies: none listed (RLS disabled)

    armors
        columns: id, armor_name, body_area, armor_type, inventory_slots, damage_reduction, defense_bonus, energy_cost
        policies: none listed (RLS disabled)

    consumables
        columns: id, item_name, description, inventory_slots
        policies: none listed (RLS disabled)

    character_status_effects
        columns: id, character_id, status_key, duration_type, duration_remaining, stacks, is_active, applied_at, updated_at
        policies: none listed (RLS disabled)

    character_wounds
        columns: id, character_id, wound_type, wound_count, updated_at
        policies: none listed (RLS disabled)

    campaign_combatant_status_effects
        columns: id, campaign_id, combatant_id, status_key, duration_type, duration_remaining, stacks, is_active, applied_at, updated_at
        policies: none listed (RLS disabled)

    campaign_combatant_wounds
        columns: id, campaign_id, combatant_id, wound_type, wound_count, updated_at
        policies: none listed (RLS disabled)

    campaign_lobby_readiness
        columns: campaign_id, player_user_id, is_ready, character_id, joined_at, updated_at
        policies:
            Players can view lobby readiness for their campaigns — SELECT — players in campaign
            Players can update/insert/delete their own readiness — UPDATE/INSERT/DELETE — player_user_id = auth.uid()
            GMs can manage all lobby readiness — ALL — GM-only
