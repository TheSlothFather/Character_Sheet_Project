/**
 * Combat V2 - Entity Overrides Component
 *
 * GM tools to modify entity stats and apply effects directly.
 */

import React, { useState, useCallback } from "react";
import { useCombat } from "../../context/CombatProvider";
import type { DamageType } from "../../../../api/combatV2Socket";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface EntityOverridesProps {
  entityId: string;
  onClose?: () => void;
}

const DAMAGE_TYPES: { value: DamageType; label: string; icon: string }[] = [
  { value: "blunt", label: "Blunt", icon: "hammer" },
  { value: "burn", label: "Burn", icon: "fire" },
  { value: "freeze", label: "Freeze", icon: "snowflake" },
  { value: "laceration", label: "Laceration", icon: "scissors" },
  { value: "mental", label: "Mental", icon: "brain" },
  { value: "necrosis", label: "Necrosis", icon: "skull" },
  { value: "holy_spiritual", label: "Holy", icon: "sun" },
  { value: "unholy_spiritual", label: "Unholy", icon: "eye" },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function EntityOverrides({ entityId, onClose }: EntityOverridesProps) {
  const { state, actions, getEntity } = useCombat();
  const entity = getEntity(entityId);

  // Override values
  const [energyDelta, setEnergyDelta] = useState(0);
  const [apDelta, setApDelta] = useState(0);
  const [damageAmount, setDamageAmount] = useState(10);
  const [damageType, setDamageType] = useState<DamageType>("blunt");
  const [healAmount, setHealAmount] = useState(10);

  // Position override
  const [newQ, setNewQ] = useState(0);
  const [newR, setNewR] = useState(0);

  if (!entity) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <p className="text-slate-500">Entity not found</p>
      </div>
    );
  }

  // Apply damage
  const handleApplyDamage = () => {
    actions.gmApplyDamage(entityId, damageAmount, damageType);
  };

  // Apply healing
  const handleApplyHealing = () => {
    actions.gmApplyDamage(entityId, -healAmount, damageType);
  };

  // Modify energy directly
  const handleModifyEnergy = () => {
    if (energyDelta !== 0) {
      actions.gmOverride(entityId, {
        energy: {
          current: Math.max(0, (entity.energy?.current ?? 0) + energyDelta),
          max: entity.energy?.max ?? 100,
        },
      });
      setEnergyDelta(0);
    }
  };

  // Modify AP directly
  const handleModifyAP = () => {
    if (apDelta !== 0) {
      actions.gmOverride(entityId, {
        ap: {
          current: Math.max(0, (entity.ap?.current ?? 0) + apDelta),
          max: entity.ap?.max ?? 6,
        },
      });
      setApDelta(0);
    }
  };

  // Move entity
  const handleMoveEntity = () => {
    actions.gmMoveEntity(entityId, newQ, newR);
  };

  // Toggle unconscious
  const handleToggleUnconscious = () => {
    actions.gmOverride(entityId, { unconscious: !entity.unconscious });
  };

  // Kill/Revive entity
  const handleToggleAlive = () => {
    actions.gmOverride(entityId, { alive: !entity.alive });
  };

  return (
    <div className="bg-slate-800 border border-amber-700/50 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-amber-400">
          Override: {entity.displayName || entity.name}
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            Close
          </button>
        )}
      </div>

      {/* Current Status */}
      <div className="grid grid-cols-2 gap-2 p-3 bg-slate-700/50 rounded text-sm">
        <div>
          <span className="text-slate-400">Energy: </span>
          <span className="text-green-400">
            {entity.energy?.current ?? 0}/{entity.energy?.max ?? 100}
          </span>
        </div>
        <div>
          <span className="text-slate-400">AP: </span>
          <span className="text-blue-400">
            {entity.ap?.current ?? 0}/{entity.ap?.max ?? 6}
          </span>
        </div>
        <div>
          <span className="text-slate-400">Status: </span>
          <span className={entity.alive === false ? "text-red-400" : entity.unconscious ? "text-amber-400" : "text-green-400"}>
            {entity.alive === false ? "Dead" : entity.unconscious ? "Unconscious" : "Active"}
          </span>
        </div>
        <div>
          <span className="text-slate-400">Tier: </span>
          <span className="text-purple-400 capitalize">{entity.tier}</span>
        </div>
      </div>

      {/* Apply Damage */}
      <div className="space-y-2 p-3 bg-red-900/20 border border-red-700/30 rounded">
        <h4 className="text-sm font-medium text-red-400">Apply Damage</h4>
        <div className="flex gap-2">
          <input
            type="number"
            value={damageAmount}
            onChange={(e) => setDamageAmount(parseInt(e.target.value) || 0)}
            min={0}
            className="w-20 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-200 text-center"
          />
          <select
            value={damageType}
            onChange={(e) => setDamageType(e.target.value as DamageType)}
            className="flex-1 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-200"
          >
            {DAMAGE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleApplyDamage}
            disabled={damageAmount <= 0}
            className="px-3 py-1 rounded bg-red-600 hover:bg-red-500 disabled:bg-slate-700 text-red-100 text-sm transition-colors"
          >
            Damage
          </button>
        </div>
      </div>

      {/* Apply Healing */}
      <div className="space-y-2 p-3 bg-green-900/20 border border-green-700/30 rounded">
        <h4 className="text-sm font-medium text-green-400">Apply Healing</h4>
        <div className="flex gap-2">
          <input
            type="number"
            value={healAmount}
            onChange={(e) => setHealAmount(parseInt(e.target.value) || 0)}
            min={0}
            className="w-20 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-200 text-center"
          />
          <button
            onClick={handleApplyHealing}
            disabled={healAmount <= 0}
            className="flex-1 px-3 py-1 rounded bg-green-600 hover:bg-green-500 disabled:bg-slate-700 text-green-100 text-sm transition-colors"
          >
            Heal Energy
          </button>
        </div>
      </div>

      {/* Resource Modifiers */}
      <div className="grid grid-cols-2 gap-3">
        {/* Energy Modifier */}
        <div className="space-y-1 p-2 bg-slate-700/30 rounded">
          <div className="text-xs text-slate-400">Modify Energy</div>
          <div className="flex gap-1">
            <input
              type="number"
              value={energyDelta}
              onChange={(e) => setEnergyDelta(parseInt(e.target.value) || 0)}
              className="w-16 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-200 text-center text-sm"
            />
            <button
              onClick={handleModifyEnergy}
              disabled={energyDelta === 0}
              className="px-2 py-1 rounded bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:text-slate-500 text-slate-200 text-xs transition-colors"
            >
              Apply
            </button>
          </div>
        </div>

        {/* AP Modifier */}
        <div className="space-y-1 p-2 bg-slate-700/30 rounded">
          <div className="text-xs text-slate-400">Modify AP</div>
          <div className="flex gap-1">
            <input
              type="number"
              value={apDelta}
              onChange={(e) => setApDelta(parseInt(e.target.value) || 0)}
              className="w-16 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-200 text-center text-sm"
            />
            <button
              onClick={handleModifyAP}
              disabled={apDelta === 0}
              className="px-2 py-1 rounded bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:text-slate-500 text-slate-200 text-xs transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* Move Entity */}
      <div className="space-y-2 p-3 bg-cyan-900/20 border border-cyan-700/30 rounded">
        <h4 className="text-sm font-medium text-cyan-400">Move to Hex</h4>
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400">Q:</span>
            <input
              type="number"
              value={newQ}
              onChange={(e) => setNewQ(parseInt(e.target.value) || 0)}
              className="w-14 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-200 text-center text-sm"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400">R:</span>
            <input
              type="number"
              value={newR}
              onChange={(e) => setNewR(parseInt(e.target.value) || 0)}
              className="w-14 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-200 text-center text-sm"
            />
          </div>
          <button
            onClick={handleMoveEntity}
            className="flex-1 px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-cyan-100 text-sm transition-colors"
          >
            Teleport
          </button>
        </div>
      </div>

      {/* Status Toggles */}
      <div className="flex gap-2">
        <button
          onClick={handleToggleUnconscious}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
            entity.unconscious
              ? "bg-amber-600 hover:bg-amber-500 text-amber-100"
              : "bg-slate-600 hover:bg-slate-500 text-slate-200"
          }`}
        >
          {entity.unconscious ? "Wake Up" : "Knock Out"}
        </button>
        <button
          onClick={handleToggleAlive}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
            entity.alive === false
              ? "bg-green-600 hover:bg-green-500 text-green-100"
              : "bg-red-900/50 hover:bg-red-800/50 border border-red-700/50 text-red-300"
          }`}
        >
          {entity.alive === false ? "Revive" : "Kill"}
        </button>
      </div>
    </div>
  );
}

export default EntityOverrides;
