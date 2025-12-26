/**
 * Combat V2 - Entity Marker Component
 *
 * Visual representation of an entity on the hex grid.
 * Shows faction color, health bar, status indicators.
 */

import React from "react";
import type { CombatV2Entity } from "../../../../api/combatV2Socket";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface EntityMarkerProps {
  entity: CombatV2Entity;
  isSelected?: boolean;
  isCurrentTurn?: boolean;
  isControlled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTION COLORS (Dark Fantasy Theme)
// ═══════════════════════════════════════════════════════════════════════════

const FACTION_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  ally: {
    fill: "rgba(34, 197, 94, 0.9)", // green-500
    stroke: "rgba(22, 163, 74, 1)", // green-600
    text: "#ffffff",
  },
  enemy: {
    fill: "rgba(239, 68, 68, 0.9)", // red-500
    stroke: "rgba(220, 38, 38, 1)", // red-600
    text: "#ffffff",
  },
  neutral: {
    fill: "rgba(234, 179, 8, 0.9)", // yellow-500
    stroke: "rgba(202, 138, 4, 1)", // yellow-600
    text: "#000000",
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// TIER SIZES
// ═══════════════════════════════════════════════════════════════════════════

const TIER_SIZES = {
  minion: 14,
  full: 18,
  lieutenant: 22,
  hero: 26,
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function EntityMarker({
  entity,
  isSelected = false,
  isCurrentTurn = false,
  isControlled = false,
  onClick,
}: EntityMarkerProps) {
  const colors = FACTION_COLORS[entity.faction] || FACTION_COLORS.ally;
  const size = TIER_SIZES[entity.tier] || TIER_SIZES.full;

  // Calculate health percentage
  const healthPercent = entity.energy
    ? Math.max(0, Math.min(100, (entity.energy.current / entity.energy.max) * 100))
    : 100;

  // Calculate AP percentage (for full entities)
  const apPercent = entity.ap
    ? Math.max(0, Math.min(100, (entity.ap.current / entity.ap.max) * 100))
    : 100;

  // Get first letter of name for display
  const initial = (entity.displayName || entity.name).charAt(0).toUpperCase();

  // Status indicators
  const isUnconscious = entity.unconscious;
  const isDead = entity.alive === false;
  const isChanneling = !!entity.channeling;

  // Get total wound count
  const totalWounds = entity.wounds
    ? Object.values(entity.wounds).reduce((sum, count) => sum + (count || 0), 0)
    : 0;

  return (
    <g
      className={`entity-marker cursor-pointer transition-transform duration-150 ${
        isControlled ? "hover:scale-110" : ""
      }`}
      onClick={onClick}
    >
      {/* Selection ring */}
      {isSelected && (
        <circle
          r={size + 6}
          fill="none"
          stroke="rgba(250, 204, 21, 0.9)"
          strokeWidth="3"
          strokeDasharray="4 2"
          className="animate-pulse"
        />
      )}

      {/* Current turn indicator */}
      {isCurrentTurn && !isSelected && (
        <circle
          r={size + 4}
          fill="none"
          stroke="rgba(34, 197, 94, 0.8)"
          strokeWidth="2"
        />
      )}

      {/* Main entity circle */}
      <circle
        r={size}
        fill={isDead ? "rgba(55, 65, 81, 0.9)" : colors.fill}
        stroke={isDead ? "rgba(31, 41, 55, 1)" : colors.stroke}
        strokeWidth="2"
        opacity={isUnconscious ? 0.5 : 1}
      />

      {/* Entity initial */}
      <text
        x="0"
        y="1"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={colors.text}
        className="font-bold pointer-events-none select-none"
        style={{ fontSize: `${size * 0.8}px` }}
        opacity={isDead ? 0.5 : 1}
      >
        {isDead ? "☠" : initial}
      </text>

      {/* Health bar (for full entities) */}
      {entity.tier !== "minion" && !isDead && (
        <g transform={`translate(-${size}, ${size + 4})`}>
          {/* Background */}
          <rect
            width={size * 2}
            height="4"
            fill="rgba(31, 41, 55, 0.8)"
            rx="2"
          />
          {/* Health fill */}
          <rect
            width={(size * 2 * healthPercent) / 100}
            height="4"
            fill={
              healthPercent > 50
                ? "rgba(34, 197, 94, 0.9)"
                : healthPercent > 25
                ? "rgba(250, 204, 21, 0.9)"
                : "rgba(239, 68, 68, 0.9)"
            }
            rx="2"
          />
        </g>
      )}

      {/* AP indicator (small dots) */}
      {entity.tier !== "minion" && entity.ap && !isDead && (
        <g transform={`translate(-${size}, ${size + 10})`}>
          {Array.from({ length: Math.min(entity.ap.max, 10) }).map((_, i) => (
            <circle
              key={i}
              cx={3 + i * 4}
              cy="2"
              r="1.5"
              fill={
                i < entity.ap!.current
                  ? "rgba(96, 165, 250, 0.9)" // blue-400
                  : "rgba(55, 65, 81, 0.6)" // gray-700
              }
            />
          ))}
        </g>
      )}

      {/* Channeling indicator */}
      {isChanneling && (
        <g transform={`translate(${size - 4}, -${size - 4})`}>
          <circle
            r="6"
            fill="rgba(168, 85, 247, 0.9)" // purple-500
            stroke="rgba(147, 51, 234, 1)" // purple-600
            strokeWidth="1"
          />
          <text
            x="0"
            y="1"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#ffffff"
            style={{ fontSize: "8px" }}
            className="font-bold pointer-events-none select-none"
          >
            ✦
          </text>
        </g>
      )}

      {/* Wound indicator */}
      {totalWounds > 0 && !isDead && (
        <g transform={`translate(-${size - 4}, -${size - 4})`}>
          <circle
            r="6"
            fill="rgba(185, 28, 28, 0.9)" // red-700
            stroke="rgba(127, 29, 29, 1)" // red-900
            strokeWidth="1"
          />
          <text
            x="0"
            y="1"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#ffffff"
            style={{ fontSize: "8px" }}
            className="font-bold pointer-events-none select-none"
          >
            {totalWounds > 9 ? "9+" : totalWounds}
          </text>
        </g>
      )}

      {/* Unconscious indicator */}
      {isUnconscious && !isDead && (
        <g transform={`translate(0, -${size + 8})`}>
          <text
            x="0"
            y="0"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(250, 204, 21, 0.9)"
            style={{ fontSize: "12px" }}
            className="pointer-events-none select-none"
          >
            💤
          </text>
        </g>
      )}

      {/* Controlled indicator (small diamond) */}
      {isControlled && !isDead && (
        <polygon
          points="0,-3 3,0 0,3 -3,0"
          fill="rgba(96, 165, 250, 0.9)"
          stroke="rgba(59, 130, 246, 1)"
          strokeWidth="0.5"
          transform={`translate(${size - 2}, ${size - 2})`}
        />
      )}
    </g>
  );
}

export default EntityMarker;
