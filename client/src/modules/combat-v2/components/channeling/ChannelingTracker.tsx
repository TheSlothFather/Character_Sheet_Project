/**
 * Combat V2 - Channeling Tracker Component
 *
 * Displays and manages Ildakar spell channeling progress.
 */

import React, { useState, useCallback, useMemo } from "react";
import { useCombat } from "../../context/CombatProvider";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ChannelingTrackerProps {
  entityId: string;
  onStartChanneling?: () => void;
  onReleaseSpell?: (targetId: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPELL ASPECTS (Ildakar Magic System)
// ═══════════════════════════════════════════════════════════════════════════

const ASPECT_COSTS = [1, 9, 27, 57, 99, 153]; // Tier 1-6

const DAMAGE_TYPES = [
  { value: "burn", label: "Fire (Burn)", icon: "🔥" },
  { value: "freeze", label: "Ice (Freeze)", icon: "❄️" },
  { value: "mental", label: "Mental", icon: "🧠" },
  { value: "necrosis", label: "Necrotic", icon: "☠️" },
  { value: "holy_spiritual", label: "Holy", icon: "✨" },
  { value: "unholy_spiritual", label: "Unholy", icon: "👁️" },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ChannelingTracker({
  entityId,
  onStartChanneling,
  onReleaseSpell,
}: ChannelingTrackerProps) {
  const { state, actions, getEntity, canControlEntity } = useCombat();
  const entity = getEntity(entityId);

  // New spell configuration
  const [spellName, setSpellName] = useState("Fireball");
  const [damageType, setDamageType] = useState("burn");
  const [intensityTier, setIntensityTier] = useState(1);
  const [initialEnergy, setInitialEnergy] = useState(5);
  const [initialAP, setInitialAP] = useState(2);

  // Release target
  const [releaseTargetId, setReleaseTargetId] = useState<string | null>(null);

  const isControlled = canControlEntity(entityId);
  const channeling = entity?.channeling;
  const isChanneling = !!channeling;

  // Calculate total cost based on intensity
  const totalCost = useMemo(() => {
    return ASPECT_COSTS[intensityTier - 1] || ASPECT_COSTS[0];
  }, [intensityTier]);

  // Get valid targets for spell release
  const validTargets = useMemo(() => {
    return Object.entries(state.entities)
      .filter(([id, e]) => id !== entityId && e.alive !== false)
      .map(([targetId, e]) => ({ ...e, id: targetId }));
  }, [state.entities, entityId]);

  // Start channeling
  const handleStartChanneling = useCallback(() => {
    if (!entity) return;

    const availableEnergy = entity.energy?.current ?? 0;
    const availableAP = entity.ap?.current ?? 0;

    const energyToChannel = Math.min(initialEnergy, availableEnergy);
    const apToChannel = Math.min(initialAP, availableAP);

    actions.startChanneling({
      entityId,
      spellName,
      totalCost,
      damageType,
      intensity: intensityTier,
      initialEnergy: energyToChannel,
      initialAP: apToChannel,
    });

    onStartChanneling?.();
  }, [actions, entityId, entity, spellName, totalCost, damageType, intensityTier, initialEnergy, initialAP, onStartChanneling]);

  // Continue channeling
  const handleContinueChanneling = useCallback((addEnergy: number, addAP: number) => {
    if (!entity) return;

    const availableEnergy = entity.energy?.current ?? 0;
    const availableAP = entity.ap?.current ?? 0;

    const energyToAdd = Math.min(addEnergy, availableEnergy);
    const apToAdd = Math.min(addAP, availableAP);

    actions.continueChanneling(entityId, energyToAdd, apToAdd);
  }, [actions, entityId, entity]);

  // Release spell
  const handleReleaseSpell = useCallback(() => {
    actions.releaseSpell(entityId, releaseTargetId ?? undefined);
    onReleaseSpell?.(releaseTargetId ?? "");
  }, [actions, entityId, releaseTargetId, onReleaseSpell]);

  // Abort channeling
  const handleAbortChanneling = useCallback(() => {
    actions.abortChanneling(entityId);
  }, [actions, entityId]);

  if (!entity || !isControlled) {
    return null;
  }

  // Currently channeling
  if (isChanneling && channeling) {
    const { spellName: currentSpell, progress, energyChanneled, apChanneled, totalCost: spellCost } = channeling;
    const isReady = progress >= 1;
    const progressPercent = Math.min(100, progress * 100);

    return (
      <div className="bg-purple-900/30 border border-purple-700/50 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-purple-200">
            🔮 Channeling: {currentSpell}
          </h3>
          {isReady && (
            <span className="px-2 py-1 text-sm font-bold rounded bg-green-600 text-green-100 animate-pulse">
              READY TO RELEASE
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-purple-300">Progress</span>
            <span className="text-purple-200">{progressPercent.toFixed(0)}%</span>
          </div>
          <div className="h-4 bg-purple-900/50 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isReady ? "bg-green-500" : "bg-purple-500"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Resource tracking */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="p-2 bg-purple-900/30 rounded">
            <div className="text-purple-400">Energy Channeled</div>
            <div className="text-xl font-bold text-purple-200">
              {energyChanneled} / {spellCost}
            </div>
          </div>
          <div className="p-2 bg-purple-900/30 rounded">
            <div className="text-purple-400">AP Channeled</div>
            <div className="text-xl font-bold text-purple-200">
              {apChanneled} / {spellCost}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {!isReady && (
            <>
              <button
                onClick={() => handleContinueChanneling(5, 1)}
                disabled={(entity.energy?.current ?? 0) < 1 || (entity.ap?.current ?? 0) < 1}
                className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-purple-100 transition-colors"
              >
                Channel +5 Energy, +1 AP
              </button>
              <button
                onClick={() => handleContinueChanneling(10, 2)}
                disabled={(entity.energy?.current ?? 0) < 1 || (entity.ap?.current ?? 0) < 1}
                className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-purple-100 transition-colors"
              >
                Channel +10 Energy, +2 AP
              </button>
            </>
          )}

          {isReady && (
            <div className="w-full space-y-2">
              <label className="text-sm text-purple-300">Select Target</label>
              <select
                value={releaseTargetId ?? ""}
                onChange={(e) => setReleaseTargetId(e.target.value || null)}
                className="w-full px-3 py-2 rounded bg-slate-700 border border-purple-600 text-slate-200"
              >
                <option value="">No target (area effect)</option>
                {validTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.displayName || target.name} ({target.faction})
                  </option>
                ))}
              </select>

              <button
                onClick={handleReleaseSpell}
                className="w-full px-4 py-3 rounded bg-green-600 hover:bg-green-500 text-green-100 font-bold text-lg transition-colors"
              >
                ⚡ RELEASE SPELL
              </button>
            </div>
          )}

          <button
            onClick={handleAbortChanneling}
            className="px-4 py-2 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 transition-colors"
          >
            Abort (Lose Progress)
          </button>
        </div>

        {/* Warning */}
        <div className="text-xs text-amber-400 bg-amber-900/30 p-2 rounded">
          ⚠️ Interruption (damage/stun) causes blowback: you take spell damage!
        </div>
      </div>
    );
  }

  // Not channeling - show spell setup
  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-4 space-y-4">
      <h3 className="text-lg font-semibold text-slate-200">
        🔮 Start Ildakar Channeling
      </h3>

      {/* Spell Name */}
      <div className="space-y-1">
        <label className="text-sm text-slate-400">Spell Name</label>
        <input
          type="text"
          value={spellName}
          onChange={(e) => setSpellName(e.target.value)}
          className="w-full px-3 py-2 rounded bg-slate-700 border border-slate-600 text-slate-200"
          placeholder="Enter spell name..."
        />
      </div>

      {/* Damage Type */}
      <div className="space-y-1">
        <label className="text-sm text-slate-400">Damage Type</label>
        <select
          value={damageType}
          onChange={(e) => setDamageType(e.target.value)}
          className="w-full px-3 py-2 rounded bg-slate-700 border border-slate-600 text-slate-200"
        >
          {DAMAGE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.icon} {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* Intensity Tier */}
      <div className="space-y-1">
        <label className="text-sm text-slate-400">
          Intensity Tier (determines total cost)
        </label>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5, 6].map((tier) => (
            <button
              key={tier}
              onClick={() => setIntensityTier(tier)}
              className={`w-10 h-10 rounded font-bold transition-colors ${
                intensityTier === tier
                  ? "bg-purple-600 text-purple-100"
                  : "bg-slate-700 hover:bg-slate-600 text-slate-300"
              }`}
            >
              {tier}
            </button>
          ))}
        </div>
        <div className="text-sm text-purple-400">
          Total Cost: {totalCost} Energy & {totalCost} AP
        </div>
      </div>

      {/* Initial Investment */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm text-slate-400">Initial Energy</label>
          <input
            type="number"
            value={initialEnergy}
            onChange={(e) => setInitialEnergy(Math.max(1, parseInt(e.target.value) || 1))}
            min={1}
            max={entity.energy?.current ?? 1}
            className="w-full px-3 py-2 rounded bg-slate-700 border border-slate-600 text-slate-200"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-400">Initial AP</label>
          <input
            type="number"
            value={initialAP}
            onChange={(e) => setInitialAP(Math.max(1, parseInt(e.target.value) || 1))}
            min={1}
            max={entity.ap?.current ?? 1}
            className="w-full px-3 py-2 rounded bg-slate-700 border border-slate-600 text-slate-200"
          />
        </div>
      </div>

      {/* Start Button */}
      <button
        onClick={handleStartChanneling}
        disabled={(entity.energy?.current ?? 0) < initialEnergy || (entity.ap?.current ?? 0) < initialAP}
        className="w-full px-4 py-3 rounded bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-purple-100 font-bold transition-colors"
      >
        Begin Channeling
      </button>

      {/* Info */}
      <div className="text-xs text-slate-400 space-y-1">
        <p>• Channeling takes multiple turns to reach full power</p>
        <p>• You must channel both Energy AND AP equal to the total cost</p>
        <p>• Spell is ready when both reach the threshold</p>
        <p>• Damage dealt = Energy channeled × Intensity</p>
      </div>
    </div>
  );
}

export default ChannelingTracker;
