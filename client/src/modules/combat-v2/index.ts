/**
 * Combat V2 Module Index
 *
 * Clean-slate combat system for Adûrun TTRPG.
 * Features:
 * - 8 damage types with immunity/resistance/weakness
 * - Hex grid tactical movement (Honeycomb)
 * - Ildakar spell channeling system
 * - Entity tiers (Minion vs Full)
 * - Real-time via Cloudflare Durable Objects
 */

// Pages
export { PlayerCombatPage, GmCombatPage, CombatLobbyPage } from "./pages";

// Context
export {
  CombatProvider,
  useCombat,
  useCombatState,
  useCombatActions,
  type CombatProviderProps,
  type CombatContextValue,
} from "./context/CombatProvider";

// Grid Components
export { HexGrid, HexCell, EntityMarker } from "./components/grid";

// Entity Components
export { EntityCard, WoundTracker } from "./components/entities";

// Action Components
export {
  ActionBar,
  MovementAction,
  AttackAction,
  WEAPON_CATEGORIES,
  type ActionMode,
  type WeaponCategory,
} from "./components/actions";

// Channeling Components
export { ChannelingTracker } from "./components/channeling";

// GM Components
export { GmControls, EntityOverrides } from "./components/gm";
