/**
 * Combat V2 - Attack Action Component
 *
 * Handles attack declaration with weapon selection and target.
 */

import React, { useState, useCallback, useMemo } from "react";
import { useCombat } from "../../context/CombatProvider";
import { WEAPON_CATEGORIES, type WeaponCategory } from "./ActionBar";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AttackActionProps {
  entityId: string;
  availableAP: number;
  availableEnergy: number;
  selectedWeapon: WeaponCategory;
  onWeaponChange: (weapon: WeaponCategory) => void;
  onComplete?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// WEAPON DISPLAY NAMES
// ═══════════════════════════════════════════════════════════════════════════

const WEAPON_DISPLAY_NAMES: Record<WeaponCategory, string> = {
  small_blades: "Small Blades (Dagger, Knife)",
  medium_blades: "Medium Blades (Sword, Scimitar)",
  large_blades: "Large Blades (Greatsword, Claymore)",
  small_bearded: "Small Bearded (Hatchet)",
  large_bearded: "Large Bearded (Battleaxe)",
  polearms: "Polearms (Spear, Halberd)",
  long_ranged: "Long Ranged (Bow, Crossbow)",
  thrown: "Thrown (Javelin, Throwing Knife)",
  small_blunt: "Small Blunt (Club, Mace)",
  large_blunt: "Large Blunt (Warhammer, Maul)",
  flexible: "Flexible (Whip, Flail)",
  unarmed: "Unarmed",
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function AttackAction({
  entityId,
  availableAP,
  availableEnergy,
  selectedWeapon,
  onWeaponChange,
  onComplete,
}: AttackActionProps) {
  const { state, actions, getEntityPosition } = useCombat();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [attackRoll, setAttackRoll] = useState<number>(10); // Default roll

  const weaponStats = WEAPON_CATEGORIES[selectedWeapon];
  const attackerPosition = getEntityPosition(entityId);

  // Check if we can afford this attack
  const canAfford = availableAP >= weaponStats.ap && availableEnergy >= weaponStats.energy;

  // Get valid targets (entities in range)
  const validTargets = useMemo(() => {
    if (!attackerPosition) return [];

    return Object.entries(state.entities)
      .filter(([id, entity]) => {
        // Can't attack self
        if (id === entityId) return false;
        // Can't attack dead entities
        if (entity.alive === false) return false;

        // Check range
        const targetPos = state.hexPositions[id];
        if (!targetPos) return false;

        const distance =
          (Math.abs(attackerPosition.q - targetPos.q) +
            Math.abs(attackerPosition.q + attackerPosition.r - targetPos.q - targetPos.r) +
            Math.abs(attackerPosition.r - targetPos.r)) /
          2;

        return distance >= weaponStats.minRange && distance <= weaponStats.maxRange;
      })
      .map(([entityId, entity]) => ({ ...entity, id: entityId }));
  }, [state.entities, state.hexPositions, entityId, attackerPosition, weaponStats]);

  // Get target entity
  const targetEntity = targetId ? state.entities[targetId] : null;

  // Calculate distance to target
  const targetDistance = useMemo(() => {
    if (!targetId || !attackerPosition) return null;
    const targetPos = state.hexPositions[targetId];
    if (!targetPos) return null;

    return (
      (Math.abs(attackerPosition.q - targetPos.q) +
        Math.abs(attackerPosition.q + attackerPosition.r - targetPos.q - targetPos.r) +
        Math.abs(attackerPosition.r - targetPos.r)) /
      2
    );
  }, [targetId, attackerPosition, state.hexPositions]);

  // Handle attack confirmation
  const handleConfirm = useCallback(() => {
    if (!targetId || !canAfford) return;

    actions.declareAttack({
      attackerId: entityId,
      targetId,
      weaponCategory: selectedWeapon,
      apCost: weaponStats.ap,
      energyCost: weaponStats.energy,
      baseDamage: weaponStats.damage,
      damageType: weaponStats.type,
      attackRoll,
    });

    onComplete?.();
  }, [actions, entityId, targetId, selectedWeapon, weaponStats, attackRoll, canAfford, onComplete]);

  return (
    <div className="space-y-4">
      {/* Weapon Selection */}
      <div className="space-y-2">
        <label className="text-sm text-slate-400">Weapon Category</label>
        <select
          value={selectedWeapon}
          onChange={(e) => onWeaponChange(e.target.value as WeaponCategory)}
          className="w-full px-3 py-2 rounded bg-slate-700 border border-slate-600 text-slate-200"
        >
          {(Object.keys(WEAPON_CATEGORIES) as WeaponCategory[]).map((weapon) => {
            const stats = WEAPON_CATEGORIES[weapon];
            const affordable = availableAP >= stats.ap && availableEnergy >= stats.energy;
            return (
              <option key={weapon} value={weapon} disabled={!affordable}>
                {WEAPON_DISPLAY_NAMES[weapon]} - {stats.damage} dmg ({stats.type})
                {!affordable ? " [Not enough resources]" : ""}
              </option>
            );
          })}
        </select>
      </div>

      {/* Weapon Stats */}
      <div className="grid grid-cols-2 gap-2 p-3 bg-slate-700/50 rounded text-sm">
        <div>
          <span className="text-slate-400">AP Cost: </span>
          <span className={availableAP >= weaponStats.ap ? "text-blue-400" : "text-red-400"}>
            {weaponStats.ap}
          </span>
        </div>
        <div>
          <span className="text-slate-400">Energy Cost: </span>
          <span className={availableEnergy >= weaponStats.energy ? "text-green-400" : "text-red-400"}>
            {weaponStats.energy}
          </span>
        </div>
        <div>
          <span className="text-slate-400">Base Damage: </span>
          <span className="text-red-400">{weaponStats.damage}</span>
        </div>
        <div>
          <span className="text-slate-400">Damage Type: </span>
          <span className="text-orange-400 capitalize">{weaponStats.type}</span>
        </div>
        <div className="col-span-2">
          <span className="text-slate-400">Range: </span>
          <span className="text-cyan-400">
            {weaponStats.minRange === weaponStats.maxRange
              ? weaponStats.minRange
              : `${weaponStats.minRange}-${weaponStats.maxRange}`}{" "}
            hexes
          </span>
        </div>
      </div>

      {/* Target Selection */}
      <div className="space-y-2">
        <label className="text-sm text-slate-400">
          Target ({validTargets.length} in range)
        </label>
        {validTargets.length > 0 ? (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {validTargets.map((target) => (
              <button
                key={target.id}
                onClick={() => setTargetId(target.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded transition-colors ${
                  targetId === target.id
                    ? "bg-red-700 text-red-100"
                    : "bg-slate-700 hover:bg-slate-600 text-slate-200"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      target.faction === "enemy" ? "bg-red-500" : "bg-green-500"
                    }`}
                  />
                  <span>{target.displayName || target.name}</span>
                </span>
                <span className="text-xs text-slate-400">
                  {target.tier} • {target.energy?.current ?? "?"}/{target.energy?.max ?? "?"} HP
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500 italic p-3 bg-slate-700/30 rounded">
            No valid targets in range ({weaponStats.minRange}-{weaponStats.maxRange} hexes)
          </div>
        )}
      </div>

      {/* Attack Roll Input */}
      {targetId && (
        <div className="space-y-2">
          <label className="text-sm text-slate-400">Attack Roll Result</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={attackRoll}
              onChange={(e) => setAttackRoll(parseInt(e.target.value) || 0)}
              min={1}
              max={100}
              className="w-24 px-3 py-2 rounded bg-slate-700 border border-slate-600 text-slate-200 text-center"
            />
            <button
              onClick={() => setAttackRoll(Math.floor(Math.random() * 20) + 1)}
              className="px-3 py-2 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm"
            >
              Roll d20
            </button>
            <span className="text-xs text-slate-500">
              (Enter your actual roll result)
            </span>
          </div>
        </div>
      )}

      {/* Target Info & Confirm */}
      {targetEntity && (
        <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded">
          <div className="space-y-1">
            <div className="text-sm font-medium text-slate-200">
              Attacking: {targetEntity.displayName || targetEntity.name}
            </div>
            <div className="text-xs text-slate-400">
              Distance: {targetDistance} hex{targetDistance !== 1 ? "es" : ""} •
              HP: {targetEntity.energy?.current ?? "?"}/{targetEntity.energy?.max ?? "?"}
            </div>
            {/* Show modifiers */}
            <div className="flex flex-wrap gap-1 mt-1">
              {targetEntity.immunities?.includes(weaponStats.type) && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-blue-900/50 text-blue-300">
                  IMMUNE to {weaponStats.type}
                </span>
              )}
              {targetEntity.resistances?.includes(weaponStats.type) && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-slate-600 text-slate-300">
                  Resistant to {weaponStats.type} (½ dmg)
                </span>
              )}
              {targetEntity.weaknesses?.includes(weaponStats.type) && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-red-900/50 text-red-300">
                  Weak to {weaponStats.type} (2× dmg)
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleConfirm}
            disabled={!canAfford}
            className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-red-100 font-medium transition-colors"
          >
            Attack!
          </button>
        </div>
      )}
    </div>
  );
}

export default AttackAction;
