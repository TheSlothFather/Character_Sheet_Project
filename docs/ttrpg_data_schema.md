# TTRPG Ruleset Data Design

This document proposes a third-normal-form PostgreSQL schema, import templates, and an ingestion strategy for the "Race and Skills" source material. It decomposes racial and subracial traits into atomic, automation-ready effects and outlines future-proofing for feats, classes, and items.

## Source observations and irregularities
- Skills are grouped under attribute-linked categories (Physical, Mental, Will, Spiritual, hybrid groupings) but the file does not mark the attribute links explicitly per skill; they are implied by section headers.【8f007b†L53-L117】
- Attribute/skill creation rules introduce numeric baselines (e.g., attribute points, skill point pools, martial prowess caps) but are embedded in prose rather than discrete tables.【8f007b†L12-L20】
- Racial data mixes cosmetic descriptors, languages, resource baselines (martial prowess, Ildakar points, psi-points), and complex conditional effects in free text (environmental contexts, target creature types, adjacency, lighting). Examples:
  - Ecthvasin: mixed resource grants and conditional bonuses/penalties keyed to foe race and context.【e35d61†L236-L252】
  - Georothin: environmental context (swamplands) and creature-type conditions (undead).【e35d61†L256-L273】
  - Rodonin: lighting-dependent mobility and critical escalations.【e35d61†L349-L360】
  - Venii (base): lighting-dependent initiative/battle swings and environmental navigation edge cases.【548227†L706-L720】
  - East Anzar: bonuses keyed to opponent species and subrace, plus flat stat/resource boosts.【8a4367†L539-L549】
- Some features alter rule interpretations (critical upgrade chains, action cost changes) that require effect types beyond numeric bonuses.【e35d61†L303-L311】【e35d61†L356-L360】【db6204†L596-L600】

These irregularities require a normalized model that separates flavor from mechanical effects and supports conditional, non-numeric modifications.

## Normalized PostgreSQL schema (3NF)

### Core reference tables
- `attributes (attribute_id PK, code UNIQUE, name, description)`
- `skills (skill_id PK, code UNIQUE, name, description, base_category, is_active_bool)`
- `skill_attribute_links (skill_id FK -> skills, attribute_id FK -> attributes, weight_type ENUM['primary','secondary'], PRIMARY KEY(skill_id, attribute_id))` — captures the single or dual attribute influences noted by section grouping.【8f007b†L53-L117】
- `resource_types (resource_type_id PK, code UNIQUE, name, description, default_unit)` — e.g., martial_prowess, ildakar_faculty, psi_points, energy.
- `languages (language_id PK, code UNIQUE, name)`
- `creature_sizes (size_id PK, code UNIQUE, name, description)`

### Lineage hierarchy
- `lineages (lineage_id PK, code UNIQUE, name, typical_height_range, typical_weight_range, lifespan_range, size_id FK -> creature_sizes, description)` — top-level species such as Inin, Anz, Phi'ilin, Cerevu, Venii, Freinin; holds shared flavor data.【e35d61†L221-L229】【8a4367†L505-L519】【db6204†L562-L579】【db6204†L641-L648】【548227†L706-L712】【9f9ef0†L756-L765】
- `cultures (culture_id PK, lineage_id FK -> lineages, code UNIQUE, name, description)` — subraces/cultures such as Ecthvasin, Georothin, etc.
- `culture_languages (culture_id FK, language_id FK, proficiency ENUM['native','bonus_choice'], PRIMARY KEY(culture_id, language_id, proficiency))` — supports fixed and player-choice languages.【e35d61†L238-L248】【e35d61†L256-L263】【9f9ef0†L766-L769】

