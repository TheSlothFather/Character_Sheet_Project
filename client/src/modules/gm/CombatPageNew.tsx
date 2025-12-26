/**
 * GM Combat Page - War Chronicle Edition
 *
 * Authoritative combat management interface with War Chronicle aesthetic.
 * GM-focused layout with combat controls and entity management.
 */

import React from "react";
import { useParams } from "react-router-dom";
import {
  CombatProvider,
  useCombat,
  useCombatTurn,
  useCombatEntities,
} from "../combat/CombatContext";
import {
  PhaseDial,
  InitiativeTower,
  EntityToken,
  CombatChronicle,
  ResourceSegments,
  StatusList,
  WoundDisplay,
  GmContestResolutionPanel,
  GmSkillActionPanel,
  GmSkillCheckResolutionPanel,
  NpcActionPanel,
  RollOverlay,
  GmInitiativeStatusPanel,
  GmResourcePanel,
} from "../../components/combat";
import {
  GmCombatLobby,
  type LobbyPlayer,
  type LobbyCombatant,
  type LobbyPlayerCharacter,
  type BestiaryEntryPreview,
} from "../combat/CombatLobby";
import { gmApi, type BestiaryEntry, type CampaignCombatant, type Campaign, type CampaignMember } from "../../api/gm";
import { api as clientApi, type Character } from "../../api/client";
import { getSupabaseClient } from "../../api/supabaseClient";
import type {
  CombatEntity,
  EntityFaction,
  InitiativeMode as CombatInitiativeMode,
  CombatStatusEffect,
  StatusKey,
  GmOverrideType,
} from "@shared/rules/combat";
import type { WoundCounts, WoundType } from "@shared/rules/wounds";
import type { InitiativeMode as LobbyInitiativeMode } from "../combat/CombatLobby";
import "./CombatPageNew.css";

// ═══════════════════════════════════════════════════════════════════════════
// COMBATANT TO ENTITY TRANSFORMER
// ═══════════════════════════════════════════════════════════════════════════

const buildCharacterSkills = (character: Character): Record<string, number> => {
  const allocations = character.skillAllocations ?? {};
  const bonuses = character.skillBonuses ?? {};
  const skills: Record<string, number> = {};
  const keys = new Set([...Object.keys(allocations), ...Object.keys(bonuses)]);
  keys.forEach((key) => {
    skills[key] = (allocations[key] ?? 0) + (bonuses[key] ?? 0);
  });
  return skills;
};

const computeCharacterEnergyMax = (character: Character): number => {
  const energyBase = character.raceKey === "ANZ" ? 140 : 100;
  const energyPerLevel = character.raceKey === "ANZ" ? 14 : 10;
  const level = Math.max(1, character.level);
  return Math.round(energyBase + energyPerLevel * (level - 1));
};

