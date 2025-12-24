/**
 * Player Combat Page - Redesigned
 *
 * Player-facing combat interface with immersive fantasy aesthetic.
 * Uses the CombatContext provider and reusable combat components.
 */

import React from "react";
import { useParams } from "react-router-dom";
import { CombatProvider, useCombat, useCombatTurn, useCombatEntities, useCombatReactions } from "../combat/CombatContext";
import {
  EntityCard,
  InitiativeBar,
  PhaseIndicator,
  ResourceBar,
  WoundTracker,
  StatusEffectList,
  ReactionButton,
  SkillContestModal,
  SkillCheckPrompt,
  ContestResultDisplay,
} from "../../components/combat";
import type { CombatEntity, ActionType, ReactionType } from "@shared/rules/combat";
import "./CombatPageNew.css";

// Local action categories for UI display (maps to actual ActionTypes)
type UIActionCategory = "attack" | "spell" | "ability" | "movement" | "item" | "other";

// ═══════════════════════════════════════════════════════════════════════════
// ACTION PANEL - For declaring actions on player's turn
// ═══════════════════════════════════════════════════════════════════════════

interface ActionPanelProps {
  entity: CombatEntity;
  onDeclareAction: (type: ActionType, apCost: number, targetId?: string) => void;
  enemies: CombatEntity[];
  disabled?: boolean;
}