### Feature system
- `features (feature_id PK, source_type ENUM['lineage','culture','background','feat','class','item'], source_id, name, category ENUM['trait','resource','rule_override','action_economy'], description)` — the parent record for any mechanical trait.
- `feature_prerequisites (feature_id FK, prereq_type ENUM['lineage','culture','skill_min','attribute_min','resource_min'], prereq_value JSONB)` — extensible gating.
- `feature_effects (effect_id PK, feature_id FK, effect_type ENUM['attribute_bonus','skill_bonus','resource_bonus','language_grant','damage_modifier','resistance','action_cost_mod','movement_mod','condition_immunity','critical_upgrade','advantage_rule','derived_stat_bonus'], target_ref JSONB, magnitude JSONB, stacking_rule ENUM['stack','replace','max'], applies_automatically_bool)` — atomic effects; `target_ref` carries the target type/id (attribute, skill, resource, creature_type, damage_type, condition). Magnitude supports flat, percent, per_modifier, dice, or tier-scaling payloads.
- `effect_conditions (condition_id PK, effect_id FK, condition_type ENUM['environment','opponent_lineage','opponent_culture','lighting','adjacency','equipment_state','action_phase','usage_frequency','size_category','status'], condition_value JSONB)` — encodes predicates such as “in darkness,” “against undead,” “while adjacent,” “per moonface,” etc.【e35d61†L256-L273】【e35d61†L349-L360】【e35d61†L375-L382】【8a4367†L544-L548】【548227†L713-L720】【9f9ef0†L747-L751】
- `feature_resources (feature_id FK, resource_type_id FK, base_amount, per_tier_increment, per_level_increment, PRIMARY KEY(feature_id, resource_type_id))` — for base grants such as “+30 Martial Prowess points” or tier-scaling bonuses.【e35d61†L240-L247】【e35d61†L260-L266】【e35d61†L300-L306】【8a4367†L539-L548】【db6204†L596-L600】【9f9ef0†L768-L776】
- `feature_languages (feature_id FK, language_id FK, grant_type ENUM['native','choice'], PRIMARY KEY(feature_id, language_id, grant_type))` — captures language grants when modeled as features.【e35d61†L238-L241】【db6204†L586-L589】【9f9ef0†L767-L769】
- `effect_notes (effect_id FK, note TEXT)` — preserves non-mechanical prose.

### Creatures and extensibility anchors
- `feats`, `classes`, `items`, `backgrounds` tables (minimal scaffolding: id, code, name, description) to host future `features` via `source_type`/`source_id` without schema changes.
- `creature_feature_links (creature_id FK, feature_id FK, acquired_from ENUM['lineage','culture','feat','class','item','background'], PRIMARY KEY(creature_id, feature_id, acquired_from))` — runtime binding for character sheets and automation.

All tables use surrogate keys for stability; lookup codes support human readability. Descriptions remain in their respective tables to keep 3NF while allowing flavor text.

## Example effect decomposition
Atomic breakdown examples illustrate how to encode the file content:

- **Ecthvasin “Magically Inclined”**
  - `feature_effects`: skill_bonus (+15) targeting worship *or* will dakar *or* psionic technique (represented as three effect rows flagged with `stacking_rule='replace'` and `applies_automatically_bool=false` to model a player choice).
  - `feature_effects`: skill_bonus (+5) targeting combined-effort rolls for the chosen skill (target_ref includes roll_type='combined').
  - `feature_effects`: damage_modifier (+20%, offensive_only=true) targeting the chosen skill; `effect_conditions` can constrain to offensive use.【e35d61†L243-L247】
  - `feature_effects`: skill_bonus (+15) to either resist psionics or resist supernatural or countering will dakar (three choice-based rows).【e35d61†L243-L247】
  - `feature_conditions`: opponent_culture != Ecthvasin for penalties and extra damage; lighting/environment is null.
- **Georothin “Swamper Upbringing”** — conditional skill bonuses keyed to environment (swamplands) and toxin defense; action_economy change for swimming cost (movement_mod with condition environment='swamp' or activity='swim').【e35d61†L263-L267】
- **Rodonin “Swift of Foot/Shadow Blender”** — multiple movement_mod effects conditioned on darkness, critical_upgrade chained while flanking, item swap action_cost_mod set to zero once per round (`usage_frequency` condition).【e35d61†L349-L360】
- **Venii “Depth Strider”** — lighting and indoor conditions drive initiative/battle modifiers; immunity to suffocation and pallesthesia range captured via condition_immunity and sense_range fields inside `magnitude` JSON.【548227†L706-L720】
- **East Anzar “Unfaic Lands”** — opponent lineage/culture conditions apply to armor reduction, battle/divine/psionic bonuses, and flat physical increase; action_economy unaffected.【8a4367†L539-L549】

The same pattern handles class/feat/item effects by attaching their `features` records via `source_type`.

## JSON import templates
Use one JSON file per entity type; IDs are database-assigned. Codes are required to ensure idempotent imports.

### attributes.json
```json
[
  {"code": "PHYS", "name": "Physical", "description": "Raw strength and agility."},
  {"code": "MENT", "name": "Mental", "description": "Intellect and memory."}
]
```

### skills.json
```json
[
  {
    "code": "BATTLE",
    "name": "Battle",
    "description": "Physical attacks, defenses, initiative.",
    "base_category": "Physical",
    "attributes": [
      {"attribute_code": "PHYS", "weight_type": "primary"}
    ]
  },
  {
    "code": "NAVIGATE",
    "name": "Navigate",
    "description": "Finding paths in wilderness, dungeons, cities.",
    "base_category": "Intuition",
    "attributes": [
      {"attribute_code": "PHYS", "weight_type": "secondary"},
      {"attribute_code": "SPIR", "weight_type": "secondary"}
    ]
  }
]
```

