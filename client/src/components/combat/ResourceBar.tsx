/**
 * ResourceBar Component
 *
 * Displays a segmented bar for AP/Energy with current/max values.
 * Uses the design system health-bar patterns.
 */

import React from "react";
import "./Combat.css";

export type ResourceType = "ap" | "energy" | "wounds";

export interface ResourceBarProps {
  label: string;
  current: number;
  max: number;
  type?: ResourceType;
  showLabel?: boolean;
  compact?: boolean;
  className?: string;
}

const typeClasses: Record<ResourceType, string> = {
  ap: "resource-bar--ap",
  energy: "resource-bar--energy",
  wounds: "resource-bar--wounds",
};

export const ResourceBar: React.FC<ResourceBarProps> = ({
  label,
  current,
  max,
  type = "ap",
  showLabel = true,
  compact = false,
  className = "",
}) => {
  const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const segments = Array.from({ length: max }, (_, i) => i < current);

  return (
    <div
      className={`resource-bar ${typeClasses[type]} ${compact ? "resource-bar--compact" : ""} ${className}`}
    >
      {showLabel && (
        <span className="resource-bar__label">{label}</span>
      )}
      <div className="resource-bar__track">
        {/* Segmented display for small max values */}
        {max <= 10 ? (
          <div className="resource-bar__segments">
            {segments.map((filled, i) => (
              <div
                key={i}
                className={`resource-bar__segment ${filled ? "resource-bar__segment--filled" : ""}`}
              />
            ))}
          </div>
        ) : (
          /* Continuous bar for larger values */
          <div
            className="resource-bar__fill"
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
      <span className="resource-bar__value">
        {current}/{max}
      </span>
    </div>
  );
};

// Compact inline version
export interface ResourceInlineProps {
  label: string;
  current: number;
  max: number;
  type?: ResourceType;
  className?: string;
}

export const ResourceInline: React.FC<ResourceInlineProps> = ({
  label,
  current,
  max,
  type = "ap",
  className = "",
}) => (
  <div className={`resource-inline ${typeClasses[type]} ${className}`}>
    <span className="resource-inline__label">{label}</span>
    <span className="resource-inline__value">
      <strong>{current}</strong>/{max}
    </span>
  </div>
);
