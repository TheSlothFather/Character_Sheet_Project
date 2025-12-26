/**
 * GmInitiativeStatusPanel Component
 *
 * Shows GM which entities have rolled initiative and which are pending.
 * Allows GM to force-roll for entities that haven't rolled yet.
 */

import React from "react";
import type { CombatEntity } from "@shared/rules/combat";

export interface InitiativeRoll {
  entityId: string;
  roll: number;
  skillValue: number;
  currentEnergy: number;
}

export interface GmInitiativeStatusPanelProps {
  entities: Record<string, CombatEntity>;
  initiativeRolls: Record<string, InitiativeRoll>;
  onForceRoll: (entityId: string) => Promise<void>;
  className?: string;
}

export const GmInitiativeStatusPanel: React.FC<GmInitiativeStatusPanelProps> = ({
  entities,
  initiativeRolls,
  onForceRoll,
  className = "",
}) => {
  const [forcingRolls, setForcingRolls] = React.useState<Set<string>>(new Set());

  const allEntities = Object.values(entities);
  const rolled = allEntities.filter((e) => initiativeRolls[e.id]);
  const pending = allEntities.filter((e) => !initiativeRolls[e.id]);

  const handleForceRoll = async (entityId: string) => {
    setForcingRolls((prev) => new Set(prev).add(entityId));
    try {
      await onForceRoll(entityId);
    } catch (err) {
      console.error("Failed to force roll:", err);
    } finally {
      setForcingRolls((prev) => {
        const next = new Set(prev);
        next.delete(entityId);
        return next;
      });
    }
  };

  const getInitiativeTotal = (entity: CombatEntity): number => {
    const rollData = initiativeRolls[entity.id];
    if (!rollData) return 0;
    return rollData.roll + rollData.skillValue;
  };

  return (
    <div className={`gm-initiative-status ${className}`}>
      <div className="gm-initiative-status__header">
        <h3>Initiative Status</h3>
        <div className="gm-initiative-status__counts">
          <span className="rolled-count">✓ {rolled.length} Rolled</span>
          <span className="pending-count">⏳ {pending.length} Pending</span>
        </div>
      </div>

      {rolled.length > 0 && (
        <div className="gm-initiative-status__section gm-initiative-status__section--rolled">
          <h4>Rolled</h4>
          <ul className="entity-list">
            {rolled
              .sort((a, b) => getInitiativeTotal(b) - getInitiativeTotal(a))
              .map((entity) => {
                const total = getInitiativeTotal(entity);
                const rollData = initiativeRolls[entity.id];
                return (
                  <li key={entity.id} className="entity-status entity-status--rolled">
                    <span className="status-icon">✓</span>
                    <span className="entity-name">{entity.displayName || entity.name}</span>
                    <span className="initiative-roll">
                      {rollData.roll} + {rollData.skillValue} = <strong>{total}</strong>
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {pending.length > 0 && (
        <div className="gm-initiative-status__section gm-initiative-status__section--pending">
          <h4>Pending</h4>
          <ul className="entity-list">
            {pending.map((entity) => (
              <li key={entity.id} className="entity-status entity-status--pending">
                <span className="status-icon">⏳</span>
                <span className="entity-name">{entity.displayName || entity.name}</span>
                <button
                  className="force-roll-btn"
                  onClick={() => handleForceRoll(entity.id)}
                  disabled={forcingRolls.has(entity.id)}
                >
                  {forcingRolls.has(entity.id) ? "Rolling..." : "Force Roll"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default GmInitiativeStatusPanel;
