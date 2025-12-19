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

type CombatStatus = "active" | "inactive";

type CombatFaction = "ally" | "enemy";

type CombatEntry = {
  id: string;
  name: string;
  combatStatus: CombatStatus;
  faction: CombatFaction;
  statsSkills: Record<string, unknown>;
};

const readString = (value: unknown) => (typeof value === "string" ? value : "");

const normalizeCombatStatus = (value: string): CombatStatus => {
  const lowered = value.trim().toLowerCase();
  if (lowered === "active") return "active";
  if (lowered === "inactive") return "inactive";
  return "inactive";
};

const normalizeFaction = (value: string): CombatFaction => {
  const lowered = value.trim().toLowerCase();
  if (lowered.startsWith("ally")) return "ally";
  if (lowered.startsWith("enemy")) return "enemy";
  return "enemy";
};

const mapApiEntry = (entry: ApiBestiaryEntry): CombatEntry => {
  const statsSkills = entry.statsSkills ?? {};
  return {
    id: entry.id,
    name: entry.name,
    combatStatus: normalizeCombatStatus(readString(statsSkills.combat_status)),
    faction: normalizeFaction(readString(statsSkills.faction)),
    statsSkills
  };
};

const updateStatsSkills = (entry: CombatEntry, updates: Partial<Pick<CombatEntry, "combatStatus" | "faction">>) => {
  const next = { ...entry.statsSkills };
  if (updates.combatStatus) next.combat_status = updates.combatStatus;
  if (updates.faction) next.faction = updates.faction;
  return next;
};

