/**
 * InitiativeList Component
 *
 * Displays combat initiative order with active entity highlight.
 */

import React from "react";
import type { CombatEntity, InitiativeEntry, EntityFaction } from "@shared/rules/combat";
import "./Combat.css";

export interface InitiativeListProps {
  entities: CombatEntity[];
  initiativeOrder: string[];
  activeEntityId: string | null;
  initiativeRolls?: Record<string, InitiativeEntry>;
  horizontal?: boolean;
  onEntityClick?: (entityId: string) => void;
  className?: string;
}

export const InitiativeList: React.FC<InitiativeListProps> = ({
  entities,
  initiativeOrder,
  activeEntityId,
  initiativeRolls,
  horizontal = false,
  onEntityClick,
  className = "",
}) => {
  const entitiesById = React.useMemo(() => {
    const map: Record<string, CombatEntity> = {};
    entities.forEach((e) => {
      map[e.id] = e;
    });
    return map;
  }, [entities]);

  return (
    <div
      className={`initiative-list ${horizontal ? "initiative-list--horizontal" : ""} ${className}`}
    >
      {initiativeOrder.map((entityId, index) => {
        const entity = entitiesById[entityId];
        if (!entity) return null;

        const isActive = entityId === activeEntityId;
        const roll = initiativeRolls?.[entityId];

        return (
          <InitiativeItem
            key={entityId}
            position={index + 1}
            entity={entity}
            isActive={isActive}
            roll={roll?.roll}
            onClick={onEntityClick ? () => onEntityClick(entityId) : undefined}
          />
        );
      })}
    </div>
  );
};

export interface InitiativeItemProps {
  position: number;
  entity: CombatEntity;
  isActive: boolean;
  roll?: number;
  onClick?: () => void;
  className?: string;
}

export const InitiativeItem: React.FC<InitiativeItemProps> = ({
  position,
  entity,
  isActive,
  roll,
  onClick,
  className = "",
}) => {
  const factionClass = entity.faction === "ally" ? "initiative-item--ally" : "initiative-item--enemy";

  return (
    <div
      className={`initiative-item ${factionClass} ${isActive ? "initiative-item--active" : ""} ${onClick ? "initiative-item--clickable" : ""} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      <span className="initiative-item__position">{position}</span>
      <span className="initiative-item__name">{entity.name}</span>
      {roll !== undefined && (
        <span className="initiative-item__roll">{roll}</span>
      )}
      {!entity.alive && (
        <span className="initiative-item__dead" title="Incapacitated">
          \u2620
        </span>
      )}
    </div>
  );
};

// Compact single-line display
export interface InitiativeBarProps {
  entities: CombatEntity[];
  initiativeOrder: string[];
  activeEntityId: string | null;
  className?: string;
}

export const InitiativeBar: React.FC<InitiativeBarProps> = ({
  entities,
  initiativeOrder,
  activeEntityId,
  className = "",
}) => {
  const entitiesById = React.useMemo(() => {
    const map: Record<string, CombatEntity> = {};
    entities.forEach((e) => {
      map[e.id] = e;
    });
    return map;
  }, [entities]);

  const activeIndex = activeEntityId
    ? initiativeOrder.indexOf(activeEntityId)
    : -1;

  return (
    <div className={`initiative-bar ${className}`}>
      {initiativeOrder.map((entityId, index) => {
        const entity = entitiesById[entityId];
        if (!entity) return null;

        const isActive = entityId === activeEntityId;
        const isPast = activeIndex >= 0 && index < activeIndex;

        return (
          <div
            key={entityId}
            className={`initiative-bar__item ${isActive ? "initiative-bar__item--active" : ""} ${isPast ? "initiative-bar__item--past" : ""} initiative-bar__item--${entity.faction}`}
            title={entity.name}
          >
            <span className="initiative-bar__name">
              {entity.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        );
      })}
    </div>
  );
};
