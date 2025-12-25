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
export { InitiativeRollPanel, type InitiativeRollPanelProps } from "./InitiativeRollPanel";
export { SkillCheckRequestModal, type SkillCheckRequestModalProps } from "./SkillCheckRequestModal";

// Notifications
export { NotificationBanner, type NotificationBannerProps, type Notification } from "./notifications/NotificationBanner";
export { TurnAnnouncement, type TurnAnnouncementProps } from "./notifications/TurnAnnouncement";

// GM Tools
export { GmContestResolutionPanel, type GmContestResolutionPanelProps } from "./GmContestResolutionPanel";
export { GmSkillActionPanel, type GmSkillActionPanelProps } from "./GmSkillActionPanel";
export { GmSkillCheckResolutionPanel, type GmSkillCheckResolutionPanelProps } from "./GmSkillCheckResolutionPanel";
export { NpcActionPanel, type NpcActionPanelProps } from "./NpcActionPanel";
export { SkillCheckRequestPanel, type SkillCheckRequestPanelProps } from "./SkillCheckRequestPanel";

// Rolls
export { default as RollOverlay } from "./rolls/RollOverlay";
export type { RollOverlayProps, RollSubmitData, DiceRoll } from "./rolls/RollOverlay";

// Utilities (kept from previous implementation)
export { SkillSelector, type SkillSelectorProps } from "./SkillSelector";
export { DiceRollConfig, type DiceRollConfigProps } from "./DiceRollConfig";
