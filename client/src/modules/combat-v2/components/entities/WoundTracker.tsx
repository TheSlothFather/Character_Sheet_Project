/**
 * Combat V2 - Wound Tracker Component
 *
 * Displays and manages the 8 wound types with their counts and penalties.
 */

import React from "react";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type WoundType =
  | "blunt"
  | "burn"
  | "freeze"
  | "laceration"
  | "mental"
  | "necrosis"
  | "holy_spiritual"
  | "unholy_spiritual";

export interface WoundTrackerProps {
  wounds: Partial<Record<WoundType, number>>;
  compact?: boolean;
  showPenalties?: boolean;
  onWoundChange?: (type: WoundType, delta: number) => void;
  editable?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// WOUND METADATA
// ═══════════════════════════════════════════════════════════════════════════

const WOUND_INFO: Record<WoundType, {
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  bgColor: string;
  penalty: string;
}> = {
  blunt: {
    label: "Blunt Trauma",
    shortLabel: "Blunt",
    icon: "🔨",
    color: "text-stone-300",
    bgColor: "bg-stone-800",
    penalty: "-1 Physical per wound",
  },
  burn: {
    label: "Burn",
    shortLabel: "Burn",
    icon: "🔥",
    color: "text-orange-400",
    bgColor: "bg-orange-900/50",
    penalty: "-1 to all actions per wound",
  },
  freeze: {
    label: "Frostbite",
    shortLabel: "Freeze",
    icon: "❄️",
    color: "text-cyan-300",
    bgColor: "bg-cyan-900/50",
    penalty: "-1 Movement per wound",
  },
  laceration: {
    label: "Laceration",
    shortLabel: "Slash",
    icon: "🗡️",
    color: "text-red-400",
    bgColor: "bg-red-900/50",
    penalty: "Bleeding: -5 Energy/turn per wound",
  },
  mental: {
    label: "Mental Trauma",
    shortLabel: "Mental",
    icon: "🧠",
    color: "text-purple-400",
    bgColor: "bg-purple-900/50",
    penalty: "-1 Mental per wound",
  },
  necrosis: {
    label: "Necrosis",
    shortLabel: "Decay",
    icon: "☠️",
    color: "text-green-400",
    bgColor: "bg-green-900/50",
    penalty: "-10 Max Energy per wound",
  },
  holy_spiritual: {
    label: "Holy Rending",
    shortLabel: "Holy",
    icon: "✨",
    color: "text-yellow-300",
    bgColor: "bg-yellow-900/50",
    penalty: "Rended (Holy): -10 Energy/turn",
  },
  unholy_spiritual: {
    label: "Unholy Rending",
    shortLabel: "Unholy",
    icon: "👁️",
    color: "text-violet-400",
    bgColor: "bg-violet-900/50",
    penalty: "Rended (Unholy): -10 Energy/turn",
  },
};

const WOUND_ORDER: WoundType[] = [
  "blunt",
  "burn",
  "freeze",
  "laceration",
  "mental",
  "necrosis",
  "holy_spiritual",
  "unholy_spiritual",
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function WoundTracker({
  wounds,
  compact = false,
  showPenalties = false,
  onWoundChange,
  editable = false,
}: WoundTrackerProps) {
  // Filter to only wounds that exist
  const activeWounds = WOUND_ORDER.filter((type) => (wounds[type] || 0) > 0);
  const totalWounds = Object.values(wounds).reduce((sum, count) => sum + (count || 0), 0);

  if (compact) {
    if (totalWounds === 0) {
      return (
        <span className="text-xs text-slate-500 italic">No wounds</span>
      );
    }

    return (
      <div className="flex flex-wrap gap-1">
        {activeWounds.map((type) => {
          const info = WOUND_INFO[type];
          const count = wounds[type] || 0;

          return (
            <span
              key={type}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs ${info.bgColor} ${info.color}`}
              title={`${info.label}: ${count} (${info.penalty})`}
            >
              <span>{info.icon}</span>
              <span className="font-medium">{count}</span>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-300">
          Wounds
          {totalWounds > 0 && (
            <span className="ml-2 text-red-400">({totalWounds} total)</span>
          )}
        </h4>
      </div>

      <div className="grid grid-cols-2 gap-1">
        {WOUND_ORDER.map((type) => {
          const info = WOUND_INFO[type];
          const count = wounds[type] || 0;
          const isActive = count > 0;

          return (
            <div
              key={type}
              className={`flex items-center gap-2 px-2 py-1 rounded transition-colors ${
                isActive
                  ? `${info.bgColor} ${info.color}`
                  : "bg-slate-800/50 text-slate-500"
              }`}
            >
              <span className="text-sm">{info.icon}</span>
              <span className="flex-1 text-xs font-medium truncate">
                {info.shortLabel}
              </span>

              {editable && onWoundChange ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onWoundChange(type, -1)}
                    disabled={count === 0}
                    className="w-5 h-5 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                  >
                    -
                  </button>
                  <span className="w-4 text-center text-xs font-bold">
                    {count}
                  </span>
                  <button
                    onClick={() => onWoundChange(type, 1)}
                    className="w-5 h-5 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-xs"
                  >
                    +
                  </button>
                </div>
              ) : (
                <span
                  className={`text-sm font-bold ${
                    isActive ? "text-white" : "text-slate-600"
                  }`}
                >
                  {count}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {showPenalties && totalWounds > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-700">
          <h5 className="text-xs font-semibold text-slate-400 mb-1">
            Active Penalties
          </h5>
          <ul className="space-y-0.5">
            {activeWounds.map((type) => {
              const info = WOUND_INFO[type];
              const count = wounds[type] || 0;

              return (
                <li
                  key={type}
                  className={`text-xs ${info.color} flex items-center gap-1`}
                >
                  <span>{info.icon}</span>
                  <span>
                    {info.penalty.replace("per wound", `(×${count})`)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default WoundTracker;
