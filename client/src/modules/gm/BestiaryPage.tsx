import React from "react";
import { useParams } from "react-router-dom";
import { gmApi, type BestiaryEntry as ApiBestiaryEntry, type Campaign } from "../../api/gm";
import { useDefinitions } from "../definitions/DefinitionsContext";
import { AttributeKey, computeAttributeSkillBonuses, getSkillCode, normalizeSkillCode } from "../characters/skillMetadata";

const cardStyle: React.CSSProperties = {
  background: "#0f131a",
  border: "1px solid #1f2935",
  borderRadius: 12,
  padding: "1rem"
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  borderRadius: 8,
  border: "1px solid #2f3542",
  background: "#0b1017",
  color: "#e5e7eb",
  boxSizing: "border-box"
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  width: "100%",
  background: "transparent",
  border: "none",
  color: "#e5e7eb",
  padding: 0,
  cursor: "pointer",
  fontSize: 16,
  fontWeight: 700,
  textAlign: "left"
};

const collapsibleStyle: React.CSSProperties = {
  border: "1px solid #1f2935",
  borderRadius: 10,
  padding: "0.75rem",
  background: "#0c111a",
  display: "grid",
  gap: "0.75rem"
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
  attributes: Record<AttributeKey, string>;
  skills: Record<string, string>;
  abilityType: string;
  customAbilityName: string;
  customAbilityEnergy: string;
  customAbilityAp: string;
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

const toStatsSkills = (entry: BestiaryEntry, tierValue?: number): Record<string, string | number> => {
  const statsSkills: Record<string, string | number> = {};
  const type = entry.type.trim();
  const description = entry.description.trim();
  if (type) statsSkills.type = type;
  if (description) statsSkills.description = description;
  if (tierValue !== undefined) statsSkills.tier = tierValue;
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

type PanelKey = "core" | "stats" | "attributes" | "skills" | "abilities";

type CollapsibleSectionProps = {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, isOpen, onToggle, children }) => (
  <div style={collapsibleStyle}>
    <button type="button" onClick={onToggle} style={sectionHeaderStyle}>
      <span>{title}</span>
      <span style={{ color: "#94a3b8", fontSize: 14 }}>{isOpen ? "▾" : "▸"}</span>
    </button>
    {isOpen && <div style={{ display: "grid", gap: "0.75rem" }}>{children}</div>}
  </div>
);

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
  const [attributes, setAttributes] = React.useState<Record<AttributeKey, string>>({
    PHYSICAL: "",
    MENTAL: "",
    SPIRITUAL: "",
    WILL: ""
  });
  const [skills, setSkills] = React.useState<Record<string, string>>({});
  const [abilityType, setAbilityType] = React.useState("");
  const [customAbilityName, setCustomAbilityName] = React.useState("");
  const [customAbilityEnergy, setCustomAbilityEnergy] = React.useState("");
  const [customAbilityAp, setCustomAbilityAp] = React.useState("");
  const [lieutenantId, setLieutenantId] = React.useState("");
  const [heroId, setHeroId] = React.useState("");
  const [selectedEntryId, setSelectedEntryId] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterRank, setFilterRank] = React.useState("All");
  const [filterType, setFilterType] = React.useState("");
  const [filterTier, setFilterTier] = React.useState("");
  const [panelState, setPanelState] = React.useState<Record<PanelKey, boolean>>({
    core: true,
    stats: true,
    attributes: false,
    skills: false,
    abilities: false
  });
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<BestiaryEntry | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setType("");
    setRank("NPC");
    setDescription("");
    setTier("");
    setMaxEnergy("");
    setMaxAp("");
    setAttributes({ PHYSICAL: "", MENTAL: "", SPIRITUAL: "", WILL: "" });
    setSkills((prev) => {
      const next: Record<string, string> = {};
      (definitions?.skills ?? []).forEach((skill) => {
        next[getSkillCode(skill)] = "";
      });
      return Object.keys(next).length ? next : prev;
    });
    setAbilityType("");
    setCustomAbilityName("");
    setCustomAbilityEnergy("");
    setCustomAbilityAp("");
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

  const skillDefinitions = definitions?.skills ?? [];
  const skillCodeSet = React.useMemo(() => new Set(skillDefinitions.map(getSkillCode)), [skillDefinitions]);

  const mapApiEntry = React.useCallback(
    (entry: ApiBestiaryEntry): BestiaryEntry => {
      const statsSkills = entry.statsSkills;
      const attributesPayload = entry.attributes ?? {};
      const type = typeof statsSkills?.type === "string" ? statsSkills.type : "";
      const description = typeof statsSkills?.description === "string" ? statsSkills.description : "";
      const tier = readNumberString(statsSkills?.tier ?? attributesPayload?.tier);
      const maxEnergy = readNumberString(attributesPayload?.energy);
      const maxAp = readNumberString(attributesPayload?.ap);
      const rankValue = typeof entry.rank === "string" ? entry.rank : "NPC";
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
      const primaryAbility = entry.abilities?.[0];
      const abilityTypeValue = typeof primaryAbility?.type === "string" ? primaryAbility.type : "";
      const customAbilityNameValue = typeof primaryAbility?.name === "string" ? primaryAbility.name : "";
      const customAbilityEnergyValue = readNumberString(primaryAbility?.energyCost);
      const customAbilityApValue = readNumberString(primaryAbility?.apCost);
      return {
        id: entry.id,
        name: entry.name,
        type,
        rank: rankValue,
        description,
        tier,
        maxEnergy,
        maxAp,
        attributes: attributesValues,
        skills: skillsValues,
        abilityType: abilityTypeValue,
        customAbilityName: customAbilityNameValue,
        customAbilityEnergy: customAbilityEnergyValue,
        customAbilityAp: customAbilityApValue,
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
    if (abilityType === "custom" && !customAbilityName.trim()) {
      setError("Custom ability name is required.");
      return;
    }
    const customEnergyParsed = parseIntegerField("Custom ability energy cost", customAbilityEnergy);
    if (customEnergyParsed.error) {
      setError(customEnergyParsed.error);
      return;
    }
    const customApParsed = parseIntegerField("Custom ability AP cost", customAbilityAp);
    if (customApParsed.error) {
      setError(customApParsed.error);
      return;
    }
    if (maxEnergyParsed.value !== undefined) attributesPayload.energy = maxEnergyParsed.value;
    if (maxApParsed.value !== undefined) attributesPayload.ap = maxApParsed.value;
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
    const abilitiesPayload = abilityType
      ? [
          {
            type: abilityType,
            ...(abilityType === "custom"
              ? {
                  name: customAbilityName.trim(),
                  energyCost: customEnergyParsed.value,
                  apCost: customApParsed.value
                }
              : {})
          }
        ]
      : undefined;
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
        attributes,
        skills,
        abilityType,
        customAbilityName,
        customAbilityEnergy,
        customAbilityAp,
        lieutenantId,
        heroId
      };
      const created = await gmApi.createBestiaryEntry({
        campaignId: selectedCampaignId,
        name: trimmed,
        statsSkills: toStatsSkills(draftEntry, tierParsed.value),
        attributes: Object.keys(attributesPayload).length ? attributesPayload : undefined,
        skills: Object.keys(skillsPayload).length ? skillsPayload : undefined,
        abilities: abilitiesPayload,
        rank,
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
    if (editDraft.abilityType === "custom" && !editDraft.customAbilityName.trim()) {
      setError("Custom ability name is required.");
      return;
    }
    const customEnergyParsed = parseIntegerField("Custom ability energy cost", editDraft.customAbilityEnergy);
    if (customEnergyParsed.error) {
      setError(customEnergyParsed.error);
      return;
    }
    const customApParsed = parseIntegerField("Custom ability AP cost", editDraft.customAbilityAp);
    if (customApParsed.error) {
      setError(customApParsed.error);
      return;
    }
    if (maxEnergyParsed.value !== undefined) attributesPayload.energy = maxEnergyParsed.value;
    if (maxApParsed.value !== undefined) attributesPayload.ap = maxApParsed.value;
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
    const abilitiesPayload = editDraft.abilityType
      ? [
          {
            type: editDraft.abilityType,
            ...(editDraft.abilityType === "custom"
              ? {
                  name: editDraft.customAbilityName.trim(),
                  energyCost: customEnergyParsed.value,
                  apCost: customApParsed.value
                }
              : {})
          }
        ]
      : undefined;
    const attributesToSend = Object.keys(attributesPayload).length ? attributesPayload : undefined;
    try {
      const updated = await gmApi.updateBestiaryEntry(editDraft.id, {
        name: editDraft.name.trim(),
        statsSkills: toStatsSkills(editDraft, tierParsed.value),
        attributes: attributesToSend,
        skills: Object.keys(skillsPayload).length ? skillsPayload : undefined,
        abilities: abilitiesPayload,
        rank: editDraft.rank,
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
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Bestiary</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#cbd5e1" }}>
          Maintain monster entries with quick edit controls.
        </p>
      </header>

      {error && <div style={{ color: "#fca5a5" }}>{error}</div>}
      {loading && <div style={{ color: "#94a3b8" }}>Loading...</div>}

      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        <section
          style={{
            ...cardStyle,
            width: 300,
            flex: "0 0 300px",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Creatures</h3>
            <button
              type="button"
              onClick={startCreate}
              style={{
                padding: "0.35rem 0.7rem",
                borderRadius: 8,
                border: "1px solid #1d4ed8",
                background: "#2563eb",
                color: "#e6edf7",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              New
            </button>
          </div>
          {!campaignId && (
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Campaign</span>
              <select
                value={selectedCampaignId}
                onChange={(event) => setSelectedCampaignId(event.target.value)}
                style={inputStyle}
              >
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 700 }}>Search</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search creatures..."
              style={inputStyle}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.6rem" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Rank</span>
              <select value={filterRank} onChange={(event) => setFilterRank(event.target.value)} style={inputStyle}>
                <option value="All">All</option>
                {RANK_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Type</span>
              <input
                value={filterType}
                onChange={(event) => setFilterType(event.target.value)}
                placeholder="Dragon"
                style={inputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Tier</span>
              <input
                value={filterTier}
                onChange={(event) => setFilterTier(event.target.value)}
                placeholder="3"
                style={inputStyle}
                inputMode="numeric"
              />
            </label>
          </div>
          <div style={{ display: "grid", gap: "0.5rem", maxHeight: "70vh", overflowY: "auto" }}>
            {filteredEntries.length === 0 ? (
              <div style={{ color: "#94a3b8", fontSize: 13 }}>No entries match these filters.</div>
            ) : (
              filteredEntries.map((entry) => {
                const isSelected = entry.id === selectedEntryId;
                const rankChipColor =
                  entry.rank === "Hero"
                    ? { background: "rgba(139, 92, 246, 0.2)", color: "#c4b5fd", border: "1px solid #7c3aed" }
                    : entry.rank === "Lieutenant"
                      ? { background: "rgba(245, 158, 11, 0.2)", color: "#fcd34d", border: "1px solid #f59e0b" }
                      : entry.rank === "Minion"
                        ? { background: "rgba(45, 212, 191, 0.2)", color: "#5eead4", border: "1px solid #14b8a6" }
                        : { background: "rgba(148, 163, 184, 0.2)", color: "#cbd5f5", border: "1px solid #64748b" };
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
                    style={{
                      textAlign: "left",
                      borderRadius: 8,
                      border: isSelected ? "1px solid #2563eb" : "1px solid #1f2935",
                      background: isSelected ? "rgba(37, 99, 235, 0.15)" : "#0c111a",
                      padding: "0.6rem",
                      color: "#e5e7eb",
                      cursor: "pointer",
                      display: "grid",
                      gap: "0.2rem"
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{entry.name}</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
                      <span
                        style={{
                          ...rankChipColor,
                          padding: "0.1rem 0.45rem",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em"
                        }}
                      >
                        {entry.rank || "NPC"}
                      </span>
                      {inlineLink && <span style={{ color: "#94a3b8", fontSize: 11 }}>{inlineLink}</span>}
                    </div>
                    <span style={{ color: "#9ca3af", fontSize: 12 }}>
                      {entry.tier ? `Tier ${entry.tier}` : "Tier —"} • {entry.type || "Unknown type"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section style={{ ...cardStyle, flex: "1 1 0", minWidth: 0 }}>
          {!campaignId && campaigns.length === 0 ? (
            <p style={{ color: "#94a3b8", margin: 0 }}>Create a campaign first to manage a bestiary.</p>
          ) : !selectedCampaignId ? (
            <p style={{ color: "#94a3b8", margin: 0 }}>Select a campaign to view or edit bestiary entries.</p>
          ) : isCreating ? (
            <form onSubmit={handleCreate} style={{ display: "grid", gap: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>Add Creature</h3>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  style={{
                    padding: "0.35rem 0.7rem",
                    borderRadius: 8,
                    border: "1px solid #2b3747",
                    background: "#1f2935",
                    color: "#e5e7eb",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
              </div>
              <CollapsibleSection
                title="Core Info"
                isOpen={panelState.core}
                onToggle={() => togglePanel("core")}
              >
                <label style={{ display: "grid", gap: "0.35rem" }}>
                  <span style={{ fontWeight: 700 }}>Name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ash Drake"
                    style={inputStyle}
                  />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ fontWeight: 700 }}>Type</span>
                    <input
                      value={type}
                      onChange={(event) => setType(event.target.value)}
                      placeholder="Dragon"
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ fontWeight: 700 }}>Rank</span>
                    <select
                      value={rank}
                      onChange={(event) => {
                        const next = event.target.value;
                        setRank(next);
                        if (next !== "Minion") setLieutenantId("");
                        if (next !== "Lieutenant") setHeroId("");
                      }}
                      style={inputStyle}
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
                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ fontWeight: 700 }}>Assigned Lieutenant</span>
                    <select value={lieutenantId} onChange={(event) => setLieutenantId(event.target.value)} style={inputStyle}>
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
                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ fontWeight: 700 }}>Assigned Hero</span>
                    <select value={heroId} onChange={(event) => setHeroId(event.target.value)} style={inputStyle}>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ fontWeight: 700 }}>Tier</span>
                    <input
                      value={tier}
                      onChange={(event) => setTier(event.target.value)}
                      placeholder="3"
                      style={inputStyle}
                      inputMode="numeric"
                    />
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>{tier ? tierLabel(Number(tier)) : "Tier name"}</span>
                  </label>
                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ fontWeight: 700 }}>Max Energy</span>
                    <input
                      value={maxEnergy}
                      onChange={(event) => setMaxEnergy(event.target.value)}
                      placeholder="120"
                      style={inputStyle}
                      inputMode="numeric"
                    />
                  </label>
                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ fontWeight: 700 }}>Max AP</span>
                    <input
                      value={maxAp}
                      onChange={(event) => setMaxAp(event.target.value)}
                      placeholder="6"
                      style={inputStyle}
                      inputMode="numeric"
                    />
                  </label>
                </div>
                <label style={{ display: "grid", gap: "0.35rem" }}>
                  <span style={{ fontWeight: 700 }}>Tactics / Notes</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    placeholder="Breath weapon on round two, vulnerable to cold iron."
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </label>
              </CollapsibleSection>
              <CollapsibleSection
                title="Attributes"
                isOpen={panelState.attributes}
                onToggle={() => togglePanel("attributes")}
              >
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}>
                  {ATTRIBUTE_KEYS.map((key) => (
                    <label key={key} style={{ display: "grid", gap: "0.35rem" }}>
                      <span style={{ fontWeight: 600 }}>{ATTRIBUTE_LABELS[key]}</span>
                      <input
                        value={attributes[key]}
                        onChange={(event) => setAttributes((prev) => ({ ...prev, [key]: event.target.value }))}
                        placeholder="0"
                        style={inputStyle}
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
                  <div style={{ color: "#94a3b8", fontSize: 13 }}>No skills loaded from definitions.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.75rem" }}>
                    {skillDefinitions.map((skill) => {
                      const code = getSkillCode(skill);
                      const bonus = createBonuses[code] ?? 0;
                      const baseValue = skills[code] ?? "";
                      const numericBase = Number(baseValue);
                      const total = (Number.isFinite(numericBase) ? numericBase : 0) + bonus;
                      return (
                        <label key={code} style={{ display: "grid", gap: "0.35rem" }}>
                          <span style={{ fontWeight: 600 }}>{skill.name}</span>
                          <input
                            value={baseValue}
                            onChange={(event) => setSkills((prev) => ({ ...prev, [code]: event.target.value }))}
                            placeholder="0"
                            style={inputStyle}
                            inputMode="numeric"
                          />
                          <span style={{ color: "#94a3b8", fontSize: 12 }}>
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
                <label style={{ display: "grid", gap: "0.35rem" }}>
                  <span style={{ fontWeight: 700 }}>Ability Type</span>
                  <select
                    value={abilityType}
                    onChange={(event) => setAbilityType(event.target.value)}
                    style={inputStyle}
                  >
                    <option value="">None</option>
                    <option value="psionic">Psionic</option>
                    <option value="martial">Martial</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                {abilityType === "custom" && (
                  <div
                    style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}
                  >
                    <label style={{ display: "grid", gap: "0.35rem" }}>
                      <span style={{ fontWeight: 700 }}>Custom Ability Name</span>
                      <input
                        value={customAbilityName}
                        onChange={(event) => setCustomAbilityName(event.target.value)}
                        placeholder="Solar Flare"
                        style={inputStyle}
                      />
                    </label>
                    <label style={{ display: "grid", gap: "0.35rem" }}>
                      <span style={{ fontWeight: 700 }}>Energy Cost</span>
                      <input
                        value={customAbilityEnergy}
                        onChange={(event) => setCustomAbilityEnergy(event.target.value)}
                        placeholder="8"
                        style={inputStyle}
                        inputMode="numeric"
                      />
                    </label>
                    <label style={{ display: "grid", gap: "0.35rem" }}>
                      <span style={{ fontWeight: 700 }}>AP Cost</span>
                      <input
                        value={customAbilityAp}
                        onChange={(event) => setCustomAbilityAp(event.target.value)}
                        placeholder="2"
                        style={inputStyle}
                        inputMode="numeric"
                      />
                    </label>
                  </div>
                )}
              </CollapsibleSection>
              <button
                type="submit"
                style={{
                  padding: "0.6rem 0.9rem",
                  borderRadius: 8,
                  border: "1px solid #1d4ed8",
                  background: "#2563eb",
                  color: "#e6edf7",
                  fontWeight: 700,
                  width: "fit-content",
                  cursor: "pointer"
                }}
              >
                Add Entry
              </button>
            </form>
          ) : selectedEntry ? (
            editingId === selectedEntry.id && editDraft ? (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>Edit Creature</h3>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    style={{
                      padding: "0.35rem 0.7rem",
                      borderRadius: 8,
                      border: "1px solid #2b3747",
                      background: "#1f2935",
                      color: "#e5e7eb",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
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
                    style={inputStyle}
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.6rem" }}>
                    <input
                      value={editDraft.type}
                      onChange={(event) => setEditDraft({ ...editDraft, type: event.target.value })}
                      placeholder="Type"
                      style={inputStyle}
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
                      style={inputStyle}
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
                      style={inputStyle}
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
                      style={inputStyle}
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
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.6rem" }}>
                    <input
                      value={editDraft.tier}
                      onChange={(event) => setEditDraft({ ...editDraft, tier: event.target.value })}
                      placeholder="Tier"
                      style={inputStyle}
                      inputMode="numeric"
                    />
                    <input
                      value={editDraft.maxEnergy}
                      onChange={(event) => setEditDraft({ ...editDraft, maxEnergy: event.target.value })}
                      placeholder="Max Energy"
                      style={inputStyle}
                      inputMode="numeric"
                    />
                    <input
                      value={editDraft.maxAp}
                      onChange={(event) => setEditDraft({ ...editDraft, maxAp: event.target.value })}
                      placeholder="Max AP"
                      style={inputStyle}
                      inputMode="numeric"
                    />
                  </div>
                  <textarea
                    value={editDraft.description}
                    onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })}
                    rows={3}
                    placeholder="Notes"
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </CollapsibleSection>
                <CollapsibleSection
                  title="Attributes"
                  isOpen={panelState.attributes}
                  onToggle={() => togglePanel("attributes")}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.6rem" }}>
                    {ATTRIBUTE_KEYS.map((key) => (
                      <label key={key} style={{ display: "grid", gap: "0.35rem" }}>
                        <span style={{ fontWeight: 600 }}>{ATTRIBUTE_LABELS[key]}</span>
                        <input
                          value={editDraft.attributes[key]}
                          onChange={(event) =>
                            setEditDraft({ ...editDraft, attributes: { ...editDraft.attributes, [key]: event.target.value } })
                          }
                          placeholder="0"
                          style={inputStyle}
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
                    <div style={{ color: "#94a3b8", fontSize: 13 }}>No skills loaded from definitions.</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.6rem" }}>
                      {skillDefinitions.map((skill) => {
                        const code = getSkillCode(skill);
                        const bonus = (editBonuses as Record<string, number>)[code] ?? 0;
                        const baseValue = editDraft.skills[code] ?? "";
                        const numericBase = Number(baseValue);
                        const total = (Number.isFinite(numericBase) ? numericBase : 0) + bonus;
                        return (
                          <label key={code} style={{ display: "grid", gap: "0.35rem" }}>
                            <span style={{ fontWeight: 600 }}>{skill.name}</span>
                            <input
                              value={baseValue}
                              onChange={(event) =>
                                setEditDraft({ ...editDraft, skills: { ...editDraft.skills, [code]: event.target.value } })
                              }
                              placeholder="0"
                              style={inputStyle}
                              inputMode="numeric"
                            />
                            <span style={{ color: "#94a3b8", fontSize: 12 }}>
                              Bonus {bonus >= 0 ? `+${bonus}` : bonus} • Total {total}
                            </span>
                          </label>
                        );
                      })}
                      {Object.keys(editDraft.skills)
                        .filter((code) => !skillCodeSet.has(code))
                        .map((code) => (
                          <label key={code} style={{ display: "grid", gap: "0.35rem" }}>
                            <span style={{ fontWeight: 600 }}>{normalizeSkillCode({ id: code })}</span>
                            <input
                              value={editDraft.skills[code]}
                              onChange={(event) =>
                                setEditDraft({ ...editDraft, skills: { ...editDraft.skills, [code]: event.target.value } })
                              }
                              placeholder="0"
                              style={inputStyle}
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
                  <select
                    value={editDraft.abilityType}
                    onChange={(event) => setEditDraft({ ...editDraft, abilityType: event.target.value })}
                    style={inputStyle}
                  >
                    <option value="">None</option>
                    <option value="psionic">Psionic</option>
                    <option value="martial">Martial</option>
                    <option value="custom">Custom</option>
                  </select>
                  {editDraft.abilityType === "custom" && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.6rem" }}>
                      <input
                        value={editDraft.customAbilityName}
                        onChange={(event) => setEditDraft({ ...editDraft, customAbilityName: event.target.value })}
                        placeholder="Custom Ability"
                        style={inputStyle}
                      />
                      <input
                        value={editDraft.customAbilityEnergy}
                        onChange={(event) => setEditDraft({ ...editDraft, customAbilityEnergy: event.target.value })}
                        placeholder="Energy Cost"
                        style={inputStyle}
                        inputMode="numeric"
                      />
                      <input
                        value={editDraft.customAbilityAp}
                        onChange={(event) => setEditDraft({ ...editDraft, customAbilityAp: event.target.value })}
                        placeholder="AP Cost"
                        style={inputStyle}
                        inputMode="numeric"
                      />
                    </div>
                  )}
                </CollapsibleSection>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={saveEdit}
                    style={{
                      padding: "0.45rem 0.8rem",
                      borderRadius: 8,
                      border: "1px solid #1d4ed8",
                      background: "#2563eb",
                      color: "#e6edf7",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    style={{
                      padding: "0.45rem 0.8rem",
                      borderRadius: 8,
                      border: "1px solid #2b3747",
                      background: "#1f2935",
                      color: "#e5e7eb",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                  <h3 style={{ margin: 0 }}>{selectedEntry.name}</h3>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => startEdit(selectedEntry)}
                      style={{
                        padding: "0.4rem 0.7rem",
                        borderRadius: 8,
                        border: "1px solid #2b3747",
                        background: "#1f2935",
                        color: "#e5e7eb",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEntry(selectedEntry.id)}
                      style={{
                        padding: "0.4rem 0.7rem",
                        borderRadius: 8,
                        border: "1px solid #3f2b2b",
                        background: "#2c1515",
                        color: "#fecaca",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    border: "1px solid #1f2935",
                    borderRadius: 12,
                    padding: "1rem",
                    background: "#0c111a",
                    display: "grid",
                    gap: "0.85rem"
                  }}
                >
                  <div style={{ display: "grid", gap: "0.25rem" }}>
                    <div style={{ color: "#9ca3af", fontSize: 13 }}>
                      {selectedEntry.type || "Unknown type"} • {selectedEntry.rank || "NPC"}
                    </div>
                    {selectedEntry.rank === "Minion" && selectedEntry.lieutenantId && (
                      <div style={{ color: "#94a3b8", fontSize: 12 }}>
                        → Lt: {entryNameById.get(selectedEntry.lieutenantId) ?? "Unassigned"}
                      </div>
                    )}
                    {selectedEntry.rank === "Lieutenant" && selectedEntry.heroId && (
                      <div style={{ color: "#94a3b8", fontSize: 12 }}>
                        → Hero: {entryNameById.get(selectedEntry.heroId) ?? "Unassigned"}
                      </div>
                    )}
                    {selectedEntry.description && (
                      <p style={{ margin: 0, color: "#cbd5e1", fontSize: 14 }}>{selectedEntry.description}</p>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem" }}>
                    <div>
                      <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase" }}>Tier</div>
                      <div style={{ fontWeight: 600 }}>
                        {selectedEntry.tier || "—"}{" "}
                        {selectedEntry.tier ? `(${tierLabel(Number(selectedEntry.tier))})` : ""}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase" }}>Max Energy</div>
                      <div style={{ fontWeight: 600 }}>{selectedEntry.maxEnergy || "—"}</div>
                    </div>
                    <div>
                      <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase" }}>Max AP</div>
                      <div style={{ fontWeight: 600 }}>{selectedEntry.maxAp || "—"}</div>
                    </div>
                    <div>
                      <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase" }}>Ability</div>
                      <div style={{ fontWeight: 600 }}>
                        {selectedEntry.abilityType
                          ? selectedEntry.abilityType === "custom"
                            ? selectedEntry.customAbilityName || "Custom"
                            : selectedEntry.abilityType
                          : "None"}
                      </div>
                      {selectedEntry.abilityType === "custom" && (
                        <div style={{ color: "#94a3b8", fontSize: 12 }}>
                          Energy {selectedEntry.customAbilityEnergy || "—"} • AP {selectedEntry.customAbilityAp || "—"}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ fontWeight: 700 }}>Attributes</span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.6rem" }}>
                      {ATTRIBUTE_KEYS.map((key) => (
                        <div
                          key={key}
                          style={{
                            border: "1px solid #1f2935",
                            borderRadius: 8,
                            padding: "0.5rem",
                            background: "#0b1017"
                          }}
                        >
                          <div style={{ color: "#94a3b8", fontSize: 12 }}>{ATTRIBUTE_LABELS[key]}</div>
                          <div style={{ fontWeight: 600 }}>{selectedEntry.attributes[key] || "0"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    <span style={{ fontWeight: 700 }}>Top Skills</span>
                    {skillDefinitions.length === 0 ? (
                      <div style={{ color: "#94a3b8", fontSize: 13 }}>No skills loaded from definitions.</div>
                    ) : topSkillSummary.length === 0 ? (
                      <div style={{ color: "#94a3b8", fontSize: 13 }}>No notable skills listed.</div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.6rem" }}>
                        {topSkillSummary.map((skill) => (
                          <div
                            key={skill.code}
                            style={{
                              border: "1px solid #1f2935",
                              borderRadius: 8,
                              padding: "0.5rem",
                              background: "#0b1017",
                              display: "grid",
                              gap: "0.2rem"
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{skill.name}</span>
                            <span style={{ color: "#94a3b8", fontSize: 12 }}>
                              Total {skill.total} (Base {skill.base} • Bonus {skill.bonus >= 0 ? `+${skill.bonus}` : skill.bonus})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          ) : (
            <div style={{ color: "#94a3b8" }}>Select an entry or create a new one.</div>
          )}
        </section>
      </div>
    </div>
  );
};
