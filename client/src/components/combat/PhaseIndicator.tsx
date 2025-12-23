/**
 * PhaseIndicator Component
 *
 * Displays the current combat phase with contextual styling.
 */

import React from "react";
import type { CombatPhase } from "@shared/rules/combat";
import "./Combat.css";

export interface PhaseIndicatorProps {
  phase: CombatPhase;
  round?: number;
  turnIndex?: number;
  className?: string;
}

const PHASE_LABELS: Record<CombatPhase, string> = {
  setup: "Setup",
  initiative: "Rolling Initiative",
  "active-turn": "Active Turn",
  "reaction-interrupt": "Reactions",
  resolution: "Resolving",
  completed: "Combat Ended",
};

const PHASE_ICONS: Record<CombatPhase, string> = {
  setup: "\u2699",        // gear
  initiative: "\u2694",   // crossed swords
  "active-turn": "\u2744", // play
  "reaction-interrupt": "\u26A1", // lightning
  resolution: "\u231B",   // hourglass
  completed: "\u2714",    // checkmark
};

export const PhaseIndicator: React.FC<PhaseIndicatorProps> = ({
  phase,
  round,
  turnIndex,
  className = "",
}) => {
  return (
    <div className={`phase-indicator phase-indicator--${phase} ${className}`}>
      <span className="phase-indicator__icon">{PHASE_ICONS[phase]}</span>
      <div className="phase-indicator__content">
        <span className="phase-indicator__label">Phase</span>
        <span className="phase-indicator__value">{PHASE_LABELS[phase]}</span>
      </div>
      {round !== undefined && round > 0 && (
        <div className="phase-indicator__round">
          <span className="phase-indicator__label">Round</span>
          <span className="phase-indicator__value">{round}</span>
        </div>
      )}
    </div>
  );
};

// Compact inline version
export interface PhaseChipProps {
  phase: CombatPhase;
  className?: string;
}

export const PhaseChip: React.FC<PhaseChipProps> = ({
  phase,
  className = "",
}) => (
  <span className={`badge badge--${phase === "completed" ? "success" : phase === "reaction-interrupt" ? "info" : "primary"} ${className}`}>
    {PHASE_ICONS[phase]} {PHASE_LABELS[phase]}
  </span>
);

// Round/Turn display
export interface RoundDisplayProps {
  round: number;
  turnIndex: number;
  totalTurns: number;
  className?: string;
}

export const RoundDisplay: React.FC<RoundDisplayProps> = ({
  round,
  turnIndex,
  totalTurns,
  className = "",
}) => (
  <div className={`round-display ${className}`}>
    <div className="round-display__round">
      <span className="round-display__label">Round</span>
      <span className="round-display__value">{round}</span>
    </div>
    <div className="round-display__turn">
      <span className="round-display__label">Turn</span>
      <span className="round-display__value">
        {turnIndex + 1}/{totalTurns}
      </span>
    </div>
  </div>
);
