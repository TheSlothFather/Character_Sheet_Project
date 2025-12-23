import React from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client";
import { gmApi, type BestiaryEntry as ApiBestiaryEntry, type Campaign } from "../../api/gm";
import { getSupabaseClient } from "../../api/supabaseClient";
import { useDefinitions } from "../definitions/DefinitionsContext";
import { parseBestiaryImport, type ParsedBestiaryEntry, type BestiaryParseMessage } from "./bestiaryImport";
import { AttributeKey, computeAttributeSkillBonuses, getSkillCode, normalizeSkillCode } from "../characters/skillMetadata";
import styles from "./BestiaryPage.module.css";

type BestiaryAction = {
  energyCost: string;
  apCost: string;
  range: string;
  damage: string;
  damageType: string;
};

type BestiaryActionPayload = {
  energyCost?: number;
  apCost?: number;
  range?: string;
  damage?: string;
  damageType?: string;
};

type WeaponAbilityOption = {
  id: number;
  category: string;
  name: string;
  abilityType?: string;
  energyCost?: number;
  apCost?: number;
  damage?: string;
  damageType?: string;
  range?: string;
  description?: string;
};

type PsionicAbilityOption = {
  id: string;
  tree: string;
  name: string;
  tier?: number;
  description?: string;
  energyCost?: number;
};

type BestiaryEntry = {
  id: string;
  name: string;
  type: string;
  rank: string;
  description: string;
  tier: string;
  maxEnergy: string;
  maxAp: string;
  dr: string;
  armorType: string;
  energyBars: string;
  attributes: Record<AttributeKey, string>;
  skills: Record<string, string>;
  actions: BestiaryAction[];
  immunities: string[];
  resistances: string[];
  weaknesses: string[];
  customAbilityEnabled: boolean;
  customAbilityName: string;
  customAbilityEnergy: string;
  customAbilityAp: string;
  abilities: NonNullable<ApiBestiaryEntry["abilities"]>;
  lieutenantId: string;
  heroId: string;
};

const ATTRIBUTE_KEYS: AttributeKey[] = ["PHYSICAL", "MENTAL", "SPIRITUAL", "WILL"];

const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  PHYSICAL: "Physical",
  MENTAL: "Mental",
  SPIRITUAL: "Spiritual",
  WILL: "Will"
};

const RANK_OPTIONS = ["NPC", "Minion", "Lieutenant", "Hero"];

const tierLabel = (value: number): string => {
  if (value <= 0 || Number.isNaN(value)) return "Unknown";
  if (value === 1) return "Fledgling";
  if (value === 2) return "Advanced";
  if (value === 3) return "Heroic";
  if (value === 4) return "Epic";
  if (value === 5) return "Legendary";
  if (value === 6) return "Mythic";
  return `Mythic ${value - 5}`;
};

const readNumberString = (value: unknown): string => {
  if (typeof value === "number" && !Number.isNaN(value)) return `${value}`;
  if (typeof value === "string" && value.trim()) return value.trim();
  return "";
};

const readStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
};

const readActions = (value: unknown): BestiaryAction[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as BestiaryActionPayload;
      const range = typeof record.range === "string" ? record.range : "";
      const damage = typeof record.damage === "string" ? record.damage : "";
      const damageType = typeof record.damageType === "string" ? record.damageType : "";
      return {
        energyCost: readNumberString(record.energyCost),
        apCost: readNumberString(record.apCost),
        range,
        damage,
        damageType
      };
    })
    .filter((entry): entry is BestiaryAction => Boolean(entry))
    .filter((entry) =>
      [entry.energyCost, entry.apCost, entry.range, entry.damage, entry.damageType].some((value) => value.trim())
    );
};

const createBlankAction = (): BestiaryAction => ({
  energyCost: "",
  apCost: "",
  range: "",
  damage: "",
  damageType: ""
});

const parseActions = (actions: BestiaryAction[]): { value?: BestiaryActionPayload[]; error?: string } => {
  const payloads: BestiaryActionPayload[] = [];
  for (const [index, action] of actions.entries()) {
    const hasContent = [action.energyCost, action.apCost, action.range, action.damage, action.damageType].some((value) =>
      value.trim()
    );
    if (!hasContent) continue;
    const energyParsed = parseIntegerField(`Action ${index + 1} energy cost`, action.energyCost);
    if (energyParsed.error) return { error: energyParsed.error };
    const apParsed = parseIntegerField(`Action ${index + 1} AP cost`, action.apCost);
    if (apParsed.error) return { error: apParsed.error };
    const range = action.range.trim();
    const damage = action.damage.trim();
    const damageType = action.damageType.trim();
    payloads.push({
      energyCost: energyParsed.value,
      apCost: apParsed.value,
      range: range || undefined,
      damage: damage || undefined,
      damageType: damageType || undefined
    });
  }
  return { value: payloads };
};

const toStatsSkills = (
  entry: BestiaryEntry,
  tierValue?: number,
  actionsPayload?: BestiaryActionPayload[]
): Record<string, string | number | string[] | BestiaryActionPayload[]> => {
  const statsSkills: Record<string, string | number | string[] | BestiaryActionPayload[]> = {};
  const type = entry.type.trim();
  const description = entry.description.trim();
  if (type) statsSkills.type = type;
  if (description) statsSkills.description = description;
  if (tierValue !== undefined) statsSkills.tier = tierValue;
  if (entry.immunities.length) statsSkills.immunities = entry.immunities;
  if (entry.resistances.length) statsSkills.resistances = entry.resistances;
  if (entry.weaknesses.length) statsSkills.weaknesses = entry.weaknesses;
  if (actionsPayload && actionsPayload.length) statsSkills.actions = actionsPayload;
  return statsSkills;
};

const parseIntegerField = (label: string, value: string): { value?: number; error?: string } => {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return { error: `${label} must be an integer.` };
  }
  return { value: parsed };
};

const parseSkillValues = (
  skills: Record<string, string>
): { value?: Record<string, number>; error?: string } => {
  const normalized: Record<string, number> = {};
  for (const [key, raw] of Object.entries(skills)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) {
      return { error: `Skill ${key} must be an integer.` };
    }
    normalized[key] = parsed;
  }
  return { value: normalized };
};

const toAttributeNumbers = (values: Record<AttributeKey, string>): Record<AttributeKey, number> =>
  ATTRIBUTE_KEYS.reduce<Record<AttributeKey, number>>((acc, key) => {
    const parsed = Number(values[key]);
    acc[key] = Number.isFinite(parsed) ? parsed : 0;
    return acc;
  }, {} as Record<AttributeKey, number>);

type PanelKey = "core" | "stats" | "defenses" | "actions" | "attributes" | "skills" | "abilities";

type CollapsibleSectionProps = {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, isOpen, onToggle, children }) => (
  <div className={styles.collapsible}>
    <button type="button" onClick={onToggle} className={styles.sectionHeader}>
      <span>{title}</span>
      <span className={styles.sectionToggle}>{isOpen ? "▾" : "▸"}</span>
    </button>
    {isOpen && <div className={styles.collapsibleBody}>{children}</div>}
  </div>
);

type MultiValueInputProps = {
  label: string;
  values: string[];
  placeholder?: string;
  onChange: (values: string[]) => void;
};

