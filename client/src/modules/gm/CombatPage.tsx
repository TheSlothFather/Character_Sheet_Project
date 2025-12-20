import React from "react";
import { useParams } from "react-router-dom";
import {
  gmApi,
  type Campaign,
  type CampaignCombatant,
  type BestiaryEntry as ApiBestiaryEntry
} from "../../api/gm";

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

type CombatFaction = "ally" | "enemy";

type CombatEntry = CampaignCombatant & {
  faction: CombatFaction;
  isActive: boolean;
};

const readNumber = (value: unknown): number | undefined => (typeof value === "number" && !Number.isNaN(value) ? value : undefined);

const normalizeFaction = (value?: string): CombatFaction => {
  const lowered = value?.trim().toLowerCase() ?? "";
  if (lowered.startsWith("ally")) return "ally";
  return "enemy";
};

const mapCombatant = (combatant: CampaignCombatant): CombatEntry => ({
  ...combatant,
  faction: normalizeFaction(combatant.faction),
  isActive: combatant.isActive ?? false
});

const fallbackNumber = (value?: number | null, fallback = 0): number =>
  typeof value === "number" && !Number.isNaN(value) ? value : fallback;

const calculateEnergyGain = (ap: number, tier: number): number => ap * tier * 3;

const deriveTier = (entry: ApiBestiaryEntry): number | undefined => {
  const stats = entry.statsSkills ?? {};
  const attributes = entry.attributes ?? {};
  return readNumber(stats.tier) ?? readNumber(attributes.tier);
};

const deriveEnergy = (entry: ApiBestiaryEntry): number | undefined => {
  const attributes = entry.attributes ?? {};
  return readNumber(attributes.energy);
};

const deriveAp = (entry: ApiBestiaryEntry): number | undefined => {
  const attributes = entry.attributes ?? {};
  return readNumber(attributes.ap);
};

