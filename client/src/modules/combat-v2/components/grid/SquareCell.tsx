/**
 * Combat V2 - Square Cell Component
 *
 * Individual square cell with terrain styling and state indicators.
 */

import React from "react";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SquareCellProps {
  /** Size of the square cell */
  size: number;
  /** Terrain type for styling */
  terrainType?: string;
  /** Whether this cell is a valid movement target */
  isMovementTarget?: boolean;
  /** Whether this cell is a valid attack target */
  isAttackTarget?: boolean;
  /** Whether this cell is part of the current movement path */
  isPathCell?: boolean;
  /** Whether this cell is the current drag target */
  isDragTarget?: boolean;
  /** Whether an entity on this cell is selected */
  isSelected?: boolean;
  /** Whether this cell contains the current turn entity */
  isCurrentTurn?: boolean;
  /** Whether this cell is occupied by an entity */
  isOccupied?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// TERRAIN COLORS (Dark Fantasy Theme)
// ═══════════════════════════════════════════════════════════════════════════

const TERRAIN_COLORS: Record<string, { fill: string; stroke: string }> = {
  normal: {
    fill: "rgba(51, 65, 85, 0.6)", // slate-700 with transparency
    stroke: "rgba(100, 116, 139, 0.8)", // slate-500
  },
  difficult: {
    fill: "rgba(120, 53, 15, 0.7)", // amber-900
    stroke: "rgba(180, 83, 9, 0.8)", // amber-700
  },
  hazard: {
    fill: "rgba(127, 29, 29, 0.7)", // red-900
    stroke: "rgba(185, 28, 28, 0.8)", // red-700
  },
  water: {
    fill: "rgba(30, 58, 138, 0.7)", // blue-900
    stroke: "rgba(59, 130, 246, 0.8)", // blue-500
  },
  impassable: {
    fill: "rgba(17, 24, 39, 0.9)", // gray-900
    stroke: "rgba(55, 65, 81, 0.8)", // gray-700
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function SquareCell({
  size,
  terrainType = "normal",
  isMovementTarget = false,
  isAttackTarget = false,
  isPathCell = false,
  isDragTarget = false,
  isSelected = false,
  isCurrentTurn = false,
  isOccupied = false,
}: SquareCellProps) {
  // Get base terrain colors
  const terrain = TERRAIN_COLORS[terrainType] || TERRAIN_COLORS.normal;

  // Determine fill color based on state
  let fillColor = terrain.fill;
  let strokeColor = terrain.stroke;
  let strokeWidth = 1;

  if (isSelected) {
    strokeColor = "rgba(250, 204, 21, 0.9)"; // yellow-400
    strokeWidth = 3;
  } else if (isCurrentTurn) {
    strokeColor = "rgba(34, 197, 94, 0.9)"; // green-500
    strokeWidth = 2;
  }

  if (isMovementTarget && !isOccupied) {
    fillColor = "rgba(59, 130, 246, 0.4)"; // blue-500 with transparency
    if (!isSelected) {
      strokeColor = "rgba(59, 130, 246, 0.7)";
    }
  }

  if (isAttackTarget) {
    fillColor = "rgba(239, 68, 68, 0.4)"; // red-500 with transparency
    if (!isSelected) {
      strokeColor = "rgba(239, 68, 68, 0.7)";
    }
  }

  if (isPathCell) {
    fillColor = "rgba(34, 197, 94, 0.5)"; // green-500 with transparency
  }

  if (isDragTarget && !isSelected) {
    strokeColor = "rgba(59, 130, 246, 0.9)"; // blue-500
    strokeWidth = 2;
    if (!isMovementTarget && !isAttackTarget && !isPathCell) {
      fillColor = "rgba(59, 130, 246, 0.2)";
    }
  }

  return (
    <g className="square-cell">
      {/* Base square */}
      <rect
        x="0"
        y="0"
        width={size}
        height={size}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        className="transition-colors duration-150 hover:brightness-110"
      />

      {/* Hazard indicator */}
      {terrainType === "hazard" && (
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-xs fill-red-400 font-bold pointer-events-none select-none"
          style={{ fontSize: "12px" }}
        >
          ⚠
        </text>
      )}

      {/* Impassable indicator */}
      {terrainType === "impassable" && (
        <>
          <line
            x1="0"
            y1="0"
            x2={size}
            y2={size}
            stroke="rgba(127, 29, 29, 0.8)"
            strokeWidth="2"
            className="pointer-events-none"
          />
          <line
            x1={size}
            y1="0"
            x2="0"
            y2={size}
            stroke="rgba(127, 29, 29, 0.8)"
            strokeWidth="2"
            className="pointer-events-none"
          />
        </>
      )}
    </g>
  );
}

export default SquareCell;
