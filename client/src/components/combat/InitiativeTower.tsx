/**
 * InitiativeTower Component
 *
 * Vertical stone tower displaying entity portraits in initiative order.
 * Features mystical chain connections and faction-based styling.
 */

import React from "react";
import type { CombatEntity } from "@shared/rules/combat";
import "./WarChronicle.css";

export interface InitiativeTowerProps {
  entities: CombatEntity[];
  initiativeOrder: string[];
  activeEntityId: string | null;
  onEntityClick?: (entityId: string) => void;
  className?: string;
}

export const InitiativeTower: React.FC<InitiativeTowerProps> = ({
  entities,
  initiativeOrder,
  activeEntityId,
  onEntityClick,
  className = "",
}) => {
  // Map initiative order to entities
  const orderedEntities = initiativeOrder
    .map(id => entities.find(e => e.id === id))
    .filter((e): e is CombatEntity => e !== undefined);

  return (
    <div className={`initiative-tower ${className}`}>
      {/* Tower Header */}
      <div className="initiative-tower__header">
        <div className="initiative-tower__header-icon">⚔</div>
        <h3 className="initiative-tower__title war-text-display">
          Initiative
        </h3>
      </div>

      {/* Entity List */}
      <div className="initiative-tower__list">
        {orderedEntities.length === 0 ? (
          <div className="initiative-tower__empty">
            <p>No combatants</p>
          </div>
        ) : (
          orderedEntities.map((entity, index) => {
            const isActive = entity.id === activeEntityId;
            const isDefeated = !entity.alive;
            const factionClass = `initiative-tower__entry--${entity.faction}`;
            const activeClass = isActive ? "initiative-tower__entry--active" : "";
            const defeatedClass = isDefeated ? "initiative-tower__entry--defeated" : "";

            return (
              <React.Fragment key={entity.id}>
                {/* Chain connector (except before first entry) */}
                {index > 0 && (
                  <div className="initiative-tower__chain">
                    <svg className="initiative-tower__chain-svg" viewBox="0 0 20 40" preserveAspectRatio="none">
                      <line
                        x1="10"
                        y1="0"
                        x2="10"
                        y2="40"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="4,2"
                        className="initiative-tower__chain-line"
                      />
                    </svg>
                  </div>
                )}

                {/* Entity Entry */}
                <button
                  className={`initiative-tower__entry ${factionClass} ${activeClass} ${defeatedClass}`}
                  onClick={() => onEntityClick?.(entity.id)}
                  disabled={!onEntityClick}
                  aria-label={`${entity.name} - ${isActive ? "Acting" : "Waiting"}`}
                  title={`${entity.name}\nAP: ${entity.ap.current}/${entity.ap.max} | Energy: ${entity.energy.current}/${entity.energy.max}`}
                >
                  {/* Portrait/Icon */}
                  <div className="initiative-tower__portrait">
                    <div className="initiative-tower__portrait-placeholder">
                      {entity.name.charAt(0).toUpperCase()}
                    </div>
                    {isActive && (
                      <div className="initiative-tower__active-indicator">★</div>
                    )}
                    {isDefeated && (
                      <div className="initiative-tower__defeated-overlay">
                        <span className="initiative-tower__defeated-mark">✕</span>
                      </div>
                    )}
                  </div>

                  {/* Entity Info */}
                  <div className="initiative-tower__info">
                    <div className="initiative-tower__name">{entity.name}</div>
                    <div className="initiative-tower__resources">
                      <span className="initiative-tower__resource initiative-tower__resource--ap">
                        {entity.ap.current}/{entity.ap.max} AP
                      </span>
                      <span className="initiative-tower__resource initiative-tower__resource--energy">
                        {entity.energy.current}/{entity.energy.max} EN
                      </span>
                    </div>
                  </div>

                  {/* Reaction Indicator */}
                  {entity.reaction?.available && !isActive && (
                    <div className="initiative-tower__reaction" title="Reaction available">
                      ⚡
                    </div>
                  )}
                </button>
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* Tower Footer */}
      <div className="initiative-tower__footer">
        <div className="initiative-tower__count">
          {orderedEntities.length} combatant{orderedEntities.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
};

export default InitiativeTower;
