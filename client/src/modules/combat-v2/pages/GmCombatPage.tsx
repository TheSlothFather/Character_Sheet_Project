/**
 * Combat V2 - GM Combat Page
 *
 * Game Master combat interface with full control over combat state.
 * Shows all entities, provides override controls, and manages combat flow.
 */

import React, { useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { CombatProvider, useCombat } from "../context/CombatProvider";
import { HexGrid } from "../components/grid";
import { EntityCard, WoundTracker } from "../components/entities";
import { GmControls, EntityOverrides } from "../components/gm";
import { ChannelingTracker } from "../components/channeling";
import type { HexPosition } from "../../../api/combatV2Socket";

// ═══════════════════════════════════════════════════════════════════════════
// ADD ENTITY MODAL
// ═══════════════════════════════════════════════════════════════════════════

interface AddEntityModalProps {
  onAdd: (entity: {
    name: string;
    displayName: string;
    faction: "ally" | "enemy" | "neutral";
    tier: "minion" | "full" | "lieutenant" | "hero";
    level: number;
    position: HexPosition;
  }) => void;
  onCancel: () => void;
}

function AddEntityModal({ onAdd, onCancel }: AddEntityModalProps) {
  const [name, setName] = useState("New Entity");
  const [displayName, setDisplayName] = useState("");
  const [faction, setFaction] = useState<"ally" | "enemy" | "neutral">("enemy");
  const [tier, setTier] = useState<"minion" | "full" | "lieutenant" | "hero">("minion");
  const [level, setLevel] = useState(1);
  const [q, setQ] = useState(0);
  const [r, setR] = useState(0);

  const handleSubmit = useCallback(() => {
    onAdd({
      name,
      displayName: displayName || name,
      faction,
      tier,
      level,
      position: { q, r },
    });
  }, [onAdd, name, displayName, faction, tier, level, q, r]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-md space-y-4">
        <h2 className="text-xl font-bold text-amber-400">Add Entity</h2>

        {/* Name */}
        <div className="space-y-1">
          <label className="text-sm text-slate-400">Name (Internal)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded bg-slate-700 border border-slate-600 text-slate-200"
            placeholder="Entity name..."
          />
        </div>

        {/* Display Name */}
        <div className="space-y-1">
          <label className="text-sm text-slate-400">Display Name (Optional)</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 rounded bg-slate-700 border border-slate-600 text-slate-200"
            placeholder="Name shown to players..."
          />
        </div>

        {/* Faction & Tier */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-slate-400">Faction</label>
            <select
              value={faction}
              onChange={(e) => setFaction(e.target.value as "ally" | "enemy" | "neutral")}
              className="w-full px-3 py-2 rounded bg-slate-700 border border-slate-600 text-slate-200"
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
              className="w-full px-3 py-2 rounded bg-slate-700 border border-slate-600 text-slate-200"
            >
              <option value="minion">Minion (1-hit)</option>
              <option value="full">Full</option>
              <option value="lieutenant">Lieutenant</option>
              <option value="hero">Hero</option>
            </select>
          </div>
        </div>

        {/* Level */}
        <div className="space-y-1">
          <label className="text-sm text-slate-400">Level</label>
          <input
            type="number"
            value={level}
            onChange={(e) => setLevel(parseInt(e.target.value) || 1)}
            min={1}
            max={30}
            className="w-full px-3 py-2 rounded bg-slate-700 border border-slate-600 text-slate-200"
          />
        </div>

        {/* Position */}
        <div className="space-y-1">
          <label className="text-sm text-slate-400">Starting Position (Hex)</label>
          <div className="flex gap-3">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Q:</span>
              <input
                type="number"
                value={q}
                onChange={(e) => setQ(parseInt(e.target.value) || 0)}
                className="w-20 px-3 py-2 rounded bg-slate-700 border border-slate-600 text-slate-200 text-center"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">R:</span>
              <input
                type="number"
                value={r}
                onChange={(e) => setR(parseInt(e.target.value) || 0)}
                className="w-20 px-3 py-2 rounded bg-slate-700 border border-slate-600 text-slate-200 text-center"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-green-100 font-medium transition-colors"
          >
            Add Entity
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 transition-colors"
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

function GmCombatContent() {
  const { state, actions, getInitiativeOrder, getEntity } = useCombat();
  const [hoveredHex, setHoveredHex] = useState<HexPosition | null>(null);
  const [showAddEntity, setShowAddEntity] = useState(false);
  const [overrideEntityId, setOverrideEntityId] = useState<string | null>(null);

  const {
    connectionStatus,
    phase,
    round,
    entities,
    initiative,
    selectedEntityId,
    currentEntityId,
  } = state;

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

  // Handle hex click
  const handleHexClick = useCallback((position: HexPosition) => {
    // GM can click hex to see position
    console.log("GM hex click:", position);
  }, []);

  // Handle entity selection
  const handleEntityClick = useCallback((entityId: string) => {
    actions.selectEntity(entityId === selectedEntityId ? null : entityId);
  }, [actions, selectedEntityId]);

  // Handle add entity
  const handleAddEntity = useCallback((entity: {
    name: string;
    displayName: string;
    faction: "ally" | "enemy" | "neutral";
    tier: "minion" | "full" | "lieutenant" | "hero";
    level: number;
    position: HexPosition;
  }) => {
    // This would call an action to add the entity to combat
    // For now, we'll use the GM override system
    console.log("Add entity:", entity);
    setShowAddEntity(false);
  }, []);

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
                className="h-[500px]"
              />
            </div>

            {/* Hex info */}
            {hoveredHex && (
              <div className="mt-2 text-sm text-slate-400">
                Hex: ({hoveredHex.q}, {hoveredHex.r})
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
          </div>
        </div>
      </div>

      {/* Add Entity Modal */}
      {showAddEntity && (
        <AddEntityModal
          onAdd={handleAddEntity}
          onCancel={() => setShowAddEntity(false)}
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

  // TODO: Get from auth context
  const gmId = "gm-1";

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
      playerId={gmId}
      isGM={true}
    >
      <GmCombatContent />
    </CombatProvider>
  );
}

export default GmCombatPage;
