/**
 * EntityCard Component
 *
 * Displays a combat entity with resources, status effects, and wounds.
 */

import React from "react";
import type { CombatEntity, EntityController } from "@shared/rules/combat";
import { ResourceBar, ResourceInline } from "./ResourceBar";
import { WoundTracker } from "./WoundTracker";
import { StatusEffectList } from "./StatusEffectBadge";
import "./Combat.css";

export interface EntityCardProps {
  entity: CombatEntity;
  isActive?: boolean;
  isSelected?: boolean;
  isControlled?: boolean;
  selectable?: boolean;
  compact?: boolean;
  showController?: boolean;
  onClick?: () => void;
  onAction?: (action: string) => void;
  className?: string;
  children?: React.ReactNode;
}

const formatController = (controller: EntityController): string => {
  if (controller === "gm") return "GM";
  if (controller.startsWith("player:")) {
    return controller.slice(7); // Remove "player:" prefix
  }
  return controller;
};

export const EntityCard: React.FC<EntityCardProps> = ({
  entity,
  isActive = false,
  isSelected = false,
  isControlled = false,
  selectable = false,
  compact = false,
  showController = false,
  onClick,
  onAction,
  className = "",
  children,
}) => {
  const factionClass =
    entity.faction === "ally" ? "entity-card--ally" : "entity-card--enemy";

  const cardClasses = [
    "entity-card",
    factionClass,
    isActive && "entity-card--active",
    isSelected && "entity-card--selected",
    isControlled && "entity-card--controlled",
    selectable && "entity-card--selectable",
    compact && "entity-card--compact",
    !entity.alive && "entity-card--dead",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cardClasses}
      onClick={selectable ? onClick : undefined}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={
        selectable
          ? (e) => e.key === "Enter" && onClick?.()
          : undefined
      }
    >
      <div className="entity-card__header">
        <h3 className="entity-card__name">{entity.name}</h3>
        {showController && (
          <span className="entity-card__controller">
            {formatController(entity.controller)}
          </span>
        )}
        {!entity.alive && (
          <span className="entity-card__status-icon" title="Incapacitated">
            \u2620
          </span>
        )}
      </div>

      <div className="entity-card__resources">
        {compact ? (
          <div className="entity-card__resources-inline">
            <ResourceInline
              label="AP"
              current={entity.ap.current}
              max={entity.ap.max}
              type="ap"
            />
            <ResourceInline
              label="Energy"
              current={entity.energy.current}
              max={entity.energy.max}
              type="energy"
            />
          </div>
        ) : (
          <>
            <ResourceBar
              label="AP"
              current={entity.ap.current}
              max={entity.ap.max}
              type="ap"
            />
            <ResourceBar
              label="Energy"
              current={entity.energy.current}
              max={entity.energy.max}
              type="energy"
            />
          </>
        )}
      </div>

      {entity.statusEffects.length > 0 && (
        <div className="entity-card__status">
          <StatusEffectList effects={entity.statusEffects} />
        </div>
      )}

      {Object.values(entity.wounds).some((w) => w > 0) && (
        <div className="entity-card__wounds">
          <WoundTracker wounds={entity.wounds} compact={compact} hideEmpty />
        </div>
      )}

      {entity.reaction && (
        <div className="entity-card__reaction">
          {entity.reaction.available ? (
            <span className="entity-card__reaction-available" title="Reaction available">
              \u26A1 Reaction Ready
            </span>
          ) : (
            <span className="entity-card__reaction-used" title="Reaction used">
              \u26A1 Reaction Used
            </span>
          )}
        </div>
      )}

      {children && <div className="entity-card__extra">{children}</div>}

      {onAction && entity.alive && (
        <div className="entity-card__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              onAction("attack");
            }}
          >
            Attack
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              onAction("ability");
            }}
          >
            Ability
          </button>
        </div>
      )}
    </div>
  );
};

// Mini version for initiative list
export interface EntityMiniProps {
  entity: CombatEntity;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

export const EntityMini: React.FC<EntityMiniProps> = ({
  entity,
  isActive = false,
  onClick,
  className = "",
}) => (
  <div
    className={`entity-mini entity-mini--${entity.faction} ${isActive ? "entity-mini--active" : ""} ${!entity.alive ? "entity-mini--dead" : ""} ${className}`}
    onClick={onClick}
    role={onClick ? "button" : undefined}
    tabIndex={onClick ? 0 : undefined}
    title={entity.name}
  >
    <span className="entity-mini__name">{entity.name}</span>
    <span className="entity-mini__resources">
      {entity.ap.current}/{entity.ap.max} AP | {entity.energy.current}/
      {entity.energy.max} E
    </span>
  </div>
);
