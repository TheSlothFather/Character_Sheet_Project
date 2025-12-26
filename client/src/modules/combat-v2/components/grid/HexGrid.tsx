/**
 * Combat V2 - Hex Grid Component
 *
 * SVG-based hex grid using Honeycomb library for coordinate calculations.
 * Supports selection, movement highlighting, and entity markers.
 */

import React, { useMemo, useCallback } from "react";
import { defineHex, Grid, Orientation, rectangle } from "honeycomb-grid";
import { useCombat } from "../../context/CombatProvider";
import { HexCell, type HexCellProps } from "./HexCell";
import { EntityMarker } from "./EntityMarker";
import type { HexPosition, CombatV2Entity } from "../../../../api/combatV2Socket";

// ═══════════════════════════════════════════════════════════════════════════
// HEX CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const HEX_SIZE = 40; // Pixel size for rendering
const HEX_SPACING = 2; // Gap between hexes

// Define the hex class with Honeycomb
const CombatHex = defineHex({
  dimensions: HEX_SIZE,
  orientation: Orientation.POINTY,
  origin: "topLeft",
});

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface HexGridProps {
  /** Grid width in hexes */
  width?: number;
  /** Grid height in hexes */
  height?: number;
  /** Terrain data for hexes */
  terrain?: Record<string, { type: string; movementCost: number }>;
  /** Hexes highlighted as valid movement targets */
  movementRange?: Set<string>;
  /** Hexes highlighted as valid attack targets */
  attackRange?: Set<string>;
  /** Currently hovered hex path for movement preview */
  movementPath?: HexPosition[];
  /** Called when a hex is clicked */
  onHexClick?: (position: HexPosition) => void;
  /** Called when a hex is hovered */
  onHexHover?: (position: HexPosition | null) => void;
  /** Called when an entity is clicked */
  onEntityClick?: (entityId: string) => void;
  /** Additional CSS class */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

function parseHexKey(key: string): HexPosition {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

/**
 * Calculate the points for a pointy-top hexagon SVG polygon.
 */
function getHexPoints(size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    // Pointy-top: start at 30 degrees
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = size * Math.cos(angle);
    const y = size * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return points.join(" ");
}

/**
 * Convert axial coordinates to pixel position for pointy-top hex.
 */
function axialToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * ((3 / 2) * r);
  return { x, y };
}

/**
 * Calculate axial distance between two hex positions.
 */
function axialDistance(from: HexPosition, to: HexPosition): number {
  return (
    (Math.abs(from.q - to.q) +
      Math.abs(from.q + from.r - to.q - to.r) +
      Math.abs(from.r - to.r)) /
    2
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function HexGrid({
  width = 15,
  height = 10,
  terrain = {},
  movementRange,
  attackRange,
  movementPath,
  onHexClick,
  onHexHover,
  onEntityClick,
  className = "",
}: HexGridProps) {
  const { state, getEntity, getEntityPosition, canControlEntity } = useCombat();
  const { entities, hexPositions, selectedEntityId, currentEntityId } = state;

  // Create Honeycomb grid for coordinate calculations
  const grid = useMemo(() => {
    return new Grid(CombatHex, rectangle({ width, height }));
  }, [width, height]);

  // Pre-calculate hex points for the polygon
  const hexPoints = useMemo(() => getHexPoints(HEX_SIZE), []);

  // Calculate SVG viewBox
  const viewBox = useMemo(() => {
    const padding = HEX_SIZE * 2;
    const gridWidth = HEX_SIZE * Math.sqrt(3) * width + HEX_SIZE;
    const gridHeight = HEX_SIZE * 1.5 * height + HEX_SIZE;
    return `-${padding} -${padding} ${gridWidth + padding * 2} ${gridHeight + padding * 2}`;
  }, [width, height]);

  // Create path string for movement preview
  const movementPathString = useMemo(() => {
    if (!movementPath || movementPath.length < 2) return null;

    const points = movementPath.map((pos) => {
      const pixel = axialToPixel(pos.q, pos.r, HEX_SIZE);
      return `${pixel.x},${pixel.y}`;
    });

    return `M ${points.join(" L ")}`;
  }, [movementPath]);

  // Handle hex click
  const handleHexClick = useCallback(
    (q: number, r: number) => {
      onHexClick?.({ q, r });
    },
    [onHexClick]
  );

  // Handle hex hover
  const handleHexHover = useCallback(
    (q: number, r: number, isEnter: boolean) => {
      onHexHover?.(isEnter ? { q, r } : null);
    },
    [onHexHover]
  );

  // Handle entity click
  const handleEntityClick = useCallback(
    (entityId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onEntityClick?.(entityId);
    },
    [onEntityClick]
  );

  // Build entity position lookup
  const entityPositionLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const [entityId, pos] of Object.entries(hexPositions)) {
      lookup.set(hexKey(pos.q, pos.r), entityId);
    }
    return lookup;
  }, [hexPositions]);

  // Render hexes
  const hexCells = useMemo(() => {
    const cells: React.ReactNode[] = [];

    for (const hex of grid) {
      const key = hexKey(hex.q, hex.r);
      const pixel = axialToPixel(hex.q, hex.r, HEX_SIZE);
      const terrainData = terrain[key];
      const entityId = entityPositionLookup.get(key);
      const entity = entityId ? entities[entityId] : undefined;

      // Determine hex state
      const isMovementTarget = movementRange?.has(key) ?? false;
      const isAttackTarget = attackRange?.has(key) ?? false;
      const isPathHex = movementPath?.some((p) => p.q === hex.q && p.r === hex.r) ?? false;
      const isSelected = selectedEntityId && entityId === selectedEntityId;
      const isCurrentTurn = entityId === currentEntityId;
      const isControlled = entityId ? canControlEntity(entityId) : false;

      cells.push(
        <g
          key={key}
          transform={`translate(${pixel.x}, ${pixel.y})`}
          onClick={() => handleHexClick(hex.q, hex.r)}
          onMouseEnter={() => handleHexHover(hex.q, hex.r, true)}
          onMouseLeave={() => handleHexHover(hex.q, hex.r, false)}
          className="cursor-pointer"
        >
          <HexCell
            points={hexPoints}
            terrainType={terrainData?.type}
            isMovementTarget={isMovementTarget}
            isAttackTarget={isAttackTarget}
            isPathHex={isPathHex}
            isSelected={!!isSelected}
            isCurrentTurn={!!isCurrentTurn}
            isOccupied={!!entityId}
          />
          {entity && (
            <EntityMarker
              entity={entity}
              isSelected={!!isSelected}
              isCurrentTurn={!!isCurrentTurn}
              isControlled={isControlled}
              onClick={(e) => handleEntityClick(entity.id, e)}
            />
          )}
        </g>
      );
    }

    return cells;
  }, [
    grid,
    hexPoints,
    terrain,
    entityPositionLookup,
    entities,
    movementRange,
    attackRange,
    movementPath,
    selectedEntityId,
    currentEntityId,
    canControlEntity,
    handleHexClick,
    handleHexHover,
    handleEntityClick,
  ]);

  return (
    <div className={`relative overflow-auto ${className}`}>
      <svg
        viewBox={viewBox}
        className="w-full h-full min-w-[800px] min-h-[600px]"
        style={{ background: "transparent" }}
      >
        {/* Grid background */}
        <defs>
          <pattern
            id="hex-grid-pattern"
            width={HEX_SIZE * Math.sqrt(3)}
            height={HEX_SIZE * 3}
            patternUnits="userSpaceOnUse"
          >
            <rect width="100%" height="100%" fill="transparent" />
          </pattern>
        </defs>

        {/* Movement path preview */}
        {movementPathString && (
          <path
            d={movementPathString}
            fill="none"
            stroke="var(--color-primary, #3b82f6)"
            strokeWidth="3"
            strokeDasharray="8 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.7"
          />
        )}

        {/* Hex cells and entities */}
        <g className="hex-grid">{hexCells}</g>
      </svg>
    </div>
  );
}

export default HexGrid;
