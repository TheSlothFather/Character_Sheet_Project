/**
 * Combat V2 - Player Combat Page
 *
 * Main combat interface for players.
 * Shows hex grid, their entities, and action controls.
 */

import React, { useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { CombatProvider, useCombat } from "../context/CombatProvider";
import { useCombatIdentity } from "../hooks/useCombatIdentity";
import { HexGrid } from "../components/grid";
import { EntityCard } from "../components/entities";
import { ActionBar, type ActionMode } from "../components/actions";
import { ChannelingTracker } from "../components/channeling";
import { SkillContestPanel } from "../components/SkillContestPanel";
import type { HexPosition } from "../../../api/combatV2Socket";

// ═══════════════════════════════════════════════════════════════════════════
// INNER COMPONENT (uses combat context)
// ═══════════════════════════════════════════════════════════════════════════

function PlayerCombatContent() {
  const { state, actions, isMyTurn, canControlEntity, getInitiativeOrder } = useCombat();
  const [actionMode, setActionMode] = useState<ActionMode>("none");
  const [hoveredHex, setHoveredHex] = useState<HexPosition | null>(null);

  const {
    connectionStatus,
    phase,
    round,
    entities,
    initiative,
    selectedEntityId,
    currentEntityId,
    pendingEndureRoll,
    pendingDeathCheck,
  } = state;

  // Get controlled entities
  const myEntities = useMemo(() => {
    return Object.values(entities).filter((e) => canControlEntity(e.id));
  }, [entities, canControlEntity]);

  // Get initiative order with entity data
  const initiativeOrder = getInitiativeOrder();

  // Get selected entity
  const selectedEntity = selectedEntityId ? entities[selectedEntityId] : null;

  // Handle hex click
  const handleHexClick = useCallback((position: HexPosition) => {
    if (
      actionMode === "move" &&
      selectedEntityId &&
      selectedEntityId === currentEntityId &&
      canControlEntity(selectedEntityId) &&
      isMyTurn
    ) {
      actions.declareMovement(selectedEntityId, position.q, position.r);
      setActionMode("none");
    }
  }, [actionMode, selectedEntityId, currentEntityId, canControlEntity, isMyTurn, actions]);

  // Handle entity selection
  const handleEntityClick = useCallback((entityId: string) => {
    actions.selectEntity(entityId === selectedEntityId ? null : entityId);
  }, [actions, selectedEntityId]);

  // Handle target selection
  const handleTargetClick = useCallback((entityId: string) => {
    actions.setTarget(entityId);
  }, [actions]);

  const handleEntityDrop = useCallback((entityId: string, position: HexPosition) => {
    const current = state.hexPositions[entityId];
    if (current && current.q === position.q && current.r === position.r) {
      return;
    }

    if (!canControlEntity(entityId) || !isMyTurn) {
      return;
    }

    if (entityId !== currentEntityId) {
      return;
    }

    actions.declareMovement(entityId, position.q, position.r);
    setActionMode("none");
  }, [actions, canControlEntity, currentEntityId, isMyTurn, state.hexPositions]);

  // Render connection status
  if (connectionStatus === "connecting") {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
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
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">Combat</h1>
            {phase && (
              <span className="px-2 py-1 text-sm rounded bg-slate-700 capitalize">
                {phase}
              </span>
            )}
            {round > 0 && (
              <span className="text-slate-400">Round {round}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
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
        <div className="grid grid-cols-12 gap-4">
          {/* Left sidebar - Initiative & My Entities */}
          <div className="col-span-3 space-y-4">
            {/* Initiative Order */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <h2 className="text-sm font-semibold text-slate-400 mb-2">
                Initiative Order
              </h2>
              <div className="space-y-1">
                {initiativeOrder.map((entity, index) => (
                  <div
                    key={entity.id}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-sm ${
                      entity.id === currentEntityId
                        ? "bg-green-900/50 text-green-200"
                        : canControlEntity(entity.id)
                        ? "bg-blue-900/30 text-blue-200"
                        : "text-slate-400"
                    }`}
                  >
                    <span className="w-5 text-center font-mono">{index + 1}</span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        entity.faction === "ally" ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <span className="flex-1 truncate">
                      {entity.displayName || entity.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {entity.initiativeRoll}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* My Entities */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <h2 className="text-sm font-semibold text-slate-400 mb-2">
                My Entities
              </h2>
              <div className="space-y-2">
                {myEntities.map((entity) => (
                  <EntityCard
                    key={entity.id}
                    entity={entity}
                    isSelected={entity.id === selectedEntityId}
                    isCurrentTurn={entity.id === currentEntityId}
                    isControlled={true}
                    onClick={() => handleEntityClick(entity.id)}
                  />
                ))}
                {myEntities.length === 0 && (
                  <p className="text-sm text-slate-500 italic">
                    No entities under your control
                  </p>
                )}
              </div>
            </div>

            {/* Skill Contests */}
            <SkillContestPanel isGM={false} />
          </div>

          {/* Center - Hex Grid */}
          <div className="col-span-6">
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              <HexGrid
                width={15}
                height={10}
                onHexClick={handleHexClick}
                onHexHover={setHoveredHex}
                onEntityClick={handleEntityClick}
                onEntityDrop={handleEntityDrop}
                className="h-[500px]"
              />
            </div>

            {/* Hex info */}
            {hoveredHex && (
              <div className="mt-2 text-sm text-slate-400">
                Hex: ({hoveredHex.q}, {hoveredHex.r})
              </div>
            )}
          </div>

          {/* Right sidebar - Selected Entity & Actions */}
          <div className="col-span-3 space-y-4">
            {/* Selected Entity Details */}
            {selectedEntity && (
              <EntityCard
                entity={selectedEntity}
                isSelected={true}
                isCurrentTurn={selectedEntity.id === currentEntityId}
                isControlled={canControlEntity(selectedEntity.id)}
                showDetails={true}
              />
            )}

            {/* Channeling Tracker */}
            {selectedEntity?.channeling && canControlEntity(selectedEntity.id) && (
              <ChannelingTracker entityId={selectedEntity.id} />
            )}

            {/* Action Bar */}
            {isMyTurn && (
              <ActionBar onModeChange={setActionMode} />
            )}

            {/* Not your turn message */}
            {!isMyTurn && phase === "active" && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
                <p className="text-slate-400">Waiting for your turn...</p>
                {currentEntityId && entities[currentEntityId] && (
                  <p className="text-sm text-slate-500 mt-1">
                    Current turn: {entities[currentEntityId].displayName || entities[currentEntityId].name}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Endure Roll Modal */}
      {pendingEndureRoll && canControlEntity(pendingEndureRoll.entityId) && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-amber-600 rounded-lg p-6 max-w-md">
            <h2 className="text-xl font-bold text-amber-400 mb-4">
              Endure Roll Required!
            </h2>
            <p className="text-slate-300 mb-4">
              {entities[pendingEndureRoll.entityId]?.displayName || "Entity"} took{" "}
              {pendingEndureRoll.damage} damage and is at 0 Energy!
            </p>
            <p className="text-slate-400 mb-6">
              Make an Endure roll to stay conscious.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => actions.submitEndureRoll(pendingEndureRoll.entityId, 15, true)}
                className="flex-1 px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-green-100"
              >
                Success (Endure)
              </button>
              <button
                onClick={() => actions.submitEndureRoll(pendingEndureRoll.entityId, 5, false)}
                className="flex-1 px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-red-100"
              >
                Failure (Unconscious)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Death Check Modal */}
      {pendingDeathCheck && canControlEntity(pendingDeathCheck.entityId) && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-red-600 rounded-lg p-6 max-w-md">
            <h2 className="text-xl font-bold text-red-400 mb-4">
              💀 Feat of Defiance!
            </h2>
            <p className="text-slate-300 mb-4">
              {entities[pendingDeathCheck.entityId]?.displayName || "Entity"} took damage
              while unconscious!
            </p>
            <p className="text-slate-400 mb-6">
              Make a Feat of Defiance roll to survive!
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => actions.submitDeathCheck(pendingDeathCheck.entityId, 18, true)}
                className="flex-1 px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-green-100"
              >
                Defy Death!
              </button>
              <button
                onClick={() => actions.submitDeathCheck(pendingDeathCheck.entityId, 3, false)}
                className="flex-1 px-4 py-2 rounded bg-slate-600 hover:bg-slate-500 text-slate-100"
              >
                Accept Fate...
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

export function PlayerCombatPage() {
  const { campaignId } = useParams<{ campaignId: string }>();

  const { playerId, controlledCharacterIds, loading, error } = useCombatIdentity(campaignId, false);

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
          <p className="text-slate-300">Loading combat profile...</p>
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
      isGM={false}
      controlledCharacterIds={controlledCharacterIds}
    >
      <PlayerCombatContent />
    </CombatProvider>
  );
}

export default PlayerCombatPage;
