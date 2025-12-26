/**
 * Combat V2 - Hex Grid System
 *
 * Uses Honeycomb library for hex grid operations.
 * Provides movement validation, pathfinding, and range calculations.
 */

import {
  defineHex,
  Grid,
  Orientation,
  ring,
  spiral,
  line,
  rectangle,
  Direction,
  type Hex,
  type HexCoordinates,
} from "honeycomb-grid";

import type { HexPosition, CombatEntity, FullEntity } from "../types/entity";
import { isFull, calculateMovementPerAP } from "../types/entity";
import type { HexGridState, TerrainType, TerrainHex } from "../types/state";
import { hexKey, parseHexKey } from "../types/state";

// ═══════════════════════════════════════════════════════════════════════════
// COMBAT HEX DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Custom hex class for combat grid.
 * Extends Honeycomb's hex with combat-specific properties.
 */
export class CombatHex extends defineHex({
  dimensions: 30, // Pixel size for rendering
  orientation: Orientation.POINTY,
  origin: "topLeft",
}) {
  /** Entity currently occupying this hex */
  entityId?: string;

  /** Terrain type */
  terrain: TerrainType = "normal";

  /** Movement cost multiplier */
  movementCost: number = 1;

  /** Whether this hex blocks line of sight */
  blocksLOS: boolean = false;

  /** Hazard damage on entry */
  hazardDamage?: number;

  /** Hazard damage type */
  hazardType?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// GRID FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a combat grid from HexGridState.
 */
export function createCombatGrid(state: HexGridState): Grid<CombatHex> {
  const grid = new Grid(CombatHex, rectangle({ width: state.width, height: state.height }));

  // Apply terrain data
  for (const [key, terrainHex] of Object.entries(state.terrain)) {
    const pos = parseHexKey(key);
    const hex = grid.getHex(pos);
    if (hex) {
      hex.terrain = terrainHex.type;
      hex.movementCost = terrainHex.movementCost;
      hex.hazardDamage = terrainHex.hazardDamage;
      hex.hazardType = terrainHex.hazardType;
      hex.blocksLOS = terrainHex.type === "impassable";
    }
  }

  // Apply entity positions
  for (const [key, entityId] of Object.entries(state.entityPositions)) {
    const pos = parseHexKey(key);
    const hex = grid.getHex(pos);
    if (hex) {
      hex.entityId = entityId;
    }
  }

  return grid;
}

/**
 * Create an empty combat grid of given size.
 */
export function createEmptyGrid(width: number, height: number): Grid<CombatHex> {
  return new Grid(CombatHex, rectangle({ width, height }));
}

// ═══════════════════════════════════════════════════════════════════════════
// COORDINATE CONVERSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert HexPosition to Honeycomb coordinates.
 */
export function toHoneycombCoords(pos: HexPosition): HexCoordinates {
  return { q: pos.q, r: pos.r };
}

/**
 * Convert Honeycomb hex to HexPosition.
 */
export function fromHex(hex: Hex): HexPosition {
  return { q: hex.q, r: hex.r };
}

// ═══════════════════════════════════════════════════════════════════════════
// DISTANCE CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate distance between two hex positions.
 * Uses Honeycomb's built-in distance calculation.
 */
export function hexDistance(grid: Grid<CombatHex>, from: HexPosition, to: HexPosition): number {
  return grid.distance(toHoneycombCoords(from), toHoneycombCoords(to), { allowOutside: true });
}

/**
 * Calculate distance without a grid (pure axial calculation).
 */
export function axialDistance(from: HexPosition, to: HexPosition): number {
  return (
    (Math.abs(from.q - to.q) +
      Math.abs(from.q + from.r - to.q - to.r) +
      Math.abs(from.r - to.r)) /
    2
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NEIGHBOR FINDING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all neighbors of a hex position.
 */
export function getNeighbors(grid: Grid<CombatHex>, pos: HexPosition): CombatHex[] {
  const neighbors: CombatHex[] = [];
  const directions = [Direction.N, Direction.NE, Direction.SE, Direction.S, Direction.SW, Direction.NW];

  for (const dir of directions) {
    const neighbor = grid.neighborOf(toHoneycombCoords(pos), dir, { allowOutside: false });
    if (neighbor) {
      neighbors.push(neighbor);
    }
  }

  return neighbors;
}

/**
 * Get neighbor in a specific direction.
 */
export function getNeighborInDirection(
  grid: Grid<CombatHex>,
  pos: HexPosition,
  direction: Direction
): CombatHex | undefined {
  return grid.neighborOf(toHoneycombCoords(pos), direction, { allowOutside: false });
}

// ═══════════════════════════════════════════════════════════════════════════
// RING AND AREA TRAVERSAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all hexes at a specific distance from center.
 */
export function getHexRing(grid: Grid<CombatHex>, center: HexPosition, radius: number): CombatHex[] {
  if (radius === 0) {
    const hex = grid.getHex(toHoneycombCoords(center));
    return hex ? [hex] : [];
  }

  const ringGrid = grid.traverse(ring({ center: toHoneycombCoords(center), radius }));
  return ringGrid.toArray();
}

/**
 * Get all hexes within a certain radius (inclusive).
 */
export function getHexesInRadius(grid: Grid<CombatHex>, center: HexPosition, radius: number): CombatHex[] {
  const spiralGrid = grid.traverse(spiral({ start: toHoneycombCoords(center), radius }));
  return spiralGrid.toArray();
}

/**
 * Get hexes in a line between two positions.
 */
export function getHexLine(grid: Grid<CombatHex>, from: HexPosition, to: HexPosition): CombatHex[] {
  const lineGrid = grid.traverse(line({ start: toHoneycombCoords(from), stop: toHoneycombCoords(to) }));
  return lineGrid.toArray();
}

// ═══════════════════════════════════════════════════════════════════════════
// MOVEMENT RANGE
// ═══════════════════════════════════════════════════════════════════════════

export interface MovementRangeOptions {
  /** Entity's physical attribute (for calculating hexes per AP) */
  physicalAttribute: number;
  /** Available AP for movement */
  availableAP: number;
  /** Entity's faction (for passability) */
  faction: "ally" | "enemy" | "neutral";
  /** Whether to include occupied hexes (for visualization) */
  includeOccupied?: boolean;
}

/**
 * Get all hexes reachable within movement range.
 * Uses BFS to account for terrain costs.
 */
export function getMovementRange(
  grid: Grid<CombatHex>,
  start: HexPosition,
  options: MovementRangeOptions
): Map<string, { hex: CombatHex; apCost: number; path: HexPosition[] }> {
  const hexesPerAP = Math.max(options.physicalAttribute, 3);
  const maxMovementPoints = options.availableAP * hexesPerAP;

  const reachable = new Map<string, { hex: CombatHex; apCost: number; path: HexPosition[] }>();
  const visited = new Set<string>();
  const queue: Array<{ hex: CombatHex; cost: number; path: HexPosition[] }> = [];

  const startHex = grid.getHex(toHoneycombCoords(start));
  if (!startHex) return reachable;

  queue.push({ hex: startHex, cost: 0, path: [] });
  visited.add(hexKey(start));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentPos = fromHex(current.hex);
    const currentKey = hexKey(currentPos);

    // Add to reachable if not the start
    if (current.path.length > 0) {
      const apCost = Math.ceil(current.cost / hexesPerAP);
      if (apCost <= options.availableAP) {
        reachable.set(currentKey, {
          hex: current.hex,
          apCost,
          path: current.path,
        });
      }
    }

    // Get neighbors
    const neighbors = getNeighbors(grid, currentPos);

    for (const neighbor of neighbors) {
      const neighborPos = fromHex(neighbor);
      const neighborKey = hexKey(neighborPos);

      if (visited.has(neighborKey)) continue;

      // Check passability
      if (!isHexPassable(neighbor, options.faction, options.includeOccupied)) {
        continue;
      }

      // Calculate cost to enter this hex
      const moveCost = neighbor.movementCost || 1;
      const newCost = current.cost + moveCost;

      // Check if within movement budget
      if (newCost > maxMovementPoints) continue;

      visited.add(neighborKey);
      queue.push({
        hex: neighbor,
        cost: newCost,
        path: [...current.path, neighborPos],
      });
    }
  }

  return reachable;
}

/**
 * Check if a hex is passable for movement.
 */
function isHexPassable(
  hex: CombatHex,
  faction: "ally" | "enemy" | "neutral",
  includeOccupied?: boolean
): boolean {
  // Impassable terrain
  if (hex.terrain === "impassable") {
    return false;
  }

  // Occupied by enemy (can't pass through)
  if (hex.entityId && !includeOccupied) {
    // Would need entity faction info - for now assume occupied = blocked
    return false;
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// PATHFINDING
// ═══════════════════════════════════════════════════════════════════════════

export interface PathResult {
  /** Whether a valid path exists */
  valid: boolean;
  /** Path of hex positions (excluding start) */
  path: HexPosition[];
  /** Total movement points required */
  movementCost: number;
  /** AP cost for this movement */
  apCost: number;
  /** Reason for failure if invalid */
  reason?: string;
}

/**
 * Find shortest path between two positions.
 * Uses A* algorithm with terrain costs.
 */
export function findPath(
  grid: Grid<CombatHex>,
  from: HexPosition,
  to: HexPosition,
  faction: "ally" | "enemy" | "neutral",
  physicalAttribute: number = 3
): PathResult {
  const hexesPerAP = Math.max(physicalAttribute, 3);
  const startHex = grid.getHex(toHoneycombCoords(from));
  const endHex = grid.getHex(toHoneycombCoords(to));

  if (!startHex || !endHex) {
    return { valid: false, path: [], movementCost: 0, apCost: 0, reason: "Invalid start or end position" };
  }

  if (endHex.terrain === "impassable") {
    return { valid: false, path: [], movementCost: 0, apCost: 0, reason: "Destination is impassable" };
  }

  if (endHex.entityId) {
    return { valid: false, path: [], movementCost: 0, apCost: 0, reason: "Destination is occupied" };
  }

  // A* implementation
  const openSet = new Map<string, {
    hex: CombatHex;
    gScore: number;
    fScore: number;
    parent: string | null;
  }>();
  const closedSet = new Set<string>();

  const startKey = hexKey(from);
  const endKey = hexKey(to);

  openSet.set(startKey, {
    hex: startHex,
    gScore: 0,
    fScore: axialDistance(from, to),
    parent: null,
  });

  while (openSet.size > 0) {
    // Find node with lowest fScore
    let currentKey = "";
    let lowestF = Infinity;
    for (const [key, node] of openSet) {
      if (node.fScore < lowestF) {
        lowestF = node.fScore;
        currentKey = key;
      }
    }

    if (currentKey === endKey) {
      // Reconstruct path
      const path: HexPosition[] = [];
      let current: string | null = currentKey;
      let totalCost = openSet.get(currentKey)!.gScore;

      while (current && current !== startKey) {
        path.unshift(parseHexKey(current));
        const node = openSet.get(current) || closedSet.has(current) ? { parent: null } : null;
        // Need to track parents properly - simplified here
        break;
      }

      // Reconstruct path properly
      const pathNodes: HexPosition[] = [];
      let node = openSet.get(currentKey);
      while (node && node.parent) {
        pathNodes.unshift(parseHexKey(currentKey));
        currentKey = node.parent;
        node = openSet.get(currentKey);
      }

      return {
        valid: true,
        path: pathNodes,
        movementCost: totalCost,
        apCost: Math.ceil(totalCost / hexesPerAP),
      };
    }

    const currentNode = openSet.get(currentKey)!;
    openSet.delete(currentKey);
    closedSet.add(currentKey);

    const currentPos = parseHexKey(currentKey);
    const neighbors = getNeighbors(grid, currentPos);

    for (const neighbor of neighbors) {
      const neighborPos = fromHex(neighbor);
      const neighborKey = hexKey(neighborPos);

      if (closedSet.has(neighborKey)) continue;
      if (!isHexPassable(neighbor, faction, false)) continue;

      const moveCost = neighbor.movementCost || 1;
      const tentativeG = currentNode.gScore + moveCost;

      const existing = openSet.get(neighborKey);
      if (!existing || tentativeG < existing.gScore) {
        openSet.set(neighborKey, {
          hex: neighbor,
          gScore: tentativeG,
          fScore: tentativeG + axialDistance(neighborPos, to),
          parent: currentKey,
        });
      }
    }
  }

  return { valid: false, path: [], movementCost: 0, apCost: 0, reason: "No path found" };
}

// ═══════════════════════════════════════════════════════════════════════════
// LINE OF SIGHT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if there's line of sight between two positions.
 */
export function hasLineOfSight(
  grid: Grid<CombatHex>,
  from: HexPosition,
  to: HexPosition
): boolean {
  const hexLine = getHexLine(grid, from, to);

  // Check all hexes in line except start and end
  for (let i = 1; i < hexLine.length - 1; i++) {
    const hex = hexLine[i];
    if (hex.blocksLOS) {
      return false;
    }
  }

  return true;
}

/**
 * Get all hexes visible from a position within range.
 */
export function getVisibleHexes(
  grid: Grid<CombatHex>,
  from: HexPosition,
  maxRange: number
): CombatHex[] {
  const hexesInRange = getHexesInRadius(grid, from, maxRange);

  return hexesInRange.filter((hex) => {
    const hexPos = fromHex(hex);
    // Skip self
    if (hexPos.q === from.q && hexPos.r === from.r) return true;
    return hasLineOfSight(grid, from, hexPos);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RANGE QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a target is within weapon range.
 */
export function isInRange(
  grid: Grid<CombatHex>,
  from: HexPosition,
  to: HexPosition,
  minRange: number,
  maxRange: number
): boolean {
  const distance = hexDistance(grid, from, to);
  return distance >= minRange && distance <= maxRange;
}

/**
 * Get all hexes within weapon range.
 */
export function getHexesInRange(
  grid: Grid<CombatHex>,
  from: HexPosition,
  minRange: number,
  maxRange: number
): CombatHex[] {
  const allInMax = getHexesInRadius(grid, from, maxRange);

  if (minRange === 0) {
    return allInMax;
  }

  // Filter out hexes closer than minRange
  return allInMax.filter((hex) => {
    const hexPos = fromHex(hex);
    const dist = axialDistance(from, hexPos);
    return dist >= minRange;
  });
}

/**
 * Get entities within range.
 */
export function getEntitiesInRange(
  grid: Grid<CombatHex>,
  from: HexPosition,
  minRange: number,
  maxRange: number
): string[] {
  const hexesInRange = getHexesInRange(grid, from, minRange, maxRange);
  return hexesInRange
    .filter((hex) => hex.entityId !== undefined)
    .map((hex) => hex.entityId!);
}

// ═══════════════════════════════════════════════════════════════════════════
// GRID STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Update entity position on grid.
 */
export function moveEntity(
  grid: Grid<CombatHex>,
  entityId: string,
  from: HexPosition,
  to: HexPosition
): boolean {
  const fromHex = grid.getHex(toHoneycombCoords(from));
  const toHex = grid.getHex(toHoneycombCoords(to));

  if (!fromHex || !toHex) return false;
  if (toHex.entityId) return false; // Occupied

  fromHex.entityId = undefined;
  toHex.entityId = entityId;

  return true;
}

/**
 * Place entity on grid.
 */
export function placeEntity(
  grid: Grid<CombatHex>,
  entityId: string,
  position: HexPosition
): boolean {
  const hex = grid.getHex(toHoneycombCoords(position));
  if (!hex || hex.entityId) return false;

  hex.entityId = entityId;
  return true;
}

/**
 * Remove entity from grid.
 */
export function removeEntity(
  grid: Grid<CombatHex>,
  position: HexPosition
): string | undefined {
  const hex = grid.getHex(toHoneycombCoords(position));
  if (!hex) return undefined;

  const entityId = hex.entityId;
  hex.entityId = undefined;
  return entityId;
}

/**
 * Find entity position on grid.
 */
export function findEntityPosition(
  grid: Grid<CombatHex>,
  entityId: string
): HexPosition | undefined {
  for (const hex of grid) {
    if (hex.entityId === entityId) {
      return fromHex(hex);
    }
  }
  return undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// TERRAIN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set terrain on a hex.
 */
export function setTerrain(
  grid: Grid<CombatHex>,
  position: HexPosition,
  terrain: TerrainHex
): boolean {
  const hex = grid.getHex(toHoneycombCoords(position));
  if (!hex) return false;

  hex.terrain = terrain.type;
  hex.movementCost = terrain.movementCost;
  hex.hazardDamage = terrain.hazardDamage;
  hex.hazardType = terrain.hazardType;
  hex.blocksLOS = terrain.type === "impassable";

  return true;
}

/**
 * Get terrain at a position.
 */
export function getTerrain(
  grid: Grid<CombatHex>,
  position: HexPosition
): TerrainHex | undefined {
  const hex = grid.getHex(toHoneycombCoords(position));
  if (!hex) return undefined;

  return {
    type: hex.terrain,
    movementCost: hex.movementCost,
    hazardDamage: hex.hazardDamage,
    hazardType: hex.hazardType,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SERIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert grid to HexGridState for persistence.
 */
export function gridToState(grid: Grid<CombatHex>): HexGridState {
  const terrain: Record<string, TerrainHex> = {};
  const entityPositions: Record<string, string> = {};

  let maxQ = 0;
  let maxR = 0;

  for (const hex of grid) {
    const pos = fromHex(hex);
    const key = hexKey(pos);

    maxQ = Math.max(maxQ, Math.abs(pos.q));
    maxR = Math.max(maxR, Math.abs(pos.r));

    // Only store non-default terrain
    if (hex.terrain !== "normal" || hex.movementCost !== 1) {
      terrain[key] = {
        type: hex.terrain,
        movementCost: hex.movementCost,
        hazardDamage: hex.hazardDamage,
        hazardType: hex.hazardType,
      };
    }

    // Store entity positions
    if (hex.entityId) {
      entityPositions[key] = hex.entityId;
    }
  }

  return {
    width: maxQ * 2 + 1,
    height: maxR * 2 + 1,
    terrain,
    entityPositions,
  };
}

// Re-export Direction for external use
export { Direction };
