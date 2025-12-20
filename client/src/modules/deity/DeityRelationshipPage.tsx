import React, { useEffect, useMemo, useState } from "react";
import deityData from "../../data/deity_relationships.json";
import { api, Character, RaceDetailProfile } from "../../api/client";
import { useDefinitions } from "../definitions/DefinitionsContext";
import "./DeityRelationshipPage.css";

type WorshipAction = {
  name: string;
  value: number | null;
  type: "active" | "passive";
};

type DivineIntervention = {
  spell: string;
  effect: string;
};

type DivineInterventionChoices = {
  choose: number;
  options: string[];
};

type Deity = {
  name: string;
  sect: string;
  alignment: string;
  worship: WorshipAction[];
  divineInterventions: DivineIntervention[] | DivineInterventionChoices;
};

type DeityRelationshipData = {
  currency: {
    name: string;
    currentKey: string;
    capKey: string;
    capFormula: string;
    racialCapBonusOptions: number[];
    capTiers: Record<string, string>;
  };
  sects: Array<{ name: string; alignment: string }>;
  mechanics: {
    apostasy: string;
    spiritualLimit: string;
    worshipGeneration: {
      passive: string;
      active: string;
      fallback: string;
    };
    casting: {
      divineInterventionCost: string;
      beseech: string;
    };
    gearIntegration: {
      equipmentSlots: string[];
      effects: Record<string, string>;
    };
    worshipTracker: string;
  };
  deities: Deity[];
};

type WorshipLogEntry = {
  id: string;
  deity: string;
  action: string;
  type: WorshipAction["type"];
  perAction: number;
  count: number;
  total: number;
};

const evaluateTierFormula = (formula: string, spiritualAttribute: number) => {
  const match = formula.match(/(\d+)\s*\+\s*\(\s*(\d+)\s*\*\s*Spiritual Attribute\s*\)/i);
  if (!match) return null;
  const base = Number(match[1]);
  const multiplier = Number(match[2]);
  return base + multiplier * spiritualAttribute;
};

