import React from "react";
import facultiesText from "../../data/magic-faculties.txt?raw";
import { MAGIC_FACULTIES, ParsedFaculty, parseMagicFaculties } from "./magicParser";
import { GeneratedSpell, SpellGoal, generateSpell } from "./spellGenerator";

const cardStyle: React.CSSProperties = {
  background: "#1a202c",
  border: "1px solid #2d3748",
  borderRadius: 10,
  padding: "1rem 1.25rem",
  boxShadow: "0 2px 8px rgba(0,0,0,0.4)"
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.2rem 0.6rem",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.4,
  background: "#2f855a",
  color: "#f7fafc"
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  color: "#e2e8f0"
};

const inputStyle: React.CSSProperties = {
  padding: "0.4rem 0.6rem",
  borderRadius: 8,
  border: "1px solid #2d3748",
  background: "#0b1019",
  color: "#f7fafc"
};

const GoalToggle: React.FC<{
  goal: SpellGoal;
  active: boolean;
  onToggle: () => void;
}> = ({ goal, active, onToggle }) => (
  <button
    onClick={onToggle}
    style={{
      ...badgeStyle,
      background: active ? "#2f855a" : "#2d3748",
      color: active ? "#f7fafc" : "#cbd5e0",
      cursor: "pointer",
      border: "1px solid #2d3748"
    }}
  >
    {goal}
  </button>
);

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      ...badgeStyle,
      background: "#1f2937",
      color: "#e2e8f0",
      border: "1px solid #2d3748",
      marginRight: 6,
      marginBottom: 6
    }}
  >
    {children}
  </span>
);

const StatusList: React.FC<{ label: string; items: string[] }> = ({ label, items }) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ color: "#cbd5e0", fontWeight: 700, marginBottom: 4 }}>{label}</div>
    <div>{items.length ? items.map((status) => <Pill key={status}>{status}</Pill>) : <span style={{ color: "#a0aec0" }}>None</span>}</div>
  </div>
);

