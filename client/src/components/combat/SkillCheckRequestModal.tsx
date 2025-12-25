/**
 * SkillCheckRequestModal Component
 *
 * Modal for players to respond to GM-initiated skill check requests.
 * Shows the requested skill, allows dice configuration, and submits the roll.
 */

import React from "react";
import type { CombatEntity, DiceRoll, SkillCheckRequest } from "@shared/rules/combat";
import { SkillSelector } from "./SkillSelector";
import "./WarChronicle.css";

export interface SkillCheckRequestModalProps {
  isOpen: boolean;
  checkRequest: SkillCheckRequest | null;
  entity: CombatEntity | null;
  onSubmit: (checkId: string, roll: DiceRoll) => void;
  onClose: () => void;
  className?: string;
}

export const SkillCheckRequestModal: React.FC<SkillCheckRequestModalProps> = ({
  isOpen,
  checkRequest,
  entity,
  onSubmit,
  onClose,
  className = "",
}) => {
  const [diceCount, setDiceCount] = React.useState(2);
  const [keepHighest, setKeepHighest] = React.useState(true);
  const [isRolling, setIsRolling] = React.useState(false);
  const [localRollResult, setLocalRollResult] = React.useState<{
    rawValues: number[];
    selectedDie: number;
  } | null>(null);

  // Reset state when request changes
  React.useEffect(() => {
    if (checkRequest) {
      setDiceCount(checkRequest.diceCount ?? 2);
      setKeepHighest(checkRequest.keepHighest ?? true);
      setLocalRollResult(null);
      setIsRolling(false);
    }
  }, [checkRequest?.checkId]);

  if (!isOpen || !checkRequest || !entity) {
    return null;
  }

  // Get the skill modifier from entity
  const skillName = checkRequest.skill;
  const skillModifier = entity.skills[skillName] ?? 0;

  const handleRoll = () => {
    setIsRolling(true);

    // Simulate dice rolling animation
    setTimeout(() => {
      // Roll dice (d100 system)
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

    onSubmit(checkRequest.checkId, roll);
    onClose();
  };

  const total = localRollResult
    ? localRollResult.selectedDie + skillModifier
    : 0;

  const hasRolled = !!localRollResult;
  const isAlreadyRolled = checkRequest.status === "rolled";

  const modalClasses = [
    "skill-check-modal",
    isOpen && "skill-check-modal--open",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={modalClasses}>
      <div className="skill-check-modal__backdrop" onClick={onClose} />

      <div className="skill-check-modal__container">
        {/* Header */}
        <div className="skill-check-modal__header">
          <h2 className="skill-check-modal__title war-text-display">
            Skill Check Requested
          </h2>
          <button
            className="skill-check-modal__close"
            onClick={onClose}
            aria-label="Close modal"
          >
            X
          </button>
        </div>

        {/* Request Info */}
        <div className="skill-check-modal__request-info">
          <div className="skill-check-modal__entity-name">
            {entity.name}
          </div>
          <div className="skill-check-modal__request-text">
            The GM has requested a skill check
          </div>
        </div>

        {/* Skill Info */}
        <div className="skill-check-modal__skill-info">
          <div className="skill-check-modal__skill-label">Skill:</div>
          <div className="skill-check-modal__skill-name">
            {skillName.toUpperCase()}
          </div>
          <div className="skill-check-modal__skill-modifier war-text-mono">
            {skillModifier >= 0 ? "+" : ""}{skillModifier}
          </div>
        </div>

        {/* Dice Configuration */}
        {!hasRolled && !isAlreadyRolled && (
          <div className="skill-check-modal__config">
            <label className="skill-check-modal__config-label">
              Number of Dice:
              <input
                type="number"
                min={1}
                max={10}
                value={diceCount}
                onChange={(e) => setDiceCount(Number(e.target.value))}
                className="skill-check-modal__config-input"
              />
            </label>

            <label className="skill-check-modal__config-checkbox">
              <input
                type="checkbox"
                checked={keepHighest}
                onChange={(e) => setKeepHighest(e.target.checked)}
              />
              Keep {keepHighest ? "Highest" : "Lowest"}
            </label>
          </div>
        )}

        {/* Roll Results */}
        {localRollResult && (
          <div className="skill-check-modal__results">
            <div className="skill-check-modal__dice-values">
              {localRollResult.rawValues.map((die, i) => (
                <div
                  key={i}
                  className={`skill-check-modal__die ${
                    die === localRollResult.selectedDie
                      ? "skill-check-modal__die--selected"
                      : ""
                  }`}
                >
                  {die}
                </div>
              ))}
            </div>

            <div className="skill-check-modal__calculation">
              <span className="skill-check-modal__calc-selected">
                {localRollResult.selectedDie}
              </span>
              <span className="skill-check-modal__calc-operator">+</span>
              <span className="skill-check-modal__calc-modifier">
                {skillModifier}
              </span>
              <span className="skill-check-modal__calc-equals">=</span>
              <span className="skill-check-modal__calc-total war-text-mono">
                {total}
              </span>
            </div>

            {checkRequest.targetNumber !== undefined && (
              <div className="skill-check-modal__target">
                Target Number: {checkRequest.targetNumber}
                <span className={`skill-check-modal__result ${total >= checkRequest.targetNumber ? "skill-check-modal__result--success" : "skill-check-modal__result--failure"}`}>
                  {total >= checkRequest.targetNumber ? " - Success!" : " - Failure"}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Already Rolled Display */}
        {isAlreadyRolled && checkRequest.rollData && (
          <div className="skill-check-modal__results">
            <div className="skill-check-modal__dice-values">
              {checkRequest.rollData.rawDice.map((die, i) => (
                <div
                  key={i}
                  className={`skill-check-modal__die ${
                    die === checkRequest.rollData!.selectedDie
                      ? "skill-check-modal__die--selected"
                      : ""
                  }`}
                >
                  {die}
                </div>
              ))}
            </div>
            <div className="skill-check-modal__calculation">
              <span className="skill-check-modal__calc-total war-text-mono">
                Total: {checkRequest.rollData.total}
              </span>
            </div>
            <div className="skill-check-modal__submitted">
              Roll Submitted
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="skill-check-modal__actions">
          {!hasRolled && !isAlreadyRolled && (
            <button
              className="skill-check-modal__roll-btn"
              onClick={handleRoll}
              disabled={isRolling}
            >
              {isRolling ? (
                <>
                  <span className="skill-check-modal__spinner">...</span>
                  Rolling...
                </>
              ) : (
                <>
                  Roll {skillName}
                </>
              )}
            </button>
          )}

          {hasRolled && !isAlreadyRolled && (
            <button
              className="skill-check-modal__confirm-btn"
              onClick={handleConfirm}
            >
              Confirm Roll
            </button>
          )}

          {isAlreadyRolled && (
            <button
              className="skill-check-modal__close-btn"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SkillCheckRequestModal;
