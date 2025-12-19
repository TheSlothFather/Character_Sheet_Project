import React from "react";
import { useParams } from "react-router-dom";
import { listActiveCombatants, type PlayerCombatant } from "../../api/campaigns";

const cardStyle: React.CSSProperties = {
  background: "#0f131a",
  border: "1px solid #1f2935",
  borderRadius: 12,
  padding: "1rem"
};

const buttonStyle: React.CSSProperties = {
  padding: "0.6rem 0.9rem",
  borderRadius: 8,
  border: "1px solid #1d4ed8",
  background: "#2563eb",
  color: "#e6edf7",
  fontWeight: 700,
  cursor: "pointer"
};

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
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Combat Targets</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#cbd5e1" }}>
          Select an active target and submit a roll request to the GM.
        </p>
      </header>

      <section style={cardStyle}>
        {error && <div style={{ color: "#f87171", marginBottom: 8 }}>{error}</div>}
        {notice && <div style={{ color: "#9ae6b4", marginBottom: 8 }}>{notice}</div>}
        {loading ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>Loading combatants...</p>
        ) : combatants.length === 0 ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>No active combatants yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {combatants.map((combatant) => {
              const isSelected = combatant.id === selectedId;
              return (
                <button
                  key={combatant.id}
                  type="button"
                  onClick={() => setSelectedId(combatant.id)}
                  style={{
                    textAlign: "left",
                    border: isSelected ? "1px solid #2563eb" : "1px solid #1f2935",
                    background: isSelected ? "#101a2c" : "#0c111a",
                    color: "#e5e7eb",
                    padding: "0.75rem",
                    borderRadius: 10,
                    cursor: "pointer",
                    display: "grid",
                    gap: "0.35rem"
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{combatant.name}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>{normalizeFaction(combatant.faction)}</div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Roll Request</h3>
        <p style={{ margin: "0 0 0.75rem", color: "#9ca3af" }}>
          Target: {selected ? selected.name : "Select a combatant to roll against."}
        </p>
        <button type="button" onClick={handleSubmit} disabled={!selected} style={{ ...buttonStyle, opacity: selected ? 1 : 0.6 }}>
          Submit Roll Request
        </button>
      </section>
    </div>
  );
};
