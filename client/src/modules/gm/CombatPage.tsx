import React from "react";
import { useParams } from "react-router-dom";
import {
  gmApi,
  type Campaign,
  type CampaignCombatant,
  type BestiaryEntry as ApiBestiaryEntry,
  type CombatState,
  type CombatantStatusEffect,
  type CombatantWound
} from "../../api/gm";
import { useDefinitions } from "../definitions/DefinitionsContext";
import { getStatusWoundTick, WOUND_DEFINITIONS, type WoundType } from "@shared/rules/wounds";
import "./CombatPage.css";

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

const applyCombatState = (entries: CombatEntry[], state: CombatState): CombatEntry[] =>
  entries.map((entry) => ({
    ...entry,
    apCurrent: state.actionPointsById[entry.id] ?? entry.apCurrent,
    energyCurrent: state.energyById[entry.id] ?? entry.energyCurrent
  }));

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
  const { data: definitions } = useDefinitions();
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
  const [statusDrafts, setStatusDrafts] = React.useState<Record<string, { statusKey: string; duration: string; stacks: string }>>({});
  const [statusEdits, setStatusEdits] = React.useState<Record<string, { duration: string; stacks: string }>>({});
  const [woundDrafts, setWoundDrafts] = React.useState<Record<string, Record<string, string>>>({});

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
      setCombatants((prev) =>
        prev.map((entry) =>
          entry.id === combatantId
            ? { ...mapped, statusEffects: entry.statusEffects ?? [], wounds: entry.wounds ?? [] }
            : entry
        )
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update combatant.");
    } finally {
      setUpdatingIds((prev) => prev.filter((id) => id !== combatantId));
    }
  };

  const updateCombatantStatus = async (
    combatantId: string,
    statusKey: string,
    updates: Partial<CombatantStatusEffect>
  ) => {
    if (!selectedCampaignId) return;
    setUpdatingIds((prev) => (prev.includes(combatantId) ? prev : [...prev, combatantId]));
    setError(null);
    try {
      const updated = await gmApi.upsertCombatantStatusEffect({
        campaignId: selectedCampaignId,
        combatantId,
        statusKey,
        durationType: updates.durationType,
        durationRemaining: updates.durationRemaining,
        stacks: updates.stacks,
        isActive: updates.isActive
      });
      setCombatants((prev) =>
        prev.map((entry) => {
          if (entry.id !== combatantId) return entry;
          const existing = entry.statusEffects ?? [];
          const next = existing.some((status) => status.statusKey === statusKey)
            ? existing.map((status) => (status.statusKey === statusKey ? updated : status))
            : [...existing, updated];
          return { ...entry, statusEffects: next };
        })
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update status effect.");
    } finally {
      setUpdatingIds((prev) => prev.filter((id) => id !== combatantId));
    }
  };

  const removeCombatantStatus = async (combatantId: string, statusId: string) => {
    setUpdatingIds((prev) => (prev.includes(combatantId) ? prev : [...prev, combatantId]));
    setError(null);
    try {
      await gmApi.removeCombatantStatusEffect(statusId);
      setCombatants((prev) =>
        prev.map((entry) => {
          if (entry.id !== combatantId) return entry;
          return {
            ...entry,
            statusEffects: (entry.statusEffects ?? []).filter((status) => status.id !== statusId)
          };
        })
      );
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Failed to remove status effect.");
    } finally {
      setUpdatingIds((prev) => prev.filter((id) => id !== combatantId));
    }
  };

  const updateCombatantWound = async (combatantId: string, woundType: WoundType, woundCount: number) => {
    if (!selectedCampaignId) return;
    setUpdatingIds((prev) => (prev.includes(combatantId) ? prev : [...prev, combatantId]));
    setError(null);
    try {
      const updated = await gmApi.upsertCombatantWound({
        campaignId: selectedCampaignId,
        combatantId,
        woundType,
        woundCount
      });
      setCombatants((prev) =>
        prev.map((entry) => {
          if (entry.id !== combatantId) return entry;
          const existing = entry.wounds ?? [];
          const next = existing.some((wound) => wound.woundType === woundType)
            ? existing.map((wound) => (wound.woundType === woundType ? updated : wound))
            : [...existing, updated];
          return { ...entry, wounds: next };
        })
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update wound.");
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
          const mapped = mapCombatant(updated);
          const existing = combatants.find((entry) => entry.id === combatantId);
          return { ...mapped, statusEffects: existing?.statusEffects ?? [], wounds: existing?.wounds ?? [] };
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
        energyMax: deriveEnergy(entry),
        apMax: deriveAp(entry)
      });
      setCombatants((prev) => [mapCombatant(created), ...prev]);
      setAddingId("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to add combatant.");
    }
  };

  const handleStartTurn = async (entry: CombatEntry) => {
    if (!selectedCampaignId) return;
    setError(null);
    const apCurrent = fallbackNumber(entry.apCurrent);
    const tier = fallbackNumber(entry.tier);
    if (apCurrent <= 0 || tier <= 0) return;
    const energyCurrent = fallbackNumber(entry.energyCurrent);
    const energyGain = calculateEnergyGain(apCurrent, tier);
    try {
      const result = await gmApi.spendCombatResources(selectedCampaignId, {
        combatantId: entry.id,
        actionPointCost: 0,
        energyCost: -energyGain,
        actionType: "turn_start",
        metadata: { previousEnergy: energyCurrent }
      });
      setCombatants((prev) => applyCombatState(prev, result.state));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to start turn.");
    }
  };

  const handleEndTurn = async (entry: CombatEntry) => {
    if (!selectedCampaignId) return;
    setError(null);
    const apCurrent = fallbackNumber(entry.apCurrent);
    const tier = fallbackNumber(entry.tier);
    if (apCurrent <= 0 || tier <= 0) return;
    const rawSpend = endTurnSpend[entry.id];
    const spendValue = rawSpend === "" || rawSpend === undefined ? 0 : Number(rawSpend);
    if (!Number.isFinite(spendValue) || spendValue <= 0) return;
    const clampedSpend = Math.min(Math.max(spendValue, 0), apCurrent);
    const energyCurrent = fallbackNumber(entry.energyCurrent);
    const energyGain = calculateEnergyGain(clampedSpend, tier);
    try {
      const result = await gmApi.spendCombatResources(selectedCampaignId, {
        combatantId: entry.id,
        actionPointCost: clampedSpend,
        energyCost: -energyGain,
        actionType: "turn_end",
        metadata: { previousEnergy: energyCurrent }
      });
      setCombatants((prev) => applyCombatState(prev, result.state));
      setEndTurnSpend((prev) => ({ ...prev, [entry.id]: "" }));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to end turn.");
    }
  };

  const handleAdvanceRound = async () => {
    if (!selectedCampaignId) return;
    setBulkUpdating(true);
    setError(null);
    try {
      const updates: Promise<CombatantWound>[] = [];
      const changes = new Map<string, Record<WoundType, number>>();

      combatants.filter((entry) => entry.isActive).forEach((entry) => {
        const statusEffects = entry.statusEffects ?? [];
        statusEffects.forEach((status) => {
          if (status.isActive === false) return;
          const tick = getStatusWoundTick(status.statusKey);
          if (!tick) return;
          const entryChanges = changes.get(entry.id) ?? ({} as Record<WoundType, number>);
          entryChanges[tick.woundType] = (entryChanges[tick.woundType] ?? 0) + tick.amount;
          changes.set(entry.id, entryChanges);
        });
      });

      changes.forEach((deltaMap, combatantId) => {
        const entry = combatants.find((combatant) => combatant.id === combatantId);
        if (!entry) return;
        Object.entries(deltaMap).forEach(([woundType, increment]) => {
          const current = (entry.wounds ?? []).find((wound) => wound.woundType === woundType)?.woundCount ?? 0;
          const nextCount = current + increment;
          updates.push(
            gmApi.upsertCombatantWound({
              campaignId: selectedCampaignId,
              combatantId,
              woundType: woundType as WoundType,
              woundCount: nextCount
            })
          );
        });
      });

      const results = await Promise.all(updates);
      setCombatants((prev) =>
        prev.map((entry) => {
          const updated = results.filter((result) => result.combatantId === entry.id);
          if (!updated.length) return entry;
          const existing = entry.wounds ?? [];
          const next = [...existing];
          updated.forEach((item) => {
            const idx = next.findIndex((wound) => wound.woundType === item.woundType);
            if (idx >= 0) {
              next[idx] = item;
            } else {
              next.push(item);
            }
          });
          return { ...entry, wounds: next };
        })
      );
    } catch (tickError) {
      setError(tickError instanceof Error ? tickError.message : "Failed to apply round ticks.");
    } finally {
      setBulkUpdating(false);
    }
  };

  const filteredEntries = showInactive ? combatants : combatants.filter((entry) => entry.isActive);
  const allies = filteredEntries.filter((entry) => entry.faction === "ally");
  const enemies = filteredEntries.filter((entry) => entry.faction === "enemy");
  const statusOptions = definitions?.statusEffects ?? [];

  return (
    <div className="gm-combat">
      <header>
        <h2 className="gm-combat__title h2">Combat</h2>
        <p className="gm-combat__subtitle subtitle muted">
          Track active combatants and mark allies versus enemies in the current scene.
        </p>
        <button type="button" className="gm-combat__button" onClick={handleAdvanceRound} disabled={bulkUpdating}>
          Advance Round
        </button>
      </header>

      <section className="gm-combat__card">
        <div className="gm-combat__stack">
          <div className="gm-combat__filters">
            {!campaignId && (
              <label className="gm-combat__field">
                <span className="gm-combat__label">Campaign</span>
                <select
                  value={selectedCampaignId}
                  onChange={(event) => setSelectedCampaignId(event.target.value)}
                  className="gm-combat__input"
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
            <label className="gm-combat__field gm-combat__field--end">
              <span className="gm-combat__label">View</span>
              <button
                type="button"
                onClick={() => setShowInactive((prev) => !prev)}
                className={`gm-combat__toggle${showInactive ? " gm-combat__toggle--active" : ""}`}
              >
                {showInactive ? "Hide inactive" : "Show inactive"}
              </button>
            </label>
          </div>
          {error && <div className="gm-combat__message gm-combat__message--error">{error}</div>}
          {loading && <div className="gm-combat__message gm-combat__message--loading">Loading combat roster...</div>}
          <div className="gm-combat__bulk">
            <span className="gm-combat__bulk-status">
              Selected: {selectedIds.size} | Active: {combatants.filter((entry) => entry.isActive).length}
            </span>
            <button
              type="button"
              onClick={() => updateSelectedStatus(true)}
              disabled={selectedIds.size === 0 || bulkUpdating}
              className="gm-combat__bulk-button gm-combat__bulk-button--active"
            >
              Set Active
            </button>
            <button
              type="button"
              onClick={() => updateSelectedStatus(false)}
              disabled={selectedIds.size === 0 || bulkUpdating}
              className="gm-combat__bulk-button gm-combat__bulk-button--inactive"
            >
              Set Inactive
            </button>
          </div>
        </div>
      </section>

      <section className="gm-combat__card">
        <h3 className="gm-combat__card-title h3">Add Combatant</h3>
        <form onSubmit={handleAddCombatant} className="gm-combat__form">
          <label className="gm-combat__field">
            <span className="gm-combat__label">Bestiary Entry</span>
            <select value={addingId} onChange={(event) => setAddingId(event.target.value)} className="gm-combat__input">
              <option value="">Select an entry</option>
              {bestiaryEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <div className="gm-combat__grid">
            <label className="gm-combat__field">
              <span className="gm-combat__label">Faction</span>
              <select
                value={addingFaction}
                onChange={(event) => setAddingFaction(event.target.value as CombatFaction)}
                className="gm-combat__input"
              >
                <option value="ally">Ally</option>
                <option value="enemy">Enemy</option>
              </select>
            </label>
            <label className="gm-combat__field">
              <span className="gm-combat__label">Active</span>
              <select
                value={addingActive ? "active" : "inactive"}
                onChange={(event) => setAddingActive(event.target.value === "active")}
                className="gm-combat__input"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={!addingId}
            className="gm-combat__button gm-combat__button--primary"
          >
            Add Combatant
          </button>
        </form>
      </section>

      <section className="gm-combat__groups">
        {[{ title: "Allies", data: allies }, { title: "Enemies", data: enemies }].map((group) => (
          <div key={group.title} className="gm-combat__card">
            <h3 className="gm-combat__card-title h3">{group.title}</h3>
            {group.data.length === 0 ? (
              <p className="gm-combat__muted body muted">No {group.title.toLowerCase()} to show.</p>
            ) : (
              <div className="gm-combat__entries">
                {group.data.map((entry) => {
                  const isSelected = selectedIds.has(entry.id);
                  const isUpdating = updatingIds.includes(entry.id) || bulkUpdating;
                  const statusClass = entry.isActive ? "gm-combat__status--active" : "gm-combat__status--inactive";
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
                  const statusDraft = statusDrafts[entry.id] ?? { statusKey: "", duration: "", stacks: "1" };
                  const statusList = entry.statusEffects ?? [];
                  return (
                    <div
                      key={entry.id}
                      className={`gm-combat__entry${isSelected ? " gm-combat__entry--selected" : ""}`}
                    >
                      <div className="gm-combat__entry-header">
                        <label className="gm-combat__entry-label">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelection(entry.id)}
                            disabled={isUpdating}
                          />
                          <span className="gm-combat__entry-title">{entry.name}</span>
                        </label>
                        <span className={`gm-combat__status ${statusClass}`}>
                          {entry.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      {entry.isActive && (
                        <div className="gm-combat__entry-stats">
                          <div className="gm-combat__stat-row">
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
                          <span className="gm-combat__formula">Formula: energy gain = AP × Tier × 3</span>
                        </div>
                      )}
                      <div className="gm-combat__metrics">
                        <label className="gm-combat__field">
                          <span className="gm-combat__hint">Statuses</span>
                          <div className="gm-combat__turn-stack">
                            {statusList.length === 0 ? (
                              <span className="gm-combat__muted body muted">No statuses.</span>
                            ) : (
                              statusList.map((status) => {
                                const editKey = `${entry.id}:${status.statusKey}`;
                                const edit = statusEdits[editKey] ?? {
                                  duration: status.durationRemaining?.toString() ?? "",
                                  stacks: status.stacks?.toString() ?? "1"
                                };
                                return (
                                  <div key={status.id} className="gm-combat__turn-row">
                                    <span className="gm-combat__hint">{status.statusKey}</span>
                                    <input
                                      type="number"
                                      value={edit.duration}
                                      placeholder="Duration"
                                      onChange={(event) =>
                                        setStatusEdits((prev) => ({
                                          ...prev,
                                          [editKey]: { ...edit, duration: event.target.value }
                                        }))
                                      }
                                      onBlur={() =>
                                        updateCombatantStatus(entry.id, status.statusKey, {
                                          durationRemaining: edit.duration === "" ? undefined : Number(edit.duration),
                                          stacks: edit.stacks === "" ? undefined : Number(edit.stacks)
                                        })
                                      }
                                      className="gm-combat__input gm-combat__input--compact"
                                      disabled={isUpdating}
                                    />
                                    <input
                                      type="number"
                                      min={1}
                                      value={edit.stacks}
                                      placeholder="Stacks"
                                      onChange={(event) =>
                                        setStatusEdits((prev) => ({
                                          ...prev,
                                          [editKey]: { ...edit, stacks: event.target.value }
                                        }))
                                      }
                                      onBlur={() =>
                                        updateCombatantStatus(entry.id, status.statusKey, {
                                          durationRemaining: edit.duration === "" ? undefined : Number(edit.duration),
                                          stacks: edit.stacks === "" ? undefined : Number(edit.stacks)
                                        })
                                      }
                                      className="gm-combat__input gm-combat__input--compact"
                                      disabled={isUpdating}
                                    />
                                    <button
                                      type="button"
                                      className="gm-combat__action-button"
                                      onClick={() => removeCombatantStatus(entry.id, status.id)}
                                      disabled={isUpdating}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </label>
                        <label className="gm-combat__field">
                          <span className="gm-combat__hint">Add Status</span>
                          <div className="gm-combat__turn-row">
                            <select
                              value={statusDraft.statusKey}
                              onChange={(event) =>
                                setStatusDrafts((prev) => ({
                                  ...prev,
                                  [entry.id]: { ...statusDraft, statusKey: event.target.value }
                                }))
                              }
                              className="gm-combat__input gm-combat__input--compact"
                              disabled={isUpdating}
                            >
                              <option value="">Select status</option>
                              {statusOptions.map((status) => (
                                <option key={status.id} value={status.id}>
                                  {status.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              value={statusDraft.duration}
                              placeholder="Duration"
                              onChange={(event) =>
                                setStatusDrafts((prev) => ({
                                  ...prev,
                                  [entry.id]: { ...statusDraft, duration: event.target.value }
                                }))
                              }
                              className="gm-combat__input gm-combat__input--compact"
                              disabled={isUpdating}
                            />
                            <input
                              type="number"
                              min={1}
                              value={statusDraft.stacks}
                              placeholder="Stacks"
                              onChange={(event) =>
                                setStatusDrafts((prev) => ({
                                  ...prev,
                                  [entry.id]: { ...statusDraft, stacks: event.target.value }
                                }))
                              }
                              className="gm-combat__input gm-combat__input--compact"
                              disabled={isUpdating}
                            />
                            <button
                              type="button"
                              className="gm-combat__action-button"
                              onClick={() => {
                                if (!statusDraft.statusKey) return;
                                updateCombatantStatus(entry.id, statusDraft.statusKey, {
                                  durationRemaining: statusDraft.duration === "" ? undefined : Number(statusDraft.duration),
                                  stacks: statusDraft.stacks === "" ? undefined : Number(statusDraft.stacks)
                                });
                                setStatusDrafts((prev) => ({
                                  ...prev,
                                  [entry.id]: { statusKey: "", duration: "", stacks: "1" }
                                }));
                              }}
                              disabled={isUpdating || !statusDraft.statusKey}
                            >
                              Add
                            </button>
                          </div>
                        </label>
                      </div>
                      <label className="gm-combat__field">
                        <span className="gm-combat__hint">Faction</span>
                        <select
                          value={entry.faction}
                          onChange={(event) => updateCombatant(entry.id, { faction: event.target.value })}
                          className="gm-combat__input"
                          disabled={isUpdating}
                        >
                          <option value="ally">Ally</option>
                          <option value="enemy">Enemy</option>
                        </select>
                      </label>
                      <label className="gm-combat__field">
                        <span className="gm-combat__hint">Combat status</span>
                        <select
                          value={entry.isActive ? "active" : "inactive"}
                          onChange={(event) => updateCombatant(entry.id, { isActive: event.target.value === "active" })}
                          className="gm-combat__input"
                          disabled={isUpdating}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </label>
                      <label className="gm-combat__field">
                        <span className="gm-combat__hint">Initiative</span>
                        <input
                          type="number"
                          value={entry.initiative ?? ""}
                          onChange={(event) =>
                            updateCombatant(entry.id, {
                              initiative: event.target.value === "" ? null : Number(event.target.value)
                            })
                          }
                          className="gm-combat__input"
                          disabled={isUpdating}
                        />
                      </label>
                      <div className="gm-combat__metrics">
                        <label className="gm-combat__field">
                          <span className="gm-combat__hint">Energy Max</span>
                          <input
                            type="number"
                            value={entry.energyMax ?? ""}
                            onChange={(event) =>
                              updateCombatant(entry.id, {
                                energyMax: event.target.value === "" ? null : Number(event.target.value)
                              })
                            }
                            className="gm-combat__input"
                            disabled={isUpdating}
                          />
                        </label>
                        <label className="gm-combat__field">
                          <span className="gm-combat__hint">AP Max</span>
                          <input
                            type="number"
                            value={entry.apMax ?? ""}
                            onChange={(event) =>
                              updateCombatant(entry.id, {
                                apMax: event.target.value === "" ? null : Number(event.target.value)
                              })
                            }
                            className="gm-combat__input"
                            disabled={isUpdating}
                          />
                        </label>
                      </div>
                      <div className="gm-combat__metrics">
                        <span className="gm-combat__hint">Wounds</span>
                        {WOUND_DEFINITIONS.map((wound) => {
                          const woundMap = woundDrafts[entry.id] ?? {};
                          const current =
                            woundMap[wound.key] ??
                            (entry.wounds ?? []).find((item) => item.woundType === wound.key)?.woundCount?.toString() ??
                            "0";
                          return (
                            <label key={wound.key} className="gm-combat__field">
                              <span className="gm-combat__hint">{wound.label}</span>
                              <input
                                type="number"
                                min={0}
                                value={current}
                                onChange={(event) =>
                                  setWoundDrafts((prev) => ({
                                    ...prev,
                                    [entry.id]: { ...(prev[entry.id] ?? {}), [wound.key]: event.target.value }
                                  }))
                                }
                                onBlur={() => {
                                  const parsed = Number(current);
                                  if (!Number.isFinite(parsed)) return;
                                  updateCombatantWound(entry.id, wound.key, Math.max(parsed, 0));
                                }}
                                className="gm-combat__input gm-combat__input--compact"
                                disabled={isUpdating}
                              />
                            </label>
                          );
                        })}
                      </div>
                      {entry.isActive && (
                        <div className="gm-combat__active-panel">
                          <div className="gm-combat__turn-row">
                            <button
                              type="button"
                              onClick={() => handleStartTurn(entry)}
                              disabled={isUpdating || apCurrent <= 0 || tier <= 0}
                              className="gm-combat__action-button gm-combat__action-button--start"
                            >
                              Start Turn
                            </button>
                            <span className="gm-combat__hint">
                              Gain {startTurnGain} energy = {apCurrent} × {tier || "?"} × 3
                            </span>
                          </div>
                          <div className="gm-combat__turn-stack">
                            <div className="gm-combat__turn-row">
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
                                className="gm-combat__input gm-combat__input--compact"
                                disabled={isUpdating || apCurrent <= 0 || tier <= 0}
                              />
                              <button
                                type="button"
                                onClick={() => handleEndTurn(entry)}
                                disabled={isUpdating || apCurrent <= 0 || tier <= 0 || clampedSpend <= 0}
                                className="gm-combat__action-button gm-combat__action-button--end"
                              >
                                End Turn
                              </button>
                            </div>
                            <span className="gm-combat__hint">
                              Spend {clampedSpend} AP → gain {endTurnGain} energy = {clampedSpend} × {tier || "?"} × 3
                            </span>
                          </div>
                        </div>
                      )}
                      <label className="gm-combat__field">
                        <span className="gm-combat__hint">Notes</span>
                        <textarea
                          value={entry.notes ?? ""}
                          onChange={(event) => updateCombatant(entry.id, { notes: event.target.value })}
                          rows={2}
                          className="gm-combat__input gm-combat__input--textarea"
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
