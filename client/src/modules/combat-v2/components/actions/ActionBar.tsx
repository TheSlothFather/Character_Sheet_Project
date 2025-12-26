/**
 * Combat V2 - Action Bar Component
 *
 * Main action bar for combat, showing available actions based on current state.
 */

import React, { useState, useCallback } from "react";
import { useCombat } from "../../context/CombatProvider";
import { MovementAction } from "./MovementAction";
import { AttackAction } from "./AttackAction";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ActionMode = "none" | "move" | "attack" | "ability" | "channel" | "reaction";

export interface ActionBarProps {
  onModeChange?: (mode: ActionMode) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// WEAPON CATEGORIES (from weapons.csv)
// ═══════════════════════════════════════════════════════════════════════════

export const WEAPON_CATEGORIES = {
  small_blades: { energy: 1, ap: 1, damage: 3, minRange: 0, maxRange: 1, type: "laceration" },
  medium_blades: { energy: 2, ap: 2, damage: 7, minRange: 1, maxRange: 1, type: "laceration" },
  large_blades: { energy: 3, ap: 3, damage: 12, minRange: 1, maxRange: 2, type: "laceration" },
  small_bearded: { energy: 1, ap: 1, damage: 3, minRange: 1, maxRange: 1, type: "laceration" },
  large_bearded: { energy: 3, ap: 3, damage: 12, minRange: 1, maxRange: 2, type: "laceration" },
  polearms: { energy: 3, ap: 3, damage: 15, minRange: 2, maxRange: 3, type: "laceration" },
  long_ranged: { energy: 3, ap: 3, damage: 15, minRange: 1, maxRange: 30, type: "laceration" },
  thrown: { energy: 1, ap: 1, damage: 5, minRange: 1, maxRange: 5, type: "laceration" },
  small_blunt: { energy: 2, ap: 2, damage: 7, minRange: 0, maxRange: 1, type: "blunt" },
  large_blunt: { energy: 3, ap: 3, damage: 12, minRange: 1, maxRange: 2, type: "blunt" },
  flexible: { energy: 2, ap: 2, damage: 5, minRange: 1, maxRange: 3, type: "blunt" },
  unarmed: { energy: 1, ap: 1, damage: 2, minRange: 0, maxRange: 1, type: "blunt" },
} as const;

export type WeaponCategory = keyof typeof WEAPON_CATEGORIES;

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ActionBar({ onModeChange }: ActionBarProps) {
  const { state, actions, isMyTurn, getCurrentTurnEntity, canControlEntity } = useCombat();
  const [activeMode, setActiveMode] = useState<ActionMode>("none");
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponCategory>("unarmed");

  const currentEntity = getCurrentTurnEntity();
  const canAct = isMyTurn && currentEntity && !currentEntity.unconscious && currentEntity.alive !== false;

  // Resource availability
  const currentAP = currentEntity?.ap?.current ?? 0;
  const currentEnergy = currentEntity?.energy?.current ?? 0;

  // Handle mode change
  const handleModeChange = useCallback((mode: ActionMode) => {
    setActiveMode(mode);
    onModeChange?.(mode);
  }, [onModeChange]);

  // Cancel current action
  const handleCancel = useCallback(() => {
    setActiveMode("none");
    onModeChange?.("none");
  }, [onModeChange]);

  // End turn
  const handleEndTurn = useCallback(() => {
    if (currentEntity) {
      actions.endTurn(currentEntity.id);
    }
  }, [actions, currentEntity]);

  // Delay turn
  const handleDelayTurn = useCallback(() => {
    if (currentEntity) {
      actions.delayTurn(currentEntity.id);
    }
  }, [actions, currentEntity]);

  if (!canAct) {
    return (
      <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-4">
        <div className="text-center text-slate-400">
          {!isMyTurn ? (
            <span>Waiting for your turn...</span>
          ) : currentEntity?.unconscious ? (
            <span>Entity is unconscious</span>
          ) : currentEntity?.alive === false ? (
            <span>Entity is dead</span>
          ) : (
            <span>Select an entity to act</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-lg overflow-hidden">
      {/* Header with resources */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-700/50 border-b border-slate-600">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-200">
            {currentEntity.displayName || currentEntity.name}'s Turn
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-blue-400">
              AP: {currentAP}/{currentEntity.ap?.max ?? 6}
            </span>
            <span className="text-green-400">
              Energy: {currentEnergy}/{currentEntity.energy?.max ?? 100}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDelayTurn}
            className="px-3 py-1 text-sm rounded bg-amber-700 hover:bg-amber-600 text-amber-100 transition-colors"
          >
            Delay
          </button>
          <button
            onClick={handleEndTurn}
            className="px-3 py-1 text-sm rounded bg-slate-600 hover:bg-slate-500 text-slate-100 transition-colors"
          >
            End Turn
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="p-3">
        {activeMode === "none" ? (
          <div className="flex flex-wrap gap-2">
            {/* Movement */}
            <button
              onClick={() => handleModeChange("move")}
              disabled={currentAP < 1}
              className="flex items-center gap-2 px-4 py-2 rounded bg-blue-700 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-blue-100 transition-colors"
            >
              <span>🏃</span>
              <span>Move</span>
              <span className="text-xs opacity-75">(1+ AP)</span>
            </button>

            {/* Attack */}
            <button
              onClick={() => handleModeChange("attack")}
              disabled={currentAP < 1 || currentEnergy < 1}
              className="flex items-center gap-2 px-4 py-2 rounded bg-red-700 hover:bg-red-600 disabled:bg-slate-700 disabled:text-slate-500 text-red-100 transition-colors"
            >
              <span>⚔️</span>
              <span>Attack</span>
              <span className="text-xs opacity-75">(varies)</span>
            </button>

            {/* Ability */}
            <button
              onClick={() => handleModeChange("ability")}
              disabled={currentAP < 1}
              className="flex items-center gap-2 px-4 py-2 rounded bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700 disabled:text-slate-500 text-purple-100 transition-colors"
            >
              <span>✨</span>
              <span>Ability</span>
            </button>

            {/* Channel (Ildakar) */}
            <button
              onClick={() => handleModeChange("channel")}
              disabled={currentAP < 1 || currentEnergy < 1}
              className="flex items-center gap-2 px-4 py-2 rounded bg-violet-700 hover:bg-violet-600 disabled:bg-slate-700 disabled:text-slate-500 text-violet-100 transition-colors"
            >
              <span>🔮</span>
              <span>Channel</span>
            </button>

            {/* Continue/Release channeling if active */}
            {currentEntity.channeling && (
              <>
                <button
                  onClick={() => {
                    if (currentEntity.channeling!.progress >= 1) {
                      // Ready to release - prompt for target
                      handleModeChange("channel");
                    } else {
                      // Continue channeling
                      actions.continueChanneling(
                        currentEntity.id,
                        Math.min(currentEnergy, 10),
                        Math.min(currentAP, 2)
                      );
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded bg-green-700 hover:bg-green-600 text-green-100 transition-colors"
                >
                  <span>⚡</span>
                  <span>
                    {currentEntity.channeling.progress >= 1
                      ? "Release Spell"
                      : "Continue Channeling"}
                  </span>
                </button>
                <button
                  onClick={() => actions.abortChanneling(currentEntity.id)}
                  className="flex items-center gap-2 px-4 py-2 rounded bg-slate-600 hover:bg-slate-500 text-slate-100 transition-colors"
                >
                  <span>❌</span>
                  <span>Abort</span>
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Cancel button */}
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-3 py-1 text-sm rounded bg-slate-600 hover:bg-slate-500 text-slate-100 transition-colors"
            >
              ← Back
            </button>

            {/* Mode-specific UI */}
            {activeMode === "move" && (
              <MovementAction
                entityId={currentEntity.id}
                availableAP={currentAP}
                physicalAttribute={3} // TODO: Get from entity
                onComplete={handleCancel}
              />
            )}

            {activeMode === "attack" && (
              <AttackAction
                entityId={currentEntity.id}
                availableAP={currentAP}
                availableEnergy={currentEnergy}
                selectedWeapon={selectedWeapon}
                onWeaponChange={setSelectedWeapon}
                onComplete={handleCancel}
              />
            )}

            {activeMode === "ability" && (
              <div className="text-slate-400 text-sm">
                Ability selection coming soon...
              </div>
            )}

            {activeMode === "channel" && (
              <div className="text-slate-400 text-sm">
                Channeling UI coming soon...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error display */}
      {state.lastError && (
        <div className="px-4 py-2 bg-red-900/50 border-t border-red-700 text-red-300 text-sm">
          {state.lastError}
          <button
            onClick={() => actions.clearError()}
            className="ml-2 text-red-400 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default ActionBar;
