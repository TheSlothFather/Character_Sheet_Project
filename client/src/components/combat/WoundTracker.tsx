/**
 * WoundTracker Component
 *
 * Displays wound counts by type with color-coded chips.
 */

import React from "react";
import type { WoundType, WoundCounts } from "@shared/rules/wounds";
import "./Combat.css";

export interface WoundTrackerProps {
  wounds: WoundCounts;
  compact?: boolean;
  hideEmpty?: boolean;
  className?: string;
}

const WOUND_TYPES: WoundType[] = [
  "blunt",
  "burn",
  "freeze",
  "laceration",
  "mental",
  "necrosis",
  "spiritual",
];

const WOUND_LABELS: Record<WoundType, string> = {
  blunt: "Blunt",
  burn: "Burn",
  freeze: "Freeze",
  laceration: "Laceration",
  mental: "Mental",
  necrosis: "Necrosis",
  spiritual: "Spiritual",
};

const WOUND_ICONS: Record<WoundType, string> = {
  blunt: "\u2618",     // shamrock/impact
  burn: "\u2668",      // fire/hot springs
  freeze: "\u2744",    // snowflake
  laceration: "\u2020", // dagger
  mental: "\u2691",    // flag/psyche
  necrosis: "\u2620",  // skull
  spiritual: "\u2721", // star of david/spirit
};

export const WoundTracker: React.FC<WoundTrackerProps> = ({
  wounds,
  compact = false,
  hideEmpty = false,
  className = "",
}) => {
  const displayTypes = WOUND_TYPES.filter((type) => {
    if (hideEmpty && (wounds[type] ?? 0) === 0) return false;
    return true;
  });

  if (displayTypes.length === 0) {
    return null;
  }

  return (
    <div
      className={`wound-tracker ${compact ? "wound-tracker--compact" : ""} ${className}`}
    >
      {displayTypes.map((type) => {
        const count = wounds[type] ?? 0;
        return (
          <div
            key={type}
            className={`wound-chip wound-chip--${type} ${count === 0 ? "wound-chip--empty" : ""}`}
            title={`${WOUND_LABELS[type]}: ${count}`}
          >
            <span className="wound-chip__icon">{WOUND_ICONS[type]}</span>
            {!compact && (
              <span className="wound-chip__label">{WOUND_LABELS[type]}</span>
            )}
            <span className="wound-chip__count">{count}</span>
          </div>
        );
      })}
    </div>
  );
};

// Single wound type display
export interface WoundChipProps {
  type: WoundType;
  count: number;
  compact?: boolean;
  className?: string;
}

export const WoundChip: React.FC<WoundChipProps> = ({
  type,
  count,
  compact = false,
  className = "",
}) => {
  const label = WOUND_LABELS[type] ?? type;
  const icon = WOUND_ICONS[type] ?? "?";

  return (
    <div
      className={`wound-chip wound-chip--${type} ${count === 0 ? "wound-chip--empty" : ""} ${className}`}
      title={`${label}: ${count}`}
    >
      <span className="wound-chip__icon">{icon}</span>
      {!compact && <span className="wound-chip__label">{label}</span>}
      <span className="wound-chip__count">{count}</span>
    </div>
  );
};
