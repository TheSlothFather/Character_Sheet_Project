import React from "react";
import { useParams } from "react-router-dom";
import { gmApi, type BestiaryEntry as ApiBestiaryEntry, type Campaign } from "../../api/gm";

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

type BestiaryEntry = {
  id: string;
  name: string;
  type: string;
  threat: string;
  description: string;
  tier: string;
  maxEnergy: string;
  maxAp: string;
  skillValues: string;
  attributeValues: string;
  abilityType: string;
  customAbilityName: string;
  customAbilityEnergy: string;
  customAbilityAp: string;
};

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

const buildJsonString = (value: Record<string, unknown>): string => {
  const keys = Object.keys(value);
  if (keys.length === 0) return "";
  return JSON.stringify(value, null, 2);
};

const mapApiEntry = (entry: ApiBestiaryEntry): BestiaryEntry => {
  const statsSkills = entry.statsSkills;
  const attributes = entry.attributes;
  const type = typeof statsSkills?.type === "string" ? statsSkills.type : "";
  const threat = typeof statsSkills?.threat === "string" ? statsSkills.threat : "";
  const description = typeof statsSkills?.description === "string" ? statsSkills.description : "";
  const tier = readNumberString(statsSkills?.tier ?? attributes?.tier);
  const maxEnergy = readNumberString(attributes?.energy);
  const maxAp = readNumberString(attributes?.ap);
  const attributeValues: Record<string, unknown> = { ...(attributes ?? {}) };
  delete attributeValues.energy;
  delete attributeValues.ap;
  delete attributeValues.tier;
  const skillValues = entry.skills ?? {};
  const primaryAbility = entry.abilities?.[0];
  const abilityType = typeof primaryAbility?.type === "string" ? primaryAbility.type : "";
  const customAbilityName = typeof primaryAbility?.name === "string" ? primaryAbility.name : "";
  const customAbilityEnergy = readNumberString(primaryAbility?.energyCost);
  const customAbilityAp = readNumberString(primaryAbility?.apCost);
  return {
    id: entry.id,
    name: entry.name,
    type,
    threat,
    description,
    tier,
    maxEnergy,
    maxAp,
    skillValues: buildJsonString(skillValues as Record<string, unknown>),
    attributeValues: buildJsonString(attributeValues),
    abilityType,
    customAbilityName,
    customAbilityEnergy,
    customAbilityAp
  };
};

const toStatsSkills = (entry: BestiaryEntry, tierValue?: number): Record<string, string | number> => {
  const statsSkills: Record<string, string | number> = {};
  const type = entry.type.trim();
  const threat = entry.threat.trim();
  const description = entry.description.trim();
  if (type) statsSkills.type = type;
  if (threat) statsSkills.threat = threat;
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

const parseJsonObject = (label: string, value: string): { value?: Record<string, unknown>; error?: string } => {
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: `${label} must be a JSON object.` };
    }
    return { value: parsed as Record<string, unknown> };
  } catch (parseError) {
    return { error: `${label} must be valid JSON.` };
  }
};

const parseSkillValues = (value: string): { value?: Record<string, number>; error?: string } => {
  const parsed = parseJsonObject("Skill Values", value);
  if (parsed.error || !parsed.value) return parsed;
  const normalized: Record<string, number> = {};
  for (const [key, raw] of Object.entries(parsed.value)) {
    const numberValue = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(numberValue)) {
      return { error: `Skill Values entries must be numbers (invalid: ${key}).` };
    }
    normalized[key] = numberValue;
  }
  return { value: normalized };
};

const parseAttributeValues = (value: string): { value?: Record<string, unknown>; error?: string } =>
  parseJsonObject("Attribute Values", value);

