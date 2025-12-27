/**
 * Combat V2 - Square Grid Component
 *
 * SVG-based square grid with optional background image support.
 * Supports selection, movement highlighting, and entity markers.
 */

import React, { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { useCombat } from "../../context/CombatProvider";
import { SquareCell, type SquareCellProps } from "./SquareCell";
import { EntityMarker } from "./EntityMarker";
import type { GridPosition, CombatV2Entity, GridConfig, MapConfig } from "../../../../api/combatV2Socket";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SquareGridProps {
  /** Grid configuration (rows, cols, cell size, offsets) */
  gridConfig: GridConfig;
  /** Optional background map image */
  mapConfig?: MapConfig;
  /** Terrain data for cells */
  terrain?: Record<string, { type: string; movementCost: number }>;
  /** Cells highlighted as valid movement targets */
  movementRange?: Set<string>;
  /** Cells highlighted as valid attack targets */
  attackRange?: Set<string>;
  /** Currently hovered cell path for movement preview */
  movementPath?: GridPosition[];
  /** Called when a cell is clicked */
  onCellClick?: (position: GridPosition) => void;
  /** Called when a cell is hovered */
  onCellHover?: (position: GridPosition | null) => void;
  /** Called when an entity is clicked */
  onEntityClick?: (entityId: string) => void;
  /** Called when a draggable entity is dropped on a cell */
  onEntityDrop?: (entityId: string, position: GridPosition) => void;
  /** Additional CSS class */
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function parseCellKey(key: string): GridPosition {
  const [row, col] = key.split(",").map(Number);
  return { row, col };
}

/**
 * Convert grid coordinates to pixel position.
 */
function gridToPixel(row: number, col: number, cellSize: number, offsetX: number, offsetY: number): { x: number; y: number } {
  return {
    x: col * cellSize + offsetX,
    y: row * cellSize + offsetY,
  };
}

/**
 * Convert pixel position to grid coordinates.
 */
function pixelToGrid(x: number, y: number, cellSize: number, offsetX: number, offsetY: number): GridPosition {
  const col = Math.floor((x - offsetX) / cellSize);
  const row = Math.floor((y - offsetY) / cellSize);
  return { row, col };
}

/**
 * Calculate Manhattan distance between two grid positions.
 */
function gridDistance(from: GridPosition, to: GridPosition): number {
  return Math.abs(from.row - to.row) + Math.abs(from.col - to.col);
}

/**
 * Check if position is within grid bounds.
 */
function isWithinBounds(position: GridPosition, rows: number, cols: number): boolean {
  return position.row >= 0 && position.col >= 0 && position.row < rows && position.col < cols;
}

/**
 * Get SVG point from client coordinates.
 */
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

export function SquareGrid({
  gridConfig,
  mapConfig,
  terrain = {},
  movementRange,
  attackRange,
  movementPath,
  onCellClick,
  onCellHover,
  onEntityClick,
  onEntityDrop,
  className = "",
}: SquareGridProps) {
  const { state, canControlEntity } = useCombat();
  const { entities, gridPositions, selectedEntityId, currentEntityId } = state;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<{
    entityId: string;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const dragHoverRef = useRef<GridPosition | null>(null);
  const suppressClickRef = useRef(false);
  const [dragHoverCell, setDragHoverCell] = useState<GridPosition | null>(null);

  const { rows, cols, cellSize, offsetX, offsetY, visible, opacity } = gridConfig;

  // Calculate SVG viewBox
  const viewBox = useMemo(() => {
    const padding = cellSize * 2;
    const gridWidth = cols * cellSize;
    const gridHeight = rows * cellSize;

    // If there's a map image, expand viewBox to fit it
    if (mapConfig?.imageUrl && mapConfig.imageWidth && mapConfig.imageHeight) {
      const totalWidth = Math.max(gridWidth + offsetX, mapConfig.imageWidth);
      const totalHeight = Math.max(gridHeight + offsetY, mapConfig.imageHeight);
      return `-${padding} -${padding} ${totalWidth + padding * 2} ${totalHeight + padding * 2}`;
    }

    return `-${padding} -${padding} ${gridWidth + padding * 2} ${gridHeight + padding * 2}`;
  }, [rows, cols, cellSize, offsetX, offsetY, mapConfig]);

  // Create path string for movement preview
  const movementPathString = useMemo(() => {
    if (!movementPath || movementPath.length < 2) return null;

    const points = movementPath.map((pos) => {
      const pixel = gridToPixel(pos.row, pos.col, cellSize, offsetX, offsetY);
      // Center the path in the cell
      return `${pixel.x + cellSize / 2},${pixel.y + cellSize / 2}`;
    });

    return `M ${points.join(" L ")}`;
  }, [movementPath, cellSize, offsetX, offsetY]);

  // Handle cell click
  const handleCellClick = useCallback(
    (row: number, col: number) => {
      onCellClick?.({ row, col });
    },
    [onCellClick]
  );

  // Handle cell hover
  const handleCellHover = useCallback(
    (row: number, col: number, isEnter: boolean) => {
      onCellHover?.(isEnter ? { row, col } : null);
    },
    [onCellHover]
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

  const updateDragHover = useCallback((next: GridPosition | null) => {
    const current = dragHoverRef.current;
    if (current && next && current.row === next.row && current.col === next.col) {
      return;
    }
    if (!current && !next) {
      return;
    }
    dragHoverRef.current = next;
    setDragHoverCell(next);
    onCellHover?.(next);
  }, [onCellHover]);

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

      const cell = pixelToGrid(point.x, point.y, cellSize, offsetX, offsetY);
      if (!isWithinBounds(cell, rows, cols)) {
        updateDragHover(null);
        return;
      }

      updateDragHover(cell);
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
  }, [onEntityDrop, updateDragHover, rows, cols, cellSize, offsetX, offsetY]);

  // Build entity position lookup
  const entityPositionLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const [entityId, pos] of Object.entries(gridPositions)) {
      lookup.set(cellKey(pos.row, pos.col), entityId);
    }
    return lookup;
  }, [gridPositions]);

  // Render grid cells
  const gridCells = useMemo(() => {
    const cells: React.ReactNode[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const key = cellKey(row, col);
        const pixel = gridToPixel(row, col, cellSize, offsetX, offsetY);
        const terrainData = terrain[key];
        const entityId = entityPositionLookup.get(key);
        const entity = entityId ? entities[entityId] : undefined;

        // Determine cell state
        const isMovementTarget = movementRange?.has(key) ?? false;
        const isAttackTarget = attackRange?.has(key) ?? false;
        const isPathCell = movementPath?.some((p) => p.row === row && p.col === col) ?? false;
        const isDragTarget = !!dragHoverCell && dragHoverCell.row === row && dragHoverCell.col === col;
        const isSelected = selectedEntityId && entityId === selectedEntityId;
        const isCurrentTurn = entityId === currentEntityId;
        const isControlled = entityId ? canControlEntity(entityId) : false;
        const isDraggable = entityId ? canDragEntity(entityId) : false;

        cells.push(
          <g
            key={key}
            transform={`translate(${pixel.x}, ${pixel.y})`}
            onClick={() => handleCellClick(row, col)}
            onMouseEnter={() => handleCellHover(row, col, true)}
            onMouseLeave={() => handleCellHover(row, col, false)}
            className="cursor-pointer"
          >
            <SquareCell
              size={cellSize}
              terrainType={terrainData?.type}
              isMovementTarget={isMovementTarget}
              isAttackTarget={isAttackTarget}
              isPathCell={isPathCell}
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
    }

    return cells;
  }, [
    rows,
    cols,
    cellSize,
    offsetX,
    offsetY,
    terrain,
    entityPositionLookup,
    entities,
    movementRange,
    attackRange,
    movementPath,
    dragHoverCell,
    selectedEntityId,
    currentEntityId,
    canControlEntity,
    canDragEntity,
    handleCellClick,
    handleCellHover,
    handleEntityClick,
    handleEntityPointerDown,
  ]);

  // Render grid lines
  const gridLines = useMemo(() => {
    if (!visible) return null;

    const lines: React.ReactNode[] = [];

    // Vertical lines
    for (let col = 0; col <= cols; col++) {
      const x = col * cellSize + offsetX;
      lines.push(
        <line
          key={`v-${col}`}
          x1={x}
          y1={offsetY}
          x2={x}
          y2={rows * cellSize + offsetY}
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth="1"
          opacity={opacity}
        />
      );
    }

    // Horizontal lines
    for (let row = 0; row <= rows; row++) {
      const y = row * cellSize + offsetY;
      lines.push(
        <line
          key={`h-${row}`}
          x1={offsetX}
          y1={y}
          x2={cols * cellSize + offsetX}
          y2={y}
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth="1"
          opacity={opacity}
        />
      );
    }

    return lines;
  }, [rows, cols, cellSize, offsetX, offsetY, visible, opacity]);

  return (
    <div className={`relative overflow-auto ${className}`}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-full min-w-[800px] min-h-[600px]"
        style={{ background: "transparent" }}
      >
        {/* Background map image */}
        {mapConfig?.imageUrl && (
          <image
            href={mapConfig.imageUrl}
            x="0"
            y="0"
            width={mapConfig.imageWidth || undefined}
            height={mapConfig.imageHeight || undefined}
            preserveAspectRatio="xMidYMid meet"
          />
        )}

        {/* Grid cells */}
        <g className="grid-cells">{gridCells}</g>

        {/* Grid lines overlay */}
        {gridLines && <g className="grid-lines">{gridLines}</g>}

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
      </svg>
    </div>
  );
}

export default SquareGrid;
