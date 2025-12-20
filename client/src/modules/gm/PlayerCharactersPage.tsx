import React from "react";
import { api, Character } from "../../api/client";
import { useDefinitions } from "../definitions/DefinitionsContext";
import "./PlayerCharactersPage.css";

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
    <div className="gm-player-characters">
      <header>
        <h2 className="gm-player-characters__title h2">Player Characters</h2>
        <p className="gm-player-characters__subtitle subtitle muted">
          Review player character sheets without switching to the player UI.
        </p>
      </header>

      {error && <div className="gm-player-characters__error body">{error}</div>}

      <div className="gm-player-characters__layout">
        <section className="gm-player-characters__card">
          <div className="gm-player-characters__card-header">
            <h3 className="gm-player-characters__card-title h3">Characters</h3>
            {loading && <span className="gm-player-characters__loading caption muted">Loading...</span>}
          </div>
          {characters.length === 0 && !loading ? (
            <p className="gm-player-characters__muted body muted">No characters found.</p>
          ) : (
            <div className="gm-player-characters__list">
              {characters.map((character) => {
                const isActive = character.id === selectedId;
                return (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => setSelectedId(character.id)}
                    className={`gm-player-characters__item${isActive ? " gm-player-characters__item--active" : ""}`}
                  >
                    <div className="gm-player-characters__item-title">{character.name}</div>
                    <div className="gm-player-characters__item-meta">Level {character.level}</div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="gm-player-characters__card gm-player-characters__card--tall">
          {!selectedCharacter ? (
            <p className="gm-player-characters__muted body muted">Select a character to view details.</p>
          ) : (
            <div className="gm-player-characters__details">
              <div className="gm-player-characters__details-header">
                <div>
                  <h3 className="gm-player-characters__details-title h3">{selectedCharacter.name}</h3>
                  <div className="gm-player-characters__details-meta">
                    Level {selectedCharacter.level} • {formatLabel(raceMap.get(selectedCharacter.raceKey ?? "") ?? selectedCharacter.raceKey)}
                    {selectedCharacter.subraceKey ? ` / ${subraceMap.get(selectedCharacter.subraceKey)?.name ?? selectedCharacter.subraceKey}` : ""}
                  </div>
                </div>
                <div className="gm-player-characters__pill-row">
                  <span className="gm-player-characters__pill">Skill Points: {selectedCharacter.skillPoints}</span>
                  <span className="gm-player-characters__pill">Skill Total: {summarizeSkillTotals(selectedCharacter)}</span>
                  {selectedCharacter.fatePoints !== undefined && (
                    <span className="gm-player-characters__pill">Fate Points: {selectedCharacter.fatePoints}</span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="gm-player-characters__section-title h3">Attributes</h4>
                <div className="gm-player-characters__attributes">
                  {attributeOrder.map((key) => (
                    <div key={key} className="gm-player-characters__attribute">
                      <div className="gm-player-characters__attribute-label">{key}</div>
                      <div className="gm-player-characters__attribute-value">{selectedCharacter.attributes?.[key] ?? 0}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="gm-player-characters__section-title h3">Backgrounds</h4>
                <div className="gm-player-characters__backgrounds">
                  <div>Family: {formatLabel(selectedCharacter.backgrounds?.family)}</div>
                  <div>Childhood: {formatLabel(selectedCharacter.backgrounds?.childhood)}</div>
                  <div>Adolescence: {formatLabel(selectedCharacter.backgrounds?.adolescence)}</div>
                  <div>Adulthood: {joinList(selectedCharacter.backgrounds?.adulthood)}</div>
                  <div>Inciting Incident: {formatLabel(selectedCharacter.backgrounds?.incitingIncident)}</div>
                  <div>Flaws: {joinList(selectedCharacter.backgrounds?.flaws)}</div>
                </div>
              </div>

              <div className="gm-player-characters__notes">
                <div>
                  <h4 className="gm-player-characters__section-title h3">Notes</h4>
                  <p className="gm-player-characters__note-text">{selectedCharacter.notes?.trim() || "No notes."}</p>
                </div>
                <div>
                  <h4 className="gm-player-characters__section-title h3">Gear Notes</h4>
                  <p className="gm-player-characters__note-text">{selectedCharacter.gearNotes?.trim() || "No gear notes."}</p>
                </div>
                <div>
                  <h4 className="gm-player-characters__section-title h3">Defense Notes</h4>
                  <p className="gm-player-characters__note-text">{selectedCharacter.defenseNotes?.trim() || "No defense notes."}</p>
                </div>
                <div>
                  <h4 className="gm-player-characters__section-title h3">Weapon Notes</h4>
                  <p className="gm-player-characters__note-text">{selectedCharacter.weaponNotes?.trim() || "No weapon notes."}</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