function transformCombatantToEntity(
  combatant: CampaignCombatant,
  characterToPlayer: Map<string, string>,
  bestiaryById: Map<string, BestiaryEntry>,
  charactersById: Map<string, Character>
): CombatEntity {
  const character = combatant.characterId ? charactersById.get(combatant.characterId) : undefined;
  const bestiaryEntry = combatant.bestiaryEntryId ? bestiaryById.get(combatant.bestiaryEntryId) : undefined;
  const skills = character
    ? buildCharacterSkills(character)
    : (bestiaryEntry?.skills as Record<string, number> | undefined) ??
      (bestiaryEntry?.statsSkills as Record<string, number> | undefined) ??
      {};
  // Transform wounds from array to WoundCounts record
  const wounds: WoundCounts = {
    burn: 0,
    freeze: 0,
    laceration: 0,
    blunt: 0,
    mental: 0,
    necrosis: 0,
    spiritual: 0,
  };

  if (combatant.wounds) {
    for (const wound of combatant.wounds) {
      const woundType = wound.woundType as WoundType;
      wounds[woundType] = (wounds[woundType] ?? 0) + wound.woundCount;
    }
  }

  // Transform status effects
  const statusEffects: CombatStatusEffect[] = (combatant.statusEffects ?? [])
    .filter((se) => se.isActive !== false)
    .map((se) => ({
      key: se.statusKey.toUpperCase() as StatusKey,
      stacks: se.stacks ?? 1,
      duration: se.durationRemaining ?? null,
    }));

  // Determine controller
  const faction = (combatant.faction?.toLowerCase() ?? "enemy") as EntityFaction;
  const playerUserId = combatant.characterId ? characterToPlayer.get(combatant.characterId) : undefined;
  const controller: import("@shared/rules/combat").EntityController =
    playerUserId ? `player:${playerUserId}` : "gm";

  const energyMax = character ? computeCharacterEnergyMax(character) : combatant.energyMax ?? 100;
  const apMax = combatant.apMax ?? 6;
  const tier = combatant.tier ?? (character ? Math.max(1, character.level) : 1);

  return {
    id: combatant.id,
    name: character?.name ?? combatant.name,
    controller,
    faction,
    skills,
    initiativeSkill: "initiative",
    energy: {
      current: combatant.energyCurrent ?? energyMax,
      max: energyMax,
    },
    ap: {
      current: combatant.apCurrent ?? apMax,
      max: apMax,
    },
    tier,
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

const CombatPageInner: React.FC<{ campaignId: string; userId: string }> = ({ campaignId, userId }) => {
  const {
    state,
    lobbyState,
    connectionStatus,
    error,
    clearError,
    startCombat,
    endCombat,
    endTurn,
    resolveReactions,
    gmOverride,
    myPendingDefense,
    joinLobby,
    leaveLobby,
    initiateSkillContest,
    respondToSkillContest,
    requestSkillCheck,
    submitSkillCheck,
    pendingSkillChecks,
    forceInitiativeRoll,
    addResourceModifier,
    removeResourceModifier,
    adjustResource,
  } = useCombat();

  const { phase, round, activeEntity, pendingAction } = useCombatTurn();
  const { getEntitiesByFaction, getEntitiesInInitiativeOrder } = useCombatEntities();

  const [localError, setLocalError] = React.useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = React.useState<string | null>(null);
  const [combatants, setCombatants] = React.useState<CampaignCombatant[]>([]);
  const [bestiaryEntries, setBestiaryEntries] = React.useState<BestiaryEntry[]>([]);
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [campaign, setCampaign] = React.useState<Campaign | null>(null);
  const [members, setMembers] = React.useState<CampaignMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [initiativeMode, setInitiativeMode] = React.useState<LobbyInitiativeMode>("players-first");
  const [manualInitiative, setManualInitiative] = React.useState(false);
  const [isStarting, setIsStarting] = React.useState(false);

  // NPC Attack Roll State
  const [npcAttackRoll, setNpcAttackRoll] = React.useState<{
    attackerId: string;
    targetId: string;
    skill: string;
  } | null>(null);

  // Derived data
  const allies = state ? getEntitiesByFaction("ally") : [];
  const enemies = state ? getEntitiesByFaction("enemy") : [];
  const initiativeOrder = state ? getEntitiesInInitiativeOrder() : [];
  const hasCombat = state !== null && phase !== "completed";
  const displayError = error || localError;
  const selectedEntity = selectedEntityId && state?.entities[selectedEntityId];
  const allEntities = React.useMemo(
    () => (state ? Object.values(state.entities) : []),
    [state]
  );
  const charactersById = React.useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters]
  );

  // GM-specific derived state
  const gmEntities = React.useMemo(() => {
    if (!state) return [];
    return Object.values(state.entities).filter((entity) => entity.controller === "gm");
  }, [state]);

  const gmPendingContests = React.useMemo(() => {
    if (!state?.pendingSkillContests) return [];
    return Object.values(state.pendingSkillContests).filter(
      (contest) => {
        if (contest.status !== "awaiting_defense") return false;
        const target = state.entities[contest.targetId];
        if (!target) return false;
        return target.controller === "gm" || contest.gmCanResolve;
      }
    );
  }, [state]);

  const gmPendingChecks = React.useMemo(() => {
    const checks = Object.values(pendingSkillChecks ?? {});
    return checks.filter((check) => check.status === "pending" && check.gmCanResolve);
  }, [pendingSkillChecks]);

  const isNpcTurn = activeEntity?.controller === "gm";

  // Load campaign data, combatants, and bestiary
  React.useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const campaigns = await gmApi.listCampaigns();
        const campaignData = campaigns.find(c => c.id === campaignId);

        const [combatantsData, bestiaryData, membersData, characterData] = await Promise.all([
          gmApi.listCombatants(campaignId),
          gmApi.listBestiaryEntries(campaignId),
          gmApi.listCampaignMembers(campaignId),
          clientApi.listCampaignCharacters(campaignId),
        ]);

        setCampaign(campaignData || null);
        setCombatants(combatantsData);
        setBestiaryEntries(bestiaryData);
        setMembers(membersData);
        setCharacters(characterData);
      } catch (err) {
        setLocalError("Failed to load campaign data");
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
      joinLobby();
      return () => {
        leaveLobby();
      };
    }
  }, [hasCombat, loading, joinLobby, leaveLobby]);

  // Handlers for lobby
  const handleAddCombatant = async (bestiaryEntryId: string, faction: 'ally' | 'enemy') => {
    try {
      const entry = bestiaryEntries.find(e => e.id === bestiaryEntryId);
      if (!entry) return;

      const newCombatant = await gmApi.createCombatant({
        campaignId,
        bestiaryEntryId,
        faction,
        energyMax: entry.energyBars ? entry.energyBars * 10 : 100,
        apMax: 6,
        tier: entry.rank === 'Hero' ? 3 : entry.rank === 'Lieutenant' ? 2 : 1,
      });

      setCombatants(prev => [...prev, newCombatant]);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to add combatant");
    }
  };

  const handleAddPlayerCharacter = async (characterId: string) => {
    try {
      const character = charactersById.get(characterId);
      if (!character) {
        throw new Error("Character not found");
      }

      const newCombatant = await gmApi.createCombatant({
        campaignId,
        characterId,
        faction: "ally",
        energyMax: computeCharacterEnergyMax(character),
        apMax: 6,
        tier: Math.max(1, character.level),
      });

      setCombatants(prev => [...prev, newCombatant]);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to add player character");
    }
  };

  const handleRemoveCombatant = async (combatantId: string) => {
    try {
      await gmApi.deleteCombatant(combatantId);
      setCombatants(prev => prev.filter(c => c.id !== combatantId));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to remove combatant");
    }
  };

  const handleStartCombat = async () => {
    try {
      setIsStarting(true);
      // Build character-to-player mapping
      const characterToPlayer = new Map<string, string>();
      members.forEach((member) => {
        if (member.characterId) {
          characterToPlayer.set(member.characterId, member.playerUserId);
        }
      });

      const bestiaryById = new Map(bestiaryEntries.map((entry) => [entry.id, entry]));

      // Transform combatants to entities
      const entityList = combatants.map((c) =>
        transformCombatantToEntity(c, characterToPlayer, bestiaryById, charactersById)
      );

      // Convert array to Record
      const entities: Record<string, CombatEntity> = {};
      entityList.forEach(entity => {
        entities[entity.id] = entity;
      });

      // Map lobby initiative mode to combat initiative mode
      const combatInitMode: CombatInitiativeMode =
        initiativeMode === "interleaved" ? "individual" : "group";

      await startCombat({
        entities,
        initiativeMode: combatInitMode,
        manualInitiative,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to start combat");
    } finally {
      setIsStarting(false);
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

  const handleEntityClick = (entityId: string) => {
    setSelectedEntityId(entityId);
  };

  const handleLogEntryClick = (entry: any) => {
    if (entry.sourceEntityId) {
      setSelectedEntityId(entry.sourceEntityId);
    }
  };

  const handleGMOverride = async (overrideType: string, value: any) => {
    if (!selectedEntity) return;
    try {
      // Map simple override types to GM override types
      let type: GmOverrideType;
      let data: Record<string, unknown> = {};

      switch (overrideType) {
        case "heal":
          type = "adjust_energy";
          data = { delta: value };
          break;
        case "restore_ap":
          type = "adjust_ap";
          data = { delta: value };
          break;
        case "kill":
          type = "modify_wounds";
          data = { wounds: { laceration: 999 } }; // Lethal wounds
          break;
        default:
          type = "end_turn"; // Fallback to a valid type
      }

      await gmOverride({
        type,
        targetEntityId: selectedEntity.id,
        data,
        gmId: "", // Context will override this
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to apply override");
    }
  };

  const handleGmDefenseRoll = async (contestId: string, skill: string, roll: any) => {
    try {
      const contest = gmPendingContests.find((c) => c.contestId === contestId);
      if (!contest) return;

      await respondToSkillContest({
        contestId,
        entityId: contest.targetId,
        skill,
        roll,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to resolve contest");
    }
  };

  const handleInitiateSkillContest = async (params: {
    initiatorEntityId: string;
    targetEntityId: string;
    skill: string;
    roll: any;
    gmCanResolve?: boolean;
  }) => {
    try {
      await initiateSkillContest(params);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to initiate contest");
      throw err;
    }
  };

  const handleNpcAttack = async (attackerId: string, targetId: string, skill: string, _roll?: any) => {
    // Trigger RollOverlay for dramatic NPC attack roll (ignore inline roll from NpcActionPanel)
    setNpcAttackRoll({ attackerId, targetId, skill });
  };

  const handleNpcAttackRollSubmit = async (data: any) => {
    if (!npcAttackRoll || data.variant !== 'contest') return;

    try {
      await initiateSkillContest({
        initiatorEntityId: npcAttackRoll.attackerId,
        targetEntityId: npcAttackRoll.targetId,
        skill: data.skill,
        roll: data.roll,
      });
      setNpcAttackRoll(null); // Close overlay
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to initiate NPC attack");
    }
  };

  const handleRequestSkillCheck = async (params: {
    targetPlayerId: string;
    targetEntityId: string;
    skill: string;
    targetNumber?: number;
    diceCount?: number;
    keepHighest?: boolean;
    gmCanResolve?: boolean;
  }) => {
    try {
      await requestSkillCheck(params);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to request skill check");
      throw err;
    }
  };

  const handleGmSkillCheckRoll = async (checkId: string, roll: any) => {
    try {
      await submitSkillCheck({ checkId, roll });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to resolve skill check");
    }
  };

  if (loading) {
    return (
      <div className="war-gm-page" data-theme="dark-fantasy">
        <div className="war-gm-page__loading">
          <h2>Loading Combat Data...</h2>
        </div>
      </div>
    );
  }

  if (!hasCombat) {
    // Transform data for lobby using real-time lobby state
    const lobbyPlayers: LobbyPlayer[] = members.map(member => {
      const playerLobbyState = lobbyState?.players[member.playerUserId];
      const characterName = member.characterId ? charactersById.get(member.characterId)?.name : undefined;
      return {
        id: member.playerUserId,
        name: member.playerUserId.substring(0, 8), // TODO: Get actual player name
        characterName,
        isReady: playerLobbyState?.isReady ?? false,
        isConnected: !!playerLobbyState, // Connected if they're in the lobby state
      };
    });

    const lobbyCombatants: LobbyCombatant[] = combatants.map((combatant) => {
      const character = combatant.characterId ? charactersById.get(combatant.characterId) : undefined;
      return {
        id: combatant.id,
        bestiaryEntryId: combatant.bestiaryEntryId,
        characterId: combatant.characterId,
        name: character?.name ?? combatant.name,
        faction: (combatant.faction?.toLowerCase() || "enemy") as "ally" | "enemy",
        tier: combatant.tier ?? (character ? Math.max(1, character.level) : 1),
        energyMax: character ? computeCharacterEnergyMax(character) : combatant.energyMax || 100,
        apMax: combatant.apMax || 6,
      };
    });

    const deployedCharacterIds = new Set(
      combatants.map((combatant) => combatant.characterId).filter((id): id is string => !!id)
    );

    const membersWithCharacters = members.filter(
      (member): member is CampaignMember & { characterId: string } => !!member.characterId
    );

    const lobbyPlayerCharacters: LobbyPlayerCharacter[] = membersWithCharacters.map((member) => {
      const character = charactersById.get(member.characterId);
      return {
        playerId: member.playerUserId,
        playerName: member.playerUserId.substring(0, 8),
        characterId: member.characterId,
        characterName: character?.name ?? "Unknown Character",
        isDeployed: deployedCharacterIds.has(member.characterId),
      };
    });

    const bestiaryPreviews: BestiaryEntryPreview[] = bestiaryEntries.map(entry => ({
      id: entry.id,
      name: entry.name,
      tier: entry.rank === 'Hero' ? 3 : entry.rank === 'Lieutenant' ? 2 : 1,
      energyMax: entry.energyBars ? entry.energyBars * 10 : undefined,
      apMax: 6,
      rank: entry.rank,
    }));

    return (
      <GmCombatLobby
        campaignName={campaign?.name || 'Campaign'}
        players={lobbyPlayers}
        combatants={lobbyCombatants}
        playerCharacters={lobbyPlayerCharacters}
        bestiaryEntries={bestiaryPreviews}
        initiativeMode={initiativeMode}
        manualInitiative={manualInitiative}
        onManualInitiativeChange={setManualInitiative}
        onInitiativeModeChange={setInitiativeMode}
        onAddCombatant={handleAddCombatant}
        onAddPlayerCharacter={handleAddPlayerCharacter}
        onRemoveCombatant={handleRemoveCombatant}
        onStartCombat={handleStartCombat}
        isStarting={isStarting}
      />
    );
  }

  return (
    <div className="war-gm-page" data-theme="dark-fantasy">
      {/* HEADER */}
      <header className="war-gm-page__header">
        <div className="war-gm-page__header-content">
          <h1 className="war-gm-page__title war-text-display">👁️ Battle Command</h1>

          {phase && (
            <div className="war-gm-page__phase-dial">
              <PhaseDial phase={phase} round={round} />
            </div>
          )}

          <div className="war-gm-page__header-status">
            <div className={`war-gm-page__connection war-gm-page__connection--${connectionStatus}`}>
              <span className="war-gm-page__connection-dot" />
              <span className="war-gm-page__connection-label">{connectionStatus}</span>
            </div>
          </div>
        </div>

        {displayError && (
          <div className="war-gm-page__error">
            <span>{displayError}</span>
            <button onClick={() => { clearError(); setLocalError(null); }}>✕</button>
          </div>
        )}
      </header>

      {/* MAIN LAYOUT */}
      <main className="war-gm-page__main">
        {/* LEFT: Initiative Tower + Combat Controls */}
        <aside className="war-gm-page__sidebar war-gm-page__sidebar--left">
          <InitiativeTower
            entities={state?.entities ? Object.values(state.entities) : []}
            initiativeOrder={state?.initiativeOrder ?? []}
            activeEntityId={state?.activeEntityId ?? null}
            onEntityClick={handleEntityClick}
          />

          <div className="war-gm-page__controls">
            {/* Round Controls */}
            <div className="war-gm-page__control-section">
              <h3 className="war-gm-page__control-title">Round Controls</h3>
              <button
                className="war-gm-page__control-btn war-gm-page__control-btn--end-turn"
                onClick={handleEndTurn}
                disabled={!activeEntity}
              >
                ⏭️ End Turn
              </button>

              {phase === "reaction-interrupt" && state?.pendingReactions.length > 0 && (
                <button
                  className="war-gm-page__control-btn war-gm-page__control-btn--resolve"
                  onClick={handleResolveReactions}
                >
                  ⚡ Resolve Reactions ({state.pendingReactions.length})
                </button>
              )}
            </div>

            {/* End Combat */}
            <div className="war-gm-page__control-section war-gm-page__control-section--danger">
              <h3 className="war-gm-page__control-title">End Combat</h3>
              <div className="war-gm-page__end-btns">
                <button
                  className="war-gm-page__end-btn war-gm-page__end-btn--victory"
                  onClick={() => handleEndCombat("victory")}
                >
                  🏆 Victory
                </button>
                <button
                  className="war-gm-page__end-btn war-gm-page__end-btn--defeat"
                  onClick={() => handleEndCombat("defeat")}
                >
                  💀 Defeat
                </button>
                <button
                  className="war-gm-page__end-btn war-gm-page__end-btn--end"
                  onClick={() => handleEndCombat("gm_ended")}
                >
                  🛑 End
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* CENTER: Battlefield */}
        <section className="war-gm-page__battlefield">
          {/* Active Entity Panel */}
          {activeEntity && (
            <div className="war-gm-page__active-panel">
              <div className="war-gm-page__active-header">
                <div className="war-gm-page__active-indicator">⭐</div>
                <div className="war-gm-page__active-info">
                  <h2 className="war-gm-page__active-name war-text-display">
                    {activeEntity.name}
                  </h2>
                  <span className="war-gm-page__active-faction">
                    {activeEntity.faction === "ally" ? "Allied Forces" : "Enemy Forces"}
                  </span>
                </div>
              </div>

              <div className="war-gm-page__active-resources">
                <ResourceSegments
                  current={activeEntity.ap.current}
                  max={activeEntity.ap.max}
                  type="ap"
                  label="Action Points"
                />
                <ResourceSegments
                  current={activeEntity.energy.current}
                  max={activeEntity.energy.max}
                  type="energy"
                  label="Energy"
                />
              </div>

              {activeEntity.statusEffects.length > 0 && (
                <StatusList effects={activeEntity.statusEffects} size="sm" />
              )}

              {pendingAction && (
                <div className="war-gm-page__pending-action">
                  <span className="war-gm-page__pending-label">Pending:</span>
                  <span className="war-gm-page__pending-type">{pendingAction.type}</span>
                  {pendingAction.interruptible && (
                    <span className="war-gm-page__pending-interruptible">⚡ Interruptible</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Initiative Status Panel - Shows during manual initiative rolling */}
          {phase === "initiative-rolling" && state && (
            <div className="war-gm-page__initiative-status-panel">
              <GmInitiativeStatusPanel
                entities={state.entities}
                initiativeRolls={state.initiativeRolls || {}}
                onForceRoll={forceInitiativeRoll}
              />
            </div>
          )}

          {/* GM Contest Resolution Panel */}
          {gmPendingContests.length > 0 && state && (
            <div className="war-gm-page__contest-panel">
              <GmContestResolutionPanel
                pendingContests={gmPendingContests}
                entities={state.entities}
                onResolveContest={handleGmDefenseRoll}
              />
            </div>
          )}

          {/* GM Skill Check Resolution Panel */}
          {gmPendingChecks.length > 0 && state && (
            <div className="war-gm-page__contest-panel">
              <GmSkillCheckResolutionPanel
                pendingChecks={gmPendingChecks}
                entities={state.entities}
                onResolveCheck={handleGmSkillCheckRoll}
              />
            </div>
          )}

          {/* NPC Action Panel */}
          {isNpcTurn && activeEntity && phase === "active-turn" && (
            <div className="war-gm-page__npc-panel">
              <NpcActionPanel
                npcEntities={gmEntities}
                targetableEntities={allEntities}
                activeNpcId={activeEntity.id}
                onInitiateAttack={handleNpcAttack}
              />
            </div>
          )}

          {/* GM Skill Action Panel - Always visible during active combat */}
          {phase === "active-turn" && allEntities.length > 0 && (
            <div className="war-gm-page__skill-check-panel">
              <GmSkillActionPanel
                entities={allEntities}
                onInitiateContest={handleInitiateSkillContest}
                onRequestSkillCheck={handleRequestSkillCheck}
              />
            </div>
          )}

          {/* Faction Zones */}
          <div className="war-gm-page__zones">
            {/* Allies */}
            <div className="war-gm-page__zone war-gm-page__zone--allies">
              <h3 className="war-gm-page__zone-title war-text-display">
                ⚔️ Allied Forces
              </h3>
              <div className="war-gm-page__token-grid">
                {allies.length === 0 ? (
                  <div className="war-gm-page__zone-empty">No allies</div>
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

            {/* Enemies */}
            <div className="war-gm-page__zone war-gm-page__zone--enemies">
              <h3 className="war-gm-page__zone-title war-text-display">
                ☠️ Enemy Forces
              </h3>
              <div className="war-gm-page__token-grid">
                {enemies.length === 0 ? (
                  <div className="war-gm-page__zone-empty">No enemies</div>
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
          </div>
        </section>

        {/* RIGHT: Entity Detail Panel */}
        <aside className="war-gm-page__sidebar war-gm-page__sidebar--right">
          {selectedEntity ? (
            <div className="war-gm-page__detail-panel">
              <div className="war-gm-page__detail-header">
                <h3 className="war-gm-page__detail-title war-text-display">
                  {selectedEntity.name}
                </h3>
                <button
                  className="war-gm-page__detail-close"
                  onClick={() => setSelectedEntityId(null)}
                >
                  ✕
                </button>
              </div>

              <div className="war-gm-page__detail-content">
                {/* Resources */}
                <div className="war-gm-page__detail-section">
                  <h4 className="war-gm-page__detail-section-title">Resources</h4>
                  <ResourceSegments
                    current={selectedEntity.ap.current}
                    max={selectedEntity.ap.max}
                    type="ap"
                    label="AP"
                  />
                  <ResourceSegments
                    current={selectedEntity.energy.current}
                    max={selectedEntity.energy.max}
                    type="energy"
                    label="Energy"
                  />
                </div>

                {/* Wounds */}
                {Object.values(selectedEntity.wounds).some((count) => count > 0) && (
                  <div className="war-gm-page__detail-section">
                    <h4 className="war-gm-page__detail-section-title">Wounds</h4>
                    <WoundDisplay wounds={selectedEntity.wounds} showPenalties />
                  </div>
                )}

                {/* Status Effects */}
                {selectedEntity.statusEffects.length > 0 && (
                  <div className="war-gm-page__detail-section">
                    <h4 className="war-gm-page__detail-section-title">Status Effects</h4>
                    <StatusList effects={selectedEntity.statusEffects} showDuration />
                  </div>
                )}

                {/* GM Resource Management Panel */}
                <div className="war-gm-page__detail-section war-gm-page__detail-section--gm">
                  <GmResourcePanel
                    entity={selectedEntity}
                    onAdjustResource={(resource, delta) => adjustResource(selectedEntity.id, resource, delta)}
                    onAddModifier={(resource, modifierType, amount, duration, source) =>
                      addResourceModifier(selectedEntity.id, resource, modifierType, amount, duration, source)
                    }
                    onRemoveModifier={(resource, modifierId) =>
                      removeResourceModifier(selectedEntity.id, resource, modifierId)
                    }
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="war-gm-page__detail-empty">
              <p>Click an entity to view details</p>
            </div>
          )}
        </aside>
      </main>

      {/* FOOTER: Combat Chronicle */}
      <footer className="war-gm-page__footer">
        <CombatChronicle
          log={state?.log ?? []}
          entities={state?.entities ? Object.values(state.entities) : []}
          onEntryClick={handleLogEntryClick}
          maxEntries={50}
        />
      </footer>

      {/* MODALS - GMs view contests through GmContestResolutionPanel */}

      {/* NPC Attack Roll Overlay */}
      {npcAttackRoll && state?.entities[npcAttackRoll.attackerId] && state?.entities[npcAttackRoll.targetId] && (
        <RollOverlay
          isOpen={true}
          variant="contest"
          entity={state.entities[npcAttackRoll.attackerId]}
          contest={{
            contestId: `temp-${Date.now()}`, // Temporary ID for UI
            initiatorId: npcAttackRoll.attackerId,
            initiatorSkill: npcAttackRoll.skill,
            initiatorRoll: {
              skill: npcAttackRoll.skill,
              modifier: 0,
              diceCount: 0,
              keepHighest: true,
              rawDice: [],
              selectedDie: 0,
              total: 0,
              audit: '',
            },
            targetId: npcAttackRoll.targetId,
            autoRollDefense: false,
            status: "pending",
            createdAt: new Date().toISOString(),
          }}
          entities={state?.entities ? Object.values(state.entities) : []}
          contestMode="initiator"
          onSubmit={handleNpcAttackRollSubmit}
          onClose={() => setNpcAttackRoll(null)}
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
  const [isGm, setIsGm] = React.useState(false);
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

        // Check if user is GM for this campaign
        if (campaignId) {
          const campaigns = await gmApi.listCampaigns();
          const campaign = campaigns.find(c => c.id === campaignId);
          setIsGm(campaign?.gmUserId === data.user.id);
        }
      } catch (err) {
        setError('Failed to load user data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadAuth();
  }, [campaignId]);

  if (!campaignId) {
    return (
      <div className="war-gm-page__error-state">
        <h2>Error: No Campaign ID</h2>
        <p>Cannot load GM combat without a campaign ID.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="war-gm-page" data-theme="dark-fantasy">
        <div className="war-gm-page__loading">
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  if (error || !userId) {
    return (
      <div className="war-gm-page__error-state">
        <h2>Error: {error || 'Not authenticated'}</h2>
        <p>Please log in to access combat.</p>
      </div>
    );
  }

  return (
    <CombatProvider campaignId={campaignId} userId={userId} isGm={isGm}>
      <CombatPageInner campaignId={campaignId} userId={userId} />
    </CombatProvider>
  );
};

export default CombatPageNew;
