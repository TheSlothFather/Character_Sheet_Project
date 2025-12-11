import React from "react";
import { api, Character, ApiError, NamedDefinition } from "../../api/client";
import { useDefinitions } from "../definitions/DefinitionsContext";
import { useSelectedCharacter } from "./SelectedCharacterContext";
import { getSkillCode, groupSkillsByCategory } from "./skillMetadata";

const DEFAULT_SKILL_POINT_POOL = 100;

const isAllocationMap = (value: unknown): value is Record<string, number> => {
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === "number");
};

const isCharacter = (value: unknown): value is Character => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Character>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.level === "number" &&
    typeof candidate.skillPoints === "number" &&
    isAllocationMap(candidate.skillAllocations)
  );
};

const isCharacterArray = (value: unknown): value is Character[] =>
  Array.isArray(value) && value.every(isCharacter);

const sumAllocations = (allocations: Record<string, number>): number =>
  Object.values(allocations).reduce((acc, v) => acc + v, 0);

interface CharacterSheetProps {
  character: Character;
  skills: NamedDefinition[];
  raceName?: string;
  subraceName?: string;
  remaining: number;
  skillPointPool: number;
  allocations: Record<string, number>;
  skillBonuses: Record<string, number>;
  onChangeAllocation: (skillCode: string, delta: number) => void;
  disableAllocation: boolean;
}

