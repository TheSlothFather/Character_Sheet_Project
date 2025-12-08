import React from "react";
import type { Character, NamedDefinition } from "../../api/client";
import { api, ApiError } from "../../api/client";
import { useDefinitions } from "../definitions/DefinitionsContext";
import { computeRacialSkillBonuses } from "./racialBonuses";

const SKILL_POINT_POOL = 100;

type SkillAllocationMap = Record<string, Record<string, number>>;

const isCharacter = (value: unknown): value is Character => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Character>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.level === "number"
  );
};

const isCharacterArray = (value: unknown): value is Character[] =>
  Array.isArray(value) && value.every(isCharacter);

const getSkillCode = (skill: NamedDefinition): string => skill.code ?? skill.id;

const sumAllocations = (allocations: Record<string, number>): number =>
  Object.values(allocations).reduce((acc, v) => acc + v, 0);

interface CharacterSheetProps {
  character: Character;
  skills: NamedDefinition[];
  raceName?: string;
  subraceName?: string;
  remaining: number;
  allocations: Record<string, number>;
  racialBonuses: Record<string, number>;
  onChangeAllocation: (skillCode: string, delta: number) => void;
  disableAllocation: boolean;
}

const CharacterSheet: React.FC<CharacterSheetProps> = ({
  character,
  skills,
  raceName,
  subraceName,
  remaining,
  allocations,
  racialBonuses,
  onChangeAllocation,
  disableAllocation
}) => {
  const [activeTab, setActiveTab] = React.useState<string>("Weapons");

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

      <div style={{ display: "grid", gridTemplateColumns: "260px 300px 1fr", gap: "1rem" }}>
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
              <span>Hero Points</span>
              <strong>—</strong>
            </div>
            <div style={pillStyle}>
              <span>Fate</span>
              <strong>—</strong>
            </div>
            <div style={pillStyle}>
              <span>Defense DC</span>
              <strong>—</strong>
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
              <div style={{ fontSize: 12, color: "#9aa3b5" }}>Pool: {SKILL_POINT_POOL}</div>
            </div>
            <div style={{ overflowY: "auto", padding: "0.5rem 0.75rem", flex: 1 }}>
              {skills.length === 0 ? (
                <div style={{ padding: "0.5rem 0.25rem", color: "#9aa3b5" }}>No skills defined yet.</div>
              ) : (
                skills.map((skill) => {
                  const code = getSkillCode(skill);
                  const allocated = allocations[code] ?? 0;
                  const racial = racialBonuses[code] ?? 0;
                  const total = allocated + racial;
                  const disableInc = disableAllocation || remaining <= 0;
                  const disableDec = disableAllocation || allocated <= 0;
                  return (
                    <div
                      key={code}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 70px 70px 80px",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.4rem 0.25rem",
                        borderBottom: "1px solid #1f242d"
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
                          style={{ padding: "0.2rem 0.4rem" }}
                        >
                          -
                        </button>
                        <div style={{ width: 28, textAlign: "center" }}>{allocated}</div>
                        <button
                          onClick={() => onChangeAllocation(code, 1)}
                          disabled={disableInc}
                          style={{ padding: "0.2rem 0.4rem" }}
                        >
                          +
                        </button>
                      </div>
                      <div style={{ color: racial >= 0 ? "#9ae6b4" : "#f7a046", fontSize: 12 }}>
                        Racial {racial >= 0 ? "+" : ""}
                        {racial}
                      </div>
                      <div style={{ fontWeight: 700, textAlign: "right" }}>{total}</div>
                    </div>
                  );
                })
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
  const [name, setName] = React.useState("");
  const [raceKey, setRaceKey] = React.useState<string>("");
  const [subraceKey, setSubraceKey] = React.useState<string>("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [skillAllocations, setSkillAllocations] = React.useState<SkillAllocationMap>({});

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
        if (!selectedId && data.length) {
          setSelectedId(data[0].id);
        }
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

  const onCreate = async () => {
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const created = await api.createCharacter({
        name: name.trim(),
        level: 1,
        raceKey: raceKey || undefined,
        subraceKey: subraceKey || undefined
      });
      if (!created || !isCharacter(created)) {
        setError("Unexpected response when creating character.");
        return;
      }
      setCharacters((prev) => [...prev, created]);
      setName("");
      setSelectedId(created.id);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to create character";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onChangeAllocation = (skillCode: string, delta: number) => {
    setSkillAllocations((prev) => {
      if (!selectedId) return prev;
      const current = prev[selectedId] ?? {};
      const currentValue = current[skillCode] ?? 0;
      const nextValue = Math.max(0, currentValue + delta);
      const currentTotal = sumAllocations(current);
      const proposedTotal = currentTotal - currentValue + nextValue;
      if (proposedTotal > SKILL_POINT_POOL) return prev;
      return {
        ...prev,
        [selectedId]: {
          ...current,
          [skillCode]: nextValue
        }
      };
    });
  };

  const selectedCharacter = characters.find((c) => c.id === selectedId) || null;
  const currentAllocations = selectedCharacter && skillAllocations[selectedCharacter.id] ? skillAllocations[selectedCharacter.id] : {};
  const totalAllocated = sumAllocations(currentAllocations);
  const remaining = SKILL_POINT_POOL - totalAllocated;

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

  const availableSubraces = React.useMemo(
    () =>
      (definitions?.subraces ?? []).filter(
        (s) => !raceKey || (s.parentId ? s.parentId === raceKey : true)
      ),
    [definitions, raceKey]
  );

  const racialBonuses = React.useMemo(
    () => computeRacialSkillBonuses(definitions ?? null, selectedCharacter),
    [definitions, selectedCharacter]
  );

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
            <div style={{ fontSize: 14, color: "#9aa3b5", marginBottom: 6 }}>Create Character</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                disabled={isSubmitting}
              />
              <select
                value={raceKey}
                onChange={(e) => {
                  setRaceKey(e.target.value);
                  setSubraceKey("");
                }}
                disabled={isSubmitting || definitionsLoading}
              >
                <option value="">Select race</option>
                {(definitions?.races ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select
                value={subraceKey}
                onChange={(e) => setSubraceKey(e.target.value)}
                disabled={isSubmitting || definitionsLoading}
              >
                <option value="">Select subrace</option>
                {availableSubraces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                onClick={onCreate}
                disabled={isSubmitting || !name.trim()}
                style={{ padding: "0.4rem 0.6rem" }}
              >
                {isSubmitting ? "Creating..." : "Create"}
              </button>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 14, color: "#9aa3b5", marginBottom: 6 }}>Characters</div>
            {loading && <p style={{ margin: 0 }}>Loading characters...</p>}
            {!loading && characters.length === 0 && <p style={{ margin: 0 }}>No characters yet.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {characters.map((c) => {
                const selected = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    style={{
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
              allocations={currentAllocations}
              racialBonuses={racialBonuses}
              onChangeAllocation={onChangeAllocation}
              disableAllocation={loadingAny}
            />
          )}
        </main>
      </div>
    </div>
  );
};