const ActionPanel: React.FC<ActionPanelProps> = ({
  entity,
  onDeclareAction,
  enemies,
  disabled = false,
}) => {
  const [selectedAction, setSelectedAction] = React.useState<ActionType>("attack");
  const [selectedTarget, setSelectedTarget] = React.useState<string | null>(null);

  const actionCosts: Record<ActionType, number> = {
    attack: 2,
    spell: 2,
    ability: 2,
    movement: 1,
    item: 1,
    other: 1,
  };

  const canAffordAction = entity.ap.current >= (actionCosts[selectedAction] ?? 0);
  const needsTarget = selectedAction === "attack" || selectedAction === "spell" || selectedAction === "ability";

  const handleSubmit = () => {
    if (disabled || !canAffordAction) return;
    if (needsTarget && !selectedTarget) return;

    onDeclareAction(
      selectedAction,
      actionCosts[selectedAction],
      needsTarget ? selectedTarget ?? undefined : undefined
    );

    // Reset form
    setSelectedTarget(null);
  };

  return (
    <div className="action-panel">
      <h3 className="action-panel__title">Declare Action</h3>

      <div className="action-panel__section">
        <label className="action-panel__label">Action Type</label>
        <div className="action-panel__action-grid">
          {(["attack", "spell", "ability", "movement", "item", "other"] as ActionType[]).map((type) => (
            <button
              key={type}
              type="button"
              className={`action-panel__action-btn ${selectedAction === type ? "action-panel__action-btn--selected" : ""} ${entity.ap.current < actionCosts[type] ? "action-panel__action-btn--disabled" : ""}`}
              onClick={() => setSelectedAction(type)}
              disabled={entity.ap.current < actionCosts[type]}
            >
              <span className="action-panel__action-name">{type}</span>
              <span className="action-panel__action-cost">{actionCosts[type]} AP</span>
            </button>
          ))}
        </div>
      </div>

      {needsTarget && (
        <div className="action-panel__section">
          <label className="action-panel__label">Target</label>
          {enemies.length === 0 ? (
            <p className="action-panel__empty">No valid targets</p>
          ) : (
            <div className="action-panel__target-grid">
              {enemies.map((enemy) => (
                <button
                  key={enemy.id}
                  type="button"
                  className={`action-panel__target-btn ${selectedTarget === enemy.id ? "action-panel__target-btn--selected" : ""}`}
                  onClick={() => setSelectedTarget(enemy.id)}
                >
                  <span className="action-panel__target-name">{enemy.name}</span>
                  <span className="action-panel__target-status">
                    {enemy.statusEffects.length > 0 && `${enemy.statusEffects.length} effects`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className="action-panel__submit"
        onClick={handleSubmit}
        disabled={disabled || !canAffordAction || (needsTarget && !selectedTarget)}
      >
        <span className="action-panel__submit-icon">\u2694</span>
        Declare Action
      </button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// REACTION MODAL
// ═══════════════════════════════════════════════════════════════════════════

interface ReactionModalProps {
  entity: CombatEntity;
  pendingActionId: string | null;
  onDeclare: (entityId: string, reactionType: ReactionType, targetActionId: string) => void;
  onClose: () => void;
}

const ReactionModal: React.FC<ReactionModalProps> = ({
  entity,
  pendingActionId,
  onDeclare,
  onClose,
}) => {
  const [reactionType, setReactionType] = React.useState<ReactionType>("parry");

  const handleSubmit = () => {
    if (!pendingActionId) return;
    onDeclare(entity.id, reactionType, pendingActionId);
    onClose();
  };

  return (
    <div className="reaction-modal-overlay" onClick={onClose}>
      <div className="reaction-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reaction-modal__header">
          <h3 className="reaction-modal__title">Declare Reaction</h3>
          <button className="reaction-modal__close" onClick={onClose}>
            \u2715
          </button>
        </div>

        <div className="reaction-modal__entity">
          <span className="reaction-modal__entity-name">{entity.name}</span>
          <span className="reaction-modal__entity-reaction">
            \u26A1 Reaction Available
          </span>
        </div>

        <div className="reaction-modal__options">
          <label className="reaction-modal__option">
            <input
              type="radio"
              name="reactionType"
              value="parry"
              checked={reactionType === "parry"}
              onChange={() => setReactionType("parry")}
            />
            <div className="reaction-modal__option-content">
              <span className="reaction-modal__option-name">Parry</span>
              <span className="reaction-modal__option-desc">
                Deflect the incoming attack with your weapon
              </span>
            </div>
          </label>

          <label className="reaction-modal__option">
            <input
              type="radio"
              name="reactionType"
              value="dodge"
              checked={reactionType === "dodge"}
              onChange={() => setReactionType("dodge")}
            />
            <div className="reaction-modal__option-content">
              <span className="reaction-modal__option-name">Dodge</span>
              <span className="reaction-modal__option-desc">
                Attempt to evade the incoming attack
              </span>
            </div>
          </label>

          <label className="reaction-modal__option">
            <input
              type="radio"
              name="reactionType"
              value="counterspell"
              checked={reactionType === "counterspell"}
              onChange={() => setReactionType("counterspell")}
            />
            <div className="reaction-modal__option-content">
              <span className="reaction-modal__option-name">Counterspell</span>
              <span className="reaction-modal__option-desc">
                Attempt to disrupt an incoming spell
              </span>
            </div>
          </label>

          <label className="reaction-modal__option">
            <input
              type="radio"
              name="reactionType"
              value="opportunity"
              checked={reactionType === "opportunity"}
              onChange={() => setReactionType("opportunity")}
            />
            <div className="reaction-modal__option-content">
              <span className="reaction-modal__option-name">Opportunity</span>
              <span className="reaction-modal__option-desc">
                Strike when an enemy leaves your reach
              </span>
            </div>
          </label>
        </div>

        <div className="reaction-modal__actions">
          <button
            className="reaction-modal__btn reaction-modal__btn--cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="reaction-modal__btn reaction-modal__btn--confirm"
            onClick={handleSubmit}
            disabled={!pendingActionId}
          >
            \u26A1 Declare Reaction
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// INNER COMPONENT (Uses CombatContext)
// ═══════════════════════════════════════════════════════════════════════════

const CombatPageInner: React.FC<{ campaignId: string }> = ({ campaignId }) => {
  const {
    state,
    connectionStatus,
    error,
    clearError,
    declareAction,
    declareReaction,
    endTurn,
    initiateSkillContest,
    respondToSkillContest,
    submitSkillCheck,
    myPendingDefense,
    myPendingSkillChecks,
  } = useCombat();

  const { phase, round, activeEntity, isMyTurn, pendingAction } = useCombatTurn();
  const { getEntitiesByFaction, getEntitiesInInitiativeOrder, myControlledEntities } = useCombatEntities();
  const { canDeclareReaction } = useCombatReactions();

  const [selectedEntityId, setSelectedEntityId] = React.useState<string | null>(null);
  const [showReactionModal, setShowReactionModal] = React.useState(false);
  const [reactionEntityId, setReactionEntityId] = React.useState<string | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);

  // Skill contest state
  const [showAttackModal, setShowAttackModal] = React.useState(false);
  const [attackTargetId, setAttackTargetId] = React.useState<string | null>(null);
  const [showDefenseModal, setShowDefenseModal] = React.useState(false);
  const [contestResult, setContestResult] = React.useState<any>(null);
  const [showResultModal, setShowResultModal] = React.useState(false);

  // Derived data
  const allies = state ? getEntitiesByFaction("ally") : [];
  const enemies = state ? getEntitiesByFaction("enemy") : [];
  const initiativeOrder = state ? getEntitiesInInitiativeOrder() : [];
  const selectedEntity = selectedEntityId && state?.entities[selectedEntityId];
  const hasCombat = state !== null && phase !== "completed";
  const displayError = error || localError;

  // Entities with available reactions (computed from myControlledEntities)
  const entitiesWithReaction = myControlledEntities.filter(e => e.reaction.available);

  // Auto-select first controlled entity
  React.useEffect(() => {
    if (!selectedEntityId && myControlledEntities.length > 0) {
      setSelectedEntityId(myControlledEntities[0].id);
    }
  }, [myControlledEntities, selectedEntityId]);

  // Auto-show defense modal when we need to defend
  React.useEffect(() => {
    if (myPendingDefense && myPendingDefense.status === "awaiting_defense") {
      setShowDefenseModal(true);
    } else {
      setShowDefenseModal(false);
    }
  }, [myPendingDefense]);

  // Handlers
  const handleDeclareAction = async (
    type: ActionType,
    apCost: number,
    targetId?: string
  ) => {
    if (!activeEntity) return;
    try {
      await declareAction({
        entityId: activeEntity.id,
        type,
        targetEntityId: targetId,
        apCost,
        energyCost: 0, // Default energy cost
        interruptible: type === "attack" || type === "spell",
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to declare action");
    }
  };

  const handleOpenReactionModal = (entityId: string) => {
    setReactionEntityId(entityId);
    setShowReactionModal(true);
  };

  const handleDeclareReaction = async (
    entityId: string,
    reactionType: ReactionType,
    targetActionId: string
  ) => {
    try {
      await declareReaction({
        entityId,
        type: reactionType,
        targetActionId,
        apCost: 0, // Reactions typically don't cost AP
        energyCost: 0, // Default energy cost
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to declare reaction");
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

  // Skill contest handlers
  const handleOpenAttackModal = (targetEntityId: string) => {
    setAttackTargetId(targetEntityId);
    setShowAttackModal(true);
  };

  const handleInitiateAttack = async (skill: string, roll: any) => {
    if (!activeEntity || !attackTargetId) return;
    try {
      await initiateSkillContest({
        initiatorEntityId: activeEntity.id,
        targetEntityId: attackTargetId,
        skill,
        roll,
      });
      setShowAttackModal(false);
      setAttackTargetId(null);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to initiate attack");
    }
  };

  const handleDefend = async (contestId: string, skill: string, roll: any) => {
    const defenderEntity = myControlledEntities.find(e =>
      e.id === myPendingDefense?.targetId
    );
    if (!defenderEntity) return;
    try {
      await respondToSkillContest({
        contestId,
        entityId: defenderEntity.id,
        skill,
        roll,
      });
      setShowDefenseModal(false);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to defend");
    }
  };

  const handleSubmitSkillCheck = async (checkId: string, roll: any) => {
    try {
      await submitSkillCheck({
        checkId,
        roll,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to submit skill check");
    }
  };

  // Render no combat state
  if (!hasCombat) {
    return (
      <div className="player-combat" data-theme="dark-fantasy">
        <div className="player-combat__empty">
          <div className="player-combat__empty-icon">\u2694</div>
          <h2 className="player-combat__empty-title">No Active Combat</h2>
          <p className="player-combat__empty-desc">
            Wait for the Game Master to begin an encounter.
          </p>
          <div className={`player-combat__connection player-combat__connection--${connectionStatus}`}>
            <span className="player-combat__connection-dot" />
            <span>{connectionStatus === "connected" ? "Connected" : connectionStatus}</span>
          </div>
        </div>
      </div>
    );
  }

  const reactionEntity = reactionEntityId ? state?.entities[reactionEntityId] : null;

  return (
    <div className="player-combat" data-theme="dark-fantasy">
      {/* ═══════════════════════════════════════════════════════════════════════
          HEADER
          ═══════════════════════════════════════════════════════════════════════ */}
      <header className="player-combat__header">
        <div className="player-combat__header-content">
          <div className="player-combat__title-group">
            <h1 className="player-combat__title">Combat</h1>
            {phase && <PhaseIndicator phase={phase} round={round} />}
          </div>

          <div className="player-combat__header-status">
            <div className={`player-combat__connection player-combat__connection--${connectionStatus}`}>
              <span className="player-combat__connection-dot" />
            </div>

            {isMyTurn && activeEntity && (
              <div className="player-combat__your-turn">
                <span className="player-combat__your-turn-icon">\u2605</span>
                Your Turn: {activeEntity.name}
              </div>
            )}
          </div>
        </div>

        {displayError && (
          <div className="player-combat__error">
            <span>{displayError}</span>
            <button onClick={() => { clearError(); setLocalError(null); }}>Dismiss</button>
          </div>
        )}
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          INITIATIVE BAR
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="player-combat__initiative">
        <InitiativeBar
          entities={initiativeOrder}
          initiativeOrder={state?.initiativeOrder ?? []}
          activeEntityId={state?.activeEntityId ?? null}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN CONTENT
          ═══════════════════════════════════════════════════════════════════════ */}
      <main className="player-combat__main">
        {/* My Entities Panel */}
        <section className="player-combat__my-entities">
          <h2 className="player-combat__section-title">
            <span className="player-combat__section-icon">\u2694</span>
            Your Forces
          </h2>

          {myControlledEntities.length === 0 ? (
            <p className="player-combat__empty-section">
              You have no controlled entities in this combat.
            </p>
          ) : (
            <div className="player-combat__entity-grid">
              {myControlledEntities.map((entity) => (
                <div
                  key={entity.id}
                  className={`player-combat__my-entity ${entity.id === state?.activeEntityId ? "player-combat__my-entity--active" : ""} ${entity.id === selectedEntityId ? "player-combat__my-entity--selected" : ""}`}
                  onClick={() => setSelectedEntityId(entity.id)}
                >
                  <div className="player-combat__my-entity-header">
                    <h3 className="player-combat__my-entity-name">{entity.name}</h3>
                    {entity.id === state?.activeEntityId && (
                      <span className="player-combat__my-entity-active-badge">Active</span>
                    )}
                  </div>

                  <div className="player-combat__my-entity-resources">
                    <ResourceBar
                      label="AP"
                      current={entity.ap.current}
                      max={entity.ap.max}
                      type="ap"
                      compact
                    />
                    <ResourceBar
                      label="Energy"
                      current={entity.energy.current}
                      max={entity.energy.max}
                      type="energy"
                      compact
                    />
                  </div>

                  {entity.statusEffects.length > 0 && (
                    <div className="player-combat__my-entity-status">
                      <StatusEffectList effects={entity.statusEffects} />
                    </div>
                  )}

                  <WoundTracker wounds={entity.wounds} compact hideEmpty />

                  {entity.reaction.available && !isMyTurn && canDeclareReaction && (
                    <button
                      className="player-combat__entity-reaction-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenReactionModal(entity.id);
                      }}
                    >
                      \u26A1 React
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Battlefield View */}
        <section className="player-combat__battlefield">
          <div className="player-combat__factions">
            {/* Allies */}
            <div className="player-combat__faction player-combat__faction--allies">
              <h3 className="player-combat__faction-title">
                <span className="player-combat__faction-icon">\u2694</span>
                Allies
                <span className="player-combat__faction-count">{allies.length}</span>
              </h3>
              <div className="player-combat__faction-grid">
                {allies.map((entity) => (
                  <EntityCard
                    key={entity.id}
                    entity={entity}
                    isActive={entity.id === state?.activeEntityId}
                    compact
                  />
                ))}
              </div>
            </div>

            {/* Enemies */}
            <div className="player-combat__faction player-combat__faction--enemies">
              <h3 className="player-combat__faction-title">
                <span className="player-combat__faction-icon">\u2620</span>
                Enemies
                <span className="player-combat__faction-count">{enemies.length}</span>
              </h3>
              <div className="player-combat__faction-grid">
                {enemies.map((entity) => (
                  <div
                    key={entity.id}
                    onClick={() => {
                      if (isMyTurn && activeEntity) {
                        handleOpenAttackModal(entity.id);
                      }
                    }}
                    style={{ cursor: isMyTurn && activeEntity ? 'pointer' : 'default' }}
                  >
                    <EntityCard
                      entity={entity}
                      isActive={entity.id === state?.activeEntityId}
                      compact
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Action Panel (Only shown when it's your turn) */}
        {isMyTurn && activeEntity && myControlledEntities.some(e => e.id === activeEntity.id) && (
          <section className="player-combat__action-section">
            <ActionPanel
              entity={activeEntity}
              onDeclareAction={handleDeclareAction}
              enemies={enemies}
            />

            <div className="player-combat__turn-controls">
              {pendingAction && (
                <div className="player-combat__pending">
                  <span className="player-combat__pending-label">Pending:</span>
                  <span className="player-combat__pending-type">{pendingAction.type}</span>
                </div>
              )}

              <button
                className="player-combat__end-turn-btn"
                onClick={handleEndTurn}
              >
                End Turn
              </button>
            </div>
          </section>
        )}

        {/* Waiting overlay when not your turn */}
        {!isMyTurn && (
          <div className="player-combat__waiting">
            <div className="player-combat__waiting-content">
              <span className="player-combat__waiting-icon">\u23F3</span>
              <span className="player-combat__waiting-text">
                {activeEntity ? `${activeEntity.name}'s turn` : "Waiting..."}
              </span>
            </div>
          </div>
        )}
      </main>

      {/* Floating Reaction Button */}
      {!isMyTurn && canDeclareReaction && entitiesWithReaction.length > 0 && (
        <ReactionButton
          onClick={() => handleOpenReactionModal(entitiesWithReaction[0].id)}
          pulsing={phase === "active-turn" && pendingAction?.interruptible}
          label={`React (${entitiesWithReaction.length})`}
        />
      )}

      {/* Reaction Modal */}
      {showReactionModal && reactionEntity && (
        <ReactionModal
          entity={reactionEntity}
          pendingActionId={pendingAction?.actionId ?? null}
          onDeclare={handleDeclareReaction}
          onClose={() => {
            setShowReactionModal(false);
            setReactionEntityId(null);
          }}
        />
      )}

      {/* Attack Modal */}
      <SkillContestModal
        isOpen={showAttackModal}
        onClose={() => {
          setShowAttackModal(false);
          setAttackTargetId(null);
        }}
        mode="attack"
        attackerEntity={activeEntity}
        targetEntity={attackTargetId ? state?.entities[attackTargetId] : null}
        onInitiateAttack={handleInitiateAttack}
      />

      {/* Defense Modal */}
      {myPendingDefense && (
        <SkillContestModal
          isOpen={showDefenseModal}
          onClose={() => setShowDefenseModal(false)}
          mode="defend"
          contest={myPendingDefense}
          defenderEntity={myControlledEntities.find(e => e.id === myPendingDefense.targetId) ?? null}
          onDefend={handleDefend}
        />
      )}

      {/* Skill Check Prompt */}
      {myPendingSkillChecks.length > 0 && (
        <SkillCheckPrompt
          isOpen={true}
          onClose={() => {
            // Optionally allow closing, but skill check remains pending
          }}
          check={myPendingSkillChecks[0]}
          entity={myControlledEntities.find(e => e.id === myPendingSkillChecks[0].targetEntityId) ?? null}
          onSubmit={handleSubmitSkillCheck}
        />
      )}

      {/* Contest Result Display */}
      {contestResult && (
        <ContestResultDisplay
          isOpen={showResultModal}
          onClose={() => {
            setShowResultModal(false);
            setContestResult(null);
          }}
          outcome={contestResult.outcome}
          winnerName={contestResult.winnerName}
          loserName={contestResult.loserName}
          winnerSkill={contestResult.winnerSkill}
          loserSkill={contestResult.loserSkill}
        />
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
      <div className="player-combat__error-screen">
        <h2>No Campaign Selected</h2>
        <p>Please join a campaign to participate in combat.</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="player-combat__loading">
        <div className="player-combat__loading-spinner" />
        <p>Connecting...</p>
      </div>
    );
  }

  return (
    <CombatProvider campaignId={campaignId} userId={userId} isGm={false}>
      <CombatPageInner campaignId={campaignId} />
    </CombatProvider>
  );
};

export default CombatPageNew;
