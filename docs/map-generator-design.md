# Procedural Hex Dungeon Map Generator Design

## Goals
- Generate procedural maps on a hex grid using Honeycomb (React/TS friendly).
- Support both outside (terrain) and inside (building/interior) maps.
- Maintain a consistent scale: 5 feet per hex.
- Provide deterministic output from a seed.
- Produce metadata for gameplay (terrain, hazards, walls, doors, POIs).

## Core Inputs
- seed: number/string
- mapType: "outside" | "inside"
- gridShape: "hexagon" | "rectangle" | "custom" (hex set from polygon)
- size: radius or width/height
- locationType (outside): Plains, Forest, Swamplands, Jungle, Coastal, Mountainous, Tundra, Desert, Marine, Subterranean, Farmland, Settlement, Extraterrestrial, Extraplanar, Volcanic, City
- buildingType (inside): Palace, Small Home, Barracks, Warehouse, Factory, Temple, Tavern/Inn, Prison, Library/Archive, Laboratory/Workshop, Market Hall, Sewer/Undercroft, Clinic/Healer, Ship Interior
- density controls: roomCount, featureDensity, hazardDensity, pathComplexity
- connectivity: minimum entrances, guarantee walkable path between key POIs

## Outputs
- tile list keyed by axial coordinates (q, r)
- each tile:
  - terrainType
  - elevation (optional)
  - moisture (optional)
  - passable
  - feature tags ("river", "cliff", "door", "stairs", "hazard", etc.)
  - roomId / zoneId (inside)
- edge list or per-hex edges for walls/doors
- POIs: named or typed points of interest with coordinates

## Honeycomb Usage
- Use `defineHex({ dimensions, orientation })` and `Grid` for axial coordinates.
- Use axial neighbors for movement and flood fill.
- Use `grid.traverse` or `grid.neighborsOf` to gather rings or paths.
- Wrap in a thin map layer that stores per-hex metadata and edge data.

## Data Model (Suggested)
- HexTile:
  - coord: { q, r }
  - terrain: string
  - passable: boolean
  - features: string[]
  - roomId?: string
  - zoneId?: string
  - elevation?: number
  - moisture?: number
- EdgeState:
  - key: "q,r:dir" (dir 0-5)
  - state: "wall" | "door" | "open"
- Room:
  - id, type, tiles[], doors[], attributes{}

## Generation Pipeline (Outside)
1. Create grid with size + shape.
2. Generate base fields (elevation, moisture, temperature) using seeded noise.
3. Assign base terrain using locationType modifiers and thresholds.
4. Place features (rivers, cliffs, ruins, groves) using weighted clusters.
5. Add paths/roads and key POIs based on locationType.
6. Post-process for connectivity, remove unreachable POIs, enforce edges.

### Location Types and Feature Palettes
- Plains: rolling hills, grassland, scattered trees, streams, stone circles, windbreaks.
- Forest: dense trees, clearings, fallen logs, streams, thick undergrowth, animal trails.
- Swamplands: shallow water, mud, reeds, dead trees, fog pockets, sinks.
- Jungle: thick canopy, vines, ruins, waterfalls, predators, tangled trails.
- Coastal: beaches, cliffs, dunes, tide pools, coves, shipwrecks, salt marshes.
- Mountainous: peaks, ridges, cliffs, scree, passes, caves, avalanche zones.
- Tundra: permafrost, icy ponds, sparse shrubs, wind-scoured ridges, aurora events.
- Desert: dunes, rock outcrops, wadis, oases, ruins, mirages/heat haze.
- Marine: open water, reefs, shoals, kelp forests, currents, islands.
- Subterranean: caverns, stalactites, underground rivers, fungi, collapses.
- Farmland: fields, irrigation ditches, barns, hedgerows, windmills.
- Settlement: roads, wells, fences, market squares, watch posts, gardens.
- Extraterrestrial: alien soil, unusual gravity zones, crystal fields, meteor craters.
- Extraplanar: warped geometry, floating islands, portals, shifting terrain zones.
- Volcanic: lava flows, ash fields, vents, basalt columns, toxic gas pockets.
- City: streets, plazas, alleys, canals, bridges, district walls.

## Generation Pipeline (Inside)
1. Create building footprint as a hex set:
   - base shapes: rectangle, hexagon, ellipse, irregular (noise boundary).
2. Allocate rooms:
   - pick room count by buildingType and size.
   - seed room centers and assign tiles using Voronoi or hex-BSP.
   - label room types with weighted tables per buildingType.
3. Connect rooms:
   - build a graph of room centers.
   - create a minimum spanning tree, then add extra edges for loops.
4. Carve corridors (hex-specific method):
   - pathfind between doors using axial directions only.
   - keep corridor width to 1 hex (5 ft) for narrow halls.
   - allow two-segment "dogleg" paths to simulate right turns.
   - set walls on corridor edges except where doors connect to rooms.
5. Place interior features and hazards by room type.
6. Post-process for connectivity, fix isolated rooms, ensure minimum doors.

