import React from "react";
import facultiesText from "../../data/magic-faculties.txt?raw";
import { MAGIC_FACULTIES, ParsedFaculty, parseMagicFaculties } from "./magicParser";
import { GeneratedSpell, SpellGoal, generateSpell } from "./spellGenerator";
import "./SpellCreationPage.css";

const GoalToggle: React.FC<{
  goal: SpellGoal;
  active: boolean;
  onToggle: () => void;
}> = ({ goal, active, onToggle }) => (
  <button
    onClick={onToggle}
    className={`spell-creation__goal${active ? " spell-creation__goal--active" : ""}`}
  >
    {goal}
  </button>
);

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="spell-creation__pill">
    {children}
  </span>
);

const StatusList: React.FC<{ label: string; items: string[] }> = ({ label, items }) => (
  <div className="spell-creation__status">
    <div className="spell-creation__status-label">{label}</div>
    <div>
      {items.length ? items.map((status) => <Pill key={status}>{status}</Pill>) : <span className="spell-creation__muted">None</span>}
    </div>
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
    <div className="spell-creation">
      <header className="spell-creation__header">
        <div className="spell-creation__badge">Generator</div>
        <h1 className="spell-creation__title">Automatic Spell Creation</h1>
        <p className="spell-creation__subtitle">
          Build fully composed spells from the Adûrun magic faculties. Choose intent, tiers, and resonance rules; the generator
          pulls tier text directly from the source document, applies aspect budgets, and returns an executable spell packet with
          statuses and costs.
        </p>
      </header>

      <div className="spell-creation__grid spell-creation__grid--primary">
        <section className="spell-creation__card">
          <h2 className="spell-creation__card-title">Inputs</h2>
          <div className="spell-creation__stack">
            <label className="spell-creation__field">
              <span>Primary Faculty</span>
              <select
                value={primaryFaculty}
                onChange={(e) => setPrimaryFaculty(e.target.value)}
                className="spell-creation__input"
              >
                {faculties.map((faculty) => (
                  <option key={faculty.name} value={faculty.name}>
                    {faculty.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="spell-creation__field">
              <span>Primary Tier</span>
              <input
                type="range"
                min={1}
                max={6}
                value={primaryTier}
                onChange={(e) => setPrimaryTier(Number(e.target.value))}
              />
              <div className="spell-creation__muted">Tier {primaryTier}</div>
            </label>

            <label className="spell-creation__field">
              <span>Secondary Faculty (resonance)</span>
              <select
                value={secondaryFaculty}
                onChange={(e) => setSecondaryFaculty(e.target.value || undefined)}
                className="spell-creation__input"
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
              <label className="spell-creation__field">
                <span>Secondary Tier</span>
                <input
                  type="range"
                  min={1}
                  max={6}
                  value={secondaryTier}
                  onChange={(e) => setSecondaryTier(Number(e.target.value))}
                />
                <div className="spell-creation__muted">Tier {secondaryTier}</div>
              </label>
            )}

            <div className="spell-creation__goal-list">
              {(["Damage", "Control", "Mobility", "Support", "Hazard"] as SpellGoal[]).map((goal) => (
                <GoalToggle key={goal} goal={goal} active={goals.includes(goal)} onToggle={() => handleGoalToggle(goal)} />
              ))}
            </div>

            <label className="spell-creation__field spell-creation__field--row">
              <input
                type="checkbox"
                checked={allowOpposedRing}
                onChange={(e) => setAllowOpposedRing(e.target.checked)}
              />
              <span>Allow opposed ring/gradient if the faculty tier provides one</span>
            </label>

            <label className="spell-creation__field">
              <span>Seed</span>
              <div className="spell-creation__row">
                <input
                  className="spell-creation__input spell-creation__input--grow"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                />
                <button
                  onClick={refreshSeed}
                  className="spell-creation__pill-button"
                >
                  Randomize
                </button>
              </div>
            </label>

            <button
              onClick={handleGenerate}
              className="spell-creation__primary-button"
            >
              Generate spell
            </button>
          </div>
        </section>

        <section className="spell-creation__card">
          <h2 className="spell-creation__card-title spell-creation__card-title--tight">Generated Spell</h2>
          {spell ? (
            <div>
              <div className="spell-creation__spell-name">{spell.name}</div>
              <div className="spell-creation__spell-tagline">{spell.tagline}</div>
              <div className="spell-creation__pill-row">
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

              <div className="spell-creation__section">
                <div className="spell-creation__section-title">Tags</div>
                <div>
                  {spell.tags.length ? spell.tags.map((tag) => <Pill key={tag}>{tag}</Pill>) : <span className="spell-creation__muted">No tags derived</span>}
                </div>
              </div>

              <div className="spell-creation__section">
                <div className="spell-creation__section-title">Aspect Plan</div>
                <div className="spell-creation__aspect-grid">
                  {Object.entries(spell.aspectPlan).map(([aspect, tierValue]) => (
                    <div key={aspect} className="spell-creation__aspect-pill">
                      {aspect}: Tier {tierValue}
                    </div>
                  ))}
                </div>
              </div>

              <div className="spell-creation__payload-grid">
                <div className="spell-creation__payload">
                  <div className="spell-creation__payload-title">Primary Payload</div>
                  <div className="spell-creation__payload-text">{spell.primarySegment.primaryEffect}</div>
                  {spell.primarySegment.consequence && (
                    <div className="spell-creation__payload-muted">
                      <strong>Environmental:</strong> {spell.primarySegment.consequence}
                    </div>
                  )}
                  <StatusList label="Statuses" items={[...spell.primarySegment.statusesPrimary]} />
                </div>

                {spell.ringSegment && (
                  <div className="spell-creation__payload">
                    <div className="spell-creation__payload-title">Opposed Ring</div>
                    <div className="spell-creation__payload-text">{spell.ringSegment.consequence || spell.ringSegment.primaryEffect}</div>
                    <StatusList label="Ring Statuses" items={[...spell.ringSegment.statusesRing, ...spell.ringSegment.statusesPrimary]} />
                  </div>
                )}

                {spell.resonantSegment && (
                  <div className="spell-creation__payload">
                    <div className="spell-creation__payload-title">Resonant Blend ({spell.secondaryFaculty})</div>
                    <div className="spell-creation__payload-text">{spell.resonantSegment.primaryEffect}</div>
                    {spell.resonantSegment.consequence && (
                      <div className="spell-creation__payload-muted">
                        <strong>Environmental:</strong> {spell.resonantSegment.consequence}
                      </div>
                    )}
                    <StatusList label="Resonant Statuses" items={[...spell.resonantSegment.statusesPrimary, ...spell.resonantSegment.statusesRing]} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="spell-creation__muted">Generate to see a complete spell packet.</div>
          )}
        </section>
      </div>

      <div className="spell-creation__grid spell-creation__grid--secondary">
        <section className="spell-creation__card">
          <h3 className="spell-creation__section-heading">Structured extraction</h3>
          <p className="spell-creation__paragraph">
            The generator parses tier text into a primary payload, an optional opposed ring, and a resonance block from a second faculty.
            It derives tags, statuses, and aspect scaling automatically so you can copy this packet directly into play materials.
          </p>
          {spell && (
            <ul className="spell-creation__bullet-list">
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

        <section className="spell-creation__card">
          <h3 className="spell-creation__section-heading">Safeguards</h3>
          <ul className="spell-creation__bullet-list spell-creation__bullet-list--spaced">
            {spell?.cautions.map((caution) => (
              <li key={caution} className="spell-creation__bullet-item">
                {caution}
              </li>
            )) || <li className="spell-creation__muted">Generate a spell to see the automatic safety notes.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
};