### lineages.json
```json
[
  {
    "code": "ININ",
    "name": "Inin",
    "size_code": "MEDIUM",
    "typical_height_range": "5-6 ft",
    "typical_weight_range": "120-200 lbs",
    "lifespan_range": "80-120 years",
    "description": "Most numerous mortals; spirited and warlike." 
  }
]
```

### cultures.json
```json
[
  {
    "code": "ECTHVASIN",
    "lineage_code": "ININ",
    "name": "Ecthvasin",
    "description": "Red-haired Inin; magically inclined." ,
    "languages": [
      {"language_code": "NARINDUILIN", "proficiency": "native"}
    ],
    "features": ["ECTHVASIN_BASE", "ECTHVASIN_MAGICAL", "ECTHVASIN_IRE"]
  }
]
```

### features.json
```json
[
  {
    "code": "ECTHVASIN_MAGICAL",
    "source_type": "culture",
    "source_code": "ECTHVASIN",
    "name": "Magically Inclined",
    "category": "trait",
    "effects": [
      {"effect_type": "skill_bonus", "target": {"type": "skill", "code": "WORSHIP"}, "magnitude": {"flat": 15}, "applies_automatically": false},
      {"effect_type": "skill_bonus", "target": {"type": "skill", "code": "WILL_DAKAR"}, "magnitude": {"flat": 15}, "applies_automatically": false},
      {"effect_type": "skill_bonus", "target": {"type": "skill", "code": "PSIONIC_TECHNIQUE"}, "magnitude": {"flat": 15}, "applies_automatically": false},
      {"effect_type": "damage_modifier", "target": {"type": "skill", "code": "CHOSEN"}, "magnitude": {"percent": 20}, "conditions": [{"condition_type": "usage", "condition_value": {"mode": "offensive"}}]}
    ]
  }
]
```

### effect_conditions.json (optional separate file if bulk loading conditions)
```json
[
  {"effect_code": "ECTHVASIN_IRE_BATTLE", "condition_type": "opponent_culture", "condition_value": {"not_in": ["ECTHVASIN"]}},
  {"effect_code": "GEOROTHIN_SWAMP_NAV", "condition_type": "environment", "condition_value": {"equals": "swampland"}}
]
```

### resources.json
```json
[
  {"code": "MARTIAL_PROWESS", "name": "Martial Prowess", "default_unit": "points"},
  {"code": "ILDAKAR", "name": "Ildakar Faculty", "default_unit": "points"},
  {"code": "PSI", "name": "Psi Points", "default_unit": "points"}
]
```

## Parsing and normalization strategy
1. **Convert DOC to structured text**: Use `antiword` or `pandoc` to yield plain text; retain original line numbers for traceability.
2. **Section detection**: Scan for headings (`Physical`, `Mental`, lineage names, subrace names) using regex; build a heading stack (lineage → culture → feature label).
3. **Tokenize mechanical lines**: Identify patterns: `+/-<number> <target>` (skill/resource modifiers), `%` patterns (damage/energy), size/vision/sense phrases, and conditional keywords (darkness, swamplands, undead, adjacency, moonface, opponent type). Map them to effect templates.
4. **Normalize tokens**:
   - Map nouns to canonical targets (skills, attributes, resources, languages, conditions). Maintain lookup dictionaries to catch synonyms (e.g., “feat of agility” vs `FEAT_AGI`).
   - For choice-based bonuses ("either/or"), emit multiple effect rows with `applies_automatically_bool=false` and a `choice_group` tag inside `magnitude`.
   - For per-tier/level scaling, set `per_tier_increment` or `per_level_increment` in `feature_resources`.
5. **Condition capture**: Create `effect_conditions` records when lines contain environmental words (swamplands, darkness, desert, indoor), opponent references (undead, non-Inin, specific subrace), adjacency, action-frequency (once per round/moonface), or equipment states (shields, two-handed weapons).【e35d61†L263-L267】【e35d61†L349-L360】【8a4367†L531-L548】【db6204†L596-L600】【9f9ef0†L747-L751】
6. **Flavor vs mechanic separation**: Put appearance text into `description` fields; only mechanical tokens become `features`/`feature_effects` rows.
7. **Validation**: Enforce referential integrity (codes must exist), deduplicate identical effect rows, and run unit tests to ensure each culture/lineage exports only normalized effects.

## Automation support
- Because every mechanical element is stored as atomic `feature_effects` with explicit conditions, automation layers can query applicable effects per context (lighting, opponent tags, environment) and compute derived modifiers dynamically.
- Action economy and critical-upgrade effects are first-class rows, enabling combat resolution engines to apply rule overrides without bespoke code paths.
- Choice-based bonuses are explicit, enabling character builders to present selectable options and persist decisions separately from the base `features`.
- Future content (feats, classes, items) plugs into the same `features` table via `source_type`, requiring no schema changes.