### Corridor Method on Hex Grids
- Define six axial directions as straight lines.
- For each room connection, pick entry hexes on room boundaries.
- Run A* with a corridor cost function that prefers straight segments:
  - low cost for same direction continuation
  - higher cost for turns
- Mark corridor hexes and set wall edges on their perimeter.
- Optional: widen main halls to 2-3 hexes for grand structures.

## Interior Building Types and Environmental Factors
- Palace: grand halls, courtyards, throne room, ceremonial chambers; high ceilings, ornate pillars, guarded chokepoints.
- Small Home: 3-6 rooms, compact layout, minimal corridors; fireplaces, storage, low lighting.
- Barracks: long rooms, bunks, armory, drill yard; noise, wear, simple layout.
- Warehouse: large open areas, loading bays, stacked crates; narrow aisles, heavy obstacles.
- Factory: segmented work zones, furnaces, conveyors; heat, smoke, hazardous machinery.
- Temple: sanctums, relic chambers, side chapels; incense haze, quiet zones, symbolic geometry.
- Tavern/Inn: common room, kitchen, rooms, storage; clutter, crowd flow, multiple doors.
- Prison: cell blocks, guard posts, central hub; locked doors, limited sightlines.
- Library/Archive: stacks, reading rooms, restricted vaults; low light, fragile areas.
- Laboratory/Workshop: benches, storage, hazardous materials; spills, vents, locked cabinets.
- Market Hall: stalls, back rooms, central aisle; crowd obstacles, merchant booths.
- Sewer/Undercroft: tunnels, pits, junctions; water, slippery floors, toxic pockets.
- Clinic/Healer: ward rooms, surgical areas; sterile zones, limited access.
- Ship Interior: decks, cargo bays, crew quarters; tight passages, ladders, water access.

## Terrain and Interior Rule Tables
- Use weighted tables per locationType/buildingType for:
  - base terrain tiles
  - features and hazards
  - POIs (entrances, shrines, ruins, exits)
  - lighting levels and visibility

## Scaling Rules
- 1 hex = 5 feet.
- Corridors: 1 hex wide (5 ft) for narrow halls, 2-3 hexes for grand halls.
- Standard room: 6-12 hexes; large rooms: 20+ hexes.

## Implementation Notes
- Keep generation deterministic by seeding RNG and noise.
- Use flood fill to validate connectivity between entrances and key POIs.
- Store wall/door edges for rendering and pathfinding.
- Provide hooks for custom feature sets or rule tables per campaign.

## Visual Design Scheme
- Background: choose either sepia parchment (#f3e9d2) or clean white (#fafafa) per map, never both in the same render.
- Line system: all stationary environment elements use black lines (#111111) to keep visual unity.
  - Walls: 2-3 px stroke on hex edges.
  - Doors: 2 px stroke with a small edge gap and a short arc/hinge mark.
  - Windows: 1 px stroke with two short ticks.
  - Fixed objects (stairs, pillars, fences, boulders): 1.5 px black outline.
- Terrain readability:
  - Use patterns instead of color blocks to keep the sepia/white + black line constraint.
  - Allow a light watercolor wash under patterns (10-25% opacity) for terrain identity.
  - Grassland: light dot stipple.
  - Grassland wash: washed green (#dfe8c6).
  - Forest/Jungle: clustered tree icons with sparse stipple underlay.
  - Water/Marine: thin wave lines, light blue wash (#d7e6f2).
  - Swamp: wave lines + dotted pools.
  - Desert: short wind-swept hatch marks.
  - Mountainous/Volcanic: contour lines and triangular ridge icons.
  - Tundra: broken crosshatch with minimal density.
  - Subterranean/Caves: sparse stipple + washed brown (#e4d6c7).
- Icons for unique environment objects (black outline, minimal fill):
  - Shrines/Altars: stepped rectangle + small circle.
  - Ruins: broken square with missing corner.
  - Statues: small pedestal + abstract figure.
  - Crystals/Alien artifacts: angular shard cluster.
  - Machinery: gear icon (small circle with teeth).
  - Vents/Lava: jagged crack with short upward ticks.
  - Trees (solo): rounded canopy on a thin trunk.
  - Rocks: irregular pebble trio.
  - Chests/Crates: small box with diagonal lid line.
- Scale rules:
  - Icon size: 30-60% of a hex diameter.
  - Labels: 10-12 pt serif for sepia maps, 9-11 pt sans for white maps.
- Interior emphasis:
  - Rooms remain mostly empty to preserve readability.
  - Place 1-3 icons per room to imply function (bunks, shelves, tables, furnaces).
- Outdoor emphasis:
  - Use larger clusters of icons for forests, farmland rows, and city districts.
  - Roads and rivers are continuous thin black lines with subtle pattern breaks at bridges.
- Legend: always include a compact legend with 6-10 symbols for the current map to reduce ambiguity.

## Example Config (Pseudo)
```
{
  "seed": "raven-42",
  "mapType": "inside",
  "gridShape": "rectangle",
  "size": { "width": 40, "height": 28 },
  "buildingType": "Barracks",
  "roomCount": 8,
  "pathComplexity": 0.3
}
```
