/**
 * Combat V2 - GM Controls Component
 *
 * Combat lifecycle and administrative controls for Game Masters.
 */

import React, { useState, useCallback } from "react";
import { useCombat } from "../../context/CombatProvider";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GmControlsProps {
  onAddEntity?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function GmControls({ onAddEntity }: GmControlsProps) {
  const { state, actions } = useCombat();
  const { phase, round, currentEntityId, entities } = state;
  const [confirmEnd, setConfirmEnd] = useState(false);

  const currentEntity = currentEntityId ? entities[currentEntityId] : null;

  // Handle start combat
  const handleStartCombat = useCallback(() => {
    actions.startCombat();
  }, [actions]);

  // Handle end combat
  const handleEndCombat = useCallback(() => {
    if (!confirmEnd) {
      setConfirmEnd(true);
      return;
    }
    actions.endCombat();
    setConfirmEnd(false);
  }, [actions, confirmEnd]);

  // Handle advance turn
  const handleAdvanceTurn = useCallback(() => {
    if (currentEntityId) {
      actions.endTurn(currentEntityId);
    }
  }, [actions, currentEntityId]);

  // Cancel end confirmation
  const handleCancelEnd = useCallback(() => {
    setConfirmEnd(false);
  }, []);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-4">
      <h2 className="text-lg font-semibold text-amber-400 flex items-center gap-2">
        <span>GM Controls</span>
      </h2>

      {/* Combat Status */}
      <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded">
        <div>
          <div className="text-sm text-slate-400">Combat Status</div>
          <div className="text-lg font-bold text-slate-200 capitalize">
            {phase || "Not Started"}
          </div>
        </div>
        {round > 0 && (
          <div className="text-right">
            <div className="text-sm text-slate-400">Round</div>
            <div className="text-2xl font-bold text-amber-400">{round}</div>
          </div>
        )}
      </div>

      {/* Phase-specific controls */}
      {phase === "setup" && (
        <div className="space-y-2">
          <button
            onClick={handleStartCombat}
            className="w-full px-4 py-3 rounded bg-green-600 hover:bg-green-500 text-green-100 font-bold transition-colors"
          >
            Start Combat
          </button>
          <p className="text-xs text-slate-500 text-center">
            All players must have rolled initiative before starting
          </p>
        </div>
      )}

      {phase === "initiative" && (
        <div className="p-3 bg-amber-900/30 border border-amber-700/50 rounded">
          <div className="text-amber-400 font-medium">Rolling Initiative</div>
          <p className="text-sm text-amber-200/70 mt-1">
            Waiting for all players to submit initiative rolls...
          </p>
        </div>
      )}

      {phase === "active" && (
        <div className="space-y-3">
          {/* Current Turn Info */}
          {currentEntity && (
            <div className="p-3 bg-slate-700/50 rounded">
              <div className="text-sm text-slate-400">Current Turn</div>
              <div className="text-lg font-medium text-slate-200">
                {currentEntity.displayName || currentEntity.name}
              </div>
              <div className="flex gap-4 mt-2 text-sm">
                <span className="text-blue-400">
                  AP: {currentEntity.ap?.current ?? 0}/{currentEntity.ap?.max ?? 6}
                </span>
                <span className="text-green-400">
                  Energy: {currentEntity.energy?.current ?? 0}/{currentEntity.energy?.max ?? 100}
                </span>
              </div>
            </div>
          )}

          {/* Turn Controls */}
          <button
            onClick={handleAdvanceTurn}
            disabled={!currentEntityId}
            className="w-full px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-blue-100 font-medium transition-colors"
          >
            Advance Turn (Force End)
          </button>
        </div>
      )}

      {/* End Combat */}
      {(phase === "active" || phase === "setup" || phase === "initiative") && (
        <div className="pt-3 border-t border-slate-600">
          {confirmEnd ? (
            <div className="space-y-2">
              <div className="text-sm text-red-400 text-center">
                Are you sure you want to end combat?
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleEndCombat}
                  className="flex-1 px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-red-100 font-medium transition-colors"
                >
                  Confirm End
                </button>
                <button
                  onClick={handleCancelEnd}
                  className="flex-1 px-4 py-2 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleEndCombat}
              className="w-full px-4 py-2 rounded bg-red-900/50 hover:bg-red-800/50 border border-red-700/50 text-red-300 transition-colors"
            >
              End Combat
            </button>
          )}
        </div>
      )}

      {/* Add Entity */}
      {onAddEntity && phase !== "completed" && (
        <button
          onClick={onAddEntity}
          className="w-full px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-purple-100 font-medium transition-colors"
        >
          + Add Entity
        </button>
      )}

      {/* Combat Ended */}
      {phase === "completed" && (
        <div className="p-4 bg-slate-700/50 rounded text-center">
          <div className="text-xl font-bold text-slate-300">Combat Ended</div>
          <p className="text-sm text-slate-500 mt-1">
            Results have been saved. Wounds persist until healed.
          </p>
        </div>
      )}
    </div>
  );
}

export default GmControls;
