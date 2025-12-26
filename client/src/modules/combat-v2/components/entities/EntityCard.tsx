/**
 * Combat V2 - Entity Card Component
 *
 * Displays detailed entity information in a card format.
 * Shows resources, wounds, status effects, and channeling progress.
 */

import React from "react";
import type { CombatV2Entity } from "../../../../api/combatV2Socket";
import { WoundTracker, type WoundType } from "./WoundTracker";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface EntityCardProps {
  entity: CombatV2Entity;
  isSelected?: boolean;
  isCurrentTurn?: boolean;
  isControlled?: boolean;
  showDetails?: boolean;
  onClick?: () => void;
  onTargetClick?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function ResourceBar({
  current,
  max,
  color,
  label,
  showNumbers = true,
}: {
  current: number;
  max: number;
  color: string;
  label: string;
  showNumbers?: boolean;
}) {
  const percent = Math.max(0, Math.min(100, (current / max) * 100));

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        {showNumbers && (
          <span className="text-slate-300 font-medium">
            {current}/{max}
          </span>
        )}
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function APDisplay({ current, max }: { current: number; max: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-slate-400">AP:</span>
      <div className="flex gap-0.5">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className={`w-2.5 h-2.5 rounded-sm ${
              i < current
                ? "bg-blue-400"
                : "bg-slate-700"
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-slate-500 ml-1">
        {current}/{max}
      </span>
    </div>
  );
}

function ChannelingProgress({
  spellName,
  progress,
  energyChanneled,
  apChanneled,
  totalCost,
}: NonNullable<CombatV2Entity["channeling"]>) {
  const percent = Math.min(100, progress * 100);
  const isReady = percent >= 100;

  return (
    <div className="mt-2 p-2 bg-purple-900/30 border border-purple-700/50 rounded">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-purple-300">
          Channeling: {spellName}
        </span>
        {isReady && (
          <span className="text-xs font-bold text-green-400">READY!</span>
        )}
      </div>
      <div className="h-2 bg-purple-900/50 rounded-full overflow-hidden mb-1">
        <div
          className={`h-full ${
            isReady ? "bg-green-400" : "bg-purple-400"
          } transition-all duration-300`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-purple-400">
        <span>Energy: {energyChanneled}/{totalCost}</span>
        <span>AP: {apChanneled}/{totalCost}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function EntityCard({
  entity,
  isSelected = false,
  isCurrentTurn = false,
  isControlled = false,
  showDetails = false,
  onClick,
  onTargetClick,
}: EntityCardProps) {
  const isDead = entity.alive === false;
  const isUnconscious = entity.unconscious;
  const isMinion = entity.tier === "minion";

  // Faction styling
  const factionStyles: Record<string, { border: string; bg: string; badge: string }> = {
    ally: {
      border: isSelected
        ? "border-yellow-400"
        : isCurrentTurn
        ? "border-green-500"
        : "border-green-700/50",
      bg: "bg-green-900/20",
      badge: "bg-green-700 text-green-100",
    },
    enemy: {
      border: isSelected
        ? "border-yellow-400"
        : isCurrentTurn
        ? "border-red-500"
        : "border-red-700/50",
      bg: "bg-red-900/20",
      badge: "bg-red-700 text-red-100",
    },
    neutral: {
      border: isSelected
        ? "border-yellow-400"
        : isCurrentTurn
        ? "border-yellow-500"
        : "border-yellow-700/50",
      bg: "bg-yellow-900/20",
      badge: "bg-yellow-700 text-yellow-100",
    },
  };

  const styles = factionStyles[entity.faction] || factionStyles.ally;

  // Calculate total wounds
  const totalWounds = entity.wounds
    ? Object.values(entity.wounds).reduce((sum, count) => sum + (count || 0), 0)
    : 0;

  return (
    <div
      className={`rounded-lg border-2 ${styles.border} ${styles.bg} transition-all duration-200 ${
        onClick ? "cursor-pointer hover:brightness-110" : ""
      } ${isDead ? "opacity-50" : ""}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          {/* Current turn indicator */}
          {isCurrentTurn && (
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          )}

          {/* Name */}
          <h3
            className={`font-semibold ${
              isDead
                ? "text-slate-500 line-through"
                : isUnconscious
                ? "text-slate-400"
                : "text-slate-100"
            }`}
          >
            {entity.displayName || entity.name}
          </h3>

          {/* Status badges */}
          {isDead && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-slate-700 text-slate-400">
              Dead
            </span>
          )}
          {isUnconscious && !isDead && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-amber-700 text-amber-100">
              Unconscious
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Tier badge */}
          <span
            className={`px-1.5 py-0.5 text-xs rounded capitalize ${
              entity.tier === "hero"
                ? "bg-purple-700 text-purple-100"
                : entity.tier === "lieutenant"
                ? "bg-amber-700 text-amber-100"
                : entity.tier === "minion"
                ? "bg-slate-600 text-slate-300"
                : "bg-slate-700 text-slate-300"
            }`}
          >
            {entity.tier}
          </span>

          {/* Faction badge */}
          <span className={`px-1.5 py-0.5 text-xs rounded capitalize ${styles.badge}`}>
            {entity.faction}
          </span>

          {/* Target button */}
          {onTargetClick && !isDead && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTargetClick();
              }}
              className="p-1 rounded bg-red-700 hover:bg-red-600 text-red-100 text-xs"
              title="Set as target"
            >
              🎯
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-2 space-y-2">
        {/* Resources for full entities */}
        {!isMinion && entity.energy && (
          <ResourceBar
            current={entity.energy.current}
            max={entity.energy.max}
            color={
              entity.energy.current > entity.energy.max * 0.5
                ? "bg-green-500"
                : entity.energy.current > entity.energy.max * 0.25
                ? "bg-yellow-500"
                : "bg-red-500"
            }
            label="Energy"
          />
        )}

        {!isMinion && entity.ap && (
          <APDisplay current={entity.ap.current} max={entity.ap.max} />
        )}

        {/* Minion display */}
        {isMinion && (
          <div className="text-xs text-slate-400">
            Minion - Defeated on threshold damage
          </div>
        )}

        {/* Channeling */}
        {entity.channeling && <ChannelingProgress {...entity.channeling} />}

        {/* Modifiers (immunities/resistances/weaknesses) */}
        {showDetails && (
          <div className="space-y-1 text-xs">
            {entity.immunities && entity.immunities.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-slate-500">Immune:</span>
                {entity.immunities.map((type) => (
                  <span
                    key={type}
                    className="px-1 py-0.5 rounded bg-blue-900/50 text-blue-300"
                  >
                    {type}
                  </span>
                ))}
              </div>
            )}
            {entity.resistances && entity.resistances.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-slate-500">Resist:</span>
                {entity.resistances.map((type) => (
                  <span
                    key={type}
                    className="px-1 py-0.5 rounded bg-slate-700 text-slate-300"
                  >
                    {type}
                  </span>
                ))}
              </div>
            )}
            {entity.weaknesses && entity.weaknesses.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-slate-500">Weak:</span>
                {entity.weaknesses.map((type) => (
                  <span
                    key={type}
                    className="px-1 py-0.5 rounded bg-red-900/50 text-red-300"
                  >
                    {type}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Wounds */}
        {!isMinion && totalWounds > 0 && (
          <div className="pt-1 border-t border-slate-700/50">
            <WoundTracker
              wounds={entity.wounds as Partial<Record<WoundType, number>>}
              compact={!showDetails}
              showPenalties={showDetails}
            />
          </div>
        )}
      </div>

      {/* Controlled indicator */}
      {isControlled && (
        <div className="px-2 py-1 bg-blue-900/30 border-t border-blue-700/50 text-xs text-blue-300 text-center">
          You control this entity
        </div>
      )}
    </div>
  );
}

export default EntityCard;
