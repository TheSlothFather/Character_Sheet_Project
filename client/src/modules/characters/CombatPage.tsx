import React from "react";
import { useParams } from "react-router-dom";
import { listActiveCombatants, type PlayerCombatant } from "../../api/campaigns";
import "./CombatPage.css";

const normalizeFaction = (value?: string) => {
  if (!value) return "Unknown";
  const lowered = value.toLowerCase();
  if (lowered.startsWith("ally")) return "Ally";
  if (lowered.startsWith("enemy")) return "Enemy";
  return value;
};

export const CombatPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [combatants, setCombatants] = React.useState<PlayerCombatant[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!campaignId) {
      setError("Campaign ID is missing.");
      setLoading(false);
      return;
    }

    let active = true;
    const loadCombatants = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listActiveCombatants(campaignId);
        if (!active) return;
        setCombatants(data);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load combatants.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadCombatants();

    return () => {
      active = false;
    };
  }, [campaignId]);

  const selected = combatants.find((combatant) => combatant.id === selectedId) ?? null;

  const handleSubmit = () => {
    if (!selected) return;
    setNotice(`Roll request queued against ${selected.name}.`);
    setTimeout(() => setNotice(null), 2500);
  };

  return (
    <div className="combat-page">
      <header>
        <h2 className="combat-page__title">Combat Targets</h2>
        <p className="combat-page__subtitle">Select an active target and submit a roll request to the GM.</p>
      </header>

      <section className="combat-page__card">
        {error && <div className="combat-page__message combat-page__message--error">{error}</div>}
        {notice && <div className="combat-page__message combat-page__message--success">{notice}</div>}
        {loading ? (
          <p className="combat-page__status">Loading combatants...</p>
        ) : combatants.length === 0 ? (
          <p className="combat-page__status">No active combatants yet.</p>
        ) : (
          <div className="combat-page__list">
            {combatants.map((combatant) => {
              const isSelected = combatant.id === selectedId;
              return (
                <button
                  key={combatant.id}
                  type="button"
                  onClick={() => setSelectedId(combatant.id)}
                  className={`combat-page__target${isSelected ? " combat-page__target--selected" : ""}`}
                >
                  <div className="combat-page__target-name">{combatant.name}</div>
                  <div className="combat-page__target-faction">{normalizeFaction(combatant.faction)}</div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="combat-page__card">
        <h3 className="combat-page__section-title">Roll Request</h3>
        <p className="combat-page__helper">Target: {selected ? selected.name : "Select a combatant to roll against."}</p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selected}
          className="combat-page__button"
        >
          Submit Roll Request
        </button>
      </section>
    </div>
  );
};