const MultiValueInput: React.FC<MultiValueInputProps> = ({ label, values, placeholder, onChange }) => {
  const [draft, setDraft] = React.useState("");

  const addValue = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setDraft("");
  };

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.rowWrap}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addValue();
            }
          }}
          placeholder={placeholder}
          className={styles.input}
        />
        <button type="button" onClick={addValue} className={styles.secondaryButton}>
          Add
        </button>
      </div>
      {values.length > 0 && (
        <div className={styles.chipRow}>
          {values.map((value) => (
            <span key={value} className={styles.valueChip}>
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((item) => item !== value))}
                className={styles.chipRemove}
                aria-label={`Remove ${value}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export const BestiaryPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { data: definitions } = useDefinitions();
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string>(campaignId ?? "");
  const [apiEntries, setApiEntries] = React.useState<ApiBestiaryEntry[]>([]);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState("");
  const [rank, setRank] = React.useState("NPC");
  const [description, setDescription] = React.useState("");
  const [tier, setTier] = React.useState("");
  const [maxEnergy, setMaxEnergy] = React.useState("");
  const [maxAp, setMaxAp] = React.useState("");
  const [dr, setDr] = React.useState("");
  const [armorType, setArmorType] = React.useState("");
  const [energyBars, setEnergyBars] = React.useState("");
  const [attributes, setAttributes] = React.useState<Record<AttributeKey, string>>({
    PHYSICAL: "",
    MENTAL: "",
    SPIRITUAL: "",
    WILL: ""
  });
  const [skills, setSkills] = React.useState<Record<string, string>>({});
  const [actions, setActions] = React.useState<BestiaryAction[]>([]);
  const [immunities, setImmunities] = React.useState<string[]>([]);
  const [resistances, setResistances] = React.useState<string[]>([]);
  const [weaknesses, setWeaknesses] = React.useState<string[]>([]);
  const [customAbilityEnabled, setCustomAbilityEnabled] = React.useState(false);
  const [customAbilityName, setCustomAbilityName] = React.useState("");
  const [customAbilityEnergy, setCustomAbilityEnergy] = React.useState("");
  const [customAbilityAp, setCustomAbilityAp] = React.useState("");
  const [abilities, setAbilities] = React.useState<NonNullable<ApiBestiaryEntry["abilities"]>>([]);
  const [lieutenantId, setLieutenantId] = React.useState("");
  const [heroId, setHeroId] = React.useState("");
  const [selectedEntryId, setSelectedEntryId] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterRank, setFilterRank] = React.useState("All");
  const [filterType, setFilterType] = React.useState("");
  const [filterTier, setFilterTier] = React.useState("");
  const [importText, setImportText] = React.useState("");
  const [importPreview, setImportPreview] = React.useState<ParsedBestiaryEntry[]>([]);
  const [importMessages, setImportMessages] = React.useState<BestiaryParseMessage[]>([]);
  const [importGroupName, setImportGroupName] = React.useState<string | undefined>(undefined);
  const [importing, setImporting] = React.useState(false);
  const [panelState, setPanelState] = React.useState<Record<PanelKey, boolean>>({
    core: true,
    stats: true,
    defenses: false,
    actions: false,
    attributes: false,
    skills: false,
    abilities: false
  });
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<BestiaryEntry | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [abilityLoadError, setAbilityLoadError] = React.useState<string | null>(null);
  const [weaponAbilities, setWeaponAbilities] = React.useState<WeaponAbilityOption[]>([]);
  const [psionicAbilities, setPsionicAbilities] = React.useState<PsionicAbilityOption[]>([]);
  const [weaponCategory, setWeaponCategory] = React.useState("");
  const [psionicTree, setPsionicTree] = React.useState("");

  const resetForm = () => {
    setName("");
    setType("");
    setRank("NPC");
    setDescription("");
    setTier("");
    setMaxEnergy("");
    setMaxAp("");
    setDr("");
    setArmorType("");
    setEnergyBars("");
    setAttributes({ PHYSICAL: "", MENTAL: "", SPIRITUAL: "", WILL: "" });
    setActions([]);
    setImmunities([]);
    setResistances([]);
    setWeaknesses([]);
    setSkills((prev) => {
      const next: Record<string, string> = {};
      (definitions?.skills ?? []).forEach((skill) => {
        next[getSkillCode(skill)] = "";
      });
      return Object.keys(next).length ? next : prev;
    });
    setCustomAbilityEnabled(false);
    setCustomAbilityName("");
    setCustomAbilityEnergy("");
    setCustomAbilityAp("");
    setAbilities([]);
    setLieutenantId("");
    setHeroId("");
  };

  React.useEffect(() => {
    if (!definitions?.skills) return;
    setSkills((prev) => {
      if (Object.keys(prev).length) return prev;
      const next: Record<string, string> = {};
      definitions.skills.forEach((skill) => {
        next[getSkillCode(skill)] = "";
      });
      return next;
    });
  }, [definitions]);

  React.useEffect(() => {
    if (campaignId) {
      setSelectedCampaignId(campaignId);
      return;
    }
    let active = true;
    const loadCampaigns = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await gmApi.listCampaigns();
        if (!active) return;
        setCampaigns(data);
        setSelectedCampaignId((current) => current || data[0]?.id || "");
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load campaigns.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadCampaigns();
    return () => {
      active = false;
    };
  }, [campaignId]);

  React.useEffect(() => {
    if (!selectedCampaignId) {
      setApiEntries([]);
      return;
    }
    let active = true;
    const loadEntries = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await gmApi.listBestiaryEntries(selectedCampaignId);
        if (!active) return;
        setApiEntries(data);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load bestiary entries.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadEntries();
    return () => {
      active = false;
    };
  }, [selectedCampaignId]);

  React.useEffect(() => {
    let active = true;
    setAbilityLoadError(null);
    const loadAbilities = async () => {
      try {
        const client = getSupabaseClient();
        const { data: weaponData, error: weaponError } = await client
          .from("weapon_abilities")
          .select(
            "id, category, ability_name, ability_type, energy_cost, action_point_cost, damage, damage_type, range, description"
          )
          .order("category", { ascending: true })
          .order("ability_name", { ascending: true });
        if (weaponError) throw new Error(weaponError.message);

        const martialOptions = (weaponData ?? [])
          .filter((row) => row.category && row.ability_name)
          .map((row) => ({
            id: row.id,
            category: row.category,
            name: row.ability_name,
            abilityType: row.ability_type ?? undefined,
            energyCost: typeof row.energy_cost === "number" ? row.energy_cost : undefined,
            apCost: typeof row.action_point_cost === "number" ? row.action_point_cost : undefined,
            damage: row.damage ?? undefined,
            damageType: row.damage_type ?? undefined,
            range: row.range ?? undefined,
            description: row.description ?? undefined
          }));

        const psionicRows = await api.listPsionicAbilities();
        const psionicOptions = psionicRows.map((row) => ({
          id: `${row.ability_tree}:${row.ability}`,
          tree: row.ability_tree,
          name: row.ability,
          tier: row.tier ?? undefined,
          description: row.description ?? undefined,
          energyCost: row.energy_cost !== null && row.energy_cost !== undefined ? Number(row.energy_cost) : undefined
        }));

        if (!active) return;
        setWeaponAbilities(martialOptions);
        setPsionicAbilities(psionicOptions);
        setWeaponCategory((current) => current || martialOptions[0]?.category || "");
        setPsionicTree((current) => current || psionicOptions[0]?.tree || "");
      } catch (loadError) {
        if (!active) return;
        setAbilityLoadError(loadError instanceof Error ? loadError.message : "Failed to load abilities.");
      }
    };

    loadAbilities();
    return () => {
      active = false;
    };
  }, []);

  const skillDefinitions = definitions?.skills ?? [];
  const skillCodeSet = React.useMemo(() => new Set(skillDefinitions.map(getSkillCode)), [skillDefinitions]);
  const weaponCategories = React.useMemo(
    () => Array.from(new Set(weaponAbilities.map((ability) => ability.category))).sort((a, b) => a.localeCompare(b)),
    [weaponAbilities]
  );
  const psionicTrees = React.useMemo(
    () => Array.from(new Set(psionicAbilities.map((ability) => ability.tree))).sort((a, b) => a.localeCompare(b)),
    [psionicAbilities]
  );

  const buildMartialAbilityKey = React.useCallback(
    (ability: WeaponAbilityOption) =>
      `${ability.category}::${ability.name}${ability.abilityType ? `::${ability.abilityType}` : ""}`,
    []
  );
  const buildPsionicAbilityKey = React.useCallback((ability: PsionicAbilityOption) => `${ability.tree}::${ability.name}`, []);

  const buildMartialAbility = React.useCallback(
    (ability: WeaponAbilityOption): NonNullable<ApiBestiaryEntry["abilities"]>[number] => ({
      type: "martial",
      category: ability.category,
      key: buildMartialAbilityKey(ability),
      name: ability.name,
      description: ability.description,
      range: ability.range,
      damage: ability.damage,
      energyCost: ability.energyCost,
      apCost: ability.apCost
    }),
    [buildMartialAbilityKey]
  );
  const buildPsionicAbility = React.useCallback(
    (ability: PsionicAbilityOption): NonNullable<ApiBestiaryEntry["abilities"]>[number] => ({
      type: "psionic",
      tree: ability.tree,
      key: buildPsionicAbilityKey(ability),
      name: ability.name,
      description: ability.description,
      energyCost: ability.energyCost
    }),
    [buildPsionicAbilityKey]
  );

  const toggleAbilitySelection = React.useCallback(
    (
      current: NonNullable<ApiBestiaryEntry["abilities"]>,
      ability: NonNullable<ApiBestiaryEntry["abilities"]>[number]
    ) => {
      const exists = current.some((item) => item.type === ability.type && item.key === ability.key);
      if (exists) {
        return current.filter((item) => !(item.type === ability.type && item.key === ability.key));
      }
      return [...current, ability];
    },
    []
  );

  const weaponAbilityOptions = React.useMemo(
    () => weaponAbilities.filter((ability) => ability.category === weaponCategory),
    [weaponAbilities, weaponCategory]
  );
  const psionicAbilityOptions = React.useMemo(
    () => psionicAbilities.filter((ability) => ability.tree === psionicTree),
    [psionicAbilities, psionicTree]
  );

  const mapApiEntry = React.useCallback(
    (entry: ApiBestiaryEntry): BestiaryEntry => {
      const statsSkills = entry.statsSkills;
      const attributesPayload = entry.attributes ?? {};
      const type = typeof statsSkills?.type === "string" ? statsSkills.type : "";
      const description = typeof statsSkills?.description === "string" ? statsSkills.description : "";
      const tier = readNumberString(statsSkills?.tier ?? attributesPayload?.tier);
      const maxEnergy = readNumberString(attributesPayload?.energy);
      const maxAp = readNumberString(attributesPayload?.ap);
      const drValue = readNumberString(attributesPayload?.dr ?? entry.dr);
      const armorTypeValue = typeof entry.armorType === "string" ? entry.armorType : "";
      const energyBarsValue = readNumberString(attributesPayload?.energy_bars ?? entry.energyBars);
      const rankValue = typeof entry.rank === "string" ? entry.rank : "NPC";
      const immunities = readStringList(statsSkills?.immunities);
      const resistances = readStringList(statsSkills?.resistances);
      const weaknesses = readStringList(statsSkills?.weaknesses);
      const actions = readActions(statsSkills?.actions);
      const attributesValues = ATTRIBUTE_KEYS.reduce<Record<AttributeKey, string>>((acc, key) => {
        acc[key] = readNumberString((attributesPayload as Record<string, unknown>)[key]);
        return acc;
      }, {} as Record<AttributeKey, string>);
      const attributeNumbers = ATTRIBUTE_KEYS.reduce<Record<AttributeKey, number>>((acc, key) => {
        const parsed = Number(attributesValues[key]);
        acc[key] = Number.isFinite(parsed) ? parsed : 0;
        return acc;
      }, {} as Record<AttributeKey, number>);
      const bonuses = computeAttributeSkillBonuses(attributeNumbers, skillDefinitions);
      const skillsPayload = entry.skills ?? {};
      const skillsValues: Record<string, string> = {};
      skillDefinitions.forEach((skill) => {
        const code = getSkillCode(skill);
        const total = skillsPayload[code] ?? 0;
        const bonus = bonuses[code] ?? 0;
        const baseValue = total - bonus;
        skillsValues[code] = total !== 0 || bonus !== 0 ? `${baseValue}` : "";
      });
      Object.entries(skillsPayload).forEach(([code, total]) => {
        if (skillCodeSet.has(code)) return;
        if (typeof total === "number" && !Number.isNaN(total)) {
          skillsValues[code] = `${total}`;
        }
      });
      const abilitiesPayload = entry.abilities ?? [];
      const customAbility = abilitiesPayload.find((ability) => ability.type === "custom");
      const customAbilityNameValue = typeof customAbility?.name === "string" ? customAbility.name : "";
      const customAbilityEnergyValue = readNumberString(customAbility?.energyCost);
      const customAbilityApValue = readNumberString(customAbility?.apCost);
      const customAbilityEnabled = Boolean(
        customAbilityNameValue || customAbilityEnergyValue || customAbilityApValue
      );
      return {
        id: entry.id,
        name: entry.name,
        type,
        rank: rankValue,
        description,
        tier,
        maxEnergy,
        maxAp,
        dr: drValue,
        armorType: armorTypeValue,
        energyBars: energyBarsValue,
        attributes: attributesValues,
        skills: skillsValues,
        actions,
        immunities,
        resistances,
        weaknesses,
        customAbilityEnabled,
        customAbilityName: customAbilityNameValue,
        customAbilityEnergy: customAbilityEnergyValue,
        customAbilityAp: customAbilityApValue,
        abilities: abilitiesPayload,
        lieutenantId: entry.lieutenantId ?? "",
        heroId: entry.heroId ?? ""
      };
    },
    [skillDefinitions, skillCodeSet]
  );

  const entries = React.useMemo(() => apiEntries.map(mapApiEntry), [apiEntries, mapApiEntry]);
  const filteredEntries = React.useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    const typeFilter = filterType.trim().toLowerCase();
    const tierFilter = filterTier.trim();
    return entries.filter((entry) => {
      if (filterRank !== "All" && entry.rank !== filterRank) return false;
      if (typeFilter && !entry.type.toLowerCase().includes(typeFilter)) return false;
      if (tierFilter && entry.tier.trim() !== tierFilter) return false;
      if (search) {
        const haystack = `${entry.name} ${entry.type} ${entry.description}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [entries, searchQuery, filterRank, filterType, filterTier]);

  const validateImportHierarchy = React.useCallback((entriesToCheck: ParsedBestiaryEntry[]) => {
    const heroNames = new Set(entriesToCheck.filter((entry) => entry.rank.toLowerCase() === "hero").map((entry) => entry.name));
    const lieutenantNames = new Set(
      entriesToCheck.filter((entry) => entry.rank.toLowerCase() === "lieutenant").map((entry) => entry.name)
    );
    const messages: BestiaryParseMessage[] = [];
    entriesToCheck.forEach((entry, index) => {
      const rank = entry.rank.toLowerCase();
      if (rank === "lieutenant") {
        if (entry.heroName) {
          if (!heroNames.has(entry.heroName)) {
            messages.push({
              blockIndex: index,
              entryName: entry.name,
              message: `Lieutenant references unknown hero '${entry.heroName}'.`,
              block: entry.name,
              level: "error"
            });
          }
        } else if (heroNames.size === 1) {
          entry.heroName = Array.from(heroNames)[0];
        } else {
          messages.push({
            blockIndex: index,
            entryName: entry.name,
            message: "Lieutenant requires a Hero reference when multiple heroes are present.",
            block: entry.name,
            level: "error"
          });
        }
      }
      if (rank === "minion") {
        if (entry.lieutenantName) {
          if (!lieutenantNames.has(entry.lieutenantName)) {
            messages.push({
              blockIndex: index,
              entryName: entry.name,
              message: `Minion references unknown lieutenant '${entry.lieutenantName}'.`,
              block: entry.name,
              level: "error"
            });
          }
        } else if (lieutenantNames.size === 1) {
          entry.lieutenantName = Array.from(lieutenantNames)[0];
        } else {
          messages.push({
            blockIndex: index,
            entryName: entry.name,
            message: "Minion requires a Lieutenant reference when multiple lieutenants are present.",
            block: entry.name,
            level: "error"
          });
        }
      }
    });
    return messages;
  }, []);

  const handleParseImport = React.useCallback(() => {
    const knownSkillCodes = skillDefinitions.map((skill) => normalizeSkillCode(skill));
    const result = parseBestiaryImport(importText, { knownSkillCodes });
    const hierarchyMessages = validateImportHierarchy(result.entries);
    setImportPreview(result.entries);
    setImportGroupName(result.groupName);
    setImportMessages([...result.messages, ...hierarchyMessages]);
  }, [importText, skillDefinitions, validateImportHierarchy]);

  const buildAttributesPayload = (entry: ParsedBestiaryEntry): Record<string, number> | undefined => {
    const attributesPayload = Object.fromEntries(
      Object.entries(entry.attributes).filter(([, value]) => typeof value === "number" && Number.isFinite(value))
    ) as Record<string, number>;
    return Object.keys(attributesPayload).length ? attributesPayload : undefined;
  };

  const buildSkillsPayload = (entry: ParsedBestiaryEntry): Record<string, number> | undefined => {
    const skillsPayload = Object.fromEntries(
      Object.entries(entry.skills).filter(([, value]) => typeof value === "number" && Number.isFinite(value))
    ) as Record<string, number>;
    return Object.keys(skillsPayload).length ? skillsPayload : undefined;
  };

  const buildStatsSkillsPayload = (entry: ParsedBestiaryEntry): Record<string, unknown> | undefined => {
    const statsSkills: Record<string, unknown> = {};
    if (entry.groupName) statsSkills.type = entry.groupName;
    if (entry.description) statsSkills.description = entry.description;
    if (entry.immunities?.length) statsSkills.immunities = entry.immunities;
    if (entry.resistances?.length) statsSkills.resistances = entry.resistances;
    if (entry.weaknesses?.length) statsSkills.weaknesses = entry.weaknesses;
    return Object.keys(statsSkills).length ? statsSkills : undefined;
  };

  const normalizeRank = (rankValue: string): string => {
    const lower = rankValue.toLowerCase();
    if (lower === "hero") return "Hero";
    if (lower === "lieutenant") return "Lieutenant";
    if (lower === "minion") return "Minion";
    return "NPC";
  };

  const handleCreateImport = async () => {
    if (!selectedCampaignId) {
      setError("Select a campaign before importing entries.");
      return;
    }
    if (!importPreview.length) {
      setError("Parse the import text before creating entries.");
      return;
    }
    if (importMessages.some((message) => message.level === "error")) {
      setError("Resolve import errors before creating entries.");
      return;
    }
    setError(null);
    setImporting(true);
    try {
      const heroes = importPreview.filter((entry) => entry.rank.toLowerCase() === "hero");
      const lieutenants = importPreview.filter((entry) => entry.rank.toLowerCase() === "lieutenant");
      const minions = importPreview.filter((entry) => entry.rank.toLowerCase() === "minion");

      const heroIdByName = new Map<string, string>();
      const lieutenantIdByName = new Map<string, string>();

      for (const entry of heroes) {
        const created = await gmApi.createBestiaryEntry({
          campaignId: selectedCampaignId,
          name: entry.name,
          statsSkills: buildStatsSkillsPayload(entry),
          attributes: buildAttributesPayload(entry),
          skills: buildSkillsPayload(entry),
          abilities: entry.abilities,
          tags: entry.tags,
          rank: normalizeRank(entry.rank),
          dr: entry.attributes.dr,
          armorType: entry.armorType,
          energyBars: entry.energyBars
        });
        heroIdByName.set(entry.name, created.id);
      }

      for (const entry of lieutenants) {
        const heroName = entry.heroName;
        if (!heroName || !heroIdByName.has(heroName)) {
          throw new Error(`Lieutenant ${entry.name} missing Hero reference.`);
        }
        const created = await gmApi.createBestiaryEntry({
          campaignId: selectedCampaignId,
          name: entry.name,
          statsSkills: buildStatsSkillsPayload(entry),
          attributes: buildAttributesPayload(entry),
          skills: buildSkillsPayload(entry),
          abilities: entry.abilities,
          tags: entry.tags,
          rank: normalizeRank(entry.rank),
          dr: entry.attributes.dr,
          armorType: entry.armorType,
          energyBars: entry.energyBars,
          heroId: heroIdByName.get(heroName)
        });
        lieutenantIdByName.set(entry.name, created.id);
      }

      for (const entry of minions) {
        const lieutenantName = entry.lieutenantName;
        if (!lieutenantName || !lieutenantIdByName.has(lieutenantName)) {
          throw new Error(`Minion ${entry.name} missing Lieutenant reference.`);
        }
        await gmApi.createBestiaryEntry({
          campaignId: selectedCampaignId,
          name: entry.name,
          statsSkills: buildStatsSkillsPayload(entry),
          attributes: buildAttributesPayload(entry),
          skills: buildSkillsPayload(entry),
          abilities: entry.abilities,
          tags: entry.tags,
          rank: normalizeRank(entry.rank),
          dr: entry.attributes.dr,
          armorType: entry.armorType,
          energyBars: entry.energyBars,
          lieutenantId: lieutenantIdByName.get(lieutenantName)
        });
      }

      setImportText("");
      setImportPreview([]);
      setImportMessages([]);
      setImportGroupName(undefined);
      const refreshed = await gmApi.listBestiaryEntries(selectedCampaignId);
      setApiEntries(refreshed);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to import bestiary entries.");
    } finally {
      setImporting(false);
    }
  };

  React.useEffect(() => {
    if (isCreating) return;
    if (selectedEntryId && entries.some((entry) => entry.id === selectedEntryId)) return;
    setSelectedEntryId(entries[0]?.id ?? null);
  }, [entries, selectedEntryId, isCreating]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCampaignId) {
      setError("Select a campaign before adding entries.");
      return;
    }
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    const tierParsed = parseIntegerField("Tier", tier);
    if (tierParsed.error) {
      setError(tierParsed.error);
      return;
    }
    const maxEnergyParsed = parseIntegerField("Max Energy", maxEnergy);
    if (maxEnergyParsed.error) {
      setError(maxEnergyParsed.error);
      return;
    }
    const maxApParsed = parseIntegerField("Max AP", maxAp);
    if (maxApParsed.error) {
      setError(maxApParsed.error);
      return;
    }
    const drParsed = parseIntegerField("DR", dr);
    if (drParsed.error) {
      setError(drParsed.error);
      return;
    }
    const energyBarsParsed = parseIntegerField("Energy Bars", energyBars);
    if (energyBarsParsed.error) {
      setError(energyBarsParsed.error);
      return;
    }
    if (!RANK_OPTIONS.includes(rank)) {
      setError("Rank must be NPC, Minion, Lieutenant, or Hero.");
      return;
    }
    if (rank === "Minion" && !lieutenantId) {
      setError("Minions must be assigned to a Lieutenant.");
      return;
    }
    if (rank === "Lieutenant" && !heroId) {
      setError("Lieutenants must be assigned to a Hero.");
      return;
    }
    const attributeNumbers = {} as Record<AttributeKey, number>;
    const attributesPayload: Record<string, number> = {};
    for (const key of ATTRIBUTE_KEYS) {
      const parsed = parseIntegerField(`${ATTRIBUTE_LABELS[key]} attribute`, attributes[key]);
      if (parsed.error) {
        setError(parsed.error);
        return;
      }
      if (parsed.value !== undefined) {
        attributesPayload[key] = parsed.value;
        attributeNumbers[key] = parsed.value;
      } else {
        attributeNumbers[key] = 0;
      }
    }
    const skillsParsed = parseSkillValues(skills);
    if (skillsParsed.error) {
      setError(skillsParsed.error);
      return;
    }
    if (customAbilityEnabled && !customAbilityName.trim()) {
      setError("Custom ability name is required.");
      return;
    }
    const customEnergyParsed = customAbilityEnabled
      ? parseIntegerField("Custom ability energy cost", customAbilityEnergy)
      : {};
    if (customEnergyParsed.error) {
      setError(customEnergyParsed.error);
      return;
    }
    const customApParsed = customAbilityEnabled
      ? parseIntegerField("Custom ability AP cost", customAbilityAp)
      : {};
    if (customApParsed.error) {
      setError(customApParsed.error);
      return;
    }
    const actionsParsed = parseActions(actions);
    if (actionsParsed.error) {
      setError(actionsParsed.error);
      return;
    }
    if (maxEnergyParsed.value !== undefined) attributesPayload.energy = maxEnergyParsed.value;
    if (maxApParsed.value !== undefined) attributesPayload.ap = maxApParsed.value;
    if (drParsed.value !== undefined) attributesPayload.dr = drParsed.value;
    if (energyBarsParsed.value !== undefined) attributesPayload.energy_bars = energyBarsParsed.value;
    const bonuses = computeAttributeSkillBonuses(attributeNumbers, skillDefinitions);
    const skillsPayload: Record<string, number> = {};
    skillDefinitions.forEach((skill) => {
      const code = getSkillCode(skill);
      const base = skillsParsed.value?.[code] ?? 0;
      const bonus = bonuses[code] ?? 0;
      const total = base + bonus;
      if (total !== 0) {
        skillsPayload[code] = total;
      }
    });
    Object.entries(skillsParsed.value ?? {}).forEach(([code, value]) => {
      if (skillCodeSet.has(code)) return;
      if (value !== 0) {
        skillsPayload[code] = value;
      }
    });
    const abilitiesPayload = [...abilities];
    if (customAbilityEnabled) {
      abilitiesPayload.push({
        type: "custom",
        key: customAbilityName.trim(),
        name: customAbilityName.trim(),
        energyCost: customEnergyParsed.value,
        apCost: customApParsed.value
      });
    }
    try {
      const draftEntry: BestiaryEntry = {
        id: "",
        name: trimmed,
        type,
        rank,
        description,
        tier,
        maxEnergy,
        maxAp,
        dr,
        armorType,
        energyBars,
        attributes,
        skills,
        actions,
        immunities,
        resistances,
        weaknesses,
        customAbilityEnabled,
        customAbilityName,
        customAbilityEnergy,
        customAbilityAp,
        abilities: abilitiesPayload,
        lieutenantId,
        heroId
      };
      const created = await gmApi.createBestiaryEntry({
        campaignId: selectedCampaignId,
        name: trimmed,
        statsSkills: toStatsSkills(draftEntry, tierParsed.value, actionsParsed.value),
        attributes: Object.keys(attributesPayload).length ? attributesPayload : undefined,
        skills: Object.keys(skillsPayload).length ? skillsPayload : undefined,
        abilities: abilitiesPayload.length ? abilitiesPayload : undefined,
        rank,
        dr: drParsed.value,
        armorType: armorType.trim() || undefined,
        energyBars: energyBarsParsed.value,
        lieutenantId: rank === "Minion" ? lieutenantId : undefined,
        heroId: rank === "Lieutenant" ? heroId : undefined
      });
      setApiEntries((prev) => [created, ...prev]);
      setSelectedEntryId(created.id);
      setIsCreating(false);
      resetForm();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create bestiary entry.");
    }
  };

  const startEdit = (entry: BestiaryEntry) => {
    setEditingId(entry.id);
    setEditDraft({ ...entry });
    setSelectedEntryId(entry.id);
    setIsCreating(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const selectEntry = (entryId: string) => {
    setSelectedEntryId(entryId);
    setIsCreating(false);
    if (editingId && editingId !== entryId) {
      cancelEdit();
    }
  };

  const startCreate = () => {
    cancelEdit();
    resetForm();
    setSelectedEntryId(null);
    setIsCreating(true);
  };

  const togglePanel = (key: PanelKey) => {
    setPanelState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const saveEdit = async () => {
    if (!editDraft) return;
    if (!editDraft.name.trim()) return;
    setError(null);
    const tierParsed = parseIntegerField("Tier", editDraft.tier);
    if (tierParsed.error) {
      setError(tierParsed.error);
      return;
    }
    const maxEnergyParsed = parseIntegerField("Max Energy", editDraft.maxEnergy);
    if (maxEnergyParsed.error) {
      setError(maxEnergyParsed.error);
      return;
    }
    const maxApParsed = parseIntegerField("Max AP", editDraft.maxAp);
    if (maxApParsed.error) {
      setError(maxApParsed.error);
      return;
    }
    const drParsed = parseIntegerField("DR", editDraft.dr);
    if (drParsed.error) {
      setError(drParsed.error);
      return;
    }
    const energyBarsParsed = parseIntegerField("Energy Bars", editDraft.energyBars);
    if (energyBarsParsed.error) {
      setError(energyBarsParsed.error);
      return;
    }
    if (!RANK_OPTIONS.includes(editDraft.rank)) {
      setError("Rank must be NPC, Minion, Lieutenant, or Hero.");
      return;
    }
    if (editDraft.rank === "Minion" && !editDraft.lieutenantId) {
      setError("Minions must be assigned to a Lieutenant.");
      return;
    }
    if (editDraft.rank === "Lieutenant" && !editDraft.heroId) {
      setError("Lieutenants must be assigned to a Hero.");
      return;
    }
    const attributeNumbers = {} as Record<AttributeKey, number>;
    const attributesPayload: Record<string, number> = {};
    for (const key of ATTRIBUTE_KEYS) {
      const parsed = parseIntegerField(`${ATTRIBUTE_LABELS[key]} attribute`, editDraft.attributes[key]);
      if (parsed.error) {
        setError(parsed.error);
        return;
      }
      if (parsed.value !== undefined) {
        attributesPayload[key] = parsed.value;
        attributeNumbers[key] = parsed.value;
      } else {
        attributeNumbers[key] = 0;
      }
    }
    const skillsParsed = parseSkillValues(editDraft.skills);
    if (skillsParsed.error) {
      setError(skillsParsed.error);
      return;
    }
    if (editDraft.customAbilityEnabled && !editDraft.customAbilityName.trim()) {
      setError("Custom ability name is required.");
      return;
    }
    const customEnergyParsed = editDraft.customAbilityEnabled
      ? parseIntegerField("Custom ability energy cost", editDraft.customAbilityEnergy)
      : {};
    if (customEnergyParsed.error) {
      setError(customEnergyParsed.error);
      return;
    }
    const customApParsed = editDraft.customAbilityEnabled
      ? parseIntegerField("Custom ability AP cost", editDraft.customAbilityAp)
      : {};
    if (customApParsed.error) {
      setError(customApParsed.error);
      return;
    }
    const actionsParsed = parseActions(editDraft.actions);
    if (actionsParsed.error) {
      setError(actionsParsed.error);
      return;
    }
    if (maxEnergyParsed.value !== undefined) attributesPayload.energy = maxEnergyParsed.value;
    if (maxApParsed.value !== undefined) attributesPayload.ap = maxApParsed.value;
    if (drParsed.value !== undefined) attributesPayload.dr = drParsed.value;
    if (energyBarsParsed.value !== undefined) attributesPayload.energy_bars = energyBarsParsed.value;
    const bonuses = computeAttributeSkillBonuses(attributeNumbers, skillDefinitions);
    const skillsPayload: Record<string, number> = {};
    skillDefinitions.forEach((skill) => {
      const code = getSkillCode(skill);
      const base = skillsParsed.value?.[code] ?? 0;
      const bonus = bonuses[code] ?? 0;
      const total = base + bonus;
      if (total !== 0) {
        skillsPayload[code] = total;
      }
    });
    Object.entries(skillsParsed.value ?? {}).forEach(([code, value]) => {
      if (skillCodeSet.has(code)) return;
      if (value !== 0) {
        skillsPayload[code] = value;
      }
    });
    const baseAbilities = editDraft.abilities.filter((ability) => ability.type !== "custom");
    const abilitiesPayload = [...baseAbilities];
    if (editDraft.customAbilityEnabled) {
      abilitiesPayload.push({
        type: "custom",
        key: editDraft.customAbilityName.trim(),
        name: editDraft.customAbilityName.trim(),
        energyCost: customEnergyParsed.value,
        apCost: customApParsed.value
      });
    }
    const attributesToSend = Object.keys(attributesPayload).length ? attributesPayload : undefined;
    try {
      const updated = await gmApi.updateBestiaryEntry(editDraft.id, {
        name: editDraft.name.trim(),
        statsSkills: toStatsSkills(editDraft, tierParsed.value, actionsParsed.value),
        attributes: attributesToSend,
        skills: Object.keys(skillsPayload).length ? skillsPayload : undefined,
        abilities: abilitiesPayload.length ? abilitiesPayload : undefined,
        rank: editDraft.rank,
        dr: drParsed.value,
        armorType: editDraft.armorType.trim() || null,
        energyBars: energyBarsParsed.value,
        lieutenantId: editDraft.rank === "Minion" ? editDraft.lieutenantId : null,
        heroId: editDraft.rank === "Lieutenant" ? editDraft.heroId : null
      });
      setApiEntries((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      cancelEdit();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update bestiary entry.");
    }
  };

  const deleteEntry = async (id: string) => {
    setError(null);
    try {
      await gmApi.deleteBestiaryEntry(id);
      setApiEntries((prev) => prev.filter((entry) => entry.id !== id));
      if (editingId === id) cancelEdit();
      if (selectedEntryId === id) setSelectedEntryId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete bestiary entry.");
    }
  };

  const createAttributeNumbers = React.useMemo(() => toAttributeNumbers(attributes), [attributes]);
  const createBonuses = React.useMemo(
    () => computeAttributeSkillBonuses(createAttributeNumbers, skillDefinitions),
    [createAttributeNumbers, skillDefinitions]
  );
  const editBonuses = React.useMemo(() => {
    if (!editDraft) return {};
    return computeAttributeSkillBonuses(toAttributeNumbers(editDraft.attributes), skillDefinitions);
  }, [editDraft, skillDefinitions]);
  const availableLieutenants = React.useMemo(
    () => entries.filter((entry) => entry.rank === "Lieutenant"),
    [entries]
  );
  const availableHeroes = React.useMemo(() => entries.filter((entry) => entry.rank === "Hero"), [entries]);
  const entryNameById = React.useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry.name])),
    [entries]
  );
  const selectedEntry = React.useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId) ?? null,
    [entries, selectedEntryId]
  );
  const selectedBonuses = React.useMemo(() => {
    if (!selectedEntry) return {};
    return computeAttributeSkillBonuses(toAttributeNumbers(selectedEntry.attributes), skillDefinitions);
  }, [selectedEntry, skillDefinitions]);
  const topSkillSummary = React.useMemo(() => {
    if (!selectedEntry) return [];
    const bonuses = selectedBonuses as Record<string, number>;
    return skillDefinitions
      .map((skill) => {
        const code = getSkillCode(skill);
        const raw = selectedEntry.skills[code] ?? "";
        const base = Number.isFinite(Number(raw)) ? Number(raw) : 0;
        const bonus = bonuses[code] ?? 0;
        return {
          code,
          name: skill.name,
          total: base + bonus,
          base,
          bonus
        };
      })
      .filter((skill) => skill.total !== 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [selectedEntry, selectedBonuses, skillDefinitions]);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h2 className={styles.title}>Grimoire of Beasts</h2>
        <p className={styles.subtitle}>An arcane compendium of creatures, monsters, and adversaries</p>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {loading && <div className={styles.mutedText} style={{ textAlign: 'center' }}>Consulting the ancient scrolls...</div>}

      <div className={styles.mainLayout}>
        <section className={`${styles.card} ${styles.sidebar}`}>
          <div className={styles.rowBetween}>
            <h3 className={styles.title} style={{ fontSize: '1rem' }}>Creature Index</h3>
            <button type="button" onClick={startCreate} className={styles.primaryButton}>
              Inscribe
            </button>
          </div>
          {!campaignId && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Campaign</span>
              <select
                value={selectedCampaignId}
                onChange={(event) => setSelectedCampaignId(event.target.value)}
                className={styles.input}
              >
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Search</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search creatures..."
              className={styles.input}
            />
          </label>
          <div className={styles.gridAuto120}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Rank</span>
              <select value={filterRank} onChange={(event) => setFilterRank(event.target.value)} className={styles.input}>
                <option value="All">All</option>
                {RANK_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Type</span>
              <input
                value={filterType}
                onChange={(event) => setFilterType(event.target.value)}
                placeholder="Dragon"
                className={styles.input}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Tier</span>
              <input
                value={filterTier}
                onChange={(event) => setFilterTier(event.target.value)}
                placeholder="3"
                className={styles.input}
                inputMode="numeric"
              />
            </label>
          </div>
          <div className={styles.listPanel}>
            {filteredEntries.length === 0 ? (
              <div className={styles.emptyText}>No entries match these filters.</div>
            ) : (
              filteredEntries.map((entry) => {
                const isSelected = entry.id === selectedEntryId;
                const rankSlug = (entry.rank || "NPC").toLowerCase();
                const inlineLink =
                  entry.rank === "Minion" && entry.lieutenantId
                    ? `→ Lt: ${entryNameById.get(entry.lieutenantId) ?? "Unassigned"}`
                    : entry.rank === "Lieutenant" && entry.heroId
                      ? `→ Hero: ${entryNameById.get(entry.heroId) ?? "Unassigned"}`
                      : "";
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => selectEntry(entry.id)}
                    className={styles.entryButton}
                    aria-selected={isSelected}
                    style={isSelected ? { borderColor: "var(--accent-warm, var(--accent))", background: "var(--accent-soft, var(--surface-2))" } : undefined}
                  >
                    <span className={styles.entryName}>{entry.name}</span>
                    <div className={styles.chipRow}>
                      <span className={styles.rankChip} data-rank={rankSlug}>
                        {entry.rank || "NPC"}
                      </span>
                      <span className={styles.entryMeta}>
                        {entry.tier ? `Tier ${entry.tier}` : "Tier —"} · {entry.type || "Unknown type"}
                        {inlineLink ? ` · ${inlineLink}` : ""}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className={`${styles.card} ${styles.detailPanel}`}>
          <div className={styles.detailSection}>
            <div className={styles.rowBetween}>
              <div>
                <h3 className={styles.title} style={{ fontSize: '1rem' }}>Transcription Chamber</h3>
                <p className={styles.mutedTextSmall}>
                  Transcribe ancient texts into the grimoire. Include "Hero:" or "Lieutenant:" markings to establish dominion.
                </p>
              </div>
              <div className={styles.rowWrap}>
                <button type="button" className={styles.secondaryButton} onClick={handleParseImport}>
                  Decipher Text
                </button>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={handleCreateImport}
                  disabled={importing || importPreview.length === 0 || importMessages.some((msg) => msg.level === "error")}
                >
                  {importing ? "Inscribing..." : "Transcribe to Grimoire"}
                </button>
              </div>
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Ancient Text</span>
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                rows={10}
                placeholder="Feudal Army\n\nKnight (Rank 1 Mortal Hero, Aligned)\n100 energy x3 bars, 9 AP\n15 DR (plate)\n..."
                className={`${styles.input} ${styles.textarea}`}
              />
            </label>
            {importGroupName && (
              <div className={styles.mutedTextSmall}>Detected group: {importGroupName}</div>
            )}
            {importMessages.length > 0 && (
              <div className={styles.detailSection}>
                <div className={styles.sectionTitle}>Preview Messages</div>
                <div className={styles.gridTwo}>
                  {importMessages.map((message, index) => (
                    <div key={`${message.blockIndex}-${index}`} className={styles.skillCard}>
                      <span className={styles.fieldLabelMedium}>
                        {message.level === "error" ? "Error" : "Warning"}
                        {message.entryName ? `: ${message.entryName}` : ""}
                      </span>
                      <span className={styles.mutedTextSmall}>{message.message}</span>
                      {message.block && <span className={styles.mutedTextSmall}>Source: {message.block}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {importPreview.length > 0 && (
              <div className={styles.detailSection}>
                <div className={styles.sectionTitle}>Parsed Entries</div>
                <div className={styles.gridTwo}>
                  {importPreview.map((entry) => (
                    <div key={entry.name} className={styles.skillCard}>
                      <span className={styles.fieldLabelMedium}>
                        {entry.name} • {normalizeRank(entry.rank)}
                      </span>
                      <span className={styles.mutedTextSmall}>
                        Attributes: {Object.keys(entry.attributes).length} • Skills: {Object.keys(entry.skills).length} • Abilities:{" "}
                        {entry.abilities.length}
                      </span>
                      {entry.attributes.dr !== undefined && (
                        <span className={styles.mutedTextSmall}>DR: {entry.attributes.dr}</span>
                      )}
                      {entry.armorType && <span className={styles.mutedTextSmall}>Armor: {entry.armorType}</span>}
                      {entry.energyBars !== undefined && (
                        <span className={styles.mutedTextSmall}>Energy Bars: {entry.energyBars}</span>
                      )}
                      {entry.heroName && <span className={styles.mutedTextSmall}>Hero: {entry.heroName}</span>}
                      {entry.lieutenantName && <span className={styles.mutedTextSmall}>Lieutenant: {entry.lieutenantName}</span>}
                      {entry.immunities?.length ? (
                        <span className={styles.mutedTextSmall}>Immune: {entry.immunities.join(", ")}</span>
                      ) : null}
                      {entry.resistances?.length ? (
                        <span className={styles.mutedTextSmall}>Resistant: {entry.resistances.join(", ")}</span>
                      ) : null}
                      {entry.weaknesses?.length ? (
                        <span className={styles.mutedTextSmall}>Weak: {entry.weaknesses.join(", ")}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {!campaignId && campaigns.length === 0 ? (
            <p className={`${styles.mutedText} ${styles.title}`}>Create a campaign first to manage a bestiary.</p>
          ) : !selectedCampaignId ? (
            <p className={`${styles.mutedText} ${styles.title}`}>Select a campaign to view or edit bestiary entries.</p>
          ) : isCreating ? (
            <form onSubmit={handleCreate} className={styles.form}>
              <div className={styles.rowBetween}>
                <h3 className={styles.title} style={{ fontSize: '1rem' }}>Inscribe New Entry</h3>
                <button type="button" onClick={() => setIsCreating(false)} className={styles.secondaryButton}>
                  Abandon
                </button>
              </div>
              <CollapsibleSection
                title="Core Info"
                isOpen={panelState.core}
                onToggle={() => togglePanel("core")}
              >
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ash Drake"
                    className={styles.input}
                  />
                </label>
                <div className={styles.gridAuto180}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Type</span>
                    <input
                      value={type}
                      onChange={(event) => setType(event.target.value)}
                      placeholder="Dragon"
                      className={styles.input}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Rank</span>
                    <select
                      value={rank}
                      onChange={(event) => {
                        const next = event.target.value;
                        setRank(next);
                        if (next !== "Minion") setLieutenantId("");
                        if (next !== "Lieutenant") setHeroId("");
                      }}
                      className={styles.input}
                    >
                      {RANK_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {rank === "Minion" && (
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Assigned Lieutenant</span>
                    <select value={lieutenantId} onChange={(event) => setLieutenantId(event.target.value)} className={styles.input}>
                      <option value="">Select a lieutenant</option>
                      {availableLieutenants.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {rank === "Lieutenant" && (
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Assigned Hero</span>
                    <select value={heroId} onChange={(event) => setHeroId(event.target.value)} className={styles.input}>
                      <option value="">Select a hero</option>
                      {availableHeroes.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </CollapsibleSection>
                <CollapsibleSection
                  title="Stats"
                  isOpen={panelState.stats}
                  onToggle={() => togglePanel("stats")}
                >
                <div className={styles.gridAuto160}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Tier</span>
                    <input
                      value={tier}
                      onChange={(event) => setTier(event.target.value)}
                      placeholder="3"
                      className={styles.input}
                      inputMode="numeric"
                    />
                    <span className={styles.mutedTextSmall}>{tier ? tierLabel(Number(tier)) : "Tier name"}</span>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Max Energy</span>
                    <input
                      value={maxEnergy}
                      onChange={(event) => setMaxEnergy(event.target.value)}
                      placeholder="120"
                      className={styles.input}
                      inputMode="numeric"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Max AP</span>
                    <input
                      value={maxAp}
                      onChange={(event) => setMaxAp(event.target.value)}
                      placeholder="6"
                      className={styles.input}
                      inputMode="numeric"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Damage Reduction (DR)</span>
                    <input
                      value={dr}
                      onChange={(event) => setDr(event.target.value)}
                      placeholder="10"
                      className={styles.input}
                      inputMode="numeric"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Armor Type</span>
                    <input
                      value={armorType}
                      onChange={(event) => setArmorType(event.target.value)}
                      placeholder="Plate"
                      className={styles.input}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Energy Bars</span>
                    <input
                      value={energyBars}
                      onChange={(event) => setEnergyBars(event.target.value)}
                      placeholder="3"
                      className={styles.input}
                      inputMode="numeric"
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Tactics / Notes</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    placeholder="Breath weapon on round two, vulnerable to cold iron."
                    className={`${styles.input} ${styles.textarea}`}
                  />
                </label>
              </CollapsibleSection>
              <CollapsibleSection
                title="Defenses"
                isOpen={panelState.defenses}
                onToggle={() => togglePanel("defenses")}
              >
                <MultiValueInput
                  label="Immunities"
                  values={immunities}
                  onChange={setImmunities}
                  placeholder="Poison"
                />
                <MultiValueInput
                  label="Resistances"
                  values={resistances}
                  onChange={setResistances}
                  placeholder="Fire"
                />
                <MultiValueInput
                  label="Weaknesses"
                  values={weaknesses}
                  onChange={setWeaknesses}
                  placeholder="Cold Iron"
                />
              </CollapsibleSection>
              <CollapsibleSection
                title="Actions"
                isOpen={panelState.actions}
                onToggle={() => togglePanel("actions")}
              >
                {actions.length === 0 ? (
                  <div className={styles.mutedTextSmall}>No actions added yet.</div>
                ) : (
                  <div className={styles.actionList}>
                    {actions.map((action, index) => (
                      <div key={`action-${index}`} className={styles.actionInputsRow}>
                        <input
                          value={action.energyCost}
                          onChange={(event) =>
                            setActions((prev) =>
                              prev.map((item, rowIndex) =>
                                rowIndex === index ? { ...item, energyCost: event.target.value } : item
                              )
                            )
                          }
                          placeholder="Energy"
                          className={styles.input}
                          inputMode="numeric"
                        />
                        <input
                          value={action.apCost}
                          onChange={(event) =>
                            setActions((prev) =>
                              prev.map((item, rowIndex) =>
                                rowIndex === index ? { ...item, apCost: event.target.value } : item
                              )
                            )
                          }
                          placeholder="AP"
                          className={styles.input}
                          inputMode="numeric"
                        />
                        <input
                          value={action.range}
                          onChange={(event) =>
                            setActions((prev) =>
                              prev.map((item, rowIndex) =>
                                rowIndex === index ? { ...item, range: event.target.value } : item
                              )
                            )
                          }
                          placeholder="Range"
                          className={styles.input}
                        />
                        <input
                          value={action.damage}
                          onChange={(event) =>
                            setActions((prev) =>
                              prev.map((item, rowIndex) =>
                                rowIndex === index ? { ...item, damage: event.target.value } : item
                              )
                            )
                          }
                          placeholder="Damage"
                          className={styles.input}
                        />
                        <input
                          value={action.damageType}
                          onChange={(event) =>
                            setActions((prev) =>
                              prev.map((item, rowIndex) =>
                                rowIndex === index ? { ...item, damageType: event.target.value } : item
                              )
                            )
                          }
                          placeholder="Damage Type"
                          className={styles.input}
                        />
                        <button
                          type="button"
                          onClick={() => setActions((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                          className={styles.dangerButton}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => setActions((prev) => [...prev, createBlankAction()])} className={styles.secondaryButton}>
                  Add Action
                </button>
              </CollapsibleSection>
              <CollapsibleSection
                title="Attributes"
                isOpen={panelState.attributes}
                onToggle={() => togglePanel("attributes")}
              >
                <div className={styles.gridTwoWide}>
                  {ATTRIBUTE_KEYS.map((key) => (
                    <label key={key} className={styles.field}>
                      <span className={styles.fieldLabelMedium}>{ATTRIBUTE_LABELS[key]}</span>
                      <input
                        value={attributes[key]}
                        onChange={(event) => setAttributes((prev) => ({ ...prev, [key]: event.target.value }))}
                        placeholder="0"
                        className={styles.input}
                        inputMode="numeric"
                      />
                    </label>
                  ))}
                </div>
              </CollapsibleSection>
              <CollapsibleSection
                title="Skills"
                isOpen={panelState.skills}
                onToggle={() => togglePanel("skills")}
              >
                {skillDefinitions.length === 0 ? (
                  <div className={styles.mutedTextMedium}>No skills loaded from definitions.</div>
                ) : (
                  <div className={styles.gridThreeWide}>
                    {skillDefinitions.map((skill) => {
                      const code = getSkillCode(skill);
                      const bonus = createBonuses[code] ?? 0;
                      const baseValue = skills[code] ?? "";
                      const numericBase = Number(baseValue);
                      const total = (Number.isFinite(numericBase) ? numericBase : 0) + bonus;
                      return (
                        <label key={code} className={styles.field}>
                          <span className={styles.fieldLabelMedium}>{skill.name}</span>
                          <input
                            value={baseValue}
                            onChange={(event) => setSkills((prev) => ({ ...prev, [code]: event.target.value }))}
                            placeholder="0"
                            className={styles.input}
                            inputMode="numeric"
                          />
                          <span className={styles.mutedTextSmall}>
                            Bonus {bonus >= 0 ? `+${bonus}` : bonus} • Total {total}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </CollapsibleSection>
              <CollapsibleSection
                title="Abilities"
                isOpen={panelState.abilities}
                onToggle={() => togglePanel("abilities")}
              >
                {abilityLoadError && <div className={styles.mutedTextSmall}>Ability data error: {abilityLoadError}</div>}
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Martial</span>
                  <label className={styles.field}>
                    <span className={styles.fieldLabelMedium}>Weapon Category</span>
                    <select
                      value={weaponCategory}
                      onChange={(event) => setWeaponCategory(event.target.value)}
                      className={styles.input}
                    >
                      {weaponCategories.length === 0 ? (
                        <option value="">No categories available</option>
                      ) : (
                        weaponCategories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  {weaponAbilityOptions.length === 0 ? (
                    <div className={styles.mutedTextSmall}>No martial abilities for this category.</div>
                  ) : (
                    <div className={styles.selectionGrid}>
                      {weaponAbilityOptions.map((ability) => {
                        const key = buildMartialAbilityKey(ability);
                        const selected = abilities.some((item) => item.type === "martial" && item.key === key);
                        return (
                          <label key={key} className={styles.checkboxRow}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() =>
                                setAbilities((prev) => toggleAbilitySelection(prev, buildMartialAbility(ability)))
                              }
                            />
                            <span>{ability.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Psionic</span>
                  <label className={styles.field}>
                    <span className={styles.fieldLabelMedium}>Tree</span>
                    <select
                      value={psionicTree}
                      onChange={(event) => setPsionicTree(event.target.value)}
                      className={styles.input}
                    >
                      {psionicTrees.length === 0 ? (
                        <option value="">No trees available</option>
                      ) : (
                        psionicTrees.map((tree) => (
                          <option key={tree} value={tree}>
                            {tree}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  {psionicAbilityOptions.length === 0 ? (
                    <div className={styles.mutedTextSmall}>No psionic abilities for this tree.</div>
                  ) : (
                    <div className={styles.selectionGrid}>
                      {psionicAbilityOptions.map((ability) => {
                        const key = buildPsionicAbilityKey(ability);
                        const selected = abilities.some((item) => item.type === "psionic" && item.key === key);
                        return (
                          <label key={key} className={styles.checkboxRow}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() =>
                                setAbilities((prev) => toggleAbilitySelection(prev, buildPsionicAbility(ability)))
                              }
                            />
                            <span>
                              {ability.name}
                              {ability.tier ? ` (Tier ${ability.tier})` : ""}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={customAbilityEnabled}
                    onChange={(event) => setCustomAbilityEnabled(event.target.checked)}
                  />
                  <span className={styles.fieldLabel}>Custom Ability</span>
                </label>
                {customAbilityEnabled && (
                  <div className={styles.gridAuto160}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Custom Ability Name</span>
                      <input
                        value={customAbilityName}
                        onChange={(event) => setCustomAbilityName(event.target.value)}
                        placeholder="Solar Flare"
                        className={styles.input}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Energy Cost</span>
                      <input
                        value={customAbilityEnergy}
                        onChange={(event) => setCustomAbilityEnergy(event.target.value)}
                        placeholder="8"
                        className={styles.input}
                        inputMode="numeric"
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>AP Cost</span>
                      <input
                        value={customAbilityAp}
                        onChange={(event) => setCustomAbilityAp(event.target.value)}
                        placeholder="2"
                        className={styles.input}
                        inputMode="numeric"
                      />
                    </label>
                  </div>
                )}
              </CollapsibleSection>
              <button
                type="submit"
                className={styles.submitButton}
              >
                Add Entry
              </button>
            </form>
          ) : selectedEntry ? (
            editingId === selectedEntry.id && editDraft ? (
              <div className={styles.detailStack}>
                <div className={styles.rowBetween}>
                  <h3 className={styles.title}>Edit Creature</h3>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className={styles.secondaryButton}
                  >
                    Cancel
                  </button>
                </div>
                <CollapsibleSection
                  title="Core Info"
                  isOpen={panelState.core}
                  onToggle={() => togglePanel("core")}
                >
                  <input
                    value={editDraft.name}
                    onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                    className={styles.input}
                  />
                  <div className={styles.gridAuto160}>
                    <input
                      value={editDraft.type}
                      onChange={(event) => setEditDraft({ ...editDraft, type: event.target.value })}
                      placeholder="Type"
                      className={styles.input}
                    />
                    <select
                      value={editDraft.rank}
                      onChange={(event) => {
                        const next = event.target.value;
                        setEditDraft({
                          ...editDraft,
                          rank: next,
                          lieutenantId: next === "Minion" ? editDraft.lieutenantId : "",
                          heroId: next === "Lieutenant" ? editDraft.heroId : ""
                        });
                      }}
                      className={styles.input}
                    >
                      {RANK_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  {editDraft.rank === "Minion" && (
                    <select
                      value={editDraft.lieutenantId}
                      onChange={(event) => setEditDraft({ ...editDraft, lieutenantId: event.target.value })}
                      className={styles.input}
                    >
                      <option value="">Select a lieutenant</option>
                      {availableLieutenants
                        .filter((entryOption) => entryOption.id !== editDraft.id)
                        .map((entryOption) => (
                          <option key={entryOption.id} value={entryOption.id}>
                            {entryOption.name}
                          </option>
                        ))}
                    </select>
                  )}
                  {editDraft.rank === "Lieutenant" && (
                    <select
                      value={editDraft.heroId}
                      onChange={(event) => setEditDraft({ ...editDraft, heroId: event.target.value })}
                      className={styles.input}
                    >
                      <option value="">Select a hero</option>
                      {availableHeroes
                        .filter((entryOption) => entryOption.id !== editDraft.id)
                        .map((entryOption) => (
                          <option key={entryOption.id} value={entryOption.id}>
                            {entryOption.name}
                          </option>
                        ))}
                    </select>
                  )}
                </CollapsibleSection>
                <CollapsibleSection
                  title="Stats"
                  isOpen={panelState.stats}
                  onToggle={() => togglePanel("stats")}
                >
                  <div className={styles.gridAuto150}>
                    <input
                      value={editDraft.tier}
                      onChange={(event) => setEditDraft({ ...editDraft, tier: event.target.value })}
                      placeholder="Tier"
                      className={styles.input}
                      inputMode="numeric"
                    />
                    <input
                      value={editDraft.maxEnergy}
                      onChange={(event) => setEditDraft({ ...editDraft, maxEnergy: event.target.value })}
                      placeholder="Max Energy"
                      className={styles.input}
                      inputMode="numeric"
                    />
                    <input
                      value={editDraft.maxAp}
                      onChange={(event) => setEditDraft({ ...editDraft, maxAp: event.target.value })}
                      placeholder="Max AP"
                      className={styles.input}
                      inputMode="numeric"
                    />
                    <input
                      value={editDraft.dr}
                      onChange={(event) => setEditDraft({ ...editDraft, dr: event.target.value })}
                      placeholder="Damage Reduction"
                      className={styles.input}
                      inputMode="numeric"
                    />
                    <input
                      value={editDraft.armorType}
                      onChange={(event) => setEditDraft({ ...editDraft, armorType: event.target.value })}
                      placeholder="Armor Type"
                      className={styles.input}
                    />
                    <input
                      value={editDraft.energyBars}
                      onChange={(event) => setEditDraft({ ...editDraft, energyBars: event.target.value })}
                      placeholder="Energy Bars"
                      className={styles.input}
                      inputMode="numeric"
                    />
                  </div>
                  <textarea
                    value={editDraft.description}
                    onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })}
                    rows={3}
                    placeholder="Notes"
                    className={`${styles.input} ${styles.textarea}`}
                  />
                </CollapsibleSection>
                <CollapsibleSection
                  title="Defenses"
                  isOpen={panelState.defenses}
                  onToggle={() => togglePanel("defenses")}
                >
                  <MultiValueInput
                    label="Immunities"
                    values={editDraft.immunities}
                    onChange={(values) => setEditDraft({ ...editDraft, immunities: values })}
                    placeholder="Poison"
                  />
                  <MultiValueInput
                    label="Resistances"
                    values={editDraft.resistances}
                    onChange={(values) => setEditDraft({ ...editDraft, resistances: values })}
                    placeholder="Fire"
                  />
                  <MultiValueInput
                    label="Weaknesses"
                    values={editDraft.weaknesses}
                    onChange={(values) => setEditDraft({ ...editDraft, weaknesses: values })}
                    placeholder="Cold Iron"
                  />
                </CollapsibleSection>
                <CollapsibleSection
                  title="Actions"
                  isOpen={panelState.actions}
                  onToggle={() => togglePanel("actions")}
                >
                  {editDraft.actions.length === 0 ? (
                    <div className={styles.mutedTextSmall}>No actions added yet.</div>
                  ) : (
                    <div className={styles.actionList}>
                      {editDraft.actions.map((action, index) => (
                        <div key={`edit-action-${index}`} className={styles.actionInputsRow}>
                          <input
                            value={action.energyCost}
                            onChange={(event) =>
                              setEditDraft({
                                ...editDraft,
                                actions: editDraft.actions.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, energyCost: event.target.value } : item
                                )
                              })
                            }
                            placeholder="Energy"
                            className={styles.input}
                            inputMode="numeric"
                          />
                          <input
                            value={action.apCost}
                            onChange={(event) =>
                              setEditDraft({
                                ...editDraft,
                                actions: editDraft.actions.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, apCost: event.target.value } : item
                                )
                              })
                            }
                            placeholder="AP"
                            className={styles.input}
                            inputMode="numeric"
                          />
                          <input
                            value={action.range}
                            onChange={(event) =>
                              setEditDraft({
                                ...editDraft,
                                actions: editDraft.actions.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, range: event.target.value } : item
                                )
                              })
                            }
                            placeholder="Range"
                            className={styles.input}
                          />
                          <input
                            value={action.damage}
                            onChange={(event) =>
                              setEditDraft({
                                ...editDraft,
                                actions: editDraft.actions.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, damage: event.target.value } : item
                                )
                              })
                            }
                            placeholder="Damage"
                            className={styles.input}
                          />
                          <input
                            value={action.damageType}
                            onChange={(event) =>
                              setEditDraft({
                                ...editDraft,
                                actions: editDraft.actions.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, damageType: event.target.value } : item
                                )
                              })
                            }
                            placeholder="Damage Type"
                            className={styles.input}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setEditDraft({
                                ...editDraft,
                                actions: editDraft.actions.filter((_, rowIndex) => rowIndex !== index)
                              })
                            }
                            className={styles.dangerButton}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditDraft({ ...editDraft, actions: [...editDraft.actions, createBlankAction()] })}
                    className={styles.secondaryButton}
                  >
                    Add Action
                  </button>
                </CollapsibleSection>
                <CollapsibleSection
                  title="Attributes"
                  isOpen={panelState.attributes}
                  onToggle={() => togglePanel("attributes")}
                >
                  <div className={styles.gridTwo}>
                    {ATTRIBUTE_KEYS.map((key) => (
                      <label key={key} className={styles.field}>
                        <span className={styles.fieldLabelMedium}>{ATTRIBUTE_LABELS[key]}</span>
                        <input
                          value={editDraft.attributes[key]}
                          onChange={(event) =>
                            setEditDraft({ ...editDraft, attributes: { ...editDraft.attributes, [key]: event.target.value } })
                          }
                          placeholder="0"
                          className={styles.input}
                          inputMode="numeric"
                        />
                      </label>
                    ))}
                  </div>
                </CollapsibleSection>
                <CollapsibleSection
                  title="Skills"
                  isOpen={panelState.skills}
                  onToggle={() => togglePanel("skills")}
                >
                  {skillDefinitions.length === 0 ? (
                    <div className={styles.mutedTextMedium}>No skills loaded from definitions.</div>
                  ) : (
                    <div className={styles.gridThree}>
                      {skillDefinitions.map((skill) => {
                        const code = getSkillCode(skill);
                        const bonus = (editBonuses as Record<string, number>)[code] ?? 0;
                        const baseValue = editDraft.skills[code] ?? "";
                        const numericBase = Number(baseValue);
                        const total = (Number.isFinite(numericBase) ? numericBase : 0) + bonus;
                        return (
                          <label key={code} className={styles.field}>
                            <span className={styles.fieldLabelMedium}>{skill.name}</span>
                            <input
                              value={baseValue}
                              onChange={(event) =>
                                setEditDraft({ ...editDraft, skills: { ...editDraft.skills, [code]: event.target.value } })
                              }
                              placeholder="0"
                              className={styles.input}
                              inputMode="numeric"
                            />
                            <span className={styles.mutedTextSmall}>
                              Bonus {bonus >= 0 ? `+${bonus}` : bonus} • Total {total}
                            </span>
                          </label>
                        );
                      })}
                      {Object.keys(editDraft.skills)
                        .filter((code) => !skillCodeSet.has(code))
                        .map((code) => (
                          <label key={code} className={styles.field}>
                            <span className={styles.fieldLabelMedium}>{normalizeSkillCode({ id: code })}</span>
                            <input
                              value={editDraft.skills[code]}
                              onChange={(event) =>
                                setEditDraft({ ...editDraft, skills: { ...editDraft.skills, [code]: event.target.value } })
                              }
                              placeholder="0"
                              className={styles.input}
                              inputMode="numeric"
                            />
                          </label>
                        ))}
                    </div>
                  )}
                </CollapsibleSection>
                <CollapsibleSection
                  title="Abilities"
                  isOpen={panelState.abilities}
                  onToggle={() => togglePanel("abilities")}
                >
                  {abilityLoadError && <div className={styles.mutedTextSmall}>Ability data error: {abilityLoadError}</div>}
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Martial</span>
                    <label className={styles.field}>
                      <span className={styles.fieldLabelMedium}>Weapon Category</span>
                      <select
                        value={weaponCategory}
                        onChange={(event) => setWeaponCategory(event.target.value)}
                        className={styles.input}
                      >
                        {weaponCategories.length === 0 ? (
                          <option value="">No categories available</option>
                        ) : (
                          weaponCategories.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    {weaponAbilityOptions.length === 0 ? (
                      <div className={styles.mutedTextSmall}>No martial abilities for this category.</div>
                    ) : (
                      <div className={styles.selectionGrid}>
                        {weaponAbilityOptions.map((ability) => {
                          const key = buildMartialAbilityKey(ability);
                          const selected = editDraft.abilities.some((item) => item.type === "martial" && item.key === key);
                          return (
                            <label key={key} className={styles.checkboxRow}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() =>
                                  setEditDraft({
                                    ...editDraft,
                                    abilities: toggleAbilitySelection(editDraft.abilities, buildMartialAbility(ability))
                                  })
                                }
                              />
                              <span>{ability.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Psionic</span>
                    <label className={styles.field}>
                      <span className={styles.fieldLabelMedium}>Tree</span>
                      <select
                        value={psionicTree}
                        onChange={(event) => setPsionicTree(event.target.value)}
                        className={styles.input}
                      >
                        {psionicTrees.length === 0 ? (
                          <option value="">No trees available</option>
                        ) : (
                          psionicTrees.map((tree) => (
                            <option key={tree} value={tree}>
                              {tree}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    {psionicAbilityOptions.length === 0 ? (
                      <div className={styles.mutedTextSmall}>No psionic abilities for this tree.</div>
                    ) : (
                      <div className={styles.selectionGrid}>
                        {psionicAbilityOptions.map((ability) => {
                          const key = buildPsionicAbilityKey(ability);
                          const selected = editDraft.abilities.some((item) => item.type === "psionic" && item.key === key);
                          return (
                            <label key={key} className={styles.checkboxRow}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() =>
                                  setEditDraft({
                                    ...editDraft,
                                    abilities: toggleAbilitySelection(editDraft.abilities, buildPsionicAbility(ability))
                                  })
                                }
                              />
                              <span>
                                {ability.name}
                                {ability.tier ? ` (Tier ${ability.tier})` : ""}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={editDraft.customAbilityEnabled}
                      onChange={(event) => setEditDraft({ ...editDraft, customAbilityEnabled: event.target.checked })}
                    />
                    <span className={styles.fieldLabel}>Custom Ability</span>
                  </label>
                  {editDraft.customAbilityEnabled && (
                    <div className={styles.gridAuto150}>
                      <input
                        value={editDraft.customAbilityName}
                        onChange={(event) => setEditDraft({ ...editDraft, customAbilityName: event.target.value })}
                        placeholder="Custom Ability"
                        className={styles.input}
                      />
                      <input
                        value={editDraft.customAbilityEnergy}
                        onChange={(event) => setEditDraft({ ...editDraft, customAbilityEnergy: event.target.value })}
                        placeholder="Energy Cost"
                        className={styles.input}
                        inputMode="numeric"
                      />
                      <input
                        value={editDraft.customAbilityAp}
                        onChange={(event) => setEditDraft({ ...editDraft, customAbilityAp: event.target.value })}
                        placeholder="AP Cost"
                        className={styles.input}
                        inputMode="numeric"
                      />
                    </div>
                  )}
                </CollapsibleSection>
                <div className={styles.actionRow}>
                  <button type="button" onClick={saveEdit} className={styles.actionButton}>
                    Save
                  </button>
                  <button type="button" onClick={cancelEdit} className={styles.actionButtonSecondary}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.detailStack}>
                <div className={styles.detailHeader}>
                  <h3 className={styles.title}>{selectedEntry.name}</h3>
                  <div className={styles.detailActions}>
                    <button
                      type="button"
                      onClick={() => startEdit(selectedEntry)}
                      className={styles.editButton}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEntry(selectedEntry.id)}
                      className={styles.dangerButton}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className={styles.summaryCard}>
                  <div className={styles.detailSection}>
                    <div className={styles.sectionTitle}>Overview</div>
                    <div className={styles.infoStack}>
                      <div className={styles.mutedTextMedium}>
                        {selectedEntry.type || "Unknown type"} • {selectedEntry.rank || "NPC"}
                      </div>
                      {selectedEntry.rank === "Minion" && selectedEntry.lieutenantId && (
                        <div className={styles.mutedTextSmall}>
                          → Lt: {entryNameById.get(selectedEntry.lieutenantId) ?? "Unassigned"}
                        </div>
                      )}
                      {selectedEntry.rank === "Lieutenant" && selectedEntry.heroId && (
                        <div className={styles.mutedTextSmall}>
                          → Hero: {entryNameById.get(selectedEntry.heroId) ?? "Unassigned"}
                        </div>
                      )}
                      {selectedEntry.description && (
                        <p className={styles.description}>{selectedEntry.description}</p>
                      )}
                    </div>
                  </div>
                  <div className={styles.detailSection}>
                    <div className={styles.sectionTitle}>Stats</div>
                    <div className={styles.gridAuto140}>
                      <div>
                        <div className={styles.statLabel}>Tier</div>
                        <div className={styles.statValue}>
                          {selectedEntry.tier || "—"}{" "}
                          {selectedEntry.tier ? `(${tierLabel(Number(selectedEntry.tier))})` : ""}
                        </div>
                      </div>
                      <div>
                        <div className={styles.statLabel}>Max Energy</div>
                        <div className={styles.statValue}>{selectedEntry.maxEnergy || "—"}</div>
                      </div>
                      <div>
                        <div className={styles.statLabel}>Max AP</div>
                        <div className={styles.statValue}>{selectedEntry.maxAp || "—"}</div>
                      </div>
                      <div>
                        <div className={styles.statLabel}>Damage Reduction</div>
                        <div className={styles.statValue}>{selectedEntry.dr || "—"}</div>
                        {selectedEntry.armorType && (
                          <div className={styles.mutedTextSmall}>{selectedEntry.armorType}</div>
                        )}
                      </div>
                      <div>
                        <div className={styles.statLabel}>Energy Bars</div>
                        <div className={styles.statValue}>{selectedEntry.energyBars || "—"}</div>
                      </div>
                      <div>
                        <div className={styles.statLabel}>Abilities</div>
                        <div className={styles.statValue}>
                          {selectedEntry.abilities.length ? `${selectedEntry.abilities.length} selected` : "None"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.detailSection}>
                    <div className={styles.sectionTitle}>Defenses</div>
                    <div className={styles.gridTwo}>
                      <div>
                        <div className={styles.statLabel}>Immunities</div>
                        <div className={styles.statValue}>
                          {selectedEntry.immunities.length ? selectedEntry.immunities.join(", ") : "—"}
                        </div>
                      </div>
                      <div>
                        <div className={styles.statLabel}>Resistances</div>
                        <div className={styles.statValue}>
                          {selectedEntry.resistances.length ? selectedEntry.resistances.join(", ") : "—"}
                        </div>
                      </div>
                      <div>
                        <div className={styles.statLabel}>Weaknesses</div>
                        <div className={styles.statValue}>
                          {selectedEntry.weaknesses.length ? selectedEntry.weaknesses.join(", ") : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.detailSection}>
                    <div className={styles.sectionTitle}>Actions</div>
                    {selectedEntry.actions.length === 0 ? (
                      <div className={styles.mutedTextMedium}>No actions listed.</div>
                    ) : (
                      <div className={styles.gridTwo}>
                        {selectedEntry.actions.map((action, index) => {
                          const parts = [
                            action.energyCost ? `Energy ${action.energyCost}` : null,
                            action.apCost ? `AP ${action.apCost}` : null,
                            action.range ? `Range ${action.range}` : null,
                            action.damage ? `Damage ${action.damage}` : null,
                            action.damageType ? `Type ${action.damageType}` : null
                          ].filter(Boolean);
                          return (
                            <div key={`action-display-${index}`} className={styles.skillCard}>
                              <span className={styles.fieldLabelMedium}>Action {index + 1}</span>
                              {parts.length > 0 ? (
                                <span className={styles.mutedTextSmall}>{parts.join(" • ")}</span>
                              ) : (
                                <span className={styles.mutedTextSmall}>No details provided.</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className={styles.detailSection}>
                    <div className={styles.sectionTitle}>Attributes</div>
                    <div className={styles.gridTwo}>
                      {ATTRIBUTE_KEYS.map((key) => (
                        <div key={key} className={styles.attributeCard}>
                          <div className={styles.mutedTextSmall}>{ATTRIBUTE_LABELS[key]}</div>
                          <div className={styles.statValue}>{selectedEntry.attributes[key] || "0"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={styles.detailSection}>
                    <div className={styles.sectionTitle}>Top Skills</div>
                    {skillDefinitions.length === 0 ? (
                      <div className={styles.mutedTextMedium}>No skills loaded from definitions.</div>
                    ) : topSkillSummary.length === 0 ? (
                      <div className={styles.mutedTextMedium}>No notable skills listed.</div>
                    ) : (
                      <div className={styles.gridThree}>
                        {topSkillSummary.map((skill) => (
                          <div key={skill.code} className={styles.skillCard}>
                            <span className={styles.fieldLabelMedium}>{skill.name}</span>
                            <span className={styles.mutedTextSmall}>
                              Total {skill.total} (Base {skill.base} • Bonus {skill.bonus >= 0 ? `+${skill.bonus}` : skill.bonus})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={styles.detailSection}>
                    <div className={styles.sectionTitle}>Abilities</div>
                    {selectedEntry.abilities && selectedEntry.abilities.length > 0 ? (
                      <div className={styles.gridTwo}>
                        {selectedEntry.abilities.map((ability, index) => {
                          const label = ability.name || ability.key || ability.type || `Ability ${index + 1}`;
                          const metaParts = [
                            ability.category ? `Category: ${ability.category}` : null,
                            ability.tree ? `Tree: ${ability.tree}` : null,
                            ability.phase ? `Phase: ${ability.phase}` : null,
                            ability.energyCost !== undefined ? `Energy ${ability.energyCost}` : null,
                            ability.apCost !== undefined ? `AP ${ability.apCost}` : null,
                            ability.range ? `Range ${ability.range}` : null,
                            ability.damage ? `Damage ${ability.damage}` : null
                          ]
                            .filter((value): value is string => Boolean(value))
                            .join(" • ");
                          return (
                            <div key={`${label}-${index}`} className={styles.skillCard}>
                              <span className={styles.fieldLabelMedium}>{label}</span>
                              {ability.type && <span className={styles.mutedTextSmall}>Type: {ability.type}</span>}
                              {metaParts && <span className={styles.mutedTextSmall}>{metaParts}</span>}
                              {(ability.description || ability.rules) && (
                                <span className={styles.mutedTextSmall}>{ability.description ?? ability.rules}</span>
                              )}
                              {ability.tags && ability.tags.length > 0 && (
                                <span className={styles.mutedTextSmall}>Tags: {ability.tags.join(", ")}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={styles.mutedTextMedium}>No abilities listed.</div>
                    )}
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className={styles.mutedText}>Select an entry or create a new one.</div>
          )}
        </section>
      </div>
    </div>
  );
};
