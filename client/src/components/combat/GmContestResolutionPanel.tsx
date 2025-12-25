/**
 * GmContestResolutionPanel Component
 *
 * GM interface for resolving pending skill contests.
 * Shows attacker info and allows GM to select defense skill and roll.
 */

import React from "react";
import type { CombatEntity, SkillContestRequest, DiceRoll } from "@shared/rules/combat";
import { SkillSelector } from "./SkillSelector";
import { DiceRollConfig } from "./DiceRollConfig";
import "./WarChronicle.css";

export interface GmContestResolutionPanelProps {
  pendingContests: SkillContestRequest[];
  entities: Record<string, CombatEntity>;
  onResolveContest: (contestId: string, skill: string, roll: DiceRoll) => void;
  className?: string;
}

export const GmContestResolutionPanel: React.FC<GmContestResolutionPanelProps> = ({
  pendingContests,
  entities,
  onResolveContest,
  className = "",
}) => {
  const [selectedContestId, setSelectedContestId] = React.useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = React.useState<string | null>(null);
  const [diceCount, setDiceCount] = React.useState(2);
  const [keepHighest, setKeepHighest] = React.useState(true);

  const selectedContest = pendingContests.find(c => c.contestId === selectedContestId);

  // Auto-select first contest
  React.useEffect(() => {
    if (pendingContests.length > 0 && !selectedContestId) {
      setSelectedContestId(pendingContests[0].contestId);
      setSelectedSkill(pendingContests[0].suggestedDefenseSkill || null);
    }
  }, [pendingContests, selectedContestId]);

  const handleResolve = () => {
    if (!selectedContest || !selectedSkill) return;

    const defender = entities[selectedContest.targetId];
    if (!defender) return;

    // Roll dice
    const rawValues = Array.from({ length: diceCount }, () =>
      Math.floor(Math.random() * 100) + 1
    );
    const skillModifier = defender.skills[selectedSkill] || 0;

    const roll: DiceRoll = {
      diceCount,
      diceSize: 100,
      rawValues,
      keepHighest,
      modifier: skillModifier,
    };

    onResolveContest(selectedContest.contestId, selectedSkill, roll);

    // Reset for next contest
    setSelectedContestId(null);
    setSelectedSkill(null);
  };

  if (pendingContests.length === 0) {
    return null;
  }

  const panelClasses = [
    "gm-contest-resolution",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={panelClasses}>
      {/* Header */}
      <div className="gm-contest-resolution__header">
        <h3 className="gm-contest-resolution__title war-text-display">
          ⚔️ Resolve Contests ({pendingContests.length})
        </h3>
      </div>

      {/* Contest List */}
      <div className="gm-contest-resolution__list">
        {pendingContests.map((contest) => {
          const initiator = entities[contest.initiatorId];
          const defender = entities[contest.targetId];
          const isSelected = contest.contestId === selectedContestId;

          if (!initiator || !defender) return null;

          return (
            <button
              key={contest.contestId}
              className={`gm-contest-resolution__contest ${
                isSelected ? "gm-contest-resolution__contest--selected" : ""
              }`}
              onClick={() => {
                setSelectedContestId(contest.contestId);
                setSelectedSkill(contest.suggestedDefenseSkill || null);
              }}
            >
              <div className="gm-contest-resolution__contest-header">
                <span className="gm-contest-resolution__attacker">
                  {initiator.name}
                </span>
                <span className="gm-contest-resolution__vs">vs</span>
                <span className="gm-contest-resolution__defender">
                  {defender.name}
                </span>
              </div>
              <div className="gm-contest-resolution__attack-info">
                <span className="gm-contest-resolution__skill">
                  {contest.initiatorSkill}
                </span>
                <span className="gm-contest-resolution__roll war-text-mono">
                  Roll: {contest.initiatorRoll.total}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Resolution Interface */}
      {selectedContest && (
        <div className="gm-contest-resolution__interface">
          <div className="gm-contest-resolution__defender-section">
            <h4 className="gm-contest-resolution__section-title">
              Defender: {entities[selectedContest.targetId]?.name}
            </h4>

            <SkillSelector
              entity={entities[selectedContest.targetId] || null}
              selectedSkill={selectedSkill}
              onSkillChange={setSelectedSkill}
              label="Defense Skill:"
              placeholder={selectedContest.suggestedDefenseSkill || "Choose defense skill..."}
            />

            <DiceRollConfig
              diceCount={diceCount}
              keepHighest={keepHighest}
              onDiceCountChange={setDiceCount}
              onKeepHighestChange={setKeepHighest}
            />
          </div>

          <button
            className="gm-contest-resolution__resolve-btn"
            onClick={handleResolve}
            disabled={!selectedSkill}
          >
            <span className="gm-contest-resolution__resolve-icon">🎲</span>
            Roll Defense & Resolve
          </button>
        </div>
      )}

      {/* Decorative border */}
      <div className="gm-contest-resolution__border" aria-hidden="true" />
    </div>
  );
};

export default GmContestResolutionPanel;