export const BestiaryPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string>(campaignId ?? "");
  const [entries, setEntries] = React.useState<BestiaryEntry[]>([]);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState("");
  const [threat, setThreat] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tier, setTier] = React.useState("");
  const [maxEnergy, setMaxEnergy] = React.useState("");
  const [maxAp, setMaxAp] = React.useState("");
  const [skillValues, setSkillValues] = React.useState("");
  const [attributeValues, setAttributeValues] = React.useState("");
  const [abilityType, setAbilityType] = React.useState("");
  const [customAbilityName, setCustomAbilityName] = React.useState("");
  const [customAbilityEnergy, setCustomAbilityEnergy] = React.useState("");
  const [customAbilityAp, setCustomAbilityAp] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<BestiaryEntry | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setType("");
    setThreat("");
    setDescription("");
    setTier("");
    setMaxEnergy("");
    setMaxAp("");
    setSkillValues("");
    setAttributeValues("");
    setAbilityType("");
    setCustomAbilityName("");
    setCustomAbilityEnergy("");
    setCustomAbilityAp("");
  };

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
      setEntries([]);
      return;
    }
    let active = true;
    const loadEntries = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await gmApi.listBestiaryEntries(selectedCampaignId);
        if (!active) return;
        setEntries(data.map(mapApiEntry));
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
    const skillsParsed = parseSkillValues(skillValues);
    if (skillsParsed.error) {
      setError(skillsParsed.error);
      return;
    }
    const attributesParsed = parseAttributeValues(attributeValues);
    if (attributesParsed.error) {
      setError(attributesParsed.error);
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
    const attributesPayload: Record<string, unknown> = {
      ...(attributesParsed.value ?? {})
    };
    if (maxEnergyParsed.value !== undefined) attributesPayload.energy = maxEnergyParsed.value;
    if (maxApParsed.value !== undefined) attributesPayload.ap = maxApParsed.value;
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
        threat,
        description,
        tier,
        maxEnergy,
        maxAp,
        skillValues,
        attributeValues,
        abilityType,
        customAbilityName,
        customAbilityEnergy,
        customAbilityAp
      };
      const created = await gmApi.createBestiaryEntry({
        campaignId: selectedCampaignId,
        name: trimmed,
        statsSkills: toStatsSkills(draftEntry, tierParsed.value),
        attributes: Object.keys(attributesPayload).length ? attributesPayload : undefined,
        skills: skillsParsed.value,
        abilities: abilitiesPayload
      });
      setEntries((prev) => [mapApiEntry(created), ...prev]);
      resetForm();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create bestiary entry.");
    }
  };

  const startEdit = (entry: BestiaryEntry) => {
    setEditingId(entry.id);
    setEditDraft({ ...entry });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
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
    const skillsParsed = parseSkillValues(editDraft.skillValues);
    if (skillsParsed.error) {
      setError(skillsParsed.error);
      return;
    }
    const attributesParsed = parseAttributeValues(editDraft.attributeValues);
    if (attributesParsed.error) {
      setError(attributesParsed.error);
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
    const attributesPayload: Record<string, unknown> = {
      ...(attributesParsed.value ?? {})
    };
    const shouldClearAttributes =
      !editDraft.attributeValues.trim() && maxEnergyParsed.value === undefined && maxApParsed.value === undefined;
    if (maxEnergyParsed.value !== undefined) attributesPayload.energy = maxEnergyParsed.value;
    if (maxApParsed.value !== undefined) attributesPayload.ap = maxApParsed.value;
    const skillsPayload = editDraft.skillValues.trim() ? skillsParsed.value : {};
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
      : [];
    const attributesToSend = shouldClearAttributes
      ? {}
      : Object.keys(attributesPayload).length
        ? attributesPayload
        : undefined;
    try {
      const updated = await gmApi.updateBestiaryEntry(editDraft.id, {
        name: editDraft.name.trim(),
        statsSkills: toStatsSkills(editDraft, tierParsed.value),
        attributes: attributesToSend,
        skills: skillsPayload,
        abilities: abilitiesPayload
      });
      setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? mapApiEntry(updated) : entry)));
      cancelEdit();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update bestiary entry.");
    }
  };

  const deleteEntry = async (id: string) => {
    setError(null);
    try {
      await gmApi.deleteBestiaryEntry(id);
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      if (editingId === id) cancelEdit();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete bestiary entry.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Bestiary</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#cbd5e1" }}>
          Maintain monster entries with quick edit controls.
        </p>
      </header>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Add Creature</h3>
        {error && <div style={{ marginBottom: "0.75rem", color: "#fca5a5" }}>{error}</div>}
        {loading && <div style={{ marginBottom: "0.75rem", color: "#94a3b8" }}>Loading...</div>}
        {!campaignId && campaigns.length === 0 ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>Create a campaign first to manage a bestiary.</p>
        ) : (
        <form onSubmit={handleCreate} style={{ display: "grid", gap: "0.75rem" }}>
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
              <span style={{ fontWeight: 700 }}>Threat Tier</span>
              <input
                value={threat}
                onChange={(event) => setThreat(event.target.value)}
                placeholder="Tier 3"
                style={inputStyle}
              />
            </label>
          </div>
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
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Skill Values (JSON)</span>
              <textarea
                value={skillValues}
                onChange={(event) => setSkillValues(event.target.value)}
                rows={4}
                placeholder='{"athletics": 4, "lore": 2}'
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Attribute Values (JSON)</span>
              <textarea
                value={attributeValues}
                onChange={(event) => setAttributeValues(event.target.value)}
                rows={4}
                placeholder='{"strength": 5, "agility": 3}'
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>
          </div>
          <div style={{ display: "grid", gap: "0.75rem" }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
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
          </div>
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
        )}
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Entries</h3>
        {entries.length === 0 ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>No entries yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {entries.map((entry) => {
              const isEditing = editingId === entry.id;
              return (
                <div
                  key={entry.id}
                  style={{
                    border: "1px solid #1f2935",
                    borderRadius: 10,
                    padding: "0.75rem",
                    background: "#0c111a",
                    display: "grid",
                    gap: "0.6rem"
                  }}
                >
                  {isEditing && editDraft ? (
                    <div style={{ display: "grid", gap: "0.6rem" }}>
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
                        <input
                          value={editDraft.threat}
                          onChange={(event) => setEditDraft({ ...editDraft, threat: event.target.value })}
                          placeholder="Threat"
                          style={inputStyle}
                        />
                      </div>
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
                      <textarea
                        value={editDraft.skillValues}
                        onChange={(event) => setEditDraft({ ...editDraft, skillValues: event.target.value })}
                        rows={3}
                        placeholder="Skill Values (JSON)"
                        style={{ ...inputStyle, resize: "vertical" }}
                      />
                      <textarea
                        value={editDraft.attributeValues}
                        onChange={(event) => setEditDraft({ ...editDraft, attributeValues: event.target.value })}
                        rows={3}
                        placeholder="Attribute Values (JSON)"
                        style={{ ...inputStyle, resize: "vertical" }}
                      />
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
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{entry.name}</div>
                          <div style={{ color: "#9ca3af", fontSize: 13 }}>
                            {entry.type || "Unknown type"} • {entry.threat || "Unrated"}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => startEdit(entry)}
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
                            onClick={() => deleteEntry(entry.id)}
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
                      {entry.description && (
                        <p style={{ margin: 0, color: "#cbd5e1", fontSize: 14 }}>{entry.description}</p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
