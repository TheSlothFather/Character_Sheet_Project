/**
 * WoundDisplay Component
 *
 * Icon-based wound display with type-specific colors and tooltips.
 * Shows wound penalties and counts.
 */

import React from "react";
import type { WoundCounts, WoundType } from "@shared/rules/wounds";
import "./WarChronicle.css";

export interface WoundDisplayProps {
  wounds: WoundCounts;
  compact?: boolean;
  showPenalties?: boolean;
  hideEmpty?: boolean;
  className?: string;
}

// Wound type configuration
const WOUND_CONFIG: Record<
  WoundType,
  { icon: string; color: string; penalty: string }
> = {
  burn: {
    icon: "🔥",
    color: "var(--war-wound-burn)",
    penalty: "-3 to physical skills per wound",
  },
  freeze: {
    icon: "❄️",
    color: "var(--war-wound-freeze)",
    penalty: "-1 AP per wound",
  },
  laceration: {
    icon: "💔",
    color: "var(--war-wound-laceration)",
    penalty: "-3 energy per round per wound",
  },
  blunt: {
    icon: "🔨",
    color: "var(--war-wound-blunt)",
    penalty: "+1× movement energy cost per wound",
  },
  mental: {
    icon: "🧠",
    color: "var(--war-wound-mental)",
    penalty: "-3 to mental skills per wound",
  },
  necrosis: {
    icon: "☠️",
    color: "var(--war-wound-necrosis)",
    penalty: "-3 to max energy per wound",
  },
  spiritual: {
    icon: "✨",
    color: "var(--war-wound-spiritual)",
    penalty: "-3 to spiritual skills per wound",
  },
};

export const WoundDisplay: React.FC<WoundDisplayProps> = ({
  wounds,
  compact = false,
  showPenalties = false,
  hideEmpty = false,
  className = "",
}) => {
  // Filter wounds with count > 0
  const activeWounds = Object.entries(wounds).filter(
    ([_, count]) => count > 0
  ) as [WoundType, number][];

  if (hideEmpty && activeWounds.length === 0) {
    return null;
  }

  const displayClasses = [
    "wound-display",
    compact && "wound-display--compact",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={displayClasses}>
      {!compact && (
        <div className="wound-display__header">
          <span className="wound-display__label">Wounds</span>
          <span className="wound-display__total war-text-mono">
            {activeWounds.reduce((sum, [_, count]) => sum + count, 0)} total
          </span>
        </div>
      )}

      <div className="wound-display__list">
        {activeWounds.length === 0 ? (
          !hideEmpty && (
            <span className="wound-display__empty">No wounds</span>
          )
        ) : (
          activeWounds.map(([type, count]) => {
            const config = WOUND_CONFIG[type];
            const tooltipText = showPenalties
              ? `${type}: ${count} × ${config.penalty}`
              : `${type}: ${count}`;

            return (
              <div
                key={type}
                className={`wound-display__wound wound-display__wound--${type}`}
                title={tooltipText}
                style={{ borderColor: config.color } as React.CSSProperties}
              >
                <span className="wound-display__icon">{config.icon}</span>
                <span className="wound-display__count war-text-mono">
                  ×{count}
                </span>
                {showPenalties && !compact && (
                  <span className="wound-display__penalty">
                    {config.penalty}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// Individual wound badge component
export interface WoundBadgeProps {
  type: WoundType;
  count: number;
  showPenalty?: boolean;
  className?: string;
}

export const WoundBadge: React.FC<WoundBadgeProps> = ({
  type,
  count,
  showPenalty = false,
  className = "",
}) => {
  const config = WOUND_CONFIG[type];
  const tooltipText = showPenalty
    ? `${type}: ${config.penalty}`
    : `${type}: ${count}`;

  return (
    <div
      className={`wound-badge wound-badge--${type} ${className}`}
      title={tooltipText}
      style={{ borderColor: config.color } as React.CSSProperties}
    >
      <span className="wound-badge__icon">{config.icon}</span>
      <span className="wound-badge__count war-text-mono">×{count}</span>
    </div>
  );
};

export default WoundDisplay;
