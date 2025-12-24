/**
 * StatusPill Component
 *
 * Pill-shaped status effect badges with buff/debuff/neutral styling.
 * Shows stacks and duration with tooltips.
 */

import React from "react";
import type { CombatStatusEffect, StatusKey } from "@shared/rules/combat";
import "./WarChronicle.css";

export interface StatusPillProps {
  status: CombatStatusEffect;
  size?: "sm" | "md" | "lg";
  showDuration?: boolean;
  onClick?: () => void;
  className?: string;
}

// Status classification
const STATUS_TYPES: Record<StatusKey, "buff" | "debuff" | "neutral"> = {
  BLESSED: "buff",
  HASTENED: "buff",
  BLINDED: "debuff",
  BURNING: "debuff",
  CHARMED: "debuff",
  CRUSHING: "debuff",
  CURSED: "debuff",
  DAZED: "debuff",
  DEAFENED: "debuff",
  ENRAGED: "neutral",
  FREEZING: "debuff",
  INTOXICATED: "debuff",
  BLEEDING: "debuff",
  PRONE: "debuff",
  RENDED: "debuff",
  ROTTING: "debuff",
  SLOWED: "debuff",
  STUPIFICATION: "debuff",
  SUFFOCATING: "debuff",
  UNCONSCIOUS: "debuff",
};

// Status descriptions
const STATUS_DESCRIPTIONS: Partial<Record<StatusKey, string>> = {
  BLESSED: "Improved saving throws and healing received",
  HASTENED: "Increased movement and action speed",
  BLINDED: "Cannot see, disadvantage on attacks",
  BURNING: "Takes burn damage each round",
  CHARMED: "Friendly towards source, won't attack",
  CRUSHING: "Takes blunt damage each round",
  CURSED: "Disadvantage on attacks and saves",
  DAZED: "Reduced actions and reactions",
  DEAFENED: "Cannot hear, may miss sound-based cues",
  ENRAGED: "Bonus damage but reckless attacks",
  FREEZING: "Takes freeze damage each round",
  INTOXICATED: "Impaired judgment and coordination",
  BLEEDING: "Takes laceration damage each round",
  PRONE: "Lying down, disadvantage on attacks",
  RENDED: "Takes spiritual damage each round",
  ROTTING: "Takes necrosis damage each round",
  SLOWED: "Reduced movement speed",
  STUPIFICATION: "Takes mental damage each round",
  SUFFOCATING: "Cannot breathe, taking damage",
  UNCONSCIOUS: "Helpless, cannot take actions",
};

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  size = "md",
  showDuration = true,
  onClick,
  className = "",
}) => {
  const statusType = STATUS_TYPES[status.key] || "neutral";
  const description = STATUS_DESCRIPTIONS[status.key] || "";

  const tooltipText = [
    status.key,
    status.stacks > 1 && `×${status.stacks} stacks`,
    status.duration && `${status.duration} round${status.duration !== 1 ? "s" : ""} remaining`,
    description,
  ]
    .filter(Boolean)
    .join(" • ");

  const pillClasses = [
    "status-pill",
    `status-pill--${statusType}`,
    `status-pill--${size}`,
    onClick && "status-pill--clickable",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={pillClasses}
      title={tooltipText}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      <span className="status-pill__name">{status.key}</span>

      {status.stacks > 1 && (
        <span className="status-pill__stacks war-text-mono">
          ×{status.stacks}
        </span>
      )}

      {showDuration && status.duration !== null && (
        <span className="status-pill__duration war-text-mono">
          {status.duration}r
        </span>
      )}
    </div>
  );
};

// Status list container
export interface StatusListProps {
  effects: CombatStatusEffect[];
  size?: "sm" | "md" | "lg";
  showDuration?: boolean;
  onStatusClick?: (status: CombatStatusEffect) => void;
  className?: string;
}

export const StatusList: React.FC<StatusListProps> = ({
  effects,
  size = "md",
  showDuration = true,
  onStatusClick,
  className = "",
}) => {
  if (effects.length === 0) {
    return null;
  }

  return (
    <div className={`status-list ${className}`}>
      {effects.map((effect, index) => (
        <StatusPill
          key={`${effect.key}-${index}`}
          status={effect}
          size={size}
          showDuration={showDuration}
          onClick={onStatusClick ? () => onStatusClick(effect) : undefined}
        />
      ))}
    </div>
  );
};

export default StatusPill;