export const CombatPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string>(campaignId ?? "");
  const [entries, setEntries] = React.useState<CombatEntry[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [bulkUpdating, setBulkUpdating] = React.useState(false);
  const [updatingIds, setUpdatingIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

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
        setError(loadError instanceof Error ? loadError.message : "Failed to load combat entries.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadEntries();
    return () => {
      active = false;
    };
  }, [selectedCampaignId]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const updateEntry = async (entryId: string, updates: Partial<Pick<CombatEntry, "combatStatus" | "faction">>) => {
    const target = entries.find((entry) => entry.id === entryId);
    if (!target) return;
    setUpdatingIds((prev) => (prev.includes(entryId) ? prev : [...prev, entryId]));
    setError(null);
    try {
      const updated = await gmApi.updateBestiaryEntry(entryId, {
        statsSkills: updateStatsSkills(target, updates)
      });
      const mapped = mapApiEntry(updated);
      setEntries((prev) => prev.map((entry) => (entry.id === entryId ? mapped : entry)));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update combat status.");
    } finally {
      setUpdatingIds((prev) => prev.filter((id) => id !== entryId));
    }
  };

  const updateSelectedStatus = async (status: CombatStatus) => {
    if (selectedIds.size === 0) return;
    setBulkUpdating(true);
    setError(null);
    try {
      const updates = await Promise.all(
        Array.from(selectedIds).map(async (entryId) => {
          const entry = entries.find((item) => item.id === entryId);
          if (!entry) return null;
          const updated = await gmApi.updateBestiaryEntry(entryId, {
            statsSkills: updateStatsSkills(entry, { combatStatus: status })
          });
          return mapApiEntry(updated);
        })
      );
      setEntries((prev) =>
        prev.map((entry) => updates.find((update) => update?.id === entry.id) ?? entry)
      );
      setSelectedIds(new Set());
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update selected combatants.");
    } finally {
      setBulkUpdating(false);
    }
  };

  const filteredEntries = showInactive ? entries : entries.filter((entry) => entry.combatStatus === "active");
  const allies = filteredEntries.filter((entry) => entry.faction === "ally");
  const enemies = filteredEntries.filter((entry) => entry.faction === "enemy");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Combat</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#cbd5e1" }}>
          Track active combatants and mark allies versus enemies in the current scene.
        </p>
      </header>

      <section style={cardStyle}>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            {!campaignId && (
              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span style={{ fontWeight: 700 }}>Campaign</span>
                <select
                  value={selectedCampaignId}
                  onChange={(event) => setSelectedCampaignId(event.target.value)}
                  style={inputStyle}
                >
                  {campaigns.length === 0 ? (
                    <option value="">No campaigns</option>
                  ) : (
                    campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            )}
            <label style={{ display: "grid", gap: "0.35rem", alignSelf: "end" }}>
              <span style={{ fontWeight: 700 }}>View</span>
              <button
                type="button"
                onClick={() => setShowInactive((prev) => !prev)}
                style={{
                  padding: "0.55rem 0.9rem",
                  borderRadius: 8,
                  border: "1px solid #2f3542",
                  background: showInactive ? "#1f2935" : "#111827",
                  color: "#e5e7eb",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                {showInactive ? "Hide inactive" : "Show inactive"}
              </button>
            </label>
          </div>
          {error && <div style={{ color: "#fca5a5" }}>{error}</div>}
          {loading && <div style={{ color: "#94a3b8" }}>Loading combat roster...</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <span style={{ color: "#94a3b8", fontSize: 13 }}>
              Selected: {selectedIds.size} | Active: {entries.filter((entry) => entry.combatStatus === "active").length}
            </span>
            <button
              type="button"
              onClick={() => updateSelectedStatus("active")}
              disabled={selectedIds.size === 0 || bulkUpdating}
              style={{
                padding: "0.45rem 0.8rem",
                borderRadius: 8,
                border: "1px solid #16a34a",
                background: "#166534",
                color: "#dcfce7",
                fontWeight: 600,
                cursor: selectedIds.size === 0 || bulkUpdating ? "not-allowed" : "pointer",
                opacity: selectedIds.size === 0 || bulkUpdating ? 0.6 : 1
              }}
            >
              Set Active
            </button>
            <button
              type="button"
              onClick={() => updateSelectedStatus("inactive")}
              disabled={selectedIds.size === 0 || bulkUpdating}
              style={{
                padding: "0.45rem 0.8rem",
                borderRadius: 8,
                border: "1px solid #7c2d12",
                background: "#3f1d12",
                color: "#fed7aa",
                fontWeight: 600,
                cursor: selectedIds.size === 0 || bulkUpdating ? "not-allowed" : "pointer",
                opacity: selectedIds.size === 0 || bulkUpdating ? 0.6 : 1
              }}
            >
              Set Inactive
            </button>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gap: "1rem" }}>
        {[{ title: "Allies", data: allies }, { title: "Enemies", data: enemies }].map((group) => (
          <div key={group.title} style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>{group.title}</h3>
            {group.data.length === 0 ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>No {group.title.toLowerCase()} to show.</p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "0.75rem",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
                }}
              >
                {group.data.map((entry) => {
                  const isSelected = selectedIds.has(entry.id);
                  const isUpdating = updatingIds.includes(entry.id) || bulkUpdating;
                  const statusColor = entry.combatStatus === "active" ? "#9ae6b4" : "#fbbf24";
                  return (
                    <div
                      key={entry.id}
                      style={{
                        border: "1px solid #1f2935",
                        borderRadius: 12,
                        padding: "0.75rem",
                        background: isSelected ? "#111827" : "#0c111a",
                        display: "grid",
                        gap: "0.6rem"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelection(entry.id)}
                            disabled={isUpdating}
                          />
                          <span style={{ fontWeight: 700 }}>{entry.name}</span>
                        </label>
                        <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>
                          {entry.combatStatus === "active" ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <label style={{ display: "grid", gap: "0.35rem" }}>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>Faction</span>
                        <select
                          value={entry.faction}
                          onChange={(event) => updateEntry(entry.id, { faction: event.target.value as CombatFaction })}
                          style={inputStyle}
                          disabled={isUpdating}
                        >
                          <option value="ally">Ally</option>
                          <option value="enemy">Enemy</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: "0.35rem" }}>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>Combat status</span>
                        <select
                          value={entry.combatStatus}
                          onChange={(event) => updateEntry(entry.id, { combatStatus: event.target.value as CombatStatus })}
                          style={inputStyle}
                          disabled={isUpdating}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
};