export const DeityRelationshipPage: React.FC = () => {
  const data = deityData as DeityRelationshipData;
  const { data: definitions } = useDefinitions();
  const raceDetails = (definitions?.raceDetails ?? {}) as Record<string, RaceDetailProfile>;

  const hasDeityData =
    data && Array.isArray(data.deities) && data.deities.length > 0 && Array.isArray(data.sects) && data.sects.length > 0;

  const safeData: DeityRelationshipData = hasDeityData
    ? data
    : {
        currency: {
          name: "DeityRelationshipPoints",
          currentKey: "current",
          capKey: "cap",
          capFormula: "Spiritual Attribute * (10 + racial cap bonus)",
          racialCapBonusOptions: [],
          capTiers: {}
        },
        sects: [],
        mechanics: {
          apostasy: "",
          spiritualLimit: "",
          worshipGeneration: { passive: "", active: "", fallback: "" },
          casting: { divineInterventionCost: "", beseech: "" },
          gearIntegration: { equipmentSlots: [], effects: {} },
          worshipTracker: ""
        },
        deities: []
      };

  const [spiritualAttribute, setSpiritualAttribute] = useState(3);
  const [racialCapBonus, setRacialCapBonus] = useState(0);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("");
  const [characterError, setCharacterError] = useState<string | null>(null);
  const [loadingCharacters, setLoadingCharacters] = useState(false);
  const [selectedDeityName, setSelectedDeityName] = useState(safeData.deities[0]?.name ?? "");
  const [selectedActionName, setSelectedActionName] = useState<string>(safeData.deities[0]?.worship[0]?.name ?? "");
  const [timesPerformed, setTimesPerformed] = useState(1);
  const [logEntries, setLogEntries] = useState<WorshipLogEntry[]>([]);

  useEffect(() => {
    setLoadingCharacters(true);
    setCharacterError(null);
    api
      .listCharacters()
      .then((list) => setCharacters(list))
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Failed to load characters";
        setCharacterError(message);
      })
      .finally(() => setLoadingCharacters(false));
  }, []);

  const selectedCharacter = useMemo(
    () => characters.find((c) => c.id === selectedCharacterId),
    [characters, selectedCharacterId]
  );

  const computeRacialCapBonus = (character: Character | undefined): number => {
    if (!character) return 0;
    const raceBonus = raceDetails[character.raceKey ?? ""]?.disciplines?.deityCapPerSpirit ??
      raceDetails[character.raceKey ?? ""]?.deityCapPerSpirit ??
      0;
    const subraceBonus = raceDetails[character.subraceKey ?? ""]?.disciplines?.deityCapPerSpirit ??
      raceDetails[character.subraceKey ?? ""]?.deityCapPerSpirit ??
      0;
    return raceBonus + subraceBonus;
  };

  useEffect(() => {
    if (!selectedCharacter) return;
    const spiritual = selectedCharacter.attributes?.SPIRITUAL ?? selectedCharacter.attributes?.spiritual ?? 0;
    setSpiritualAttribute(spiritual);
    setRacialCapBonus(computeRacialCapBonus(selectedCharacter));
  }, [selectedCharacter, raceDetails]);

  const cap = spiritualAttribute * (10 + racialCapBonus);
  const spiritualLimit = spiritualAttribute;

  const capTiers = useMemo(() => {
    return Object.entries(safeData.currency.capTiers).map(([tier, formula]) => ({
      tier,
      formula,
      target: evaluateTierFormula(formula, spiritualAttribute)
    }));
  }, [safeData.currency.capTiers, spiritualAttribute]);

  const groupedDeities = useMemo(() => {
    const bySect = new Map<string, Deity[]>();
    safeData.deities.forEach((deity) => {
      if (!bySect.has(deity.sect)) bySect.set(deity.sect, []);
      bySect.get(deity.sect)!.push(deity);
    });
    safeData.sects.forEach((sect) => {
      if (!bySect.has(sect.name)) bySect.set(sect.name, []);
    });
    return Array.from(bySect.entries())
      .map(([sect, deities]) => ({
        sect,
        deities: [...deities].sort((a, b) => a.name.localeCompare(b.name))
      }))
      .sort((a, b) => a.sect.localeCompare(b.sect));
  }, [safeData.deities, safeData.sects]);

  const selectedDeity = useMemo(
    () => safeData.deities.find((deity) => deity.name === selectedDeityName) ?? safeData.deities[0],
    [safeData.deities, selectedDeityName]
  );

  const availableActions = selectedDeity?.worship ?? [];

  useEffect(() => {
    if (!availableActions.length) {
      setSelectedActionName("");
      return;
    }
    if (!availableActions.some((action) => action.name === selectedActionName)) {
      setSelectedActionName(availableActions[0].name);
    }
  }, [availableActions, selectedActionName]);

  const computeActionDr = (action: WorshipAction) => {
    if (action.type === "passive") {
      return 3 * spiritualAttribute;
    }
    if (typeof action.value === "number") {
      return action.value * spiritualAttribute;
    }
    return 0;
  };

  const addLogEntry = () => {
    if (!selectedDeity || !selectedActionName || timesPerformed <= 0) return;
    const action = availableActions.find((item) => item.name === selectedActionName);
    if (!action) return;
    const perAction = computeActionDr(action);
    const count = Math.max(1, timesPerformed);
    const total = perAction * count;
    const entry: WorshipLogEntry = {
      id: `${selectedDeity.name}-${action.name}-${Date.now()}`,
      deity: selectedDeity.name,
      action: action.name,
      type: action.type,
      perAction,
      count,
      total
    };
    setLogEntries((prev) => [...prev, entry]);
  };

  const removeEntry = (id: string) => {
    setLogEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const totalLoggedDr = logEntries.reduce((sum, entry) => sum + entry.total, 0);

  return (
    <div className="deity-page">
      <header className="deity-header">
        <h1 className="deity-title">Deity Relationship</h1>
        <p className="deity-intro">
          Manage Deity Relationship Points (DR), cap tiers, worship generation, beseech options, and sect-specific
          deities.
        </p>
        {!hasDeityData && (
          <div className="deity-warning">
            Data for deities failed to load. Showing an empty template so the page remains usable.
          </div>
        )}
        {characterError && <div className="deity-warning">{characterError}</div>}
      </header>

      <section className="deity-grid">
        <div className="deity-card">
          <h2 className="deity-card-title">Inputs</h2>
          <label className="deity-label">
            Character
            <select
              value={selectedCharacterId}
              onChange={(e) => setSelectedCharacterId(e.target.value)}
              disabled={loadingCharacters}
              className="deity-control"
            >
              <option value="">Manual entry</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="deity-label">
            Spiritual Attribute
            <input
              type="number"
              value={spiritualAttribute}
              min={0}
              onChange={(e) => setSpiritualAttribute(Number(e.target.value) || 0)}
              onWheel={(e) => e.preventDefault()}
              className="deity-control"
            />
          </label>
          <label className="deity-label">
            Racial Cap Bonus
            <select
              value={racialCapBonus}
              onChange={(e) => setRacialCapBonus(Number(e.target.value))}
              className="deity-control"
            >
              {[0, ...safeData.currency.racialCapBonusOptions].map((bonus) => (
                <option key={bonus} value={bonus}>
                  {bonus}
                </option>
              ))}
            </select>
            {selectedCharacter && (
              <div className="deity-note">
                Auto-set from {selectedCharacter.name}'s race/subrace.
              </div>
            )}
          </label>
          <div className="deity-subtle">
            Spiritual limit: dedicate to {spiritualLimit} deities max.
          </div>
        </div>

        <div className="deity-card">
          <h2 className="deity-card-title">Cap & Currency</h2>
          <div className="deity-cap">{cap}</div>
          <div className="deity-muted deity-spacing">
            {safeData.currency.name}: {safeData.currency.currentKey} / {safeData.currency.capKey}
          </div>
          <ul className="deity-list">
            {capTiers.map((tier) => (
              <li key={tier.tier}>
                {tier.tier}% cap target: {tier.target ?? "-"} ({tier.formula})
              </li>
            ))}
          </ul>
        </div>

        <div className="deity-card">
          <h2 className="deity-card-title">Worship Generation</h2>
          <ul className="deity-list">
            <li>
              Passive: {safeData.mechanics.worshipGeneration.passive} ⇒ {3 * spiritualAttribute} DR
            </li>
            <li>Active: {safeData.mechanics.worshipGeneration.active}</li>
            <li>Fallback: {safeData.mechanics.worshipGeneration.fallback} ⇒ {spiritualAttribute} DR</li>
          </ul>
        </div>
      </section>

      <section className="deity-card">
        <h2 className="deity-heading">Mechanics & Gear</h2>
        <div className="deity-gear-grid">
          <div>
            <h3 className="deity-heading">Rules</h3>
            <ul className="deity-list">
              <li>{safeData.mechanics.apostasy}</li>
              <li>{safeData.mechanics.spiritualLimit}</li>
              <li>{safeData.mechanics.casting.divineInterventionCost}</li>
              <li>{safeData.mechanics.casting.beseech}</li>
            </ul>
          </div>
          <div>
            <h3 className="deity-heading">Gear Integration</h3>
            <ul className="deity-list">
              {safeData.mechanics.gearIntegration.equipmentSlots.map((slot) => (
                <li key={slot}>
                  <strong>{slot}:</strong> {safeData.mechanics.gearIntegration.effects[slot]}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="deity-heading">Worship Tracker</h3>
            <p className="deity-paragraph">{safeData.mechanics.worshipTracker}</p>
          </div>
        </div>
      </section>

      <section className="deity-card">
        <h2 className="deity-heading">Worship Log</h2>
        <div className="deity-grid-tight">
          <label className="deity-label">
            Deity
            <select
              value={selectedDeity?.name ?? ""}
              onChange={(e) => setSelectedDeityName(e.target.value)}
              className="deity-control"
            >
              {safeData.deities.map((deity) => (
                <option key={deity.name} value={deity.name}>
                  {deity.name} ({deity.sect})
                </option>
              ))}
            </select>
          </label>
          <label className="deity-label">
            Worship Action
            <select
              value={selectedActionName}
              onChange={(e) => setSelectedActionName(e.target.value)}
              className="deity-control"
            >
              {availableActions.map((action) => (
                <option key={action.name} value={action.name}>
                  {action.name} ({action.type})
                </option>
              ))}
            </select>
          </label>
          <label className="deity-label">
            Times Performed
            <input
              type="number"
              value={timesPerformed}
              min={1}
              onChange={(e) => setTimesPerformed(Number(e.target.value) || 1)}
              onWheel={(e) => e.preventDefault()}
              className="deity-control"
            />
          </label>
        </div>
        <div className="deity-row">
          <div className="deity-action-text">
            Estimated gain: {(() => {
              const action = availableActions.find((item) => item.name === selectedActionName);
              return action ? computeActionDr(action) * Math.max(1, timesPerformed) : 0;
            })()} DR
          </div>
          <button
            type="button"
            onClick={addLogEntry}
            className="deity-button deity-button--add"
          >
            Add Entry
          </button>
          <div className="deity-total">Total Logged: {totalLoggedDr} DR</div>
        </div>

        <div className="deity-table-wrap">
          <table className="deity-table">
            <thead>
              <tr>
                <th>Deity</th>
                <th>Action</th>
                <th>Type</th>
                <th>DR per</th>
                <th>Count</th>
                <th>Total DR</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {logEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="deity-empty">
                    No worship actions logged yet.
                  </td>
                </tr>
              ) : (
                logEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.deity}</td>
                    <td>{entry.action}</td>
                    <td className="deity-type">{entry.type}</td>
                    <td>{entry.perAction}</td>
                    <td>{entry.count}</td>
                    <td>{entry.total}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        className="deity-button deity-button--remove"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="deity-card">
        <h2 className="deity-heading">Sects & Deities</h2>
        <div className="deity-sect-grid">
          {groupedDeities.map((group) => (
            <div key={group.sect} className="deity-sect-card">
              <h3 className="deity-sect-title">{group.sect}</h3>
              <div className="deity-sect-meta">
                Alignment: {safeData.sects.find((sect) => sect.name === group.sect)?.alignment ?? ""}
              </div>
              {group.deities.length === 0 && <div className="deity-sect-empty">No deities listed.</div>}
              {group.deities.map((deity) => (
                <div key={deity.name} className="deity-sect-divider">
                  <div className="deity-sect-row">
                    <strong>{deity.name}</strong>
                    <span className="deity-sect-alignment">{deity.alignment}</span>
                  </div>
                  <div className="deity-section-spacing">
                    <div className="deity-section-heading">Worship</div>
                    <ul className="deity-list-tight">
                      {deity.worship.map((action) => (
                        <li key={action.name}>
                          <strong>{action.name}</strong> ({action.type}) —{" "}
                          {action.type === "passive"
                            ? `${3 * spiritualAttribute} DR when conditions met`
                            : `${action.value ?? 0} × Spiritual (${(action.value ?? 0) * spiritualAttribute} DR)`}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="deity-section-spacing">
                    <div className="deity-section-heading">Divine Interventions</div>
                    {Array.isArray(deity.divineInterventions) ? (
                      <ul className="deity-list-tight">
                        {deity.divineInterventions.map((spell) => (
                          <li key={spell.spell}>
                            <strong>{spell.spell}:</strong> {spell.effect}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ul className="deity-list-tight">
                        <li>
                          Choose {deity.divineInterventions.choose} from: {deity.divineInterventions.options.join(", ")}
                        </li>
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
