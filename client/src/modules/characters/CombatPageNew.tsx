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
  CombatChronicle,
  NotificationBanner,
  TurnAnnouncement,
  RollOverlay,
  type RollSubmitData,
} from "../../components/combat";
import { useCombatNotifications } from "../../hooks/useCombatNotifications";
import {
  PlayerCombatLobby,
  type LobbyPlayer,
} from "../combat/CombatLobby";
import { gmApi, type Campaign, type CampaignMember } from "../../api/gm";
import { getSupabaseClient } from "../../api/supabaseClient";
import type {
  CombatEntity,
  ActionType,
  ReactionType,
} from "@shared/rules/combat";
import "./CombatPageNew.css";

// ═══════════════════════════════════════════════════════════════════════════
// INNER COMPONENT (Uses CombatContext)
// ═══════════════════════════════════════════════════════════════════════════

const CombatPageInner: React.FC<{ campaignId: string; userId: string }> = ({ campaignId, userId }) => {
  const {
    state,
    lobbyState,
    connectionStatus,
    error,
    clearError,
    declareAction,
    declareReaction,
    endTurn,
    initiateSkillContest,
    respondToSkillContest,
    submitSkillCheck,
    submitInitiativeRoll,
    myPendingDefense,
    myPendingSkillChecks,
    myPendingInitiativeRolls,
    joinLobby,
    leaveLobby,
    toggleReady,
  } = useCombat();

  const { phase, round, activeEntity, isMyTurn, pendingAction } =
    useCombatTurn();
  const {
    getEntitiesByFaction,
    getEntitiesInInitiativeOrder,
    myControlledEntities,
  } = useCombatEntities();
  const { canDeclareReaction } = useCombatReactions();

  const [localError, setLocalError] = React.useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = React.useState<string | null>(
    null
  );
  const [campaign, setCampaign] = React.useState<Campaign | null>(null);
  const [members, setMembers] = React.useState<CampaignMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showTurnAnnouncement, setShowTurnAnnouncement] = React.useState(false);
  const [previousActiveEntityId, setPreviousActiveEntityId] = React.useState<string | null>(null);
  const lastTurnEntityRef = React.useRef<string | null>(null);
  const hasSeenTurnRef = React.useRef(false);

  // Notification system
  const {
    notifications,
    dismissNotification,
    notifyGMRequest,
    notifyAttackIncoming,
    notifyCombatEvent,
  } = useCombatNotifications();

  // Derived data
  const allies = state ? getEntitiesByFaction("ally") : [];
  const enemies = state ? getEntitiesByFaction("enemy") : [];
  const initiativeOrder = state ? getEntitiesInInitiativeOrder() : [];
  const hasCombat = state !== null && phase !== "completed";
  const displayError = error || localError;

  // Load campaign data and members
  React.useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const campaigns = await gmApi.listCampaigns();
        const campaignData = campaigns.find(c => c.id === campaignId);
        const membersData = await gmApi.listCampaignMembers(campaignId);

        setCampaign(campaignData || null);
        setMembers(membersData);
      } catch (err) {
        setLocalError('Failed to load campaign data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [campaignId]);

  // Join lobby when not in combat, leave on cleanup
  React.useEffect(() => {
    if (!hasCombat && !loading) {
      const currentMember = members.find(m => m.playerUserId === userId);
      joinLobby(currentMember?.characterId);
      return () => {
        leaveLobby();
      };
    }
  }, [hasCombat, loading, userId, members, joinLobby, leaveLobby]);

  // Auto-select first controlled entity
  React.useEffect(() => {
    if (!selectedEntityId && myControlledEntities.length > 0) {
      setSelectedEntityId(myControlledEntities[0].id);
    }
  }, [myControlledEntities, selectedEntityId]);

  // Show turn announcement when it becomes player's turn
  React.useEffect(() => {
    if (!activeEntity || !isMyTurn) return;

    // Check if this is a new turn (different entity or was previously not my turn)
    const isNewTurn = activeEntity.id !== previousActiveEntityId;

    if (isNewTurn) {
      setShowTurnAnnouncement(true);
      setPreviousActiveEntityId(activeEntity.id);
    }
  }, [activeEntity, isMyTurn, previousActiveEntityId]);

  // Notify when GM requests skill check
  React.useEffect(() => {
    if (myPendingSkillChecks.length === 0) return;

    const latestCheck = myPendingSkillChecks[0];
    notifyGMRequest(
      `Roll a ${latestCheck.skill} check${latestCheck.targetNumber ? ` (DC ${latestCheck.targetNumber})` : ''}`,
      () => {
        // The SkillCheckRequestModal will handle the actual roll
        // This just dismisses the notification when clicked
      }
    );
  }, [myPendingSkillChecks, notifyGMRequest]);

  // Notify when player is being attacked
  React.useEffect(() => {
    if (!myPendingDefense) return;

    const attacker = state?.entities[myPendingDefense.initiatorId];
    if (attacker) {
      notifyAttackIncoming(
        attacker.name,
        () => {
          // The SkillDuelModal will handle the defense
          // This just dismisses the notification
        }
      );
    }
  }, [myPendingDefense, state, notifyAttackIncoming]);

  // Notify when turns advance
  React.useEffect(() => {
    if (!state?.activeEntityId) {
      lastTurnEntityRef.current = null;
      hasSeenTurnRef.current = false;
      return;
    }

    if (!hasSeenTurnRef.current) {
      hasSeenTurnRef.current = true;
      lastTurnEntityRef.current = state.activeEntityId;
      return;
    }

    if (lastTurnEntityRef.current && lastTurnEntityRef.current !== state.activeEntityId) {
      const previousName = state.entities[lastTurnEntityRef.current]?.name || "Unknown";
      notifyCombatEvent("Turn Ended", `${previousName} ended their turn.`);
    }

    if (lastTurnEntityRef.current !== state.activeEntityId) {
      const currentName = state.entities[state.activeEntityId]?.name || "Unknown";
      notifyCombatEvent("Turn Started", `${currentName} is now acting.`);
    }

    lastTurnEntityRef.current = state.activeEntityId;
  }, [state?.activeEntityId, state?.entities, notifyCombatEvent]);

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
    // TODO: Implement interruptible action detection
    // For now, reaction system is disabled
    if (!canDeclareReaction) return;
    const reactingEntity = myControlledEntities.find(
      (e) => e.reaction.available
    );
    if (!reactingEntity) return;

    // declareReaction({
    //   entityId: reactingEntity.id,
    //   type: "parry",
    //   targetActionId: "...",
    //   apCost: 0,
    //   energyCost: 0,
    // }).catch((err) => {
    //   setLocalError(
    //     err instanceof Error ? err.message : "Failed to declare reaction"
    //   );
    // });
  };

  const handleEntityClick = (entityId: string) => {
    setSelectedEntityId(entityId);
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
        Math.floor(Math.random() * 100) + 1
      );
      const modifier = 0; // Would come from entity stats

      // Get the defending entity ID
      const defendingEntityId = myControlledEntities[0]?.id || "";

      await respondToSkillContest({
        contestId: myPendingDefense.contestId,
        entityId: defendingEntityId,
        skill,
        roll: {
          modifier,
          diceCount,
          diceSize: 100,
          rawValues: rawDice,
          keepHighest,
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

  const handleInitiativeRoll = async (entityId: string, roll: any) => {
    try {
      await submitInitiativeRoll({ entityId, roll });
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Failed to submit initiative roll"
      );
    }
  };

  const handleInitiateSkillContest = async (targetId: string, skill: string, roll: any) => {
    if (!activeEntity) return;
    try {
      await initiateSkillContest({
        initiatorEntityId: activeEntity.id,
        targetEntityId: targetId,
        skill,
        roll,
      });
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Failed to initiate skill contest"
      );
    }
  };

  // Skill check handling (responding to GM requests)
  const handleSkillCheckSubmit = async (checkId: string, roll: any) => {
    try {
      await submitSkillCheck({ checkId, roll });
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Failed to submit skill check"
      );
    }
  };

  // Unified roll overlay handler
  const handleRollOverlaySubmit = async (data: RollSubmitData) => {
    if (data.variant === 'initiative') {
      // For initiative, we need the entity ID - use first pending initiative roll
      if (myPendingInitiativeRolls.length > 0) {
        await handleInitiativeRoll(myPendingInitiativeRolls[0].id, data.roll);
      }
    } else if (data.variant === 'skill-check') {
      await handleSkillCheckSubmit(data.checkId, data.roll);
    } else if (data.variant === 'contest' && myPendingDefense && myControlledEntities.length > 0) {
      try {
        await respondToSkillContest({
          contestId: data.contestId,
          entityId: myControlledEntities[0].id,
          skill: data.skill,
          roll: data.roll,
        });
      } catch (err) {
        setLocalError(
          err instanceof Error ? err.message : "Failed to submit defense"
        );
      }
    }
  };

  // Determine if reaction sigil should pulse
  // TODO: Re-enable when interruptible actions are implemented
  const shouldPulseReaction = false;
  // const shouldPulseReaction =
  //   canDeclareReaction &&
  //   myControlledEntities.some((e) => e.reaction.available);

  const hasReactionAvailable = myControlledEntities.some(
    (e) => e.reaction.available
  );

  if (loading) {
    return (
      <div className="war-page" data-theme="dark-fantasy">
        <div className="war-page__empty">
          <h2 className="war-page__empty-title">Loading...</h2>
        </div>
      </div>
    );
  }

  if (!hasCombat) {
    // Find current player's info
    const currentMember = members.find(m => m.playerUserId === userId);
    const myLobbyState = lobbyState?.players[userId];

    // Transform members to lobby players using real-time lobby state
    const otherPlayers: LobbyPlayer[] = members
      .filter(m => m.playerUserId !== userId)
      .map(member => {
        const playerLobbyState = lobbyState?.players[member.playerUserId];
        return {
          id: member.playerUserId,
          name: member.playerUserId.substring(0, 8), // TODO: Get actual player name
          characterName: member.characterId || undefined,
          isReady: playerLobbyState?.isReady ?? false,
          isConnected: !!playerLobbyState, // Connected if they're in the lobby state
        };
      });

    return (
      <PlayerCombatLobby
        campaignName={campaign?.name || 'Campaign'}
        playerName={userId.substring(0, 8)} // TODO: Get actual player name
        characterName={currentMember?.characterId}
        isReady={myLobbyState?.isReady ?? false}
        onToggleReady={(ready) => toggleReady(ready, currentMember?.characterId)}
        otherPlayers={otherPlayers}
      />
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

            {!isMyTurn && activeEntity && (
              <div className="war-page__current-turn">
                <span className="war-page__current-turn-icon">⏳</span>
                Current Turn: {activeEntity.name}
              </div>
            )}

            {!activeEntity && phase === "initiative-rolling" && (
              <div className="war-page__current-turn war-page__current-turn--waiting">
                <span className="war-page__current-turn-icon">🎲</span>
                Rolling initiative...
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
                    onClick={() => handleEntityClick(entity.id)}
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
                    onClick={() => handleEntityClick(entity.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Initiative Rolling Panel - Note: RollOverlay handles this via modal below */}

          {/* Action Grimoire (Bottom Panel - only visible on your turn) */}
          {isMyTurn && activeEntity && phase === "active-turn" && (
            <div className="war-page__action-panel">
              <ActionGrimoire
                entity={activeEntity}
                enemies={enemies}
                onDeclareAction={handleDeclareAction}
                onInitiateSkillContest={handleInitiateSkillContest}
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
          ROLL OVERLAY (Unified roll experience)
          ═══════════════════════════════════════════════════════════════════════ */}

      {/* Initiative Roll */}
      {myPendingInitiativeRolls.length > 0 && (
        <RollOverlay
          isOpen={true}
          variant="initiative"
          entity={myPendingInitiativeRolls[0]}
          onSubmit={handleRollOverlaySubmit}
          onClose={() => {
            /* Can't close until initiative rolled */
          }}
        />
      )}

      {/* Defense Contest */}
      {myPendingDefense && myControlledEntities.length > 0 && (
        <RollOverlay
          isOpen={true}
          variant="contest"
          entity={myControlledEntities[0]}
          contest={myPendingDefense}
          entities={state?.entities ? Object.values(state.entities) : []}
          contestMode="defender"
          onSubmit={handleRollOverlaySubmit}
          onClose={() => {
            /* Can't close until defense rolled */
          }}
        />
      )}

      {/* GM Skill Check Request */}
      {myPendingSkillChecks.length > 0 && myControlledEntities.length > 0 && (
        <RollOverlay
          isOpen={true}
          variant="skill-check"
          entity={myControlledEntities[0]}
          checkRequest={myPendingSkillChecks[0]}
          onSubmit={handleRollOverlaySubmit}
          onClose={() => {
            /* Can't close until skill check rolled */
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          NOTIFICATION SYSTEM
          ═══════════════════════════════════════════════════════════════════════ */}

      {/* Notification Banner - Slide-down alerts for GM requests, attacks, events */}
      <NotificationBanner
        notifications={notifications}
        onDismiss={dismissNotification}
      />

      {/* Turn Announcement - Full-screen flash when it becomes player's turn */}
      {showTurnAnnouncement && activeEntity && (
        <TurnAnnouncement
          isVisible={showTurnAnnouncement}
          entityName={activeEntity.name}
          ap={activeEntity.ap}
          energy={activeEntity.energy}
          onDismiss={() => setShowTurnAnnouncement(false)}
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
  const [userId, setUserId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function loadAuth() {
      try {
        const client = getSupabaseClient();
        const { data, error: authError } = await client.auth.getUser();

        if (authError || !data.user) {
          setError('Not authenticated');
          return;
        }

        setUserId(data.user.id);
      } catch (err) {
        setError('Failed to load user data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadAuth();
  }, []);

  if (!campaignId) {
    return (
      <div className="war-page__error-state">
        <h2>Error: No Campaign ID</h2>
        <p>Cannot load combat without a campaign ID.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="war-page" data-theme="dark-fantasy">
        <div className="war-page__empty">
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  if (error || !userId) {
    return (
      <div className="war-page__error-state">
        <h2>Error: {error || 'Not authenticated'}</h2>
        <p>Please log in to access combat.</p>
      </div>
    );
  }

  return (
    <CombatProvider campaignId={campaignId} userId={userId} isGm={false}>
      <CombatPageInner campaignId={campaignId} userId={userId} />
    </CombatProvider>
  );
};

export default CombatPageNew;
