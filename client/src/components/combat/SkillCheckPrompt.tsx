/**
 * SkillCheckPrompt Component
 *
 * Modal prompt displayed to players when the GM requests a skill check.
 * Allows the player to roll the specified skill and submit the result.
 */

import React from "react";
import type { CombatEntity, DiceRoll, SkillCheckRequest } from "@shared/rules/combat";

export interface SkillCheckPromptProps {
  isOpen: boolean;
  onClose: () => void;
  check: SkillCheckRequest | null;
  entity: CombatEntity | null;
  onSubmit: (checkId: string, roll: DiceRoll) => Promise<void>;
}

export const SkillCheckPrompt: React.FC<SkillCheckPromptProps> = ({
  isOpen,
  onClose,
  check,
  entity,
  onSubmit,
}) => {
  const [diceRoll, setDiceRoll] = React.useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (!isOpen) {
      setDiceRoll(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleRollDice = () => {
    const roll = Math.floor(Math.random() * 100) + 1;
    setDiceRoll(roll);
  };

  const handleSubmit = async () => {
    if (!check || diceRoll === null || !entity) return;

    const skillModifier = entity.skills?.[check.skill] ?? 0;
    const total = diceRoll + skillModifier;

    const roll: DiceRoll = {
      dice: "1d100",
      result: diceRoll,
      modifier: skillModifier,
      total,
    };

    setIsSubmitting(true);
    try {
      await onSubmit(check.checkId, roll);
      onClose();
    } catch (err) {
      console.error("Failed to submit skill check:", err);
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !check || !entity) return null;

  const skillModifier = entity.skills?.[check.skill] ?? 0;
  const total = diceRoll !== null ? diceRoll + skillModifier : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content skill-check-prompt" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Skill Check Requested</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="check-info">
            <p>
              The GM requests a <strong>{check.skill}</strong> check for{" "}
              <strong>{entity.name}</strong>
            </p>
            <p className="skill-modifier">
              Your {check.skill} modifier: {skillModifier >= 0 ? "+" : ""}
              {skillModifier}
            </p>
          </div>

          <div className="dice-section">
            <button
              className="roll-button"
              onClick={handleRollDice}
              disabled={isSubmitting}
            >
              {diceRoll === null ? "Roll d100" : `Re-roll (${diceRoll})`}
            </button>

            {diceRoll !== null && (
              <div className="roll-result">
                <div className="roll-breakdown">
                  <span className="roll-dice">d100: {diceRoll}</span>
                  <span className="roll-modifier">
                    {skillModifier >= 0 ? "+" : ""}
                    {skillModifier} ({check.skill})
                  </span>
                  <span className="roll-total">= {total}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={diceRoll === null || isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Submit Roll"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SkillCheckPrompt;
