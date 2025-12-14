import React from "react";
import ancillariesData from "../../data/ancillaries.json";
import { api, Character } from "../../api/client";
import { useDefinitions } from "../definitions/DefinitionsContext";
import { useSelectedCharacter } from "../characters/SelectedCharacterContext";

type RawAncillary = {
  id: string;
  name: string;
  requirements: string[];
  description: string;
};

type RawAncestryGroup = {
  id: string;
  name: string;
  entries: { id: string; name: string; description: string }[];
};

type AncillaryEntry = {
  id: string;
  name: string;
  description: string;
  requirements: string[];
  category: "general" | "ancestry";
  ancestryGroup?: string;
  ancestryGroupId?: string;
};

const data = ancillariesData as {
  ancestryGroups: RawAncestryGroup[];
  ancillaries: RawAncillary[];
};

const ANCESTRY_GROUP_ACCESS: Record<string, { raceKey: string; subraceKey?: string }> = {
  "thairin-inin": { raceKey: "ININ", subraceKey: "THAIRIN" },
  "grazin-inin": { raceKey: "ININ", subraceKey: "GRAZIN" },
  "bryonin-inin": { raceKey: "ININ", subraceKey: "BRYONIN" },
  "jiinin-inin": { raceKey: "ININ", subraceKey: "JIININ" },
  "rivanonin-inin": { raceKey: "ININ", subraceKey: "RIVANONIN" },
  "melfarionin-inin": { raceKey: "ININ", subraceKey: "MELFARIONIN" },
  "thuilin-inin": { raceKey: "ININ", subraceKey: "THUILIN" },
  "letelin-inin": { raceKey: "ININ", subraceKey: "LETELIN" },
  anz: { raceKey: "ANZ" },
  "phi-ilin": { raceKey: "PHIILIN" },
  cerevu: { raceKey: "CEREVU" },
  venii: { raceKey: "VENII" },
  freinin: { raceKey: "FREININ" }
};

const buildEntries = (): AncillaryEntry[] => {
  const ancestry = data.ancestryGroups.flatMap((group) =>
    group.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      requirements: [group.name],
      category: "ancestry" as const,
      ancestryGroup: group.name,
      ancestryGroupId: group.id
    }))
  );

  const general = data.ancillaries.map((entry) => ({
    ...entry,
    category: "general" as const
  }));

  return [...ancestry, ...general];
};

const ALL_ENTRIES = buildEntries();
const GENERAL_ENTRIES = ALL_ENTRIES.filter((entry) => entry.category === "general");
const ANCESTRY_ENTRIES = ALL_ENTRIES.filter((entry) => entry.category === "ancestry");
const ANCESTRY_GROUPS_BY_ID = new Map(data.ancestryGroups.map((group) => [group.id, group]));

const STORAGE_PREFIX = "ancillaries:selected";

const readSelection = (key: string): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    const validIds = new Set(ALL_ENTRIES.map((entry) => entry.id));
    return Array.isArray(parsed) ? parsed.filter((id) => validIds.has(id)) : [];
  } catch (err) {
    console.warn("Unable to read ancillary selection", err);
    return [];
  }
};

