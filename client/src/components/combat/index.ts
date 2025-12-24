/**
 * War Chronicle Combat Components
 *
 * Immersive TTRPG combat interface components with arcane war room aesthetic.
 */

// Phase 1: Core Components
export { PhaseDial, type PhaseDialProps } from "./PhaseDial";
export { InitiativeTower, type InitiativeTowerProps } from "./InitiativeTower";
export { EntityToken, type EntityTokenProps } from "./EntityToken";

// Phase 2: Interactive Elements
export {
  ResourceSegments,
  type ResourceSegmentsProps,
} from "./ResourceSegments";
export {
  WoundDisplay,
  WoundBadge,
  type WoundDisplayProps,
  type WoundBadgeProps,
} from "./WoundDisplay";
export {
  StatusPill,
  StatusList,
  type StatusPillProps,
  type StatusListProps,
} from "./StatusPill";
export {
  ActionGrimoire,
  type ActionGrimoireProps,
} from "./ActionGrimoire";
export { ReactionSigil, type ReactionSigilProps } from "./ReactionSigil";

// Phase 3: Combat Interactions
export { SkillDuelModal, type SkillDuelModalProps } from "./SkillDuelModal";
export { CombatChronicle, type CombatChronicleProps } from "./CombatChronicle";

// Utilities (kept from previous implementation)
export { SkillSelector, type SkillSelectorProps } from "./SkillSelector";
