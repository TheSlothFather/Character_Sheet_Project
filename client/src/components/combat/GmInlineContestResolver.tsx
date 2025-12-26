/**
 * GmInlineContestResolver Component
 *
 * Inline (non-modal) contest resolution for GM.
 * Shows attacker's roll, allows GM to select defense skill and roll for defender.
 * Result appears inline and auto-dismisses.
 */

import React from "react";
import type { CombatEntity } from "@shared/rules/combat";
import SkillSelector from "./SkillSelector";
import DiceRollConfig from "./DiceRollConfig";

export interface ContestRequest {
  contestId: string;
  initiatorId: string;
  initiatorSkill: string;
  initiatorRoll: {
    total: number;
    audit: string;
  };
  targetId: string;
  suggestedDefenseSkill?: string;
}

export interface GmInlineContestResolverProps {
  contest: ContestRequest;
  entities: Record<string, CombatEntity>;
  onResolve: (contestId: string, defenseSkill: string, diceCount: number, keepHighest: boolean) => Promise<void>;
  onDismiss: (contestId: string) => void;
  className?: string;
}

export const GmInlineContestResolver: React.FC<GmInlineContestResolverProps> = ({
  contest,
  entities,
  onResolve,
  onDismiss,
  className = "",
}) => {
  const [defenseSkill, setDefenseSkill] = React.useState<string>(contest.suggestedDefenseSkill || "");
  const [diceCount, setDiceCount] = React.useState(1);
  const [keepHighest, setKeepHighest] = React.useState(true);
  const [resolving, setResolving] = React.useState(false);
  const [showResult, setShowResult] = React.useState(false);

  const initiator = entities[contest.initiatorId];
  const target = entities[contest.targetId];

  const handleResolve = async () => {
    if (!defenseSkill) return;

    setResolving(true);
    try {
      await onResolve(contest.contestId, defenseSkill, diceCount, keepHighest);
      setShowResult(true);
      setTimeout(() => {
        onDismiss(contest.contestId);
      }, 3000);
    } catch (err) {
      console.error("Failed to resolve contest:", err);
      setResolving(false);
    }
  };

  if (showResult) {
    return (
      <div className={`gm-inline-contest-result ${className}`}>
        <div className="result-banner">
          ✓ Contest Resolved - Check combat log for results
        </div>
      </div>
    );
  }

  return (
    <div className={`gm-inline-contest-resolver ${className}`}>
      <div className="contest-header">
        <h4>Skill Contest</h4>
        <button onClick={() => onDismiss(contest.contestId)} className="close-btn">×</button>
      </div>

      <div className="contest-info">
        <div className="attacker-info">
          <strong>{initiator?.displayName || initiator?.name || "Unknown"}</strong>
          <div className="skill-roll">
            {contest.initiatorSkill}: <span className="total">{contest.initiatorRoll.total}</span>
          </div>
        </div>
        <div className="vs-divider">VS</div>
        <div className="defender-info">
          <strong>{target?.displayName || target?.name || "Unknown"}</strong>
        </div>
      </div>

      <div className="defense-controls">
        <SkillSelector
          entity={target}
          selectedSkill={defenseSkill}
          onSkillChange={setDefenseSkill}
          label="Defense Skill"
          placeholder="Select defense skill..."
        />

        <DiceRollConfig
          diceCount={diceCount}
          keepHighest={keepHighest}
          onDiceCountChange={setDiceCount}
          onKeepHighestChange={setKeepHighest}
        />
      </div>

      <div className="contest-actions">
        <button
          onClick={handleResolve}
          disabled={!defenseSkill || resolving}
          className="resolve-btn"
        >
          {resolving ? "Resolving..." : "Roll & Resolve"}
        </button>
      </div>
    </div>
  );
};

export default GmInlineContestResolver;
