import React, { useEffect, useMemo, useState } from "react";
import deityData from "../../data/deity_relationships.json";

type WorshipAction = {
  name: string;
  value: number | null;
  type: "active" | "passive";
};

type DivineIntervention = {
  spell: string;
  effect: string;
};

type Deity = {
  name: string;
  sect: string;
  alignment: string;
  worship: WorshipAction[];
  divineInterventions: DivineIntervention[];
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
  const [selectedDeityName, setSelectedDeityName] = useState(safeData.deities[0]?.name ?? "");
  const [selectedActionName, setSelectedActionName] = useState<string>(safeData.deities[0]?.worship[0]?.name ?? "");
  const [timesPerformed, setTimesPerformed] = useState(1);
  const [logEntries, setLogEntries] = useState<WorshipLogEntry[]>([]);

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
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <header style={{ borderBottom: "1px solid #333", paddingBottom: "0.5rem" }}>
        <h1 style={{ margin: 0 }}>Deity Relationship</h1>
        <p style={{ margin: "0.5rem 0", color: "#bbb" }}>
          Manage Deity Relationship Points (DR), cap tiers, worship generation, beseech options, and sect-specific
          deities.
        </p>
        {!hasDeityData && (
          <div style={{ color: "#f6ad55", marginTop: "0.25rem" }}>
            Data for deities failed to load. Showing an empty template so the page remains usable.
          </div>
        )}
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        <div style={{ border: "1px solid #333", padding: "1rem", borderRadius: 4 }}>
          <h2 style={{ marginTop: 0 }}>Inputs</h2>
          <label style={{ display: "block", marginBottom: "0.5rem" }}>
            Spiritual Attribute
            <input
              type="number"
              value={spiritualAttribute}
              min={0}
              onChange={(e) => setSpiritualAttribute(Number(e.target.value) || 0)}
              style={{ width: "100%", marginTop: 4, padding: 6, background: "#111", color: "#eee", border: "1px solid #444" }}
            />
          </label>
          <label style={{ display: "block", marginBottom: "0.5rem" }}>
            Racial Cap Bonus
            <select
              value={racialCapBonus}
              onChange={(e) => setRacialCapBonus(Number(e.target.value))}
              style={{ width: "100%", marginTop: 4, padding: 6, background: "#111", color: "#eee", border: "1px solid #444" }}
            >
              {[0, ...safeData.currency.racialCapBonusOptions].map((bonus) => (
                <option key={bonus} value={bonus}>
                  {bonus}
                </option>
              ))}
            </select>
          </label>
          <div style={{ marginTop: "0.5rem", fontSize: 14, color: "#ccc" }}>
            Spiritual limit: dedicate to {spiritualLimit} deities max.
          </div>
        </div>

        <div style={{ border: "1px solid #333", padding: "1rem", borderRadius: 4 }}>
          <h2 style={{ marginTop: 0 }}>Cap & Currency</h2>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{cap}</div>
          <div style={{ color: "#bbb", marginBottom: "0.75rem" }}>
            {safeData.currency.name}: {safeData.currency.currentKey} / {safeData.currency.capKey}
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#ccc", lineHeight: 1.5 }}>
            {capTiers.map((tier) => (
              <li key={tier.tier}>
                {tier.tier}% cap target: {tier.target ?? "-"} ({tier.formula})
              </li>
            ))}
          </ul>
        </div>

        <div style={{ border: "1px solid #333", padding: "1rem", borderRadius: 4 }}>
          <h2 style={{ marginTop: 0 }}>Worship Generation</h2>
          <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#ccc", lineHeight: 1.6 }}>
            <li>
              Passive: {safeData.mechanics.worshipGeneration.passive} ⇒ {3 * spiritualAttribute} DR
            </li>
            <li>Active: {safeData.mechanics.worshipGeneration.active}</li>
            <li>Fallback: {safeData.mechanics.worshipGeneration.fallback} ⇒ {spiritualAttribute} DR</li>
          </ul>
        </div>
      </section>

      <section style={{ border: "1px solid #333", padding: "1rem", borderRadius: 4 }}>
        <h2 style={{ marginTop: 0 }}>Mechanics & Gear</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
          <div>
            <h3 style={{ marginTop: 0 }}>Rules</h3>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#ccc", lineHeight: 1.6 }}>
              <li>{safeData.mechanics.apostasy}</li>
              <li>{safeData.mechanics.spiritualLimit}</li>
              <li>{safeData.mechanics.casting.divineInterventionCost}</li>
              <li>{safeData.mechanics.casting.beseech}</li>
            </ul>
          </div>
          <div>
            <h3 style={{ marginTop: 0 }}>Gear Integration</h3>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#ccc", lineHeight: 1.6 }}>
              {safeData.mechanics.gearIntegration.equipmentSlots.map((slot) => (
                <li key={slot}>
                  <strong>{slot}:</strong> {safeData.mechanics.gearIntegration.effects[slot]}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 style={{ marginTop: 0 }}>Worship Tracker</h3>
            <p style={{ margin: 0, color: "#ccc" }}>{safeData.mechanics.worshipTracker}</p>
          </div>
        </div>
      </section>

      <section style={{ border: "1px solid #333", padding: "1rem", borderRadius: 4 }}>
        <h2 style={{ marginTop: 0 }}>Worship Log</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
          <label style={{ display: "block" }}>
            Deity
            <select
              value={selectedDeity?.name ?? ""}
              onChange={(e) => setSelectedDeityName(e.target.value)}
              style={{ width: "100%", marginTop: 4, padding: 6, background: "#111", color: "#eee", border: "1px solid #444" }}
            >
              {safeData.deities.map((deity) => (
                <option key={deity.name} value={deity.name}>
                  {deity.name} ({deity.sect})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "block" }}>
            Worship Action
            <select
              value={selectedActionName}
              onChange={(e) => setSelectedActionName(e.target.value)}
              style={{ width: "100%", marginTop: 4, padding: 6, background: "#111", color: "#eee", border: "1px solid #444" }}
            >
              {availableActions.map((action) => (
                <option key={action.name} value={action.name}>
                  {action.name} ({action.type})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "block" }}>
            Times Performed
            <input
              type="number"
              value={timesPerformed}
              min={1}
              onChange={(e) => setTimesPerformed(Number(e.target.value) || 1)}
              style={{ width: "100%", marginTop: 4, padding: 6, background: "#111", color: "#eee", border: "1px solid #444" }}
            />
          </label>
        </div>
        <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ color: "#ccc" }}>
            Estimated gain: {(() => {
              const action = availableActions.find((item) => item.name === selectedActionName);
              return action ? computeActionDr(action) * Math.max(1, timesPerformed) : 0;
            })()} DR
          </div>
          <button
            type="button"
            onClick={addLogEntry}
            style={{ padding: "0.5rem 0.75rem", background: "#2f855a", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            Add Entry
          </button>
          <div style={{ marginLeft: "auto", color: "#9ae6b4", fontWeight: 700 }}>Total Logged: {totalLoggedDr} DR</div>
        </div>

        <div style={{ marginTop: "1rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #444" }}>
                <th style={{ padding: "0.5rem" }}>Deity</th>
                <th style={{ padding: "0.5rem" }}>Action</th>
                <th style={{ padding: "0.5rem" }}>Type</th>
                <th style={{ padding: "0.5rem" }}>DR per</th>
                <th style={{ padding: "0.5rem" }}>Count</th>
                <th style={{ padding: "0.5rem" }}>Total DR</th>
                <th style={{ padding: "0.5rem" }}>Remove</th>
              </tr>
            </thead>
            <tbody>
              {logEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "0.75rem", color: "#888", textAlign: "center" }}>
                    No worship actions logged yet.
                  </td>
                </tr>
              ) : (
                logEntries.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: "1px solid #222" }}>
                    <td style={{ padding: "0.5rem" }}>{entry.deity}</td>
                    <td style={{ padding: "0.5rem" }}>{entry.action}</td>
                    <td style={{ padding: "0.5rem", textTransform: "capitalize" }}>{entry.type}</td>
                    <td style={{ padding: "0.5rem" }}>{entry.perAction}</td>
                    <td style={{ padding: "0.5rem" }}>{entry.count}</td>
                    <td style={{ padding: "0.5rem" }}>{entry.total}</td>
                    <td style={{ padding: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        style={{ padding: "0.25rem 0.5rem", background: "#c53030", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
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

      <section style={{ border: "1px solid #333", padding: "1rem", borderRadius: 4 }}>
        <h2 style={{ marginTop: 0 }}>Sects & Deities</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          {groupedDeities.map((group) => (
            <div key={group.sect} style={{ border: "1px solid #333", padding: "0.75rem", borderRadius: 4, background: "#0d0d0d" }}>
              <h3 style={{ margin: "0 0 0.25rem" }}>{group.sect}</h3>
              <div style={{ fontSize: 12, color: "#999", marginBottom: "0.5rem" }}>
                Alignment: {safeData.sects.find((sect) => sect.name === group.sect)?.alignment ?? ""}
              </div>
              {group.deities.length === 0 && <div style={{ color: "#777" }}>No deities listed.</div>}
              {group.deities.map((deity) => (
                <div key={deity.name} style={{ borderTop: "1px solid #222", paddingTop: "0.5rem", marginTop: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "space-between" }}>
                    <strong>{deity.name}</strong>
                    <span style={{ fontSize: 12, color: "#999" }}>{deity.alignment}</span>
                  </div>
                  <div style={{ marginTop: "0.35rem" }}>
                    <div style={{ fontSize: 13, color: "#9ae6b4" }}>Worship</div>
                    <ul style={{ margin: "0.25rem 0", paddingLeft: "1.25rem", color: "#ccc", lineHeight: 1.5 }}>
                      {deity.worship.map((action) => (
                        <li key={action.name}>
                          <strong>{action.name}</strong> ({action.type}) — {" "}
                          {action.type === "passive"
                            ? `${3 * spiritualAttribute} DR when conditions met`
                            : `${action.value ?? 0} × Spiritual (${(action.value ?? 0) * spiritualAttribute} DR)`}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div style={{ marginTop: "0.35rem" }}>
                    <div style={{ fontSize: 13, color: "#9ae6b4" }}>Divine Interventions</div>
                    <ul style={{ margin: "0.25rem 0", paddingLeft: "1.25rem", color: "#ccc", lineHeight: 1.5 }}>
                      {deity.divineInterventions.map((spell) => (
                        <li key={spell.spell}>
                          <strong>{spell.spell}:</strong> {spell.effect}
                        </li>
                      ))}
                    </ul>
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