export const CombatPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string>(campaignId ?? "");
  const [combatants, setCombatants] = React.useState<CombatEntry[]>([]);
  const [bestiaryEntries, setBestiaryEntries] = React.useState<ApiBestiaryEntry[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [bulkUpdating, setBulkUpdating] = React.useState(false);
  const [updatingIds, setUpdatingIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [addingId, setAddingId] = React.useState<string>("");
  const [addingFaction, setAddingFaction] = React.useState<CombatFaction>("enemy");
  const [addingActive, setAddingActive] = React.useState(true);
  const [endTurnSpend, setEndTurnSpend] = React.useState<Record<string, string>>({});

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
      setCombatants([]);
      setBestiaryEntries([]);
      return;
    }
    let active = true;
    const loadEntries = async () => {
      setLoading(true);
      setError(null);
      try {
        const [combatantData, bestiaryData] = await Promise.all([
          gmApi.listCombatants(selectedCampaignId),
          gmApi.listBestiaryEntries(selectedCampaignId)
        ]);
        if (!active) return;
        setCombatants(combatantData.map(mapCombatant));
        setBestiaryEntries(bestiaryData);
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

  const updateCombatant = async (combatantId: string, updates: Partial<CampaignCombatant>) => {
    setUpdatingIds((prev) => (prev.includes(combatantId) ? prev : [...prev, combatantId]));
    setError(null);
    try {
      const updated = await gmApi.updateCombatant(combatantId, updates);
      const mapped = mapCombatant(updated);
      setCombatants((prev) => prev.map((entry) => (entry.id === combatantId ? mapped : entry)));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update combatant.");
    } finally {
      setUpdatingIds((prev) => prev.filter((id) => id !== combatantId));
    }
  };

  const updateSelectedStatus = async (isActive: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkUpdating(true);
    setError(null);
    try {
      const updates = await Promise.all(
        Array.from(selectedIds).map(async (combatantId) => {
          const updated = await gmApi.updateCombatant(combatantId, { isActive });
          return mapCombatant(updated);
        })
      );
      setCombatants((prev) => prev.map((entry) => updates.find((update) => update.id === entry.id) ?? entry));
      setSelectedIds(new Set());
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update selected combatants.");
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleAddCombatant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCampaignId || !addingId) return;
    setError(null);
    const entry = bestiaryEntries.find((item) => item.id === addingId);
    if (!entry) return;
    try {
      const created = await gmApi.createCombatant({
        campaignId: selectedCampaignId,
        bestiaryEntryId: entry.id,
        faction: addingFaction,
        isActive: addingActive,
        tier: deriveTier(entry),
        energyCurrent: deriveEnergy(entry),
        apCurrent: deriveAp(entry)
      });
      setCombatants((prev) => [mapCombatant(created), ...prev]);
      setAddingId("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to add combatant.");
    }
  };

  const handleStartTurn = async (entry: CombatEntry) => {
    const apCurrent = fallbackNumber(entry.apCurrent);
    const tier = fallbackNumber(entry.tier);
    if (apCurrent <= 0 || tier <= 0) return;
    const energyCurrent = fallbackNumber(entry.energyCurrent);
    const energyGain = calculateEnergyGain(apCurrent, tier);
    await updateCombatant(entry.id, {
      energyCurrent: energyCurrent + energyGain
    });
  };

  const handleEndTurn = async (entry: CombatEntry) => {
    const apCurrent = fallbackNumber(entry.apCurrent);
    const tier = fallbackNumber(entry.tier);
    if (apCurrent <= 0 || tier <= 0) return;
    const rawSpend = endTurnSpend[entry.id];
    const spendValue = rawSpend === "" || rawSpend === undefined ? 0 : Number(rawSpend);
    if (!Number.isFinite(spendValue) || spendValue <= 0) return;
    const clampedSpend = Math.min(Math.max(spendValue, 0), apCurrent);
    const energyCurrent = fallbackNumber(entry.energyCurrent);
    const energyGain = calculateEnergyGain(clampedSpend, tier);
    await updateCombatant(entry.id, {
      apCurrent: apCurrent - clampedSpend,
      energyCurrent: energyCurrent + energyGain
    });
    setEndTurnSpend((prev) => ({ ...prev, [entry.id]: "" }));
  };

  const filteredEntries = showInactive ? combatants : combatants.filter((entry) => entry.isActive);
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
              Selected: {selectedIds.size} | Active: {combatants.filter((entry) => entry.isActive).length}
            </span>
            <button
              type="button"
              onClick={() => updateSelectedStatus(true)}
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
              onClick={() => updateSelectedStatus(false)}
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

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Add Combatant</h3>
        <form onSubmit={handleAddCombatant} style={{ display: "grid", gap: "0.75rem" }}>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 700 }}>Bestiary Entry</span>
            <select value={addingId} onChange={(event) => setAddingId(event.target.value)} style={inputStyle}>
              <option value="">Select an entry</option>
              {bestiaryEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Faction</span>
              <select
                value={addingFaction}
                onChange={(event) => setAddingFaction(event.target.value as CombatFaction)}
                style={inputStyle}
              >
                <option value="ally">Ally</option>
                <option value="enemy">Enemy</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Active</span>
              <select
                value={addingActive ? "active" : "inactive"}
                onChange={(event) => setAddingActive(event.target.value === "active")}
                style={inputStyle}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={!addingId}
            style={{
              padding: "0.6rem 0.9rem",
              borderRadius: 8,
              border: "1px solid #1d4ed8",
              background: "#2563eb",
              color: "#e6edf7",
              fontWeight: 700,
              width: "fit-content",
              cursor: addingId ? "pointer" : "not-allowed",
              opacity: addingId ? 1 : 0.6
            }}
          >
            Add Combatant
          </button>
        </form>
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
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))"
                }}
              >
                {group.data.map((entry) => {
                  const isSelected = selectedIds.has(entry.id);
                  const isUpdating = updatingIds.includes(entry.id) || bulkUpdating;
                  const statusColor = entry.isActive ? "#9ae6b4" : "#fbbf24";
                  const energyCurrent = fallbackNumber(entry.energyCurrent);
                  const apCurrent = fallbackNumber(entry.apCurrent);
                  const energyMax = entry.energyMax ?? null;
                  const apMax = entry.apMax ?? null;
                  const tier = fallbackNumber(entry.tier);
                  const startTurnGain = entry.isActive && apCurrent > 0 && tier > 0 ? calculateEnergyGain(apCurrent, tier) : 0;
                  const rawSpend = endTurnSpend[entry.id] ?? "";
                  const spendValue = rawSpend === "" ? 0 : Number(rawSpend);
                  const clampedSpend = Number.isFinite(spendValue) ? Math.min(Math.max(spendValue, 0), apCurrent) : 0;
                  const endTurnGain = entry.isActive && clampedSpend > 0 && tier > 0 ? calculateEnergyGain(clampedSpend, tier) : 0;
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
                          {entry.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      {entry.isActive && (
                        <div style={{ display: "grid", gap: "0.35rem", color: "#cbd5e1", fontSize: 13 }}>
                          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                            <span>
                              <strong>Energy:</strong> {energyCurrent}
                              {energyMax !== null ? ` / ${energyMax}` : ""}
                            </span>
                            <span>
                              <strong>AP:</strong> {apCurrent}
                              {apMax !== null ? ` / ${apMax}` : ""}
                            </span>
                            <span>
                              <strong>Tier:</strong> {tier > 0 ? tier : "—"}
                            </span>
                          </div>
                          <span style={{ color: "#94a3b8" }}>Formula: energy gain = AP × Tier × 3</span>
                        </div>
                      )}
                      <label style={{ display: "grid", gap: "0.35rem" }}>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>Faction</span>
                        <select
                          value={entry.faction}
                          onChange={(event) => updateCombatant(entry.id, { faction: event.target.value })}
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
                          value={entry.isActive ? "active" : "inactive"}
                          onChange={(event) => updateCombatant(entry.id, { isActive: event.target.value === "active" })}
                          style={inputStyle}
                          disabled={isUpdating}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: "0.35rem" }}>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>Initiative</span>
                        <input
                          type="number"
                          value={entry.initiative ?? ""}
                          onChange={(event) =>
                            updateCombatant(entry.id, {
                              initiative: event.target.value === "" ? null : Number(event.target.value)
                            })
                          }
                          style={inputStyle}
                          disabled={isUpdating}
                        />
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.5rem" }}>
                        <label style={{ display: "grid", gap: "0.35rem" }}>
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>Energy</span>
                          <input
                            type="number"
                            value={entry.energyCurrent ?? ""}
                            onChange={(event) =>
                              updateCombatant(entry.id, {
                                energyCurrent: event.target.value === "" ? null : Number(event.target.value)
                              })
                            }
                            style={inputStyle}
                            disabled={isUpdating}
                          />
                        </label>
                        <label style={{ display: "grid", gap: "0.35rem" }}>
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>AP</span>
                          <input
                            type="number"
                            value={entry.apCurrent ?? ""}
                            onChange={(event) =>
                              updateCombatant(entry.id, {
                                apCurrent: event.target.value === "" ? null : Number(event.target.value)
                              })
                            }
                            style={inputStyle}
                            disabled={isUpdating}
                          />
                        </label>
                      </div>
                      {entry.isActive && (
                        <div style={{ display: "grid", gap: "0.5rem", padding: "0.6rem", borderRadius: 10, border: "1px solid #1f2935" }}>
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => handleStartTurn(entry)}
                              disabled={isUpdating || apCurrent <= 0 || tier <= 0}
                              style={{
                                padding: "0.45rem 0.8rem",
                                borderRadius: 8,
                                border: "1px solid #2563eb",
                                background: "#1d4ed8",
                                color: "#e0f2fe",
                                fontWeight: 700,
                                cursor: isUpdating || apCurrent <= 0 || tier <= 0 ? "not-allowed" : "pointer",
                                opacity: isUpdating || apCurrent <= 0 || tier <= 0 ? 0.6 : 1
                              }}
                            >
                              Start Turn
                            </button>
                            <span style={{ fontSize: 12, color: "#94a3b8" }}>
                              Gain {startTurnGain} energy = {apCurrent} × {tier || "?"} × 3
                            </span>
                          </div>
                          <div style={{ display: "grid", gap: "0.45rem" }}>
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                              <input
                                type="number"
                                min={0}
                                max={apCurrent}
                                value={rawSpend}
                                onChange={(event) =>
                                  setEndTurnSpend((prev) => ({
                                    ...prev,
                                    [entry.id]: event.target.value
                                  }))
                                }
                                placeholder="AP to spend"
                                style={{ ...inputStyle, width: 140 }}
                                disabled={isUpdating || apCurrent <= 0 || tier <= 0}
                              />
                              <button
                                type="button"
                                onClick={() => handleEndTurn(entry)}
                                disabled={isUpdating || apCurrent <= 0 || tier <= 0 || clampedSpend <= 0}
                                style={{
                                  padding: "0.45rem 0.8rem",
                                  borderRadius: 8,
                                  border: "1px solid #a855f7",
                                  background: "#6b21a8",
                                  color: "#f5d0fe",
                                  fontWeight: 700,
                                  cursor:
                                    isUpdating || apCurrent <= 0 || tier <= 0 || clampedSpend <= 0 ? "not-allowed" : "pointer",
                                  opacity: isUpdating || apCurrent <= 0 || tier <= 0 || clampedSpend <= 0 ? 0.6 : 1
                                }}
                              >
                                End Turn
                              </button>
                            </div>
                            <span style={{ fontSize: 12, color: "#94a3b8" }}>
                              Spend {clampedSpend} AP → gain {endTurnGain} energy = {clampedSpend} × {tier || "?"} × 3
                            </span>
                          </div>
                        </div>
                      )}
                      <label style={{ display: "grid", gap: "0.35rem" }}>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>Notes</span>
                        <textarea
                          value={entry.notes ?? ""}
                          onChange={(event) => updateCombatant(entry.id, { notes: event.target.value })}
                          rows={2}
                          style={{ ...inputStyle, resize: "vertical" }}
                          disabled={isUpdating}
                        />
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