const persistSelection = (key: string, ids: string[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch (err) {
    console.warn("Unable to persist ancillary selection", err);
  }
};

const summarizeAllowed = (character: Character | null): { total: number; tierAdvancements: number } => {
  if (!character) {
    return { total: 2, tierAdvancements: 0 };
  }
  const tierAdvancements = Math.max(0, Math.floor((character.level - 1) / 5));
  const total = 2 + tierAdvancements * 2;
  return { total, tierAdvancements };
};

const isAncestryAllowedForCharacter = (groupId: string | undefined, character: Character | null): boolean => {
  if (!groupId || !character) return false;
  const rule = ANCESTRY_GROUP_ACCESS[groupId];
  if (!rule) return false;
  if (rule.raceKey !== (character.raceKey ?? "")) return false;
  if (rule.subraceKey && rule.subraceKey !== (character.subraceKey ?? "")) return false;
  return true;
};

const cardStyle: React.CSSProperties = {
  background: "#11151d",
  border: "1px solid #2c3543",
  borderRadius: 10,
  padding: "1rem",
  color: "#e8edf7"
};

const pillStyle: React.CSSProperties = {
  background: "#0f141c",
  border: "1px solid #2a3242",
  borderRadius: 8,
  padding: "0.5rem 0.75rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  color: "#e8edf7"
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  background: "#1f2937",
  border: "1px solid #374151",
  color: "#c7d2fe",
  borderRadius: 6,
  padding: "0.15rem 0.5rem",
  fontSize: 12,
  fontWeight: 700
};

export const AncillariesPage: React.FC = () => {
  const { selectedId } = useSelectedCharacter();
  const { data: definitions } = useDefinitions();
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const storageKey = React.useMemo(() => `${STORAGE_PREFIX}:${selectedId ?? "unassigned"}`, [selectedId]);

  const [selectedAncillaries, setSelectedAncillaries] = React.useState<string[]>(() => readSelection(storageKey));

  React.useEffect(() => {
    setSelectedAncillaries(readSelection(storageKey));
  }, [storageKey]);

  React.useEffect(() => {
    persistSelection(storageKey, selectedAncillaries);
  }, [selectedAncillaries, storageKey]);

  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await api.listCharacters();
        setCharacters(list);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load characters";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const selectedCharacter = React.useMemo(
    () => characters.find((ch) => ch.id === selectedId) ?? null,
    [characters, selectedId]
  );

  const raceMap = React.useMemo(() => new Map((definitions?.races ?? []).map((race) => [race.id, race.name])), [definitions]);
  const subraceMap = React.useMemo(
    () =>
      new Map(
        (definitions?.subraces ?? []).map((subrace) => [subrace.id, { name: subrace.name, raceKey: subrace.parentId ?? "" }])
      ),
    [definitions]
  );

  const selectedRaceName = selectedCharacter?.raceKey ? raceMap.get(selectedCharacter.raceKey) ?? selectedCharacter.raceKey : undefined;
  const selectedSubraceName =
    selectedCharacter?.subraceKey && subraceMap.get(selectedCharacter.subraceKey)?.name
      ? subraceMap.get(selectedCharacter.subraceKey)?.name
      : selectedCharacter?.subraceKey;

  const { total: allowed, tierAdvancements } = summarizeAllowed(selectedCharacter);
  const remaining = Math.max(allowed - selectedAncillaries.length, 0);

  const ancestryAllowedGroups = React.useMemo(() => {
    const groups = data.ancestryGroups.filter((group) => isAncestryAllowedForCharacter(group.id, selectedCharacter));
    return new Set(groups.map((group) => group.id));
  }, [selectedCharacter]);

  const allowedAncestryEntries = React.useMemo(
    () => ANCESTRY_ENTRIES.filter((entry) => ancestryAllowedGroups.has(entry.ancestryGroupId ?? "")),
    [ancestryAllowedGroups]
  );

  const ancestryLevelEligible = selectedCharacter ? selectedCharacter.level === 1 : false;

  const allowedAncestryGroupNames = React.useMemo(
    () => Array.from(ancestryAllowedGroups).map((id) => ANCESTRY_GROUPS_BY_ID.get(id)?.name ?? id),
    [ancestryAllowedGroups]
  );

  const ancestryAvailabilityLabel = !selectedCharacter
    ? "Select a character with a race/subrace to unlock ancestry ancillaries."
    : allowedAncestryGroupNames.length > 0
    ? `${allowedAncestryGroupNames.join(", ")}${ancestryLevelEligible ? "" : " (locked after level 1)"}`
    : "No ancestry ancillaries available for this character.";

  const availableEntries = React.useMemo(() => {
    const allowedIds = new Set(allowedAncestryEntries.map((entry) => entry.id));
    return ALL_ENTRIES.filter((entry) => entry.category === "general" || allowedIds.has(entry.id));
  }, [allowedAncestryEntries]);

  const filterTerm = search.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    if (!filterTerm) return availableEntries;
    return availableEntries.filter((entry) => {
      const haystack = [entry.name, entry.description, entry.ancestryGroup ?? "", ...entry.requirements]
        .join(" \n ")
        .toLowerCase();
      return haystack.includes(filterTerm);
    });
  }, [filterTerm, availableEntries]);

  const selectedDetails = selectedAncillaries
    .map((id) => filtered.find((entry) => entry.id === id) || ALL_ENTRIES.find((e) => e.id === id))
    .filter(Boolean) as AncillaryEntry[];

  const toggleSelect = (id: string) => {
    const entry = ALL_ENTRIES.find((candidate) => candidate.id === id);
    if (entry?.category === "ancestry") {
      if (!isAncestryAllowedForCharacter(entry.ancestryGroupId, selectedCharacter)) return;
      if (!ancestryLevelEligible && !selectedAncillaries.includes(id)) return;
    }
    if (selectedAncillaries.includes(id)) {
      setSelectedAncillaries((prev) => prev.filter((existing) => existing !== id));
      return;
    }
    if (selectedAncillaries.length >= allowed) return;
    setSelectedAncillaries((prev) => [...prev, id]);
  };

  const renderAncillaryCard = (entry: AncillaryEntry, showRemove: boolean) => {
    const isSelected = selectedAncillaries.includes(entry.id);
    const buttonLabel = showRemove || isSelected ? "Remove" : "Add";
    const ancestryBlocked =
      entry.category === "ancestry" &&
      (!isAncestryAllowedForCharacter(entry.ancestryGroupId, selectedCharacter) || (!ancestryLevelEligible && !isSelected));
    const disabled = !showRemove && (isSelected || remaining <= 0 || ancestryBlocked);

    return (
      <div key={entry.id} style={{ ...cardStyle, marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
              <h4 style={{ margin: 0 }}>{entry.name}</h4>
              <span style={badgeStyle}>{entry.category === "general" ? "General" : "Ancestry"}</span>
              {entry.ancestryGroup && (
                <span style={{ ...badgeStyle, color: "#a5f3fc", borderColor: "#155e75", background: "#0b1220" }}>
                  {entry.ancestryGroup}
                </span>
              )}
            </div>
            {entry.requirements.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontWeight: 700, marginBottom: 2, fontSize: 13 }}>Requirements</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {entry.requirements.map((req) => (
                    <li key={req} style={{ marginBottom: 2 }}>{req}</li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ whiteSpace: "pre-line", color: "#cbd5e1", fontSize: 14 }}>{entry.description}</div>
            {entry.category === "ancestry" && !ancestryLevelEligible && !isSelected && (
              <div style={{ color: "#fbbf24", marginTop: 6, fontSize: 13 }}>Ancestry ancillaries can only be added at level 1.</div>
            )}
          </div>
          <div>
            <button
              onClick={() => toggleSelect(entry.id)}
              disabled={disabled}
              style={{
                padding: "0.4rem 0.75rem",
                borderRadius: 8,
                border: showRemove || isSelected ? "1px solid #b91c1c" : "1px solid #374151",
                background: showRemove || isSelected ? "#2c1515" : "#142031",
                color: showRemove || isSelected ? "#fecaca" : "#e5e7eb",
                cursor: disabled ? "not-allowed" : "pointer",
                minWidth: 90
              }}
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem" }}>Ancillaries</h2>
      <p style={{ marginTop: 0, color: "#cbd5e1" }}>
        Choose 2 ancillaries at character creation. You gain 2 more picks at every Character Tier Advancement (levels 6, 11, 16,
        and so on). Requirements are not enforced by the tool—verify eligibility before adding.
      </p>
      <p style={{ marginTop: 0, color: "#cbd5e1" }}>
        Ancestry ancillaries are locked to your character’s race and subrace (when applicable) and can only be chosen at level 1.
      </p>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 12 }}>
        <div style={pillStyle}>
          <div>
            <div style={{ fontWeight: 700 }}>Selected Character</div>
            <div style={{ color: "#9ca3af", fontSize: 14 }}>
              {loading ? "Loading..." : selectedCharacter ? `${selectedCharacter.name} (Level ${selectedCharacter.level})` : "None"}
            </div>
            {selectedCharacter && (
              <div style={{ color: "#9ca3af", fontSize: 13 }}>
                Race: {selectedRaceName ?? "Unknown"}
                {selectedSubraceName ? ` / ${selectedSubraceName}` : ""}
              </div>
            )}
          </div>
        </div>
        <div style={pillStyle}>
          <div>
            <div style={{ fontWeight: 700 }}>Allowed Ancillaries</div>
            <div style={{ color: "#9ca3af", fontSize: 14 }}>
              Base 2 + {tierAdvancements} tier advancements × 2
            </div>
          </div>
          <div style={{ fontWeight: 800, color: remaining === 0 ? "#fbbf24" : "#34d399" }}>{allowed}</div>
        </div>
        <div style={pillStyle}>
          <div>
            <div style={{ fontWeight: 700 }}>Remaining Picks</div>
            <div style={{ color: "#9ca3af", fontSize: 14 }}>Available to assign</div>
          </div>
          <div style={{ fontWeight: 800, color: remaining > 0 ? "#34d399" : "#f87171" }}>{remaining}</div>
        </div>
        <div style={pillStyle}>
          <div>
            <div style={{ fontWeight: 700 }}>Ancestry Access</div>
            <div style={{ color: "#9ca3af", fontSize: 14 }}>{ancestryAvailabilityLabel}</div>
          </div>
          <div style={{ fontWeight: 800, color: ancestryLevelEligible ? "#34d399" : "#fbbf24" }}>
            {ancestryLevelEligible ? "Level 1" : selectedCharacter ? `Level ${selectedCharacter.level}` : ""}
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>Search Ancillaries</label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, requirement, or description"
          style={{
            width: "100%",
            padding: "0.6rem 0.75rem",
            borderRadius: 8,
            border: "1px solid #2f3542",
            background: "#0b1017",
            color: "#e5e7eb"
          }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, alignItems: "start" }}>
        <div>
          <div style={{ ...cardStyle, position: "sticky", top: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Chosen Ancillaries</h3>
              <span style={{ ...badgeStyle, background: "#0f172a", borderColor: "#1f2937" }}>
                {selectedAncillaries.length}/{allowed}
              </span>
            </div>
            {selectedDetails.length === 0 ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>No ancillaries selected yet.</p>
            ) : (
              selectedDetails.map((entry) => renderAncillaryCard(entry, true))
            )}
          </div>
        </div>
        <div>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>All Ancillaries</h3>
              <span style={{ ...badgeStyle, background: "#0f172a", borderColor: "#1f2937" }}>{filtered.length}</span>
            </div>
            {filtered.map((entry) => renderAncillaryCard(entry, false))}
          </div>
        </div>
      </div>
    </div>
  );
};
