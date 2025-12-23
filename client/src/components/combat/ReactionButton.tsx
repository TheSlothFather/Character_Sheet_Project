/**
 * ReactionButton Component
 *
 * Floating button for declaring reactions during other entities' turns.
 */

import React from "react";
import "./Combat.css";

export interface ReactionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  pulsing?: boolean;
  label?: string;
  className?: string;
}

export const ReactionButton: React.FC<ReactionButtonProps> = ({
  onClick,
  disabled = false,
  pulsing = false,
  label = "Declare Reaction",
  className = "",
}) => {
  return (
    <button
      type="button"
      className={`reaction-button ${pulsing && !disabled ? "reaction-button--pulsing" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      <span className="reaction-button__icon">\u26A1</span>
      <span className="reaction-button__label">{label}</span>
    </button>
  );
};

// Inline reaction indicator for entity cards
export interface ReactionIndicatorProps {
  available: boolean;
  onClick?: () => void;
  className?: string;
}

export const ReactionIndicator: React.FC<ReactionIndicatorProps> = ({
  available,
  onClick,
  className = "",
}) => {
  if (!available && !onClick) {
    return (
      <span className={`reaction-indicator reaction-indicator--used ${className}`}>
        \u26A1 Used
      </span>
    );
  }

  if (onClick && available) {
    return (
      <button
        type="button"
        className={`reaction-indicator reaction-indicator--available ${className}`}
        onClick={onClick}
      >
        \u26A1 React
      </button>
    );
  }

  return (
    <span
      className={`reaction-indicator ${available ? "reaction-indicator--available" : "reaction-indicator--used"} ${className}`}
    >
      \u26A1 {available ? "Ready" : "Used"}
    </span>
  );
};
