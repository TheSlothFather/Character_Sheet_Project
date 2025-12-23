/**
 * StatusEffectBadge Component
 *
 * Displays a status effect with stacks and duration.
 */

import React from "react";
import type { CombatStatusEffect, StatusKey } from "@shared/rules/combat";
import "./Combat.css";

export type StatusType = "buff" | "debuff" | "neutral";

export interface StatusEffectBadgeProps {
  status: CombatStatusEffect;
  type?: StatusType;
  onRemove?: () => void;
  className?: string;
}

// Map common status keys to their types
const STATUS_TYPES: Record<string, StatusType> = {
  // Buffs
  haste: "buff",
  fortified: "buff",
  blessed: "buff",
  protected: "buff",
  inspired: "buff",
  regenerating: "buff",
  shielded: "buff",

  // Debuffs
  poisoned: "debuff",
  burning: "debuff",
  bleeding: "debuff",
  stunned: "debuff",
  slowed: "debuff",
  weakened: "debuff",
  cursed: "debuff",
  blinded: "debuff",
  frightened: "debuff",
  paralyzed: "debuff",
  exhausted: "debuff",
  prone: "debuff",
  grappled: "debuff",

  // Neutral
  concentrating: "neutral",
  hidden: "neutral",
  invisible: "neutral",
  flying: "neutral",
};

const getStatusType = (key: StatusKey): StatusType => {
  return STATUS_TYPES[key] ?? "neutral";
};

const formatDuration = (duration: number | null): string | null => {
  if (duration === null) return null;
  if (duration === 1) return "1 rd";
  return `${duration} rds`;
};

const formatStatusName = (key: StatusKey): string => {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

export const StatusEffectBadge: React.FC<StatusEffectBadgeProps> = ({
  status,
  type,
  onRemove,
  className = "",
}) => {
  const statusType = type ?? getStatusType(status.key);
  const duration = formatDuration(status.duration);

  return (
    <span
      className={`status-badge status-badge--${statusType} ${className}`}
      title={`${formatStatusName(status.key)}${status.stacks > 1 ? ` x${status.stacks}` : ""}${duration ? ` (${duration})` : ""}`}
    >
      <span className="status-badge__name">{formatStatusName(status.key)}</span>
      {status.stacks > 1 && (
        <span className="status-badge__stacks">x{status.stacks}</span>
      )}
      {duration && (
        <span className="status-badge__duration">{duration}</span>
      )}
      {onRemove && (
        <button
          type="button"
          className="status-badge__remove"
          onClick={onRemove}
          aria-label="Remove status"
        >
          ×
        </button>
      )}
    </span>
  );
};

// Group of status effects
export interface StatusEffectListProps {
  effects: CombatStatusEffect[];
  onRemove?: (key: StatusKey) => void;
  className?: string;
}

export const StatusEffectList: React.FC<StatusEffectListProps> = ({
  effects,
  onRemove,
  className = "",
}) => {
  if (effects.length === 0) return null;

  return (
    <div className={`cluster cluster--xs ${className}`}>
      {effects.map((effect) => (
        <StatusEffectBadge
          key={effect.key}
          status={effect}
          onRemove={onRemove ? () => onRemove(effect.key) : undefined}
        />
      ))}
    </div>
  );
};
