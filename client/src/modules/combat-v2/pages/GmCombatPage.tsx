/**
 * Combat V2 - GM Combat Page
 *
 * Game Master combat interface with full control over combat state.
 * Shows all entities, provides override controls, and manages combat flow.
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { CombatProvider, useCombat } from "../context/CombatProvider";
import { useCombatIdentity } from "../hooks/useCombatIdentity";
import { gmApi, type CampaignMember, type BestiaryEntry } from "../../../api/gm";
import { api, type Character } from "../../../api/client";
import { SquareGrid } from "../components/grid";
import { MapUploader, GridConfigurator } from "../components/map";
import { EntityCard, WoundTracker } from "../components/entities";
import { GmControls, EntityOverrides } from "../components/gm";
import { ChannelingTracker } from "../components/channeling";
import { SkillContestPanel } from "../components/SkillContestPanel";
import type { GridPosition, CombatV2Entity } from "../../../api/combatV2Socket";

// ═══════════════════════════════════════════════════════════════════════════
// ADD ENTITY MODAL
// ═══════════════════════════════════════════════════════════════════════════

type EntityType = "pc" | "npc" | "monster";
type InitiativeTiming = "immediate" | "end";

type AddEntityRequest = {
  entity: CombatV2Entity;
  initiativeRoll: number;
  initiativeTiebreaker: number;
  initiativeTiming: InitiativeTiming;
  placeAfterAdd: boolean;
};

// Build skills from character data (skillAllocations + skillBonuses)
function buildCharacterSkills(character: Character): Record<string, number> {
  const allocations = character.skillAllocations ?? {};
  const bonuses = character.skillBonuses ?? {};
  const skills: Record<string, number> = {};
  const keys = new Set([...Object.keys(allocations), ...Object.keys(bonuses)]);
  keys.forEach((key) => {
    skills[key] = (allocations[key] ?? 0) + (bonuses[key] ?? 0);
  });
  return skills;
}

// Get skills from bestiary entry (try multiple possible field names)
function getBestiarySkills(entry: BestiaryEntry): Record<string, number> {
  return (entry.skills as Record<string, number> | undefined) ??
    (entry.statsSkills as Record<string, number> | undefined) ??
    {};
}

interface AddEntityModalProps {
  onAdd: (payload: AddEntityRequest) => void;
  onCancel: () => void;
  members: CampaignMember[];
  characters: Character[];
  bestiaryEntries: BestiaryEntry[];
  isCombatActive: boolean;
}

function AddEntityModal({
  onAdd,
  onCancel,
  members,
  characters,
  bestiaryEntries,
  isCombatActive,
}: AddEntityModalProps) {
  const [entityType, setEntityType] = useState<EntityType>("npc");
  const [name, setName] = useState("New Entity");
  const [displayName, setDisplayName] = useState("");
  const [faction, setFaction] = useState<"ally" | "enemy" | "neutral">("enemy");
  const [tier, setTier] = useState<"minion" | "full" | "lieutenant" | "hero">("full");
  const [level, setLevel] = useState(1);
  const [controller, setController] = useState("gm");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [selectedBestiaryId, setSelectedBestiaryId] = useState("");
  const [search, setSearch] = useState("");
  const [initiativeRoll, setInitiativeRoll] = useState(10);
  const [initiativeTiming, setInitiativeTiming] = useState<InitiativeTiming>("end");
  const [placeAfterAdd, setPlaceAfterAdd] = useState(true);

  const memberByCharacterId = useMemo(() => {
    return new Map(
      members
        .filter((member) => member.characterId)
        .map((member) => [member.characterId as string, member.playerUserId])
    );
  }, [members]);

  const controllerOptions = useMemo(() => {
    const uniquePlayers = Array.from(new Set(members.map((member) => member.playerUserId)));
    return ["gm", ...uniquePlayers.map((id) => `player:${id}`)];
  }, [members]);

  const selectedCharacter = useMemo(() => {
    return characters.find((entry) => entry.id === selectedCharacterId);
  }, [characters, selectedCharacterId]);

  const selectedBestiary = useMemo(() => {
    return bestiaryEntries.find((entry) => entry.id === selectedBestiaryId);
  }, [bestiaryEntries, selectedBestiaryId]);

  const filteredBestiary = useMemo(() => {
    if (!search.trim()) return bestiaryEntries;
    const term = search.toLowerCase();
    return bestiaryEntries.filter((entry) => entry.name.toLowerCase().includes(term));
  }, [bestiaryEntries, search]);

  useEffect(() => {
    if (entityType === "pc" && selectedCharacter) {
      setName(selectedCharacter.name);
      setDisplayName(selectedCharacter.name);
      setLevel(selectedCharacter.level ?? 1);
      setFaction("ally");
      setTier("hero");
      const ownerId = memberByCharacterId.get(selectedCharacter.id);
      if (ownerId) {
        setController(`player:${ownerId}`);
      }
    }
  }, [entityType, selectedCharacter, memberByCharacterId]);

  useEffect(() => {
    if (entityType === "monster" && selectedBestiary) {
      setName(selectedBestiary.name);
      setDisplayName(selectedBestiary.name);
      setFaction("enemy");
    }
  }, [entityType, selectedBestiary]);

  const handleTypeChange = useCallback((nextType: EntityType) => {
    setEntityType(nextType);
    if (nextType === "npc") {
      setFaction("enemy");
      setTier("full");
      setController("gm");
      setName("New Entity");
      setDisplayName("");
    }
    if (nextType === "monster") {
      setFaction("enemy");
      setTier("full");
      setController("gm");
    }
    if (nextType === "pc") {
      setFaction("ally");
      setTier("hero");
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const cleanedName = name.trim() || "Unknown Entity";
    const cleanedDisplay = displayName.trim() || cleanedName;
    const apMax = tier === "minion" ? 3 : 6;
    const energyMax = tier === "minion" ? 30 : 100;
    const entityId = crypto.randomUUID();

    // Build skills from character or bestiary entry
    let skills: Record<string, number> = {};
    if (entityType === "pc" && selectedCharacter) {
      skills = buildCharacterSkills(selectedCharacter);
    } else if (entityType === "monster" && selectedBestiary) {
      skills = getBestiarySkills(selectedBestiary);
    }

    const entity: CombatV2Entity = {
      id: entityId,
      name: cleanedName,
      displayName: cleanedDisplay,
      faction,
      tier,
      level,
      controller: controller as CombatV2Entity["controller"],
      entityType,
      characterId: entityType === "pc" ? selectedCharacter?.id : undefined,
      bestiaryEntryId: entityType === "monster" ? selectedBestiary?.id : undefined,
      ap: { current: apMax, max: apMax },
      energy: { current: energyMax, max: energyMax },
      skills,
    };

    onAdd({
      entity,
      initiativeRoll,
      initiativeTiebreaker: Math.random(),
      initiativeTiming,
      placeAfterAdd,
    });
  }, [
    name,
    displayName,
    faction,
    tier,
    level,
    controller,
    entityType,
    selectedCharacter,
    selectedBestiary,
    initiativeRoll,
    initiativeTiming,
    placeAfterAdd,
    onAdd,
  ]);

  const canSubmit = useMemo(() => {
    if (entityType === "pc") return !!selectedCharacterId;
    if (entityType === "monster") return !!selectedBestiaryId;
    return name.trim().length > 0;
  }, [entityType, selectedCharacterId, selectedBestiaryId, name]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-amber-400">Summoning Bay</h2>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>

        <div className="flex gap-2">
          {(["pc", "npc", "monster"] as EntityType[]).map((type) => (
            <button
              key={type}
              onClick={() => handleTypeChange(type)}
              className={`px-3 py-2 rounded text-sm uppercase tracking-wide transition-colors ${
                entityType === type
                  ? "bg-amber-600 text-amber-100"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {type === "pc" ? "Player" : type}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            {entityType === "pc" && (
              <div className="space-y-1">
                <label className="text-sm text-slate-400">Player Character</label>
                <select
                  value={selectedCharacterId}
                  onChange={(e) => setSelectedCharacterId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-200"
                >
                  <option value="">Select a character</option>
                  {characters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {entityType === "monster" && (
              <div className="space-y-2">
                <label className="text-sm text-slate-400">Monster</label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search bestiary..."
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-200"
                />
                <select
                  value={selectedBestiaryId}
                  onChange={(e) => setSelectedBestiaryId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-200"
                >
                  <option value="">Select a monster</option>
                  {filteredBestiary.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {entityType === "npc" && (
              <div className="space-y-1">
                <label className="text-sm text-slate-400">NPC Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-200"
                  placeholder="Entity name..."
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm text-slate-400">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-200"
                placeholder="Name shown to players..."
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-slate-400">Faction</label>
                <select
                  value={faction}
                  onChange={(e) => setFaction(e.target.value as "ally" | "enemy" | "neutral")}
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-200"
                >
                  <option value="ally">Ally</option>
                  <option value="enemy">Enemy</option>
                  <option value="neutral">Neutral</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-400">Tier</label>
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value as "minion" | "full" | "lieutenant" | "hero")}
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-200"
                >
                  <option value="minion">Minion</option>
                  <option value="full">Full</option>
                  <option value="lieutenant">Lieutenant</option>
                  <option value="hero">Hero</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm text-slate-400">Level</label>
              <input
                type="number"
                value={level}
                onChange={(e) => setLevel(parseInt(e.target.value) || 1)}
                min={1}
                max={30}
                className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-200"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-slate-400">Controller</label>
              <select
                value={controller}
                onChange={(e) => setController(e.target.value)}
                className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-200"
              >
                {controllerOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "gm" ? "GM" : option.replace("player:", "Player ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-400">Initiative Roll</label>
              <button
                onClick={() => setInitiativeRoll(Math.floor(Math.random() * 20) + 1)}
                className="text-xs text-amber-300 hover:text-amber-200"
              >
                Auto Roll
              </button>
            </div>
            <input
              type="number"
              value={initiativeRoll}
              onChange={(e) => setInitiativeRoll(parseInt(e.target.value) || 1)}
              min={1}
              max={30}
              className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-200"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-400">Initiative Timing</label>
            <div className="flex gap-2">
              {(["immediate", "end"] as InitiativeTiming[]).map((timing) => (
                <button
                  key={timing}
                  onClick={() => setInitiativeTiming(timing)}
                  className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${
                    initiativeTiming === timing
                      ? "bg-amber-600 text-amber-100"
                      : "bg-slate-900 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {timing === "immediate" ? "Next Up" : "End of Order"}
                </button>
              ))}
            </div>
            {!isCombatActive && (
              <p className="text-xs text-slate-500">
                Timing applies once combat is active.
              </p>
            )}
          </div>
        </div>

        <label className="flex items-center gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={placeAfterAdd}
            onChange={(e) => setPlaceAfterAdd(e.target.checked)}
            className="accent-amber-500"
          />
          Enter placement mode after adding
        </label>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2 rounded bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-green-100 font-medium transition-colors"
          >
            Spawn Entity
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INNER COMPONENT (uses combat context)
// ═══════════════════════════════════════════════════════════════════════════

function GmCombatContent({ campaignId }: { campaignId: string }) {
  const { state, actions, getInitiativeOrder } = useCombat();
  const [hoveredCell, setHoveredCell] = useState<GridPosition | null>(null);
  const [showAddEntity, setShowAddEntity] = useState(false);
  const [overrideEntityId, setOverrideEntityId] = useState<string | null>(null);
  const [placementEntityId, setPlacementEntityId] = useState<string | null>(null);
  const [placementForce, setPlacementForce] = useState(false);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [bestiaryEntries, setBestiaryEntries] = useState<BestiaryEntry[]>([]);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [showMapControls, setShowMapControls] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const {
    connectionStatus,
    phase,
    round,
    entities,
    initiative,
    selectedEntityId,
    currentEntityId,
    gridPositions,
    gridConfig,
    mapConfig,
  } = state;

  useEffect(() => {
    let isActive = true;
    const loadRoster = async () => {
      try {
        const [membersData, characterData, bestiaryData] = await Promise.all([
          gmApi.listCampaignMembers(campaignId),
          api.listCampaignCharacters(campaignId),
          gmApi.listBestiaryEntries(campaignId),
        ]);
        if (!isActive) return;
        setMembers(membersData);
        setCharacters(characterData);
        setBestiaryEntries(bestiaryData);
        setRosterError(null);
      } catch (err) {
        if (!isActive) return;
        setRosterError(err instanceof Error ? err.message : "Failed to load roster data");
      }
    };

    loadRoster();
    return () => {
      isActive = false;
    };
  }, [campaignId]);

  // Get all entities sorted by faction
  const allEntities = useMemo(() => {
    const all = Object.values(entities);
    return {
      allies: all.filter((e) => e.faction === "ally"),
      enemies: all.filter((e) => e.faction === "enemy"),
      neutrals: all.filter((e) => e.faction === "neutral"),
    };
  }, [entities]);

  // Get initiative order
  const initiativeOrder = getInitiativeOrder();

  // Get selected entity
  const selectedEntity = selectedEntityId ? entities[selectedEntityId] : null;
  const placementEntity = placementEntityId ? entities[placementEntityId] : null;
  const isCombatActive = phase === "active" || phase === "active-turn";

  const unplacedEntities = useMemo(() => {
    return Object.values(entities).filter((entity) => !gridPositions[entity.id]);
  }, [entities, gridPositions]);

  const handleEntityDrop = useCallback((entityId: string, position: GridPosition) => {
    const current = gridPositions[entityId];
    if (current && current.row === position.row && current.col === position.col) {
      return;
    }

    const isPlacementMove = placementEntityId === entityId;
    actions.gmMoveEntity(entityId, position.row, position.col, {
      force: isPlacementMove ? placementForce : false,
      ignoreApCost: true,
    });
    if (isPlacementMove) {
      setPlacementEntityId(null);
    }
  }, [actions, gridPositions, placementEntityId, placementForce]);

  // Handle cell click
  const handleCellClick = useCallback((position: GridPosition) => {
    if (placementEntityId) {
      actions.gmMoveEntity(placementEntityId, position.row, position.col, {
        force: placementForce,
        ignoreApCost: true,
      });
      setPlacementEntityId(null);
      return;
    }
  }, [actions, placementEntityId, placementForce]);

  // Handle entity selection
  const handleEntityClick = useCallback((entityId: string) => {
    actions.selectEntity(entityId === selectedEntityId ? null : entityId);
  }, [actions, selectedEntityId]);

  // Handle add entity
  const handleAddEntity = useCallback((payload: AddEntityRequest) => {
    actions.gmAddEntity({
      entity: payload.entity,
      initiativeRoll: payload.initiativeRoll,
      initiativeTiebreaker: payload.initiativeTiebreaker,
      initiativeTiming: payload.initiativeTiming,
      combatId: campaignId,
      campaignId,
    });
    if (payload.placeAfterAdd) {
      setPlacementEntityId(payload.entity.id);
      setPlacementForce(false);
    }
    setShowAddEntity(false);
  }, [actions, campaignId]);

  // Handle map upload
  const handleMapUpload = useCallback((imageUrl: string, dimensions: { width: number; height: number }) => {
    actions.gmUpdateMapConfig({
      imageUrl,
      imageWidth: dimensions.width,
      imageHeight: dimensions.height,
    });
    setMapError(null);
  }, [actions]);

  // Handle map error
  const handleMapError = useCallback((error: string) => {
    setMapError(error);
  }, []);

  // Handle grid config change
  const handleGridConfigChange = useCallback((newConfig: typeof gridConfig) => {
    actions.gmUpdateGridConfig(newConfig);
  }, [actions]);

  // Render connection status
  if (connectionStatus === "connecting") {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-300">Connecting to combat...</p>
        </div>
      </div>
    );
  }

  if (connectionStatus === "disconnected") {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-2">Disconnected from combat</p>
          <p className="text-slate-400">Attempting to reconnect...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="bg-amber-900/30 border-b border-amber-700/50 px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-amber-400">GM Combat Control</h1>
            {phase && (
              <span className="px-2 py-1 text-sm rounded bg-amber-800/50 text-amber-200 capitalize">
                {phase}
              </span>
            )}
            {round > 0 && (
              <span className="text-amber-300">Round {round}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">
              {Object.keys(entities).length} entities
            </span>
            {connectionStatus === "reconnecting" && (
              <span className="px-2 py-1 text-xs rounded bg-amber-700 text-amber-100">
                Reconnecting...
              </span>
            )}
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === "connected" ? "bg-green-500" : "bg-red-500"
              }`}
            />
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-7xl mx-auto p-4">
        {rosterError && (
          <div className="mb-4 rounded border border-red-700/60 bg-red-900/30 px-4 py-2 text-sm text-red-200">
            Failed to load campaign roster data: {rosterError}
          </div>
        )}
        <div className="grid grid-cols-12 gap-4">
          {/* Left sidebar - GM Controls & Initiative */}
          <div className="col-span-3 space-y-4">
            {/* GM Controls */}
            <GmControls onAddEntity={() => setShowAddEntity(true)} />

            {/* Initiative Order */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <h2 className="text-sm font-semibold text-slate-400 mb-2">
                Initiative Order
              </h2>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {initiativeOrder.map((entity, index) => (
                  <div
                    key={entity.id}
                    onClick={() => handleEntityClick(entity.id)}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-sm cursor-pointer transition-colors ${
                      entity.id === currentEntityId
                        ? "bg-green-900/50 text-green-200"
                        : entity.id === selectedEntityId
                        ? "bg-blue-900/50 text-blue-200"
                        : "hover:bg-slate-700 text-slate-400"
                    }`}
                  >
                    <span className="w-5 text-center font-mono">{index + 1}</span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        entity.faction === "ally"
                          ? "bg-green-500"
                          : entity.faction === "enemy"
                          ? "bg-red-500"
                          : "bg-yellow-500"
                      }`}
                    />
                    <span className="flex-1 truncate">
                      {entity.displayName || entity.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {entity.initiativeRoll ?? "—"}
                    </span>
                  </div>
                ))}
                {initiativeOrder.length === 0 && (
                  <p className="text-sm text-slate-500 italic">No initiative set</p>
                )}
              </div>
            </div>

            {/* Combat Info */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <h2 className="text-sm font-semibold text-slate-400 mb-2">
                Combat Info
              </h2>
              <div className="space-y-1 text-xs text-slate-500">
                <p>Initiative entries: {initiative.length}</p>
                <p>Current turn: {currentEntityId ? entities[currentEntityId]?.name ?? "Unknown" : "None"}</p>
              </div>
            </div>

            {/* Skill Contests */}
            <SkillContestPanel isGM={true} />
          </div>

          {/* Center - Square Grid */}
          <div className="col-span-6">
            {placementEntity && (
              <div className="mb-3 rounded border border-amber-600/40 bg-amber-900/30 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-amber-200">Placement Mode</div>
                    <div className="text-lg font-semibold text-amber-100">
                      Placing {placementEntity.displayName || placementEntity.name}
                    </div>
                  </div>
                  <button
                    onClick={() => setPlacementEntityId(null)}
                    className="text-xs text-amber-200 hover:text-amber-100"
                  >
                    Cancel
                  </button>
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm text-amber-100">
                  <input
                    type="checkbox"
                    checked={placementForce}
                    onChange={(e) => setPlacementForce(e.target.checked)}
                    className="accent-amber-400"
                  />
                  Force placement (ignore occupancy/AP)
                </label>
              </div>
            )}
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              <SquareGrid
                gridConfig={gridConfig}
                mapConfig={mapConfig}
                onCellClick={handleCellClick}
                onCellHover={setHoveredCell}
                onEntityClick={handleEntityClick}
                onEntityDrop={handleEntityDrop}
              />
            </div>

            {/* Cell info */}
            {hoveredCell && (
              <div className="mt-2 text-sm text-slate-400">
                Cell: (row {hoveredCell.row}, col {hoveredCell.col})
              </div>
            )}

            {unplacedEntities.length > 0 && (
              <div className="mt-3 rounded border border-slate-700 bg-slate-800/70 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  Unplaced Entities
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {unplacedEntities.map((entity) => (
                    <button
                      key={entity.id}
                      onClick={() => {
                        setPlacementEntityId(entity.id);
                        setPlacementForce(false);
                      }}
                      className="rounded border border-slate-600 bg-slate-900/70 px-3 py-1 text-xs text-slate-200 hover:border-amber-500 hover:text-amber-200"
                    >
                      {entity.displayName || entity.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Entity Lists */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              {/* Allies */}
              <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-2">
                <h3 className="text-sm font-semibold text-green-400 mb-2">
                  Allies ({allEntities.allies.length})
                </h3>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {allEntities.allies.map((e) => (
                    <div
                      key={e.id}
                      onClick={() => handleEntityClick(e.id)}
                      className={`text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                        e.id === selectedEntityId
                          ? "bg-green-800/50 text-green-200"
                          : "hover:bg-green-900/50 text-green-300"
                      }`}
                    >
                      {e.displayName || e.name}
                      <span className="text-green-500/60 ml-1">
                        {e.energy?.current ?? 0}/{e.energy?.max ?? 100}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Enemies */}
              <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-2">
                <h3 className="text-sm font-semibold text-red-400 mb-2">
                  Enemies ({allEntities.enemies.length})
                </h3>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {allEntities.enemies.map((e) => (
                    <div
                      key={e.id}
                      onClick={() => handleEntityClick(e.id)}
                      className={`text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                        e.id === selectedEntityId
                          ? "bg-red-800/50 text-red-200"
                          : "hover:bg-red-900/50 text-red-300"
                      }`}
                    >
                      {e.displayName || e.name}
                      <span className="text-red-500/60 ml-1">
                        {e.energy?.current ?? 0}/{e.energy?.max ?? 100}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Neutrals */}
              <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-2">
                <h3 className="text-sm font-semibold text-yellow-400 mb-2">
                  Neutral ({allEntities.neutrals.length})
                </h3>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {allEntities.neutrals.map((e) => (
                    <div
                      key={e.id}
                      onClick={() => handleEntityClick(e.id)}
                      className={`text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                        e.id === selectedEntityId
                          ? "bg-yellow-800/50 text-yellow-200"
                          : "hover:bg-yellow-900/50 text-yellow-300"
                      }`}
                    >
                      {e.displayName || e.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right sidebar - Selected Entity */}
          <div className="col-span-3 space-y-4">
            {/* Selected Entity Details */}
            {selectedEntity ? (
              <>
                <EntityCard
                  entity={selectedEntity}
                  isSelected={true}
                  isCurrentTurn={selectedEntity.id === currentEntityId}
                  isControlled={true}
                  showDetails={true}
                />

                {/* Wound Details */}
                {selectedEntity.tier !== "minion" && selectedEntity.wounds && (
                  <WoundTracker wounds={selectedEntity.wounds} showPenalties={true} />
                )}

                {/* Channeling */}
                {selectedEntity.channeling && (
                  <ChannelingTracker entityId={selectedEntity.id} />
                )}

                {/* GM Override Button */}
                <button
                  onClick={() => setOverrideEntityId(selectedEntity.id)}
                  className="w-full px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-amber-100 font-medium transition-colors"
                >
                  GM Overrides
                </button>
              </>
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
                <p className="text-slate-500">Select an entity to view details</p>
              </div>
            )}

            {/* Quick Stats */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <h3 className="text-sm font-semibold text-slate-400 mb-2">
                Combat Summary
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 bg-slate-700/30 rounded">
                  <div className="text-xs text-slate-500">Total Entities</div>
                  <div className="text-lg font-bold text-slate-200">
                    {Object.keys(entities).length}
                  </div>
                </div>
                <div className="p-2 bg-slate-700/30 rounded">
                  <div className="text-xs text-slate-500">Alive</div>
                  <div className="text-lg font-bold text-green-400">
                    {Object.values(entities).filter((e) => e.alive !== false).length}
                  </div>
                </div>
                <div className="p-2 bg-slate-700/30 rounded">
                  <div className="text-xs text-slate-500">Unconscious</div>
                  <div className="text-lg font-bold text-amber-400">
                    {Object.values(entities).filter((e) => e.unconscious).length}
                  </div>
                </div>
                <div className="p-2 bg-slate-700/30 rounded">
                  <div className="text-xs text-slate-500">Dead</div>
                  <div className="text-lg font-bold text-red-400">
                    {Object.values(entities).filter((e) => e.alive === false).length}
                  </div>
                </div>
              </div>
            </div>

            {/* Map Management */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowMapControls(!showMapControls)}
                className="w-full px-3 py-2 flex items-center justify-between text-sm font-semibold text-slate-400 hover:bg-slate-700/50 transition-colors"
              >
                <span>Map Management</span>
                <span className="text-xs">{showMapControls ? "▼" : "▶"}</span>
              </button>

              {showMapControls && (
                <div className="p-3 space-y-4 border-t border-slate-700">
                  {mapError && (
                    <div className="text-xs text-red-400 bg-red-900/20 border border-red-700/50 rounded p-2">
                      {mapError}
                    </div>
                  )}

                  {/* Map Upload */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 mb-2">Battle Map</h4>
                    <MapUploader
                      combatId={campaignId}
                      onUploadComplete={handleMapUpload}
                      onError={handleMapError}
                      currentImageUrl={mapConfig?.imageUrl}
                    />
                  </div>

                  {/* Grid Configuration */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 mb-2">Grid Setup</h4>
                    <GridConfigurator
                      config={gridConfig}
                      onChange={handleGridConfigChange}
                      imageSize={
                        mapConfig?.imageWidth && mapConfig?.imageHeight
                          ? { width: mapConfig.imageWidth, height: mapConfig.imageHeight }
                          : undefined
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Entity Modal */}
      {showAddEntity && (
        <AddEntityModal
          onAdd={handleAddEntity}
          onCancel={() => setShowAddEntity(false)}
          members={members}
          characters={characters}
          bestiaryEntries={bestiaryEntries}
          isCombatActive={isCombatActive}
        />
      )}

      {/* Entity Override Modal */}
      {overrideEntityId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="w-full max-w-md">
            <EntityOverrides
              entityId={overrideEntityId}
              onClose={() => setOverrideEntityId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

export function GmCombatPage() {
  const { campaignId } = useParams<{ campaignId: string }>();

  const { playerId, loading, error } = useCombatIdentity(campaignId, true);

  if (!campaignId) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <p className="text-red-400">No campaign ID provided</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-300">Loading GM console...</p>
        </div>
      </div>
    );
  }

  if (error || !playerId) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <p className="text-red-400">{error ?? "Not authenticated"}</p>
      </div>
    );
  }

  return (
    <CombatProvider
      combatId={campaignId}
      playerId={playerId}
      isGM={true}
    >
      <GmCombatContent campaignId={campaignId} />
    </CombatProvider>
  );
}

export default GmCombatPage;
