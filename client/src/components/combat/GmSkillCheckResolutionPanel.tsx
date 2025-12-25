/**
 * GmSkillCheckResolutionPanel Component
 *
 * GM interface for resolving skill checks when GM override is allowed.
 */

import React from "react";
import type { CombatEntity, DiceRoll, SkillCheckRequest } from "@shared/rules/combat";
import { DiceRollConfig } from "./DiceRollConfig";
import "./WarChronicle.css";

export interface GmSkillCheckResolutionPanelProps {
  pendingChecks: SkillCheckRequest[];
  entities: Record<string, CombatEntity>;
  onResolveCheck: (checkId: string, roll: DiceRoll) => void;
  className?: string;
}

export const GmSkillCheckResolutionPanel: React.FC<GmSkillCheckResolutionPanelProps> = ({
  pendingChecks,
  entities,
  onResolveCheck,
  className = "",
}) => {
  const [selectedCheckId, setSelectedCheckId] = React.useState<string | null>(null);
  const [diceCount, setDiceCount] = React.useState(2);
  const [keepHighest, setKeepHighest] = React.useState(true);

  const selectedCheck = pendingChecks.find((check) => check.checkId === selectedCheckId);

  React.useEffect(() => {
    if (pendingChecks.length > 0 && !selectedCheckId) {
      setSelectedCheckId(pendingChecks[0].checkId);
    }
  }, [pendingChecks, selectedCheckId]);

  React.useEffect(() => {
    if (selectedCheck) {
      setDiceCount(selectedCheck.diceCount ?? 2);
      setKeepHighest(selectedCheck.keepHighest ?? true);
    }
  }, [selectedCheck?.checkId]);

  const handleResolve = () => {
    if (!selectedCheck) return;
    const entity = entities[selectedCheck.targetEntityId];
    if (!entity) return;

    const rawValues = Array.from({ length: diceCount }, () =>
      Math.floor(Math.random() * 100) + 1
    );
    const skillModifier = entity.skills[selectedCheck.skill] ?? 0;

    const roll: DiceRoll = {
      diceCount,
      diceSize: 100,
      rawValues,
      keepHighest,
      modifier: skillModifier,
    };

    onResolveCheck(selectedCheck.checkId, roll);
    setSelectedCheckId(null);
  };

  if (pendingChecks.length === 0) {
    return null;
  }

  const panelClasses = [
    "gm-skill-check-resolution",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={panelClasses}>
      <div className="gm-skill-check-resolution__header">
        <h3 className="gm-skill-check-resolution__title war-text-display">
          Resolve Skill Checks ({pendingChecks.length})
        </h3>
      </div>

      <div className="gm-skill-check-resolution__list">
        {pendingChecks.map((check) => {
          const entity = entities[check.targetEntityId];
          if (!entity) return null;
          const isSelected = check.checkId === selectedCheckId;

          return (
            <button
              key={check.checkId}
              className={`gm-skill-check-resolution__check ${
                isSelected ? "gm-skill-check-resolution__check--selected" : ""
              }`}
              onClick={() => setSelectedCheckId(check.checkId)}
            >
              <div className="gm-skill-check-resolution__check-header">
                <span className="gm-skill-check-resolution__entity">
                  {entity.name}
                </span>
                <span className="gm-skill-check-resolution__skill">
                  {check.skill}
                </span>
              </div>
              {check.targetNumber !== undefined && (
                <div className="gm-skill-check-resolution__target-number">
                  Target: {check.targetNumber}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedCheck && (
        <div className="gm-skill-check-resolution__interface">
          <div className="gm-skill-check-resolution__details">
            <div className="gm-skill-check-resolution__detail">
              Roller: {entities[selectedCheck.targetEntityId]?.name ?? "Unknown"}
            </div>
            <div className="gm-skill-check-resolution__detail">
              Skill: {selectedCheck.skill}
            </div>
          </div>

          <DiceRollConfig
            diceCount={diceCount}
            keepHighest={keepHighest}
            onDiceCountChange={setDiceCount}
            onKeepHighestChange={setKeepHighest}
          />

          <button
            className="gm-skill-check-resolution__resolve-btn"
            onClick={handleResolve}
          >
            Roll & Submit
          </button>
        </div>
      )}

      <div className="gm-skill-check-resolution__border" aria-hidden="true" />
    </div>
  );
};

export default GmSkillCheckResolutionPanel;