const CharacterSheet: React.FC<CharacterSheetProps> = ({
  character,
  skills,
  raceName,
  subraceName,
  remaining,
  skillPointPool,
  allocations,
  skillBonuses,
  onChangeAllocation,
  disableAllocation
}) => {
  const [activeTab, setActiveTab] = React.useState<string>("Weapons");
  const groupedSkills = React.useMemo(() => groupSkillsByCategory(skills), [skills]);

  const summaryBarStyle: React.CSSProperties = {
    background: "#1a1d24",
    border: "1px solid #333",
    borderRadius: 8,
    padding: "0.75rem",
    display: "grid",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    gap: "0.75rem"
  };

  const cardStyle: React.CSSProperties = {
    background: "#14171d",
    border: "1px solid #2d343f",
    borderRadius: 8,
    padding: "0.75rem",
    color: "#e8edf7",
    boxSizing: "border-box"
  };

  const pillStyle: React.CSSProperties = {
    background: "#0e1116",
    border: "1px solid #2f3642",
    borderRadius: 6,
    padding: "0.5rem 0.75rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#e8edf7",
    fontSize: 14
  };

  const levelCards = Array.from({ length: 5 }, (_, idx) => idx + 1);
  const energy = 100 + 10 * (character.level - 1);
  const damageReduction = 0;
  const fatePoints = character.fatePoints ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={summaryBarStyle}>
        <div style={pillStyle}>
          <span>Name</span>
          <strong>{character.name}</strong>
        </div>
        <div style={pillStyle}>
          <span>Level</span>
          <strong>{character.level}</strong>
        </div>
        <div style={pillStyle}>
          <span>XP</span>
          <strong>—</strong>
        </div>
        <div style={pillStyle}>
          <span>Race</span>
          <strong>{raceName || "Unselected"}</strong>
        </div>
        <div style={pillStyle}>
          <span>Subrace</span>
          <strong>{subraceName || "Unselected"}</strong>
        </div>
        <div style={pillStyle}>
          <span>Speed</span>
          <strong>—</strong>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 480px 1fr", gap: "1rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {levelCards.map((lvl) => (
            <div key={lvl} style={cardStyle}>
              <div style={{ fontSize: 14, color: "#9aa3b5", marginBottom: 4 }}>Level {lvl}</div>
              <div style={{ height: 48, border: "1px dashed #2f3642", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#667" }}>
                Future feat slots
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
            <div style={pillStyle}>
              <span>Damage Reduction</span>
              <strong>{damageReduction}</strong>
            </div>
            <div style={pillStyle}>
              <span>Fate</span>
              <strong>{fatePoints}</strong>
            </div>
            <div style={pillStyle}>
              <span>Energy</span>
              <strong>{energy}</strong>
            </div>
          </div>
          <div style={{ ...cardStyle, padding: 0, display: "flex", flexDirection: "column", height: "100%" }}>
            <div
              style={{
                padding: "0.75rem 1rem",
                borderBottom: "1px solid #2d343f",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "#9aa3b5" }}>Skill Points Remaining</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: remaining < 0 ? "#f55" : "#9ae6b4" }}>
                  {remaining}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#9aa3b5" }}>Pool: {skillPointPool}</div>
            </div>
            <div style={{ overflowY: "auto", padding: "0.75rem", flex: 1 }}>
              {skills.length === 0 ? (
                <div style={{ padding: "0.5rem 0.25rem", color: "#9aa3b5" }}>No skills defined yet.</div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                    gap: "0.75rem"
                  }}
                >
                  {groupedSkills.map((group) => (
                    <div
                      key={group.key}
                      style={{
                        border: "1px solid #1f242d",
                        borderRadius: 8,
                        padding: "0.5rem 0.6rem",
                        background: "#0e1118",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#e8edf7" }}>{group.label}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {[...group.skills]
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((skill) => {
                            const code = getSkillCode(skill);
                            const allocated = allocations[code] ?? 0;
                            const bonus = skillBonuses[code] ?? 0;
                            const total = allocated + bonus;
                            const disableInc = disableAllocation || remaining <= 0;
                            const disableDec = disableAllocation || allocated <= 0;
                            return (
                              <div
                                key={code}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 140px 70px",
                                  alignItems: "center",
                                  gap: "0.45rem",
                                  padding: "0.4rem 0.25rem",
                                  borderBottom: "1px solid #161b23",
                                  background: "#0c0f14",
                                  borderRadius: 6
                                }}
                              >
                                <div>
                                  <div style={{ fontWeight: 600 }}>{skill.name}</div>
                                  <div style={{ fontSize: 11, color: "#79839a" }}>{code}</div>
                                </div>
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <button
                                    onClick={() => onChangeAllocation(code, -1)}
                                    disabled={disableDec}
                                    style={{ padding: "0.2rem 0.4rem", minWidth: 28 }}
                                  >
                                    -
                                  </button>
                                  <div style={{ width: 28, textAlign: "center" }}>{allocated}</div>
                                  <button
                                    onClick={() => onChangeAllocation(code, 1)}
                                    disabled={disableInc}
                                    style={{ padding: "0.2rem 0.4rem", minWidth: 28 }}
                                  >
                                    +
                                  </button>
                                </div>
                                <div style={{ fontWeight: 700, textAlign: "right" }}>{total}</div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {["Weapons", "Defense", "Gear", "Spells", "Details", "Feats", "Actions"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "0.45rem 0.75rem",
                  borderRadius: 6,
                  border: activeTab === tab ? "1px solid #f38b2f" : "1px solid #2d343f",
                  background: activeTab === tab ? "#1f2a33" : "#14171d",
                  color: "#e8edf7",
                  cursor: "pointer"
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          <div style={{ ...cardStyle, minHeight: 240 }}>This tab is a placeholder for future content.</div>
        </div>
      </div>
    </div>
  );
};

export const CharactersPage: React.FC = () => {
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [allocationSavingId, setAllocationSavingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const { selectedId, setSelectedId } = useSelectedCharacter();

  const {
    data: definitions,
    loading: definitionsLoading,
    error: definitionsError
  } = useDefinitions();

  React.useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .listCharacters()
      .then((data) => {
        if (!isMounted) return;
        if (!isCharacterArray(data)) {
          throw new Error("Unexpected response when loading characters");
        }
        setCharacters(data);
      })
      .catch((err) => {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : "Failed to load characters";
        setError(message);
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!characters.length) {
      if (!loading && selectedId) setSelectedId(null);
      return;
    }

    if (!selectedId || !characters.some((c) => c.id === selectedId)) {
      setSelectedId(characters[0].id);
    }
  }, [characters, loading, selectedId, setSelectedId]);

  const handleDeleteCharacter = async (id: string) => {
    const character = characters.find((c) => c.id === id);
    if (!character) return;
    if (!window.confirm(`Delete ${character.name}? This cannot be undone.`)) return;

    setError(null);
    setDeletingId(id);
    try {
      await api.deleteCharacter(id);
      setCharacters((prev) => {
        const next = prev.filter((c) => c.id !== id);
        const nextSelected = selectedId === id ? next[0]?.id ?? null : selectedId;
        setSelectedId(nextSelected ?? null);
        return next;
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to delete character";
      setError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const onChangeAllocation = async (skillCode: string, delta: number) => {
    if (!selectedId) return;
    const selectedCharacter = characters.find((c) => c.id === selectedId);
    if (!selectedCharacter) return;

    const pool = selectedCharacter.skillPoints ?? DEFAULT_SKILL_POINT_POOL;
    const currentAllocations = selectedCharacter.skillAllocations ?? {};
    const currentValue = currentAllocations[skillCode] ?? 0;
    const nextValue = Math.max(0, currentValue + delta);
    const currentTotal = sumAllocations(currentAllocations);
    const proposedTotal = currentTotal - currentValue + nextValue;
    if (proposedTotal > pool) return;

    const nextAllocations = {
      ...currentAllocations,
      [skillCode]: nextValue
    };

    const optimistic = { ...selectedCharacter, skillAllocations: nextAllocations };
    setCharacters((prev) => prev.map((c) => (c.id === selectedId ? optimistic : c)));
    setAllocationSavingId(selectedId);
    try {
      const saved = await api.updateCharacter(selectedId, { skillAllocations: nextAllocations });
      if (!isCharacter(saved)) {
        throw new Error("Unexpected response when saving allocations");
      }
      setCharacters((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save skill allocation";
      setError(message);
      setCharacters((prev) => prev.map((c) => (c.id === selectedId ? selectedCharacter : c)));
    } finally {
      setAllocationSavingId(null);
    }
  };

  const selectedCharacter = characters.find((c) => c.id === selectedId) || null;
  const currentAllocations = selectedCharacter?.skillAllocations ?? {};
  const skillPointPool = selectedCharacter?.skillPoints ?? DEFAULT_SKILL_POINT_POOL;
  const totalAllocated = sumAllocations(currentAllocations);
  const remaining = skillPointPool - totalAllocated;
  const skillBonuses = selectedCharacter?.skillBonuses ?? {};

  const raceMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (definitions?.races ?? []).forEach((r) => map.set(r.id, r.name));
    return map;
  }, [definitions]);

  const subraceMap = React.useMemo(() => {
    const map = new Map<string, { name: string; parentId?: string }>();
    (definitions?.subraces ?? []).forEach((s) => map.set(s.id, { name: s.name, parentId: s.parentId }));
    return map;
  }, [definitions]);

  const loadingAny = loading || definitionsLoading;

  return (
    <div>
      <h2 style={{ marginBottom: "0.75rem" }}>Characters</h2>
      {(definitionsError || error) && (
        <p style={{ color: "#f55" }}>{definitionsError || error}</p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "1rem" }}>
        <aside
          style={{
            background: "#12141a",
            border: "1px solid #2d343f",
            borderRadius: 10,
            padding: "0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem"
          }}
        >
          <div>
            <div style={{ fontSize: 14, color: "#9aa3b5", marginBottom: 6 }}>Characters</div>
            {loading && <p style={{ margin: 0 }}>Loading characters...</p>}
            {!loading && characters.length === 0 && <p style={{ margin: 0 }}>No characters yet.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {characters.map((c) => {
                const selected = c.id === selectedId;
                return (
                  <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      onClick={() => setSelectedId(c.id)}
                      style={{
                        flex: 1,
                        textAlign: "left",
                        padding: "0.5rem 0.6rem",
                        borderRadius: 8,
                        border: selected ? "1px solid #f38b2f" : "1px solid #2d343f",
                        background: selected ? "#1f2a33" : "#14171d",
                        color: "#e8edf7",
                        cursor: "pointer"
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "#9aa3b5" }}>
                        Lv {c.level} • {raceMap.get(c.raceKey || "") ?? "No race"} /{" "}
                        {subraceMap.get(c.subraceKey || "")?.name ?? "No subrace"}
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCharacter(c.id);
                      }}
                      disabled={deletingId === c.id || loadingAny}
                      style={{
                        padding: "0.45rem 0.55rem",
                        borderRadius: 8,
                        border: "1px solid #402b2b",
                        background: deletingId === c.id ? "#2b1c1c" : "#1b1111",
                        color: "#f7a046",
                        cursor: "pointer"
                      }}
                    >
                      {deletingId === c.id ? "Deleting" : "Delete"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <main
          style={{
            background: "#0f1117",
            border: "1px solid #2d343f",
            borderRadius: 10,
            padding: "1rem",
            minHeight: 600
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700 }}>Selected character</div>
            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
              disabled={loadingAny || characters.length === 0}
              style={{ minWidth: 200 }}
            >
              {characters.length === 0 && <option value="">No characters</option>}
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {loadingAny && <p style={{ margin: 0 }}>Loading sheet...</p>}
          {!loadingAny && !selectedCharacter && (
            <p style={{ margin: 0 }}>Select a character to view the sheet.</p>
          )}
          {!loadingAny && selectedCharacter && definitions && (
            <CharacterSheet
              character={selectedCharacter}
              skills={definitions.skills}
              raceName={raceMap.get(selectedCharacter.raceKey || "")}
              subraceName={subraceMap.get(selectedCharacter.subraceKey || "")?.name}
              remaining={remaining}
              skillPointPool={skillPointPool}
              allocations={currentAllocations}
              skillBonuses={skillBonuses}
              onChangeAllocation={onChangeAllocation}
              disableAllocation={loadingAny || allocationSavingId === selectedCharacter.id}
            />
          )}
        </main>
      </div>
    </div>
  );
};
