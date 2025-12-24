/**
 * ResourceSegments Component
 *
 * Segmented resource bars where each segment represents 1 point.
 * Features smooth transitions and low-resource warning animations.
 */

import React from "react";
import "./WarChronicle.css";

export type ResourceType = "ap" | "energy";

export interface ResourceSegmentsProps {
  current: number;
  max: number;
  type: ResourceType;
  label?: string;
  compact?: boolean;
  showValues?: boolean;
  className?: string;
}

export const ResourceSegments: React.FC<ResourceSegmentsProps> = ({
  current,
  max,
  type,
  label,
  compact = false,
  showValues = true,
  className = "",
}) => {
  const percentage = (current / max) * 100;
  const isLow = percentage <= 30;
  const isCritical = percentage <= 15;

  // Generate segment array
  const segments = Array.from({ length: max }, (_, i) => i);
  const filledSegments = Math.floor(current);
  const partialFill = current - filledSegments;

  const resourceClasses = [
    "resource-segments",
    `resource-segments--${type}`,
    compact && "resource-segments--compact",
    isLow && "resource-segments--low",
    isCritical && "resource-segments--critical",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={resourceClasses}>
      {label && (
        <div className="resource-segments__header">
          <span className="resource-segments__label">{label}</span>
          {showValues && (
            <span className="resource-segments__value war-text-mono">
              {current}/{max}
            </span>
          )}
        </div>
      )}

      <div className="resource-segments__bar">
        {segments.map((index) => {
          const isFilled = index < filledSegments;
          const isPartial = index === filledSegments && partialFill > 0;
          const fillPercentage = isPartial ? partialFill * 100 : 0;

          return (
            <div
              key={index}
              className={`resource-segments__segment ${
                isFilled ? "resource-segments__segment--filled" : ""
              } ${isPartial ? "resource-segments__segment--partial" : ""}`}
              style={
                isPartial
                  ? {
                      background: `linear-gradient(to right, var(--segment-fill-color) ${fillPercentage}%, var(--segment-empty-color) ${fillPercentage}%)`,
                    }
                  : undefined
              }
              aria-hidden="true"
            />
          );
        })}
      </div>

      {/* Screen reader text */}
      <span className="war-sr-only">
        {label} {current} out of {max}
        {isLow && " (low)"}
      </span>
    </div>
  );
};

// Inline variant for compact displays
export interface ResourceInlineProps {
  current: number;
  max: number;
  type: ResourceType;
  label: string;
  className?: string;
}

export const ResourceInline: React.FC<ResourceInlineProps> = ({
  current,
  max,
  type,
  label,
  className = "",
}) => {
  const percentage = (current / max) * 100;
  const isLow = percentage <= 30;

  return (
    <div
      className={`resource-inline resource-inline--${type} ${isLow ? "resource-inline--low" : ""} ${className}`}
    >
      <span className="resource-inline__label">{label}</span>
      <span className="resource-inline__value war-text-mono">
        {current}/{max}
      </span>
    </div>
  );
};

export default ResourceSegments;
