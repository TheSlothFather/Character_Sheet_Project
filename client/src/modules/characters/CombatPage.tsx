import React from "react";
import { useParams } from "react-router-dom";
import { getCombatState, listActiveCombatants, type CombatState, type PlayerCombatant } from "../../api/campaigns";
import { connectCampaignSocket } from "../../api/campaignSocket";
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
  const [combatState, setCombatState] = React.useState<CombatState | null>(null);

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

  React.useEffect(() => {
    if (!campaignId) return;
    let active = true;
    const loadCombatState = async () => {
      try {
        const response = await getCombatState(campaignId);
        if (!active) return;
        setCombatState(response.state);
      } catch (loadError) {
        if (!active) return;
        if (loadError instanceof Error && loadError.message.includes("Combat state not found")) {
          setCombatState(null);
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Failed to load combat state.");
      }
    };
    loadCombatState();
    return () => {
      active = false;
    };
  }, [campaignId]);

  React.useEffect(() => {
    if (!campaignId) return;
    const socket = connectCampaignSocket(campaignId, {
      onEvent: (event) => {
        if (!event.payload || typeof event.payload !== "object") return;
        if ("state" in event.payload) {
          const payload = event.payload as { state?: CombatState };
          if (payload.state) {
            setCombatState(payload.state);
          }
        }
      }
    });

    return () => {
      socket.close();
    };
  }, [campaignId]);

  const selected = combatants.find((combatant) => combatant.id === selectedId) ?? null;
  const activeCombatantId = combatState?.activeCombatantId ?? null;
  const activeCombatant = activeCombatantId
    ? combatants.find((combatant) => combatant.id === activeCombatantId) ?? null
    : null;
  const availableAp = activeCombatantId ? combatState?.actionPointsById[activeCombatantId] ?? 0 : 0;
  const reactionsUsed = activeCombatantId ? combatState?.reactionsUsedById[activeCombatantId] ?? 0 : 0;
  const reactionsRemaining = Math.max(0, 1 - reactionsUsed);
  const combatantNameById = React.useMemo(
    () => new Map(combatants.map((combatant) => [combatant.id, combatant.name])),
    [combatants]
  );
  const recentEvents = combatState?.eventLog ? [...combatState.eventLog].slice(-5).reverse() : [];

  const formatEvent = (entry: CombatState["eventLog"][number]) => {
    const payload = entry.payload;
    const readCombatant = (combatantId?: string | null) =>
      combatantId ? combatantNameById.get(combatantId) ?? combatantId : "Unknown combatant";
    if (payload && typeof payload === "object" && "combatantId" in payload) {
      const combatantId = (payload as { combatantId?: string | null }).combatantId ?? null;
      if (entry.type === "turn_started") return `Turn started: ${readCombatant(combatantId)}`;
      if (entry.type === "turn_ended") return `Turn ended: ${readCombatant(combatantId)}`;
      if (entry.type === "action_spent") return `Action spent by ${readCombatant(combatantId)}`;
      if (entry.type === "reaction_spent") return `Reaction spent by ${readCombatant(combatantId)}`;
      if (entry.type === "ambush_resolved") return `Ambush resolved for ${readCombatant(combatantId)}`;
    }
    if (entry.type === "combat_started") return "Combat started";
    if (entry.type === "status_tick") return "Status tick resolved";
    if (entry.type === "ambush_applied") return "Ambush penalty applied";
    return entry.type.replace(/_/g, " ");
  };

  const handleSubmit = () => {
    if (!selected) return;
    setNotice(`Roll request queued against ${selected.name}.`);
    setTimeout(() => setNotice(null), 2500);
  };

  return (
    <div className="combat-page">
      <header>
        <h2 className="combat-page__title h2">Combat Targets</h2>
        <p className="combat-page__subtitle subtitle muted">
          Select an active target and submit a roll request to the GM.
        </p>
      </header>

      <section className="combat-page__card combat-page__card--turn">
        <h3 className="combat-page__section-title h3">Your Turn</h3>
        <div className="combat-page__turn-grid">
          <div className="combat-page__turn-details">
            <div className="combat-page__turn-row">
              <span className="combat-page__turn-label">Active combatant</span>
              <span className="combat-page__turn-value">{activeCombatant?.name ?? "No active combatant"}</span>
            </div>
            <div className="combat-page__turn-row">
              <span className="combat-page__turn-label">Available AP</span>
              <span className="combat-page__turn-value">{activeCombatant ? availableAp : "—"}</span>
            </div>
            <div className="combat-page__turn-row">
              <span className="combat-page__turn-label">Reactions remaining</span>
              <span className="combat-page__turn-value">{activeCombatant ? reactionsRemaining : "—"}</span>
            </div>
          </div>
          <div className="combat-page__turn-log">
            <span className="combat-page__turn-label">Recent events</span>
            {recentEvents.length === 0 ? (
              <p className="combat-page__turn-muted body muted">No combat events yet.</p>
            ) : (
              <ul className="combat-page__turn-list">
                {recentEvents.map((entry) => (
                  <li key={entry.id} className="combat-page__turn-item">
                    {formatEvent(entry)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="combat-page__card">
        {error && <div className="combat-page__message body combat-page__message--error">{error}</div>}
        {notice && <div className="combat-page__message body combat-page__message--success">{notice}</div>}
        {loading ? (
          <p className="combat-page__status body muted">Loading combatants...</p>
        ) : combatants.length === 0 ? (
          <p className="combat-page__status body muted">No active combatants yet.</p>
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
                  <div className="combat-page__target-name body">{combatant.name}</div>
                  <div className="combat-page__target-faction caption muted">{normalizeFaction(combatant.faction)}</div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="combat-page__card">
        <h3 className="combat-page__section-title h3">Roll Request</h3>
        <p className="combat-page__helper body muted">
          Target: {selected ? selected.name : "Select a combatant to roll against."}
        </p>
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
