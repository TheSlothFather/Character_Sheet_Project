/**
 * Combat V2 - Movement Action Component
 *
 * Handles movement declaration with path visualization.
 */

import React, { useState, useCallback } from "react";
import { useCombat } from "../../context/CombatProvider";
import type { HexPosition } from "../../../../api/combatV2Socket";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MovementActionProps {
  entityId: string;
  availableAP: number;
  physicalAttribute: number;
  onComplete?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function MovementAction({
  entityId,
  availableAP,
  physicalAttribute,
  onComplete,
}: MovementActionProps) {
  const { actions, getEntityPosition } = useCombat();
  const [targetPosition, setTargetPosition] = useState<HexPosition | null>(null);
  const [movementPath, setMovementPath] = useState<HexPosition[]>([]);

  const currentPosition = getEntityPosition(entityId);
  const hexesPerAP = Math.max(physicalAttribute, 3);
  const maxHexes = availableAP * hexesPerAP;

  // Calculate distance (axial)
  const calculateDistance = useCallback((from: HexPosition, to: HexPosition): number => {
    return (
      (Math.abs(from.q - to.q) +
        Math.abs(from.q + from.r - to.q - to.r) +
        Math.abs(from.r - to.r)) /
      2
    );
  }, []);

  // Calculate AP cost for movement
  const getAPCost = useCallback((distance: number): number => {
    return Math.ceil(distance / hexesPerAP);
  }, [hexesPerAP]);

  // Handle target selection (would be triggered by HexGrid click)
  const handleTargetSelect = useCallback((position: HexPosition) => {
    if (!currentPosition) return;

    const distance = calculateDistance(currentPosition, position);
    const apCost = getAPCost(distance);

    if (apCost <= availableAP) {
      setTargetPosition(position);
      // In a real implementation, we'd calculate the actual path here
      setMovementPath([currentPosition, position]);
    }
  }, [currentPosition, availableAP, calculateDistance, getAPCost]);

  // Confirm movement
  const handleConfirm = useCallback(() => {
    if (!targetPosition) return;

    actions.declareMovement(entityId, targetPosition.q, targetPosition.r, movementPath);
    onComplete?.();
  }, [actions, entityId, targetPosition, movementPath, onComplete]);

  // Calculate current movement cost
  const distance = targetPosition && currentPosition
    ? calculateDistance(currentPosition, targetPosition)
    : 0;
  const apCost = getAPCost(distance);

  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-300">
        <p>Click a hex on the grid to move.</p>
        <p className="text-slate-400 mt-1">
          Movement: {hexesPerAP} hexes per AP ({maxHexes} max hexes with {availableAP} AP)
        </p>
      </div>

      {targetPosition && (
        <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded">
          <div className="space-y-1">
            <div className="text-sm text-slate-300">
              Target: ({targetPosition.q}, {targetPosition.r})
            </div>
            <div className="text-sm">
              <span className="text-slate-400">Distance: </span>
              <span className="text-blue-400">{distance} hexes</span>
              <span className="text-slate-500 mx-2">→</span>
              <span className="text-slate-400">Cost: </span>
              <span className={apCost <= availableAP ? "text-green-400" : "text-red-400"}>
                {apCost} AP
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setTargetPosition(null);
                setMovementPath([]);
              }}
              className="px-3 py-1 text-sm rounded bg-slate-600 hover:bg-slate-500 text-slate-100 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={handleConfirm}
              disabled={apCost > availableAP}
              className="px-3 py-1 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-blue-100 transition-colors"
            >
              Confirm Move
            </button>
          </div>
        </div>
      )}

      {/* Manual coordinate input (for testing) */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-400">Manual:</span>
        <input
          type="number"
          placeholder="Q"
          className="w-16 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-200 text-center"
          onChange={(e) => {
            const q = parseInt(e.target.value) || 0;
            setTargetPosition((prev) => ({ q, r: prev?.r ?? 0 }));
          }}
        />
        <input
          type="number"
          placeholder="R"
          className="w-16 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-200 text-center"
          onChange={(e) => {
            const r = parseInt(e.target.value) || 0;
            setTargetPosition((prev) => ({ q: prev?.q ?? 0, r }));
          }}
        />
      </div>
    </div>
  );
}

export default MovementAction;
