/**
 * Combat V2 - Hex Grid Component
 *
 * SVG-based hex grid using Honeycomb library for coordinate calculations.
 * Supports selection, movement highlighting, and entity markers.
 */

import React, { useMemo, useCallback, useEffect, useRef, useState } from "react";
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
  /** Called when a draggable entity is dropped on a hex */
  onEntityDrop?: (entityId: string, position: HexPosition) => void;
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

function roundAxial(q: number, r: number): HexPosition {
  const x = q;
  const z = r;
  const y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}

function pixelToAxial(x: number, y: number, size: number): HexPosition {
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
  const r = ((2 / 3) * y) / size;
  return roundAxial(q, r);
}

function isWithinBounds(position: HexPosition, width: number, height: number): boolean {
  return position.q >= 0 && position.r >= 0 && position.q < width && position.r < height;
}

function getSvgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number
): { x: number; y: number } | null {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const transformed = point.matrixTransform(matrix.inverse());
  return { x: transformed.x, y: transformed.y };
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
  onEntityDrop,
  className = "",
}: HexGridProps) {
  const { state, canControlEntity } = useCombat();
  const { entities, hexPositions, selectedEntityId, currentEntityId } = state;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<{
    entityId: string;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const dragHoverRef = useRef<HexPosition | null>(null);
  const suppressClickRef = useRef(false);
  const [dragHoverHex, setDragHoverHex] = useState<HexPosition | null>(null);

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
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onEntityClick?.(entityId);
    },
    [onEntityClick]
  );

  const canDragEntity = useCallback((entityId: string) => {
    return !!onEntityDrop && canControlEntity(entityId);
  }, [canControlEntity, onEntityDrop]);

  const updateDragHover = useCallback((next: HexPosition | null) => {
    const current = dragHoverRef.current;
    if (current && next && current.q === next.q && current.r === next.r) {
      return;
    }
    if (!current && !next) {
      return;
    }
    dragHoverRef.current = next;
    setDragHoverHex(next);
    onHexHover?.(next);
  }, [onHexHover]);

  const handleEntityPointerDown = useCallback((entityId: string, event: React.PointerEvent<SVGGElement>) => {
    if (event.button !== 0) return;
    if (!canDragEntity(entityId)) return;
    event.stopPropagation();
    event.preventDefault();
    dragStateRef.current = {
      entityId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
  }, [canDragEntity]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.dragging) {
        if (Math.hypot(dx, dy) < 6) {
          return;
        }
        drag.dragging = true;
        suppressClickRef.current = true;
      }

      const svg = svgRef.current;
      if (!svg) return;
      const point = getSvgPoint(svg, event.clientX, event.clientY);
      if (!point) return;

      const hex = pixelToAxial(point.x, point.y, HEX_SIZE);
      if (!isWithinBounds(hex, width, height)) {
        updateDragHover(null);
        return;
      }

      updateDragHover(hex);
    };

    const finalizeDrag = () => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const wasDragging = drag.dragging;
      const entityId = drag.entityId;
      dragStateRef.current = null;

      if (!wasDragging) {
        return;
      }

      const target = dragHoverRef.current;
      updateDragHover(null);
      if (target && onEntityDrop) {
        onEntityDrop(entityId, target);
      }

      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finalizeDrag);
    window.addEventListener("pointercancel", finalizeDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finalizeDrag);
      window.removeEventListener("pointercancel", finalizeDrag);
    };
  }, [onEntityDrop, updateDragHover, width, height]);

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
      const isDragTarget = !!dragHoverHex && dragHoverHex.q === hex.q && dragHoverHex.r === hex.r;
      const isSelected = selectedEntityId && entityId === selectedEntityId;
      const isCurrentTurn = entityId === currentEntityId;
      const isControlled = entityId ? canControlEntity(entityId) : false;
      const isDraggable = entityId ? canDragEntity(entityId) : false;

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
            isDragTarget={isDragTarget}
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
              onPointerDown={isDraggable ? (e) => handleEntityPointerDown(entity.id, e) : undefined}
              isDraggable={isDraggable}
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
    dragHoverHex,
    selectedEntityId,
    currentEntityId,
    canControlEntity,
    canDragEntity,
    handleHexClick,
    handleHexHover,
    handleEntityClick,
    handleEntityPointerDown,
  ]);

  return (
    <div className={`relative overflow-auto ${className}`}>
      <svg
        ref={svgRef}
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
