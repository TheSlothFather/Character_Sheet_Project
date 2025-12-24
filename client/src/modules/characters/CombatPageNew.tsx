/**
 * Player Combat Page - War Chronicle Edition
 *
 * Player-facing combat interface with immersive War Chronicle aesthetic.
 * Uses the CombatContext provider and War Chronicle components.
 */

import React from "react";
import { useParams } from "react-router-dom";
import {
  CombatProvider,
  useCombat,
  useCombatTurn,
  useCombatEntities,
  useCombatReactions,
} from "../combat/CombatContext";
import {
  PhaseDial,
  InitiativeTower,
  EntityToken,
  ActionGrimoire,
  ReactionSigil,
  SkillDuelModal,
  CombatChronicle,
} from "../../components/combat";
import type {
  CombatEntity,
  ActionType,
  ReactionType,
} from "@shared/rules/combat";
import "./CombatPageNew.css";

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

  const { phase, round, activeEntity, isMyTurn, pendingAction } =
    useCombatTurn();
  const {
    getEntitiesByFaction,
    getEntitiesInInitiativeOrder,
    myControlledEntities,
  } = useCombatEntities();
  const { canDeclareReaction, interruptibleAction } = useCombatReactions();

  const [localError, setLocalError] = React.useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = React.useState<string | null>(
    null
  );

  // Derived data
  const allies = state ? getEntitiesByFaction("ally") : [];
  const enemies = state ? getEntitiesByFaction("enemy") : [];
  const initiativeOrder = state ? getEntitiesInInitiativeOrder() : [];
  const hasCombat = state !== null && phase !== "completed";
  const displayError = error || localError;

  // Auto-select first controlled entity
  React.useEffect(() => {
    if (!selectedEntityId && myControlledEntities.length > 0) {
      setSelectedEntityId(myControlledEntities[0].id);
    }
  }, [myControlledEntities, selectedEntityId]);

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
      setLocalError(
        err instanceof Error ? err.message : "Failed to declare action"
      );
    }
  };

  const handleEndTurn = async () => {
    if (!activeEntity) return;
    try {
      await endTurn({ entityId: activeEntity.id, voluntary: true });
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Failed to end turn"
      );
    }
  };

  const handleReactionClick = () => {
    if (!interruptibleAction || !canDeclareReaction) return;
    // For now, just declare a generic parry reaction
    // In a full implementation, this could open a reaction selection modal
    const reactingEntity = myControlledEntities.find(
      (e) => e.reaction.available
    );
    if (!reactingEntity) return;

    declareReaction({
      entityId: reactingEntity.id,
      type: "parry",
      targetActionId: interruptibleAction.actionId,
      apCost: 0,
      energyCost: 0,
    }).catch((err) => {
      setLocalError(
        err instanceof Error ? err.message : "Failed to declare reaction"
      );
    });
  };

  const handleEntityClick = (entity: CombatEntity) => {
    setSelectedEntityId(entity.id);
  };

  const handleLogEntryClick = (entry: any) => {
    // Highlight entity when log entry clicked
    if (entry.sourceEntityId) {
      setSelectedEntityId(entry.sourceEntityId);
    }
  };

  // Skill contest handling
  const handleDefenseRoll = async (
    skill: string,
    diceCount: number,
    keepHighest: boolean
  ) => {
    if (!myPendingDefense) return;

    try {
      // Roll dice (client-side for demo, server will validate)
      const rawDice = Array.from({ length: diceCount }, () =>
        Math.floor(Math.random() * 20) + 1
      );
      const selectedDie = keepHighest
        ? Math.max(...rawDice)
        : Math.min(...rawDice);
      const modifier = 0; // Would come from entity stats
      const total = selectedDie + modifier;

      await respondToSkillContest({
        contestId: myPendingDefense.contestId,
        skill,
        roll: {
          skill,
          modifier,
          diceCount,
          keepHighest,
          rawDice,
          selectedDie,
          total,
          audit: `${skill}: rolled ${rawDice.join(", ")}, selected ${selectedDie}, total ${total}`,
        },
      });
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Failed to roll defense"
      );
    }
  };

  const handleAcknowledgeResult = () => {
    // Just close the modal - server tracks that contest is resolved
    // Could add explicit acknowledge endpoint if needed
  };

  // Determine if reaction sigil should pulse
  const shouldPulseReaction =
    canDeclareReaction &&
    !!interruptibleAction &&
    myControlledEntities.some((e) => e.reaction.available);

  const hasReactionAvailable = myControlledEntities.some(
    (e) => e.reaction.available
  );

  if (!hasCombat) {
    return (
      <div className="war-page" data-theme="dark-fantasy">
        <div className="war-page__empty">
          <h2 className="war-page__empty-title">No Active Combat</h2>
          <p className="war-page__empty-text">
            Waiting for combat to begin...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="war-page" data-theme="dark-fantasy">
      {/* ═══════════════════════════════════════════════════════════════════════
          HEADER
          ═══════════════════════════════════════════════════════════════════════ */}
      <header className="war-page__header">
        <div className="war-page__header-content">
          <h1 className="war-page__title war-text-display">⚔️ War Chronicle</h1>

          {phase && (
            <div className="war-page__phase-dial">
              <PhaseDial phase={phase} round={round} />
            </div>
          )}

          <div className="war-page__header-status">
            <div
              className={`war-page__connection war-page__connection--${connectionStatus}`}
            >
              <span className="war-page__connection-dot" />
              <span className="war-page__connection-label">
                {connectionStatus}
              </span>
            </div>

            {isMyTurn && activeEntity && (
              <div className="war-page__your-turn">
                <span className="war-page__your-turn-icon">⭐</span>
                Your Turn: {activeEntity.name}
              </div>
            )}
          </div>
        </div>

        {displayError && (
          <div className="war-page__error">
            <span>{displayError}</span>
            <button
              onClick={() => {
                clearError();
                setLocalError(null);
              }}
            >
              ✕
            </button>
          </div>
        )}
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN LAYOUT (3-Column Grid)
          ═══════════════════════════════════════════════════════════════════════ */}
      <main className="war-page__main">
        {/* LEFT: Initiative Tower */}
        <aside className="war-page__sidebar war-page__sidebar--left">
          <InitiativeTower
            entities={state?.entities ? Object.values(state.entities) : []}
            initiativeOrder={state?.initiativeOrder ?? []}
            activeEntityId={state?.activeEntityId ?? null}
            onEntityClick={handleEntityClick}
          />
        </aside>

        {/* CENTER: Battlefield */}
        <section className="war-page__battlefield">
          {/* Ally Zone */}
          <div className="war-page__zone war-page__zone--allies">
            <h2 className="war-page__zone-title war-text-display">
              ⚔️ Your Forces
            </h2>
            <div className="war-page__token-grid">
              {allies.length === 0 ? (
                <div className="war-page__zone-empty">No allies</div>
              ) : (
                allies.map((entity) => (
                  <EntityToken
                    key={entity.id}
                    entity={entity}
                    isActive={entity.id === state?.activeEntityId}
                    isSelected={entity.id === selectedEntityId}
                    onClick={() => handleEntityClick(entity)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Enemy Zone */}
          <div className="war-page__zone war-page__zone--enemies">
            <h2 className="war-page__zone-title war-text-display">
              ☠️ Enemy Forces
            </h2>
            <div className="war-page__token-grid">
              {enemies.length === 0 ? (
                <div className="war-page__zone-empty">No enemies</div>
              ) : (
                enemies.map((entity) => (
                  <EntityToken
                    key={entity.id}
                    entity={entity}
                    isActive={entity.id === state?.activeEntityId}
                    isSelected={entity.id === selectedEntityId}
                    onClick={() => handleEntityClick(entity)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Action Grimoire (Bottom Panel - only visible on your turn) */}
          {isMyTurn && activeEntity && (
            <div className="war-page__action-panel">
              <ActionGrimoire
                entity={activeEntity}
                enemies={enemies}
                onDeclareAction={handleDeclareAction}
                onEndTurn={handleEndTurn}
                disabled={false}
              />
            </div>
          )}
        </section>

        {/* RIGHT: Combat Chronicle (Log) */}
        <aside className="war-page__sidebar war-page__sidebar--right">
          <CombatChronicle
            log={state?.log ?? []}
            entities={state?.entities ? Object.values(state.entities) : []}
            onEntryClick={handleLogEntryClick}
            maxEntries={100}
          />
        </aside>
      </main>

      {/* ═══════════════════════════════════════════════════════════════════════
          FLOATING REACTION SIGIL
          ═══════════════════════════════════════════════════════════════════════ */}
      <ReactionSigil
        available={hasReactionAvailable}
        pulsing={shouldPulseReaction}
        onClick={handleReactionClick}
        label={shouldPulseReaction ? "React!" : "Reaction"}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          MODALS
          ═══════════════════════════════════════════════════════════════════════ */}
      {myPendingDefense && (
        <SkillDuelModal
          isOpen={true}
          contest={myPendingDefense}
          entities={state?.entities ? Object.values(state.entities) : []}
          mode="defender"
          onRoll={handleDefenseRoll}
          onAcknowledge={
            myPendingDefense.status === "resolved"
              ? handleAcknowledgeResult
              : undefined
          }
          onClose={() => {
            /* Defender can't close until they roll */
          }}
        />
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// OUTER COMPONENT (Provides CombatContext)
// ═══════════════════════════════════════════════════════════════════════════

const CombatPageNew: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();

  if (!campaignId) {
    return (
      <div className="war-page__error-state">
        <h2>Error: No Campaign ID</h2>
        <p>Cannot load combat without a campaign ID.</p>
      </div>
    );
  }

  return (
    <CombatProvider campaignId={campaignId}>
      <CombatPageInner campaignId={campaignId} />
    </CombatProvider>
  );
};

export default CombatPageNew;
