import React from "react";
import { api, Character } from "../../api/client";
import { useDefinitions } from "../definitions/DefinitionsContext";

const cardStyle: React.CSSProperties = {
  background: "#0f131a",
  border: "1px solid #1f2935",
  borderRadius: 12,
  padding: "1rem"
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0.2rem 0.55rem",
  borderRadius: 999,
  border: "1px solid #1f2935",
  background: "#0b1017",
  color: "#cbd5e1",
  fontSize: 12,
  fontWeight: 600
};

const attributeOrder = ["PHYSICAL", "MENTAL", "SPIRITUAL", "WILL"];

const formatLabel = (value: string | undefined) => (value && value.trim().length > 0 ? value : "Unknown");

const joinList = (values: string[] | undefined) => (values && values.length > 0 ? values.join(", ") : "None");

const buildRaceMaps = (definitions: ReturnType<typeof useDefinitions>["data"]) => {
  const raceMap = new Map<string, string>();
  const subraceMap = new Map<string, { name: string; raceKey: string }>();
  definitions?.races?.forEach((race) => {
    if (race.code) raceMap.set(race.code, race.name);
  });
  definitions?.subraces?.forEach((subrace) => {
    if (subrace.code && subrace.parentId) subraceMap.set(subrace.code, { name: subrace.name, raceKey: subrace.parentId });
  });
  return { raceMap, subraceMap };
};

const summarizeSkillTotals = (character: Character) => {
  const allocations = Object.values(character.skillAllocations ?? {}).reduce((sum, value) => sum + value, 0);
  const bonuses = Object.values(character.skillBonuses ?? {}).reduce((sum, value) => sum + value, 0);
  return allocations + bonuses;
};

export const PlayerCharactersPage: React.FC = () => {
  const { data: definitions } = useDefinitions();
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { raceMap, subraceMap } = React.useMemo(() => buildRaceMaps(definitions), [definitions]);

  React.useEffect(() => {
    let active = true;
    const fetchCharacters = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await api.listCharacters();
        if (!active) return;
        setCharacters(list);
        if (!selectedId && list.length > 0) setSelectedId(list[0].id);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Unable to load characters";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchCharacters();
    return () => {
      active = false;
    };
  }, []);

  const selectedCharacter = characters.find((character) => character.id === selectedId) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Player Characters</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#cbd5e1" }}>
          Review player character sheets without switching to the player UI.
        </p>
      </header>

      {error && <div style={{ color: "#f87171" }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) 2fr", gap: "1rem" }}>
        <section style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Characters</h3>
            {loading && <span style={{ color: "#9ca3af", fontSize: 12 }}>Loading...</span>}
          </div>
          {characters.length === 0 && !loading ? (
            <p style={{ color: "#94a3b8", margin: 0 }}>No characters found.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {characters.map((character) => {
                const isActive = character.id === selectedId;
                return (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => setSelectedId(character.id)}
                    style={{
                      textAlign: "left",
                      border: isActive ? "1px solid #2563eb" : "1px solid #1f2935",
                      background: isActive ? "#101a2c" : "#0c111a",
                      color: "#e5e7eb",
                      padding: "0.6rem",
                      borderRadius: 10,
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{character.name}</div>
                    <div style={{ color: "#9ca3af", fontSize: 12 }}>Level {character.level}</div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section style={{ ...cardStyle, minHeight: 320 }}>
          {!selectedCharacter ? (
            <p style={{ color: "#94a3b8", margin: 0 }}>Select a character to view details.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{selectedCharacter.name}</h3>
                  <div style={{ color: "#9ca3af", fontSize: 13 }}>
                    Level {selectedCharacter.level} • {formatLabel(raceMap.get(selectedCharacter.raceKey ?? "") ?? selectedCharacter.raceKey)}
                    {selectedCharacter.subraceKey ? ` / ${subraceMap.get(selectedCharacter.subraceKey)?.name ?? selectedCharacter.subraceKey}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={pillStyle}>Skill Points: {selectedCharacter.skillPoints}</span>
                  <span style={pillStyle}>Skill Total: {summarizeSkillTotals(selectedCharacter)}</span>
                  {selectedCharacter.fatePoints !== undefined && (
                    <span style={pillStyle}>Fate Points: {selectedCharacter.fatePoints}</span>
                  )}
                </div>
              </div>

              <div>
                <h4 style={{ marginBottom: 6 }}>Attributes</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.5rem" }}>
                  {attributeOrder.map((key) => (
                    <div key={key} style={{ border: "1px solid #1f2935", borderRadius: 10, padding: "0.6rem", background: "#0c111a" }}>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{key}</div>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{selectedCharacter.attributes?.[key] ?? 0}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 style={{ marginBottom: 6 }}>Backgrounds</h4>
                <div style={{ display: "grid", gap: "0.35rem", color: "#cbd5e1", fontSize: 14 }}>
                  <div>Family: {formatLabel(selectedCharacter.backgrounds?.family)}</div>
                  <div>Childhood: {formatLabel(selectedCharacter.backgrounds?.childhood)}</div>
                  <div>Adolescence: {formatLabel(selectedCharacter.backgrounds?.adolescence)}</div>
                  <div>Adulthood: {joinList(selectedCharacter.backgrounds?.adulthood)}</div>
                  <div>Inciting Incident: {formatLabel(selectedCharacter.backgrounds?.incitingIncident)}</div>
                  <div>Flaws: {joinList(selectedCharacter.backgrounds?.flaws)}</div>
                </div>
              </div>

              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div>
                  <h4 style={{ marginBottom: 6 }}>Notes</h4>
                  <p style={{ margin: 0, color: "#cbd5e1" }}>{selectedCharacter.notes?.trim() || "No notes."}</p>
                </div>
                <div>
                  <h4 style={{ marginBottom: 6 }}>Gear Notes</h4>
                  <p style={{ margin: 0, color: "#cbd5e1" }}>{selectedCharacter.gearNotes?.trim() || "No gear notes."}</p>
                </div>
                <div>
                  <h4 style={{ marginBottom: 6 }}>Defense Notes</h4>
                  <p style={{ margin: 0, color: "#cbd5e1" }}>{selectedCharacter.defenseNotes?.trim() || "No defense notes."}</p>
                </div>
                <div>
                  <h4 style={{ marginBottom: 6 }}>Weapon Notes</h4>
                  <p style={{ margin: 0, color: "#cbd5e1" }}>{selectedCharacter.weaponNotes?.trim() || "No weapon notes."}</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
