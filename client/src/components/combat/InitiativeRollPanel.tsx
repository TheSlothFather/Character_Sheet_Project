/**
 * InitiativeRollPanel Component
 *
 * Manual initiative rolling UI for players at the start of combat.
 * Features dice animation, roll confirmation, and War Chronicle aesthetic.
 */

import React from "react";
import type { CombatEntity, DiceRoll } from "@shared/rules/combat";
import "./WarChronicle.css";

export interface InitiativeRollPanelProps {
  entity: CombatEntity;
  onRoll: (roll: DiceRoll) => void;
  rollResult?: {
    rawValues: number[];
    selectedDie: number;
    total: number;
  };
  disabled?: boolean;
  className?: string;
}

export const InitiativeRollPanel: React.FC<InitiativeRollPanelProps> = ({
  entity,
  onRoll,
  rollResult,
  disabled = false,
  className = "",
}) => {
  const [diceCount, setDiceCount] = React.useState(2);
  const [keepHighest, setKeepHighest] = React.useState(true);
  const [isRolling, setIsRolling] = React.useState(false);
  const [localRollResult, setLocalRollResult] = React.useState<{
    rawValues: number[];
    selectedDie: number;
  } | null>(null);

  // Get initiative skill modifier
  const initiativeSkill = entity.initiativeSkill || "initiative";
  const skillModifier = entity.skills[initiativeSkill] || 0;

  const handleRoll = () => {
    setIsRolling(true);

    // Simulate dice rolling animation
    setTimeout(() => {
      // Roll dice
      const rawValues = Array.from({ length: diceCount }, () =>
        Math.floor(Math.random() * 100) + 1
      );
      const selectedDie = keepHighest
        ? Math.max(...rawValues)
        : Math.min(...rawValues);

      setLocalRollResult({ rawValues, selectedDie });
      setIsRolling(false);
    }, 800);
  };

  const handleConfirm = () => {
    if (!localRollResult) return;

    const roll: DiceRoll = {
      diceCount,
      diceSize: 100,
      rawValues: localRollResult.rawValues,
      keepHighest,
      modifier: skillModifier,
    };

    onRoll(roll);
  };

  const total = localRollResult
    ? localRollResult.selectedDie + skillModifier
    : 0;

  const hasRolled = !!localRollResult || !!rollResult;
  const displayRoll = rollResult || localRollResult;

  const panelClasses = [
    "initiative-roll-panel",
    disabled && "initiative-roll-panel--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={panelClasses}>
      {/* Header */}
      <div className="initiative-roll-panel__header">
        <h3 className="initiative-roll-panel__title war-text-display">
          🎲 Roll Initiative
        </h3>
        <div className="initiative-roll-panel__entity-name">{entity.name}</div>
      </div>

      {/* Initiative Skill Info */}
      <div className="initiative-roll-panel__skill-info">
        <div className="initiative-roll-panel__skill-label">
          Initiative Skill:
        </div>
        <div className="initiative-roll-panel__skill-name">
          {initiativeSkill.toUpperCase()}
        </div>
        <div className="initiative-roll-panel__skill-modifier war-text-mono">
          +{skillModifier}
        </div>
      </div>

      {/* Dice Configuration */}
      {!hasRolled && (
        <div className="initiative-roll-panel__config">
          <label className="initiative-roll-panel__config-label">
            Number of Dice:
            <input
              type="number"
              min={1}
              max={10}
              value={diceCount}
              onChange={(e) => setDiceCount(Number(e.target.value))}
              className="initiative-roll-panel__config-input"
              disabled={disabled}
            />
          </label>

          <label className="initiative-roll-panel__config-checkbox">
            <input
              type="checkbox"
              checked={keepHighest}
              onChange={(e) => setKeepHighest(e.target.checked)}
              disabled={disabled}
            />
            Keep {keepHighest ? "Highest" : "Lowest"}
          </label>
        </div>
      )}

      {/* Roll Results */}
      {displayRoll && (
        <div className="initiative-roll-panel__results">
          <div className="initiative-roll-panel__dice-values">
            {displayRoll.rawValues?.map((die, i) => (
              <div
                key={i}
                className={`initiative-roll-panel__die ${
                  die === displayRoll.selectedDie
                    ? "initiative-roll-panel__die--selected"
                    : ""
                }`}
              >
                {die}
              </div>
            ))}
          </div>

          <div className="initiative-roll-panel__calculation">
            <span className="initiative-roll-panel__calc-selected">
              {displayRoll.selectedDie}
            </span>
            <span className="initiative-roll-panel__calc-operator">+</span>
            <span className="initiative-roll-panel__calc-modifier">
              {skillModifier}
            </span>
            <span className="initiative-roll-panel__calc-equals">=</span>
            <span className="initiative-roll-panel__calc-total war-text-mono">
              {rollResult?.total || total}
            </span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="initiative-roll-panel__actions">
        {!hasRolled && (
          <button
            className="initiative-roll-panel__roll-btn"
            onClick={handleRoll}
            disabled={disabled || isRolling}
          >
            {isRolling ? (
              <>
                <span className="initiative-roll-panel__spinner">🎲</span>
                Rolling...
              </>
            ) : (
              <>
                <span className="initiative-roll-panel__roll-icon">🎲</span>
                Roll Initiative
              </>
            )}
          </button>
        )}

        {localRollResult && !rollResult && (
          <button
            className="initiative-roll-panel__confirm-btn"
            onClick={handleConfirm}
            disabled={disabled}
          >
            <span className="initiative-roll-panel__confirm-icon">✓</span>
            Confirm Roll
          </button>
        )}

        {rollResult && (
          <div className="initiative-roll-panel__submitted">
            ✓ Roll Submitted
          </div>
        )}
      </div>

      {/* Decorative border */}
      <div className="initiative-roll-panel__border" aria-hidden="true" />
    </div>
  );
};

export default InitiativeRollPanel;
