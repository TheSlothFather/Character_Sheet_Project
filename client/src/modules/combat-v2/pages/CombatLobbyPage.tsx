/**
 * Combat V2 - Combat Lobby Page
 *
 * Pre-combat waiting room where players join and roll initiative.
 * GM can manage participants and start combat when ready.
 */

import React, { useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { CombatProvider, useCombat } from "../context/CombatProvider";

// ═══════════════════════════════════════════════════════════════════════════
// INNER COMPONENT (uses combat context)
// ═══════════════════════════════════════════════════════════════════════════

function CombatLobbyContent() {
  const navigate = useNavigate();
  const { state, actions, isGM, canControlEntity } = useCombat();
  const [initiativeRoll, setInitiativeRoll] = useState<number>(10);
  const [selectedEntityForInit, setSelectedEntityForInit] = useState<string | null>(null);

  const {
    connectionStatus,
    phase,
    entities,
    initiative,
    combatId,
  } = state;

  // Get initiative entity IDs for checking
  const initiativeEntityIds = useMemo(() => {
    return initiative.map((entry) => entry.entityId);
  }, [initiative]);

  // Get entities by status
  const entitiesByStatus = useMemo(() => {
    const all = Object.values(entities);
    return {
      withInitiative: all.filter((e) => initiativeEntityIds.includes(e.id)),
      withoutInitiative: all.filter((e) => !initiativeEntityIds.includes(e.id)),
      controlled: all.filter((e) => canControlEntity(e.id)),
    };
  }, [entities, initiativeEntityIds, canControlEntity]);

  // Check if all entities have initiative
  const allHaveInitiative = useMemo(() => {
    return Object.keys(entities).length > 0 &&
      Object.keys(entities).every((id) => initiativeEntityIds.includes(id));
  }, [entities, initiativeEntityIds]);

  // Submit initiative roll
  const handleSubmitInitiative = useCallback(() => {
    if (!selectedEntityForInit) return;
    actions.submitInitiativeRoll(selectedEntityForInit, initiativeRoll, Math.random());
    setSelectedEntityForInit(null);
    setInitiativeRoll(10);
  }, [actions, selectedEntityForInit, initiativeRoll]);

  // GM starts combat
  const handleStartCombat = useCallback(() => {
    actions.startCombat();
  }, [actions]);

  // Roll random initiative
  const handleRollInitiative = useCallback(() => {
    const roll = Math.floor(Math.random() * 20) + 1;
    setInitiativeRoll(roll);
  }, []);

  // Render connection status
  if (connectionStatus === "connecting") {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-300">Joining combat lobby...</p>
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

  // Combat already started - redirect
  if (phase === "active") {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center space-y-4">
          <p className="text-amber-400 text-lg">Combat has started!</p>
          <button
            onClick={() => navigate(isGM ? `/gm/campaigns/${combatId}/combat` : `/player/campaigns/${combatId}/combat`)}
            className="px-6 py-3 rounded bg-blue-600 hover:bg-blue-500 text-blue-100 font-medium transition-colors"
          >
            Join Combat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">Combat Lobby</h1>
            <span className="px-2 py-1 text-sm rounded bg-slate-700 text-slate-300">
              Waiting for players...
            </span>
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
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Initiative Status */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">
            Initiative Rolls
          </h2>

          {/* Progress */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span>Progress</span>
              <span>
                {initiative.length} / {Object.keys(entities).length} rolled
              </span>
            </div>
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  allHaveInitiative ? "bg-green-500" : "bg-blue-500"
                }`}
                style={{
                  width: `${Object.keys(entities).length > 0
                    ? (initiative.length / Object.keys(entities).length) * 100
                    : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Initiative Order Preview */}
          <div className="space-y-2">
            {initiative.map((entry, index) => {
              const entity = entities[entry.entityId];
              if (!entity) return null;
              return (
                <div
                  key={entry.entityId}
                  className="flex items-center justify-between px-4 py-2 bg-slate-700/50 rounded"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-sm font-mono">
                      {index + 1}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        entity.faction === "ally"
                          ? "bg-green-500"
                          : entity.faction === "enemy"
                          ? "bg-red-500"
                          : "bg-yellow-500"
                      }`}
                    />
                    <span className="text-slate-200">
                      {entity.displayName || entity.name}
                    </span>
                  </div>
                  <span className="text-lg font-mono text-blue-400">{entry.roll}</span>
                </div>
              );
            })}

            {/* Entities without initiative */}
            {entitiesByStatus.withoutInitiative.map((entity) => (
              <div
                key={entity.id}
                className="flex items-center justify-between px-4 py-2 bg-slate-700/30 rounded border border-dashed border-slate-600"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-sm text-slate-500">
                    —
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full opacity-50 ${
                      entity.faction === "ally"
                        ? "bg-green-500"
                        : entity.faction === "enemy"
                        ? "bg-red-500"
                        : "bg-yellow-500"
                    }`}
                  />
                  <span className="text-slate-400">
                    {entity.displayName || entity.name}
                  </span>
                </div>
                <span className="text-sm text-slate-500 italic">Waiting...</span>
              </div>
            ))}
          </div>
        </div>

        {/* Roll Initiative (for controlled entities) */}
        {entitiesByStatus.controlled.some(
          (e) => !initiativeEntityIds.includes(e.id)
        ) && (
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-blue-200 mb-4">
              Roll Initiative for Your Entities
            </h2>

            {/* Entity selector */}
            <div className="space-y-2 mb-4">
              {entitiesByStatus.controlled
                .filter((e) => !initiativeEntityIds.includes(e.id))
                .map((entity) => (
                  <button
                    key={entity.id}
                    onClick={() => setSelectedEntityForInit(entity.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded transition-colors ${
                      selectedEntityForInit === entity.id
                        ? "bg-blue-700 text-blue-100"
                        : "bg-slate-700 hover:bg-slate-600 text-slate-200"
                    }`}
                  >
                    <span>{entity.displayName || entity.name}</span>
                    <span className="text-sm text-slate-400 capitalize">
                      {entity.tier}
                    </span>
                  </button>
                ))}
            </div>

            {/* Roll input */}
            {selectedEntityForInit && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-400">Roll:</label>
                  <input
                    type="number"
                    value={initiativeRoll}
                    onChange={(e) => setInitiativeRoll(parseInt(e.target.value) || 0)}
                    min={1}
                    max={100}
                    className="w-20 px-3 py-2 rounded bg-slate-700 border border-slate-600 text-slate-200 text-center"
                  />
                </div>
                <button
                  onClick={handleRollInitiative}
                  className="px-4 py-2 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 transition-colors"
                >
                  Roll d20
                </button>
                <button
                  onClick={handleSubmitInitiative}
                  className="flex-1 px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-blue-100 font-medium transition-colors"
                >
                  Submit Initiative
                </button>
              </div>
            )}
          </div>
        )}

        {/* GM Controls */}
        {isGM && (
          <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-amber-200 mb-4">
              GM Controls
            </h2>

            <div className="space-y-4">
              {/* Start Combat Button */}
              <button
                onClick={handleStartCombat}
                disabled={!allHaveInitiative}
                className={`w-full px-6 py-4 rounded font-bold text-lg transition-colors ${
                  allHaveInitiative
                    ? "bg-green-600 hover:bg-green-500 text-green-100"
                    : "bg-slate-700 text-slate-500 cursor-not-allowed"
                }`}
              >
                {allHaveInitiative ? "Start Combat" : "Waiting for all initiative rolls..."}
              </button>

              {!allHaveInitiative && (
                <p className="text-sm text-amber-300/70 text-center">
                  {entitiesByStatus.withoutInitiative.length} entity(ies) still need to roll initiative
                </p>
              )}

              {/* GM can roll for NPCs */}
              {entitiesByStatus.withoutInitiative.filter(
                (e) => e.faction === "enemy" || e.faction === "neutral"
              ).length > 0 && (
                <div className="pt-4 border-t border-amber-700/30">
                  <button
                    onClick={() => {
                      // Roll initiative for all NPCs
                      entitiesByStatus.withoutInitiative
                        .filter((e) => e.faction === "enemy" || e.faction === "neutral")
                        .forEach((entity) => {
                          const roll = Math.floor(Math.random() * 20) + 1;
                          actions.submitInitiativeRoll(entity.id, roll, Math.random());
                        });
                    }}
                    className="w-full px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-amber-100 font-medium transition-colors"
                  >
                    Roll Initiative for All NPCs
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Entity Count */}
        <div className="text-center text-sm text-slate-500">
          {Object.keys(entities).length} entities in combat •{" "}
          {entitiesByStatus.controlled.length} under your control
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

export function CombatLobbyPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [searchParams] = useSearchParams();
  const isGM = searchParams.get("gm") === "true";

  // TODO: Get from auth context and campaign membership
  const playerId = isGM ? "gm-1" : "player-1";
  const controlledCharacterIds = isGM ? [] : ["char-1", "char-2"];

  if (!campaignId) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <p className="text-red-400">No campaign ID provided</p>
      </div>
    );
  }

  return (
    <CombatProvider
      combatId={campaignId}
      playerId={playerId}
      isGM={isGM}
      controlledCharacterIds={controlledCharacterIds}
    >
      <CombatLobbyContent />
    </CombatProvider>
  );
}

export default CombatLobbyPage;