export const SpellCreationPage: React.FC = () => {
  const faculties = React.useMemo<ParsedFaculty[]>(() => parseMagicFaculties(facultiesText), []);
  const [primaryFaculty, setPrimaryFaculty] = React.useState<string>(MAGIC_FACULTIES[0].name);
  const [secondaryFaculty, setSecondaryFaculty] = React.useState<string | undefined>(MAGIC_FACULTIES[1]?.name);
  const [primaryTier, setPrimaryTier] = React.useState<number>(3);
  const [secondaryTier, setSecondaryTier] = React.useState<number>(2);
  const [goals, setGoals] = React.useState<SpellGoal[]>(["Damage", "Control"]);
  const [allowOpposedRing, setAllowOpposedRing] = React.useState<boolean>(true);
  const [seed, setSeed] = React.useState<string>(() => `auto-${Date.now().toString(36)}`);
  const [spell, setSpell] = React.useState<GeneratedSpell | null>(null);

  const primaryData = faculties.find((faculty) => faculty.name === primaryFaculty);
  const secondaryData = faculties.find((faculty) => faculty.name === secondaryFaculty);

  const primaryTierDetails = primaryData?.tiers[Math.min(primaryTier - 1, (primaryData?.tiers.length ?? 1) - 1)];
  const secondaryTierDetails = secondaryData?.tiers[Math.min(secondaryTier - 1, (secondaryData?.tiers.length ?? 1) - 1)];

  const handleGoalToggle = (goal: SpellGoal) => {
    setGoals((prev) => (prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]));
  };

  const handleGenerate = () => {
    const config = {
      primaryFaculty,
      secondaryFaculty: secondaryFaculty || undefined,
      primaryTier,
      secondaryTier: secondaryFaculty ? secondaryTier : undefined,
      goals,
      seed,
      allowOpposedRing
    };
    const generated = generateSpell(config, primaryTierDetails, secondaryTierDetails);
    setSpell(generated);
  };

  React.useEffect(() => {
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshSeed = () => {
    const nextSeed = `auto-${Math.random().toString(36).slice(2, 8)}`;
    setSeed(nextSeed);
  };

  return (
    <div style={{ color: "#e2e8f0" }}>
      <header style={{ marginBottom: "1rem" }}>
        <div style={badgeStyle}>Generator</div>
        <h1 style={{ margin: "0.35rem 0 0.25rem 0", color: "#f7fafc" }}>Automatic Spell Creation</h1>
        <p style={{ margin: 0, color: "#cbd5e0", maxWidth: 900 }}>
          Build fully composed spells from the Adûrun magic faculties. Choose intent, tiers, and resonance rules; the generator
          pulls tier text directly from the source document, applies aspect budgets, and returns an executable spell packet with
          statuses and costs.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: "1rem", alignItems: "start", marginBottom: "1rem" }}>
        <section style={cardStyle}>
          <h2 style={{ margin: "0 0 0.75rem 0", color: "#f7fafc" }}>Inputs</h2>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <label style={labelStyle}>
              <span>Primary Faculty</span>
              <select
                value={primaryFaculty}
                onChange={(e) => setPrimaryFaculty(e.target.value)}
                style={inputStyle}
              >
                {faculties.map((faculty) => (
                  <option key={faculty.name} value={faculty.name}>
                    {faculty.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Primary Tier</span>
              <input
                type="range"
                min={1}
                max={6}
                value={primaryTier}
                onChange={(e) => setPrimaryTier(Number(e.target.value))}
              />
              <div style={{ color: "#a0aec0" }}>Tier {primaryTier}</div>
            </label>

            <label style={labelStyle}>
              <span>Secondary Faculty (resonance)</span>
              <select
                value={secondaryFaculty}
                onChange={(e) => setSecondaryFaculty(e.target.value || undefined)}
                style={inputStyle}
              >
                <option value="">None</option>
                {faculties
                  .filter((faculty) => faculty.name !== primaryFaculty)
                  .map((faculty) => (
                    <option key={faculty.name} value={faculty.name}>
                      {faculty.name}
                    </option>
                  ))}
              </select>
            </label>

            {secondaryFaculty && (
              <label style={labelStyle}>
                <span>Secondary Tier</span>
                <input
                  type="range"
                  min={1}
                  max={6}
                  value={secondaryTier}
                  onChange={(e) => setSecondaryTier(Number(e.target.value))}
                />
                <div style={{ color: "#a0aec0" }}>Tier {secondaryTier}</div>
              </label>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(["Damage", "Control", "Mobility", "Support", "Hazard"] as SpellGoal[]).map((goal) => (
                <GoalToggle key={goal} goal={goal} active={goals.includes(goal)} onToggle={() => handleGoalToggle(goal)} />
              ))}
            </div>

            <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={allowOpposedRing}
                onChange={(e) => setAllowOpposedRing(e.target.checked)}
              />
              <span>Allow opposed ring/gradient if the faculty tier provides one</span>
            </label>

            <label style={labelStyle}>
              <span>Seed</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                />
                <button
                  onClick={refreshSeed}
                  style={{ ...badgeStyle, background: "#1a365d", border: "1px solid #2d3748", cursor: "pointer" }}
                >
                  Randomize
                </button>
              </div>
            </label>

            <button
              onClick={handleGenerate}
              style={{
                ...badgeStyle,
                background: "#2b6cb0",
                border: "1px solid #2c5282",
                width: "fit-content",
                padding: "0.4rem 0.9rem",
                cursor: "pointer"
              }}
            >
              Generate spell
            </button>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={{ margin: "0 0 0.25rem 0", color: "#f7fafc" }}>Generated Spell</h2>
          {spell ? (
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{spell.name}</div>
              <div style={{ color: "#a0aec0", marginBottom: 12 }}>{spell.tagline}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                <Pill>
                  Core: {spell.primaryFaculty} · Tier {spell.primaryTier}
                </Pill>
                {spell.secondaryFaculty && (
                  <Pill>
                    Resonant: {spell.secondaryFaculty} · Tier {spell.secondaryTier}
                  </Pill>
                )}
                {spell.ringSegment && <Pill>Opposed ring enabled</Pill>}
                <Pill>AP/Energy Cost: {spell.totalCost}</Pill>
                <Pill>Seed: {spell.seed}</Pill>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ color: "#cbd5e0", fontWeight: 700, marginBottom: 6 }}>Tags</div>
                <div>{spell.tags.length ? spell.tags.map((tag) => <Pill key={tag}>{tag}</Pill>) : <span style={{ color: "#a0aec0" }}>No tags derived</span>}</div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ color: "#cbd5e0", fontWeight: 700, marginBottom: 6 }}>Aspect Plan</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                  {Object.entries(spell.aspectPlan).map(([aspect, tierValue]) => (
                    <div key={aspect} style={{ ...badgeStyle, background: "#1f2937", color: "#e2e8f0" }}>
                      {aspect}: Tier {tierValue}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <div style={{ background: "#111827", borderRadius: 8, padding: "0.75rem", border: "1px solid #2d3748" }}>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>Primary Payload</div>
                  <div style={{ color: "#cbd5e0", marginBottom: 8 }}>{spell.primarySegment.primaryEffect}</div>
                  {spell.primarySegment.consequence && (
                    <div style={{ color: "#a0aec0", marginBottom: 8 }}>
                      <strong>Environmental:</strong> {spell.primarySegment.consequence}
                    </div>
                  )}
                  <StatusList label="Statuses" items={[...spell.primarySegment.statusesPrimary]} />
                </div>

                {spell.ringSegment && (
                  <div style={{ background: "#111827", borderRadius: 8, padding: "0.75rem", border: "1px solid #2d3748" }}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>Opposed Ring</div>
                    <div style={{ color: "#cbd5e0", marginBottom: 8 }}>{spell.ringSegment.consequence || spell.ringSegment.primaryEffect}</div>
                    <StatusList label="Ring Statuses" items={[...spell.ringSegment.statusesRing, ...spell.ringSegment.statusesPrimary]} />
                  </div>
                )}

                {spell.resonantSegment && (
                  <div style={{ background: "#111827", borderRadius: 8, padding: "0.75rem", border: "1px solid #2d3748" }}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>Resonant Blend ({spell.secondaryFaculty})</div>
                    <div style={{ color: "#cbd5e0", marginBottom: 8 }}>{spell.resonantSegment.primaryEffect}</div>
                    {spell.resonantSegment.consequence && (
                      <div style={{ color: "#a0aec0", marginBottom: 8 }}>
                        <strong>Environmental:</strong> {spell.resonantSegment.consequence}
                      </div>
                    )}
                    <StatusList label="Resonant Statuses" items={[...spell.resonantSegment.statusesPrimary, ...spell.resonantSegment.statusesRing]} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: "#a0aec0" }}>Generate to see a complete spell packet.</div>
          )}
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
        <section style={cardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 8, color: "#f7fafc" }}>Structured extraction</h3>
          <p style={{ marginTop: 0, color: "#cbd5e0" }}>
            The generator parses tier text into a primary payload, an optional opposed ring, and a resonance block from a second faculty.
            It derives tags, statuses, and aspect scaling automatically so you can copy this packet directly into play materials.
          </p>
          {spell && (
            <ul style={{ marginTop: 8, color: "#e2e8f0" }}>
              <li>
                <strong>Primary intent match:</strong> {spell.primarySegment.name} selected to best satisfy {goals.join(", ")} goals.
              </li>
              <li>
                <strong>Cost guardrails:</strong> AP/Energy cost {spell.totalCost} derived from aspect tiers; downgrade tiers if this exceeds your build budget.
              </li>
              {spell.ringSegment && <li>Opposed ring captured from the faculty's secondary half to maintain environmental contrast.</li>}
              {spell.resonantSegment && (
                <li>
                  Resonance merges statuses from {spell.secondaryFaculty} instead of stacking raw damage, keeping effects coherent.
                </li>
              )}
            </ul>
          )}
        </section>

        <section style={cardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 8, color: "#f7fafc" }}>Safeguards</h3>
          <ul style={{ color: "#e2e8f0", paddingLeft: "1.1rem" }}>
            {spell?.cautions.map((caution) => (
              <li key={caution} style={{ marginBottom: 6 }}>
                {caution}
              </li>
            )) || <li style={{ color: "#a0aec0" }}>Generate a spell to see the automatic safety notes.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
};
