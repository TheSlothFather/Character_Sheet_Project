/**
 * SkillContestModal Component
 *
 * Modal for initiating skill contests (attacks) and responding to them (defense).
 * Handles dice rolling, skill selection, and submission of contest actions.
 */

import React from "react";
import type { CombatEntity, DiceRoll, SkillContestRequest } from "@shared/rules/combat";
import { SkillSelector } from "./SkillSelector";

export interface SkillContestModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "attack" | "defend";

  // For attack mode
  attackerEntity?: CombatEntity | null;
  targetEntity?: CombatEntity | null;
  onInitiateAttack?: (skill: string, roll: DiceRoll) => Promise<void>;

  // For defend mode
  contest?: SkillContestRequest | null;
  defenderEntity?: CombatEntity | null;
  onDefend?: (contestId: string, skill: string, roll: DiceRoll) => Promise<void>;
}

export const SkillContestModal: React.FC<SkillContestModalProps> = ({
  isOpen,
  onClose,
  mode,
  attackerEntity,
  targetEntity,
  onInitiateAttack,
  contest,
  defenderEntity,
  onDefend,
}) => {
  const [selectedSkill, setSelectedSkill] = React.useState<string | null>(null);
  const [diceRoll, setDiceRoll] = React.useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (!isOpen) {
      setSelectedSkill(null);
      setDiceRoll(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const activeEntity = mode === "attack" ? attackerEntity : defenderEntity;
  const opposingEntity = mode === "attack" ? targetEntity : attackerEntity;

  const handleRollDice = () => {
    const roll = Math.floor(Math.random() * 100) + 1;
    setDiceRoll(roll);
  };

  const handleSubmit = async () => {
    if (!selectedSkill || diceRoll === null) return;
    if (!activeEntity) return;

    const skillModifier = activeEntity.skills?.[selectedSkill] ?? 0;
    const total = diceRoll + skillModifier;

    const roll: DiceRoll = {
      dice: "1d100",
      result: diceRoll,
      modifier: skillModifier,
      total,
    };

    setIsSubmitting(true);
    try {
      if (mode === "attack" && onInitiateAttack) {
        await onInitiateAttack(selectedSkill, roll);
      } else if (mode === "defend" && onDefend && contest) {
        await onDefend(contest.contestId, selectedSkill, roll);
      }
      onClose();
    } catch (err) {
      console.error("Failed to submit contest:", err);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const skillModifier = (selectedSkill && activeEntity?.skills?.[selectedSkill]) ?? 0;
  const total = diceRoll !== null && skillModifier !== undefined
    ? diceRoll + skillModifier
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content skill-contest-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === "attack" ? "Initiate Attack" : "Defend Against Attack"}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {mode === "attack" ? (
            <div className="contest-info">
              <p>
                <strong>{activeEntity?.name || "Unknown"}</strong> attacks{" "}
                <strong>{opposingEntity?.name || "Unknown"}</strong>
              </p>
            </div>
          ) : (
            <div className="contest-info">
              <p>
                <strong>{opposingEntity?.name || "Unknown"}</strong> rolled{" "}
                <strong>{contest?.initiatorRoll?.total ?? "?"}</strong> with{" "}
                <strong>{contest?.initiatorSkill || "Unknown Skill"}</strong>
              </p>
              <p className="defend-prompt">
                Defend with <strong>{defenderEntity?.name || "Unknown"}</strong>:
              </p>
            </div>
          )}

          <SkillSelector
            entity={activeEntity ?? null}
            selectedSkill={selectedSkill}
            onSkillChange={setSelectedSkill}
            label={mode === "attack" ? "Attack Skill" : "Defense Skill"}
            placeholder="Choose skill..."
          />

          <div className="dice-section">
            <button
              className="roll-button"
              onClick={handleRollDice}
              disabled={!selectedSkill || isSubmitting}
            >
              {diceRoll === null ? "Roll d100" : `Re-roll (${diceRoll})`}
            </button>

            {diceRoll !== null && (
              <div className="roll-result">
                <div className="roll-breakdown">
                  <span className="roll-dice">d100: {diceRoll}</span>
                  <span className="roll-modifier">
                    {skillModifier >= 0 ? "+" : ""}
                    {skillModifier} ({selectedSkill})
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
            disabled={!selectedSkill || diceRoll === null || isSubmitting}
          >
            {isSubmitting ? "Submitting..." : mode === "attack" ? "Attack" : "Defend"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SkillContestModal;
