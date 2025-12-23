/**
 * GM Combat Page - Redesigned
 *
 * Authoritative combat management interface with immersive fantasy aesthetic.
 * Uses the CombatContext provider and reusable combat components.
 */

import React from "react";
import { useParams } from "react-router-dom";
import { CombatProvider, useCombat, useCombatTurn, useCombatEntities } from "../combat/CombatContext";
import {
  EntityCard,
  InitiativeList,
  PhaseIndicator,
  ResourceBar,
  WoundTracker,
  StatusEffectList,
} from "../../components/combat";
import { gmApi, type BestiaryEntry, type CampaignCombatant } from "../../api/gm";
import { useDefinitions } from "../definitions/DefinitionsContext";
import type { CombatEntity, EntityFaction, InitiativeMode, CombatStatusEffect, StatusKey } from "@shared/rules/combat";
import type { WoundCounts, WoundType } from "@shared/rules/wounds";
import "./CombatPageNew.css";

// ═══════════════════════════════════════════════════════════════════════════
// COMBATANT TO ENTITY TRANSFORMER
// ═══════════════════════════════════════════════════════════════════════════

function transformCombatantToEntity(combatant: CampaignCombatant): CombatEntity {
  // Transform wounds from array to WoundCounts record
  const wounds: WoundCounts = {};
  if (combatant.wounds) {
    for (const wound of combatant.wounds) {
      const woundType = wound.woundType as WoundType;
      wounds[woundType] = (wounds[woundType] ?? 0) + wound.woundCount;
    }
  }

  // Transform status effects
  const statusEffects: CombatStatusEffect[] = (combatant.statusEffects ?? [])
    .filter(se => se.isActive !== false)
    .map(se => ({
      key: se.statusKey.toUpperCase() as StatusKey,
      stacks: se.stacks ?? 1,
      duration: se.durationRemaining ?? null,
    }));

  // Determine controller (GM controls enemies, players control allies)
  const faction = (combatant.faction?.toLowerCase() ?? "enemy") as EntityFaction;
  const controller = faction === "ally" ? "gm" : "gm"; // For now, GM controls all in combat start

  return {
    id: combatant.id,
    name: combatant.name,
    controller,
    faction,
    skills: {}, // Skills would need to be loaded from bestiary
    initiativeSkill: "initiative",
    energy: {
      current: combatant.energyCurrent ?? combatant.energyMax ?? 100,
      max: combatant.energyMax ?? 100,
    },
    ap: {
      current: combatant.apCurrent ?? combatant.apMax ?? 6,
      max: combatant.apMax ?? 6,
    },
    tier: combatant.tier ?? 1,
    reaction: {
      available: true,
    },
    statusEffects,
    wounds,
    alive: true,
    bestiaryEntryId: combatant.bestiaryEntryId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INNER COMPONENT (Uses CombatContext)
// ═══════════════════════════════════════════════════════════════════════════

const CombatPageInner: React.FC<{ campaignId: string }> = ({ campaignId }) => {
  const {
    state,
    connectionStatus,
    error,
    clearError,
    startCombat,
    endCombat,
    endTurn,
    resolveReactions,
    gmOverride,
  } = useCombat();

  const { phase, round, activeEntity, isMyTurn, pendingAction } = useCombatTurn();
  const { getEntitiesByFaction, getEntitiesInInitiativeOrder, myControlledEntities } = useCombatEntities();

  const [bestiaryEntries, setBestiaryEntries] = React.useState<BestiaryEntry[]>([]);
  const [combatants, setCombatants] = React.useState<CampaignCombatant[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedEntityId, setSelectedEntityId] = React.useState<string | null>(null);
  const [initiativeMode, setInitiativeMode] = React.useState<InitiativeMode>("individual");
  const [showStartModal, setShowStartModal] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  // Load bestiary and combatants
  React.useEffect(() => {
    let active = true;
    const loadData = async () => {
      setLoading(true);
      try {
        const [bestiaryData, combatantData] = await Promise.all([
          gmApi.listBestiaryEntries(campaignId),
          gmApi.listCombatants(campaignId),
        ]);
        if (!active) return;
        setBestiaryEntries(bestiaryData);
        setCombatants(combatantData);
      } catch (err) {
        if (!active) return;
        setLocalError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadData();
    return () => { active = false; };
  }, [campaignId]);

  // Derived data
  const allies = state ? getEntitiesByFaction("ally") : [];
  const enemies = state ? getEntitiesByFaction("enemy") : [];
  const initiativeOrder = state ? getEntitiesInInitiativeOrder() : [];
  const selectedEntity = selectedEntityId && state?.entities[selectedEntityId];
  const hasCombat = state !== null && phase !== "completed";
  const displayError = error || localError;

  // Handlers
  const handleStartCombat = async () => {
    try {
      // Filter active combatants and transform to CombatEntity format
      const activeCombatants = combatants.filter(c => c.isActive);
      if (activeCombatants.length === 0) {
        setLocalError("No active combatants to start combat");
        return;
      }

      const entities: Record<string, CombatEntity> = {};
      for (const c of activeCombatants) {
        entities[c.id] = transformCombatantToEntity(c);
      }

      await startCombat({ initiativeMode, entities });
      setShowStartModal(false);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to start combat");
    }
  };

  const handleEndCombat = async (reason: "victory" | "defeat" | "gm_ended") => {
    try {
      await endCombat({ reason });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to end combat");
    }
  };

  const handleEndTurn = async () => {
    if (!activeEntity) return;
    try {
      await endTurn({ entityId: activeEntity.id, voluntary: true });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to end turn");
    }
  };

  const handleResolveReactions = async () => {
    try {
      await resolveReactions();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to resolve reactions");
    }
  };

  const handleAdjustAp = async (entityId: string, delta: number) => {
    try {
      await gmOverride({
        type: "adjust_ap",
        targetEntityId: entityId,
        data: { delta },
        reason: `GM adjustment: ${delta > 0 ? "+" : ""}${delta} AP`,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to adjust AP");
    }
  };

  const handleAdjustEnergy = async (entityId: string, delta: number) => {
    try {
      await gmOverride({
        type: "adjust_energy",
        targetEntityId: entityId,
        data: { delta },
        reason: `GM adjustment: ${delta > 0 ? "+" : ""}${delta} energy`,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to adjust energy");
    }
  };

  return (
    <div className="gm-combat-v2" data-theme="dark-fantasy">
      {/* ═══════════════════════════════════════════════════════════════════════
          HEADER
          ═══════════════════════════════════════════════════════════════════════ */}
      <header className="gm-combat-v2__header">
        <div className="gm-combat-v2__header-content">
          <div className="gm-combat-v2__title-group">
            <h1 className="gm-combat-v2__title">Battle Command</h1>
            <p className="gm-combat-v2__subtitle">Authoritative Combat Management</p>
          </div>

          <div className="gm-combat-v2__header-status">
            <div className={`gm-combat-v2__connection gm-combat-v2__connection--${connectionStatus}`}>
              <span className="gm-combat-v2__connection-dot" />
              <span className="gm-combat-v2__connection-text">
                {connectionStatus === "connected" ? "Live" : connectionStatus}
              </span>
            </div>

            {phase && <PhaseIndicator phase={phase} round={round} />}
          </div>
        </div>

        {displayError && (
          <div className="gm-combat-v2__error">
            <span>{displayError}</span>
            <button onClick={() => { clearError(); setLocalError(null); }}>Dismiss</button>
          </div>
        )}
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN CONTENT
          ═══════════════════════════════════════════════════════════════════════ */}
      <main className="gm-combat-v2__main">
        {loading ? (
          <div className="gm-combat-v2__loading">
            <div className="gm-combat-v2__loading-spinner" />
            <p>Summoning combatants...</p>
          </div>
        ) : !hasCombat ? (
          /* ─────────────────────────────────────────────────────────────────────
             NO ACTIVE COMBAT - START SCREEN
             ───────────────────────────────────────────────────────────────────── */
          <div className="gm-combat-v2__start-screen">
            <div className="gm-combat-v2__start-card">
              <div className="gm-combat-v2__start-icon">\u2694</div>
              <h2 className="gm-combat-v2__start-title">No Active Combat</h2>
              <p className="gm-combat-v2__start-desc">
                Begin a new encounter to track initiative, actions, and reactions.
              </p>

              <div className="gm-combat-v2__start-options">
                <label className="gm-combat-v2__start-option">
                  <input
                    type="radio"
                    name="initiative"
                    value="individual"
                    checked={initiativeMode === "individual"}
                    onChange={() => setInitiativeMode("individual")}
                  />
                  <span className="gm-combat-v2__start-option-label">Individual Initiative</span>
                  <span className="gm-combat-v2__start-option-desc">Each combatant rolls separately</span>
                </label>

                <label className="gm-combat-v2__start-option">
                  <input
                    type="radio"
                    name="initiative"
                    value="group"
                    checked={initiativeMode === "group"}
                    onChange={() => setInitiativeMode("group")}
                  />
                  <span className="gm-combat-v2__start-option-label">Group Initiative</span>
                  <span className="gm-combat-v2__start-option-desc">Factions act together</span>
                </label>
              </div>

              <button
                className="gm-combat-v2__start-button"
                onClick={handleStartCombat}
                disabled={combatants.filter(c => c.isActive).length === 0}
              >
                <span className="gm-combat-v2__start-button-icon">\u26A1</span>
                Begin Combat
              </button>

              {combatants.filter(c => c.isActive).length === 0 && (
                <p className="gm-combat-v2__start-warning">
                  Add active combatants to start combat
                </p>
              )}
            </div>

            {/* Combatant roster for pre-combat setup */}
            <div className="gm-combat-v2__roster">
              <h3 className="gm-combat-v2__roster-title">Combat Roster</h3>
              <div className="gm-combat-v2__roster-count">
                {combatants.filter(c => c.isActive).length} active combatants
              </div>
              <div className="gm-combat-v2__roster-grid">
                {combatants.map((c) => (
                  <div
                    key={c.id}
                    className={`gm-combat-v2__roster-item gm-combat-v2__roster-item--${c.faction ?? "enemy"} ${c.isActive ? "" : "gm-combat-v2__roster-item--inactive"}`}
                  >
                    <span className="gm-combat-v2__roster-name">{c.name}</span>
                    <span className="gm-combat-v2__roster-status">
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ─────────────────────────────────────────────────────────────────────
             ACTIVE COMBAT
             ───────────────────────────────────────────────────────────────────── */
          <div className="gm-combat-v2__combat-grid">
            {/* Initiative Tracker Sidebar */}
            <aside className="gm-combat-v2__sidebar">
              <div className="gm-combat-v2__sidebar-section">
                <h3 className="gm-combat-v2__sidebar-title">Initiative Order</h3>
                <InitiativeList
                  entities={initiativeOrder}
                  initiativeOrder={state?.initiativeOrder ?? []}
                  activeEntityId={state?.activeEntityId ?? null}
                  initiativeRolls={state?.initiativeRolls}
                  onEntityClick={setSelectedEntityId}
                />
              </div>

              <div className="gm-combat-v2__sidebar-section">
                <h3 className="gm-combat-v2__sidebar-title">Round Controls</h3>
                <div className="gm-combat-v2__round-info">
                  <div className="gm-combat-v2__round-stat">
                    <span className="gm-combat-v2__round-label">Round</span>
                    <span className="gm-combat-v2__round-value">{round}</span>
                  </div>
                  <div className="gm-combat-v2__round-stat">
                    <span className="gm-combat-v2__round-label">Turn</span>
                    <span className="gm-combat-v2__round-value">
                      {(state?.turnIndex ?? 0) + 1}/{state?.initiativeOrder.length ?? 0}
                    </span>
                  </div>
                </div>

                <div className="gm-combat-v2__round-actions">
                  <button
                    className="gm-combat-v2__action-btn gm-combat-v2__action-btn--advance"
                    onClick={handleEndTurn}
                    disabled={!activeEntity}
                  >
                    End Turn
                  </button>

                  {phase === "reaction-interrupt" && state?.pendingReactions.length > 0 && (
                    <button
                      className="gm-combat-v2__action-btn gm-combat-v2__action-btn--resolve"
                      onClick={handleResolveReactions}
                    >
                      Resolve Reactions ({state.pendingReactions.length})
                    </button>
                  )}
                </div>
              </div>

              <div className="gm-combat-v2__sidebar-section gm-combat-v2__sidebar-section--danger">
                <h3 className="gm-combat-v2__sidebar-title">End Combat</h3>
                <div className="gm-combat-v2__end-actions">
                  <button
                    className="gm-combat-v2__end-btn gm-combat-v2__end-btn--victory"
                    onClick={() => handleEndCombat("victory")}
                  >
                    Victory
                  </button>
                  <button
                    className="gm-combat-v2__end-btn gm-combat-v2__end-btn--defeat"
                    onClick={() => handleEndCombat("defeat")}
                  >
                    Defeat
                  </button>
                  <button
                    className="gm-combat-v2__end-btn gm-combat-v2__end-btn--end"
                    onClick={() => handleEndCombat("gm_ended")}
                  >
                    End
                  </button>
                </div>
              </div>
            </aside>

            {/* Main Combat Area */}
            <div className="gm-combat-v2__battlefield">
              {/* Active Turn Panel */}
              {activeEntity && (
                <div className="gm-combat-v2__active-turn">
                  <div className="gm-combat-v2__active-header">
                    <div className="gm-combat-v2__active-indicator">\u2605</div>
                    <div className="gm-combat-v2__active-info">
                      <h2 className="gm-combat-v2__active-name">{activeEntity.name}</h2>
                      <span className="gm-combat-v2__active-faction">
                        {activeEntity.faction === "ally" ? "Allied Forces" : "Enemy Forces"}
                      </span>
                    </div>
                  </div>

                  <div className="gm-combat-v2__active-resources">
                    <ResourceBar
                      label="Action Points"
                      current={activeEntity.ap.current}
                      max={activeEntity.ap.max}
                      type="ap"
                    />
                    <ResourceBar
                      label="Energy"
                      current={activeEntity.energy.current}
                      max={activeEntity.energy.max}
                      type="energy"
                    />
                  </div>

                  {activeEntity.statusEffects.length > 0 && (
                    <div className="gm-combat-v2__active-status">
                      <StatusEffectList effects={activeEntity.statusEffects} />
                    </div>
                  )}

                  {pendingAction && (
                    <div className="gm-combat-v2__pending-action">
                      <span className="gm-combat-v2__pending-label">Pending Action:</span>
                      <span className="gm-combat-v2__pending-type">{pendingAction.type}</span>
                      {pendingAction.interruptible && (
                        <span className="gm-combat-v2__pending-interruptible">
                          \u26A1 Interruptible
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Faction Grids */}
              <div className="gm-combat-v2__factions">
                {/* Allies */}
                <div className="gm-combat-v2__faction gm-combat-v2__faction--allies">
                  <h3 className="gm-combat-v2__faction-title">
                    <span className="gm-combat-v2__faction-icon">\u2694</span>
                    Allied Forces
                    <span className="gm-combat-v2__faction-count">{allies.length}</span>
                  </h3>
                  <div className="gm-combat-v2__faction-grid">
                    {allies.map((entity) => (
                      <EntityCard
                        key={entity.id}
                        entity={entity}
                        isActive={entity.id === state?.activeEntityId}
                        isSelected={entity.id === selectedEntityId}
                        selectable
                        compact
                        onClick={() => setSelectedEntityId(entity.id)}
                      />
                    ))}
                    {allies.length === 0 && (
                      <p className="gm-combat-v2__faction-empty">No allies in combat</p>
                    )}
                  </div>
                </div>

                {/* Enemies */}
                <div className="gm-combat-v2__faction gm-combat-v2__faction--enemies">
                  <h3 className="gm-combat-v2__faction-title">
                    <span className="gm-combat-v2__faction-icon">\u2620</span>
                    Enemy Forces
                    <span className="gm-combat-v2__faction-count">{enemies.length}</span>
                  </h3>
                  <div className="gm-combat-v2__faction-grid">
                    {enemies.map((entity) => (
                      <EntityCard
                        key={entity.id}
                        entity={entity}
                        isActive={entity.id === state?.activeEntityId}
                        isSelected={entity.id === selectedEntityId}
                        selectable
                        compact
                        onClick={() => setSelectedEntityId(entity.id)}
                      />
                    ))}
                    {enemies.length === 0 && (
                      <p className="gm-combat-v2__faction-empty">No enemies in combat</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Detail Panel */}
            {selectedEntity && (
              <aside className="gm-combat-v2__detail-panel">
                <div className="gm-combat-v2__detail-header">
                  <h3 className="gm-combat-v2__detail-name">{selectedEntity.name}</h3>
                  <button
                    className="gm-combat-v2__detail-close"
                    onClick={() => setSelectedEntityId(null)}
                  >
                    \u2715
                  </button>
                </div>

                <div className="gm-combat-v2__detail-section">
                  <h4 className="gm-combat-v2__detail-section-title">Resources</h4>
                  <div className="gm-combat-v2__detail-resources">
                    <div className="gm-combat-v2__detail-resource">
                      <ResourceBar
                        label="AP"
                        current={selectedEntity.ap.current}
                        max={selectedEntity.ap.max}
                        type="ap"
                      />
                      <div className="gm-combat-v2__detail-adjust">
                        <button onClick={() => handleAdjustAp(selectedEntity.id, -1)}>-1</button>
                        <button onClick={() => handleAdjustAp(selectedEntity.id, 1)}>+1</button>
                      </div>
                    </div>
                    <div className="gm-combat-v2__detail-resource">
                      <ResourceBar
                        label="Energy"
                        current={selectedEntity.energy.current}
                        max={selectedEntity.energy.max}
                        type="energy"
                      />
                      <div className="gm-combat-v2__detail-adjust">
                        <button onClick={() => handleAdjustEnergy(selectedEntity.id, -5)}>-5</button>
                        <button onClick={() => handleAdjustEnergy(selectedEntity.id, 5)}>+5</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="gm-combat-v2__detail-section">
                  <h4 className="gm-combat-v2__detail-section-title">Wounds</h4>
                  <WoundTracker wounds={selectedEntity.wounds} />
                </div>

                {selectedEntity.statusEffects.length > 0 && (
                  <div className="gm-combat-v2__detail-section">
                    <h4 className="gm-combat-v2__detail-section-title">Status Effects</h4>
                    <StatusEffectList effects={selectedEntity.statusEffects} />
                  </div>
                )}

                <div className="gm-combat-v2__detail-section">
                  <h4 className="gm-combat-v2__detail-section-title">Reaction</h4>
                  <div className="gm-combat-v2__detail-reaction">
                    {selectedEntity.reaction.available ? (
                      <span className="gm-combat-v2__reaction-ready">\u26A1 Available</span>
                    ) : (
                      <span className="gm-combat-v2__reaction-used">\u26A1 Used</span>
                    )}
                  </div>
                </div>

                <div className="gm-combat-v2__detail-section">
                  <h4 className="gm-combat-v2__detail-section-title">GM Overrides</h4>
                  <div className="gm-combat-v2__gm-actions">
                    <button
                      className="gm-combat-v2__gm-btn"
                      onClick={() => gmOverride({
                        type: "skip_entity",
                        targetEntityId: selectedEntity.id,
                        reason: "GM skip",
                      })}
                    >
                      Skip Turn
                    </button>
                    <button
                      className="gm-combat-v2__gm-btn"
                      onClick={() => gmOverride({
                        type: "force_reaction",
                        targetEntityId: selectedEntity.id,
                        reason: "GM forced reaction reset",
                      })}
                    >
                      Reset Reaction
                    </button>
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}
      </main>

      {/* ═══════════════════════════════════════════════════════════════════════
          COMBAT LOG
          ═══════════════════════════════════════════════════════════════════════ */}
      {hasCombat && state?.log && state.log.length > 0 && (
        <footer className="gm-combat-v2__footer">
          <div className="gm-combat-v2__log">
            <h3 className="gm-combat-v2__log-title">Combat Chronicle</h3>
            <div className="gm-combat-v2__log-entries">
              {state.log.slice(-10).reverse().map((entry) => (
                <div
                  key={entry.id}
                  className={`gm-combat-v2__log-entry gm-combat-v2__log-entry--${entry.type}`}
                >
                  <span className="gm-combat-v2__log-time">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="gm-combat-v2__log-type">{entry.type.replace(/_/g, " ")}</span>
                  {entry.sourceEntityId && (
                    <span className="gm-combat-v2__log-source">
                      {state.entities[entry.sourceEntityId]?.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT (Wraps with CombatProvider)
// ═══════════════════════════════════════════════════════════════════════════

export const CombatPageNew: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [userId, setUserId] = React.useState<string | null>(null);

  // Get current user ID
  React.useEffect(() => {
    const fetchUser = async () => {
      try {
        const { getSupabaseClient } = await import("../../api/supabaseClient");
        const client = getSupabaseClient();
        const { data } = await client.auth.getUser();
        if (data?.user?.id) {
          setUserId(data.user.id);
        }
      } catch {
        // Ignore auth errors for now
      }
    };
    fetchUser();
  }, []);

  if (!campaignId) {
    return (
      <div className="gm-combat-v2__error-screen">
        <h2>No Campaign Selected</h2>
        <p>Please select a campaign to manage combat.</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="gm-combat-v2__loading">
        <div className="gm-combat-v2__loading-spinner" />
        <p>Authenticating...</p>
      </div>
    );
  }

  return (
    <CombatProvider campaignId={campaignId} userId={userId} isGm>
      <CombatPageInner campaignId={campaignId} />
    </CombatProvider>
  );
};

export default CombatPageNew;
