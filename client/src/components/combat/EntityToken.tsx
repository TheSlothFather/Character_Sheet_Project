/**
 * EntityToken Component
 *
 * Physical combat token cards with faction-specific framing.
 * The main entity display component for the battlefield.
 *
 * Note: Uses placeholder displays for resources/wounds/status.
 * These will be replaced with specialized components in Phase 2.
 */

import React from "react";
import type { CombatEntity, EntityFaction } from "@shared/rules/combat";
import "./WarChronicle.css";

export interface EntityTokenProps {
  entity: CombatEntity;
  isActive?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  showTargetPrompt?: boolean;
  compact?: boolean;
  className?: string;
}

export const EntityToken: React.FC<EntityTokenProps> = ({
  entity,
  isActive = false,
  isSelected = false,
  onClick,
  showTargetPrompt = false,
  compact = false,
  className = "",
}) => {
  const faction = entity.faction || "enemy";
  const isDefeated = !entity.alive;

  const tokenClasses = [
    "entity-token",
    `entity-token--${faction}`,
    isActive && "entity-token--active",
    isSelected && "entity-token--selected",
    isDefeated && "entity-token--defeated",
    compact && "entity-token--compact",
    onClick && "entity-token--clickable",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={tokenClasses}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      aria-label={`${entity.name}${isActive ? " - Acting" : ""}${isDefeated ? " - Defeated" : ""}`}
    >
      {/* Faction Ornaments */}
      <div className="entity-token__frame" aria-hidden="true">
        {faction === "ally" && (
          <div className="entity-token__ornament entity-token__ornament--ally">
            ⚔
          </div>
        )}
        {faction === "enemy" && (
          <div className="entity-token__ornament entity-token__ornament--enemy">
            ☠
          </div>
        )}
      </div>

      {/* Active Banner */}
      {isActive && (
        <div className="entity-token__banner">
          <span className="entity-token__banner-text">ACTING</span>
        </div>
      )}

      {/* Header */}
      <div className="entity-token__header">
        <h4 className="entity-token__name war-text-body">{entity.name}</h4>
        {isDefeated && (
          <span className="entity-token__status-icon" title="Defeated">
            ✕
          </span>
        )}
      </div>

      {/* Resources - Simple display for Phase 1 */}
      {!compact && (
        <div className="entity-token__resources">
          <div className="entity-token__resource-row">
            <span className="entity-token__resource-label">AP</span>
            <div className="entity-token__resource-bar">
              <div
                className="entity-token__resource-fill entity-token__resource-fill--ap"
                style={{
                  width: `${(entity.ap.current / entity.ap.max) * 100}%`,
                }}
              />
            </div>
            <span className="entity-token__resource-value war-text-mono">
              {entity.ap.current}/{entity.ap.max}
            </span>
          </div>

          <div className="entity-token__resource-row">
            <span className="entity-token__resource-label">EN</span>
            <div className="entity-token__resource-bar">
              <div
                className="entity-token__resource-fill entity-token__resource-fill--energy"
                style={{
                  width: `${(entity.energy.current / entity.energy.max) * 100}%`,
                }}
              />
            </div>
            <span className="entity-token__resource-value war-text-mono">
              {entity.energy.current}/{entity.energy.max}
            </span>
          </div>
        </div>
      )}

      {/* Compact Resources */}
      {compact && (
        <div className="entity-token__resources-compact war-text-mono">
          <span className="entity-token__compact-stat">
            {entity.ap.current}/{entity.ap.max} AP
          </span>
          <span className="entity-token__compact-separator">•</span>
          <span className="entity-token__compact-stat">
            {entity.energy.current}/{entity.energy.max} EN
          </span>
        </div>
      )}

      {/* Wounds - Simple display for Phase 1 */}
      {!compact && Object.values(entity.wounds).some((count) => count > 0) && (
        <div className="entity-token__wounds">
          <div className="entity-token__section-label">Wounds</div>
          <div className="entity-token__wound-list">
            {Object.entries(entity.wounds).map(
              ([type, count]) =>
                count > 0 && (
                  <span
                    key={type}
                    className={`entity-token__wound entity-token__wound--${type}`}
                    title={`${count} ${type} wound${count !== 1 ? "s" : ""}`}
                  >
                    {getWoundIcon(type)} ×{count}
                  </span>
                )
            )}
          </div>
        </div>
      )}

      {/* Status Effects - Simple display for Phase 1 */}
      {!compact && entity.statusEffects.length > 0 && (
        <div className="entity-token__status-effects">
          <div className="entity-token__section-label">Status</div>
          <div className="entity-token__status-list">
            {entity.statusEffects.map((effect, index) => (
              <span
                key={`${effect.key}-${index}`}
                className="entity-token__status-badge"
                title={`${effect.key}${effect.stacks > 1 ? ` (×${effect.stacks})` : ""}${effect.duration ? ` - ${effect.duration} rounds` : ""}`}
              >
                {effect.key}
                {effect.stacks > 1 && (
                  <span className="entity-token__status-stack">
                    ×{effect.stacks}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Target Prompt */}
      {showTargetPrompt && (
        <div className="entity-token__target-prompt">
          <span className="entity-token__target-text">⟪ SELECT TARGET ⟫</span>
        </div>
      )}

      {/* Reaction Indicator */}
      {entity.reaction?.available && !isActive && (
        <div className="entity-token__reaction-badge" title="Reaction available">
          ⚡
        </div>
      )}
    </div>
  );
};

// Helper function for wound icons
function getWoundIcon(type: string): string {
  const icons: Record<string, string> = {
    burn: "🔥",
    freeze: "❄️",
    laceration: "💔",
    blunt: "🔨",
    mental: "🧠",
    necrosis: "☠️",
    spiritual: "✨",
  };
  return icons[type] || "◉";
}

export default EntityToken;
