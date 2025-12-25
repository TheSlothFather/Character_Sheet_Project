/**
 * SkillDuelModal Component
 *
 * Epic split-screen showdown for skill contests.
 * Displays attacker vs defender with dramatic animations
 * and result reveals based on critical tier.
 */

import React from "react";
import type {
  CombatEntity,
  SkillContestRequest,
  CriticalTier,
} from "@shared/rules/combat";
import { ResourceSegments } from "./ResourceSegments";
import { StatusList } from "./StatusPill";
import { SkillSelector } from "./SkillSelector";
import "./WarChronicle.css";

export interface SkillDuelModalProps {
  isOpen: boolean;
  contest: SkillContestRequest | null;
  entities: CombatEntity[];
  mode: "initiator" | "defender" | "spectator";
  onRoll?: (skill: string, diceCount: number, keepHighest: boolean) => void;
  onAcknowledge?: () => void;
  onClose: () => void;
  className?: string;
}

// Critical tier display configuration
const CRITICAL_TIER_CONFIG: Record<
  CriticalTier,
  { label: string; icon: string; animation: string }
> = {
  normal: {
    label: "Success",
    icon: "✓",
    animation: "war-result-normal",
  },
  wicked: {
    label: "Wicked!",
    icon: "⚡",
    animation: "war-result-wicked",
  },
  vicious: {
    label: "Vicious!!",
    icon: "⚡⚡",
    animation: "war-result-vicious",
  },
  brutal: {
    label: "BRUTAL!!!",
    icon: "⚡⚡⚡",
    animation: "war-result-brutal",
  },
};

export const SkillDuelModal: React.FC<SkillDuelModalProps> = ({
  isOpen,
  contest,
  entities,
  mode,
  onRoll,
  onAcknowledge,
  onClose,
  className = "",
}) => {
  const [selectedDefenseSkill, setSelectedDefenseSkill] = React.useState<
    string | null
  >(null);
  const [diceCount, setDiceCount] = React.useState(2);
  const [keepHighest, setKeepHighest] = React.useState(true);

  // Find entities
  const initiator = contest
    ? entities.find((e) => e.id === contest.initiatorId)
    : null;
  const defender = contest
    ? entities.find((e) => e.id === contest.targetId)
    : null;

  // Reset selection when contest changes
  React.useEffect(() => {
    if (contest) {
      setSelectedDefenseSkill(contest.suggestedDefenseSkill || null);
      setDiceCount(2); // Default dice count
      setKeepHighest(true);
    }
  }, [contest?.contestId]);

  if (!isOpen || !contest || !initiator || !defender) {
    return null;
  }

  const isResolved = contest.status === "resolved";
  const isAwaitingDefense = contest.status === "awaiting_defense";
  const canDefend = mode === "defender" && isAwaitingDefense;
  const canAcknowledge = isResolved && onAcknowledge;

  const handleDefend = () => {
    if (!canDefend || !selectedDefenseSkill || !onRoll) return;
    onRoll(selectedDefenseSkill, diceCount, keepHighest);
  };

  const modalClasses = [
    "skill-duel-modal",
    isOpen && "skill-duel-modal--open",
    isResolved && "skill-duel-modal--resolved",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Get winner/loser for display
  const outcome = contest.outcome;
  const initiatorWon = outcome?.winnerId === initiator.id;
  const isTie = outcome?.isTie;

  return (
    <div className={modalClasses}>
      <div className="skill-duel-modal__backdrop" onClick={onClose} />

      <div className="skill-duel-modal__container">
        {/* Header */}
        <div className="skill-duel-modal__header">
          <h2 className="skill-duel-modal__title war-text-display">
            ⚔️ Skill Contest
          </h2>
          <button
            className="skill-duel-modal__close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Split-Screen Duel */}
        <div className="skill-duel-modal__arena">
          {/* Initiator Side (Left) */}
          <div
            className={`skill-duel-modal__combatant skill-duel-modal__combatant--initiator ${
              initiatorWon && !isTie
                ? "skill-duel-modal__combatant--winner"
                : ""
            }`}
          >
            <div className="skill-duel-modal__combatant-header">
              <div className="skill-duel-modal__portrait">
                <div className="skill-duel-modal__portrait-image">
                  {initiator.name[0]}
                </div>
                {initiatorWon && !isTie && (
                  <div className="skill-duel-modal__winner-badge">👑</div>
                )}
              </div>
              <div className="skill-duel-modal__combatant-info">
                <h3 className="skill-duel-modal__combatant-name war-text-display">
                  {initiator.name}
                </h3>
                <div className="skill-duel-modal__combatant-role">
                  Attacker
                </div>
              </div>
            </div>

            <div className="skill-duel-modal__combatant-stats">
              <ResourceSegments
                current={initiator.ap.current}
                max={initiator.ap.max}
                type="ap"
                compact
              />
              <StatusList
                effects={initiator.statusEffects}
                size="sm"
                showDuration={false}
              />
            </div>

            <div className="skill-duel-modal__roll-area">
              <div className="skill-duel-modal__skill-label">
                {contest.initiatorSkill}
              </div>
              {contest.initiatorRoll && (
                <div className="skill-duel-modal__dice">
                  <div className="skill-duel-modal__dice-values">
                    {contest.initiatorRoll.rawDice.map((die, i) => (
                      <div
                        key={i}
                        className={`skill-duel-modal__die ${
                          die === contest.initiatorRoll.selectedDie
                            ? "skill-duel-modal__die--selected"
                            : ""
                        }`}
                      >
                        {die}
                      </div>
                    ))}
                  </div>
                  <div className="skill-duel-modal__total war-text-mono">
                    Total: {contest.initiatorRoll.total}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Divider (Crossed Swords) */}
          <div className="skill-duel-modal__divider">
            <div className="skill-duel-modal__divider-icon">⚔️</div>
            {isResolved && outcome && (
              <div
                className={`skill-duel-modal__result-badge ${
                  CRITICAL_TIER_CONFIG[outcome.criticalTier].animation
                }`}
              >
                {isTie ? (
                  <span className="skill-duel-modal__result-tie">TIE</span>
                ) : (
                  <>
                    <span className="skill-duel-modal__result-icon">
                      {CRITICAL_TIER_CONFIG[outcome.criticalTier].icon}
                    </span>
                    <span className="skill-duel-modal__result-label">
                      {CRITICAL_TIER_CONFIG[outcome.criticalTier].label}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Defender Side (Right) */}
          <div
            className={`skill-duel-modal__combatant skill-duel-modal__combatant--defender ${
              !initiatorWon && !isTie
                ? "skill-duel-modal__combatant--winner"
                : ""
            }`}
          >
            <div className="skill-duel-modal__combatant-header">
              <div className="skill-duel-modal__portrait">
                <div className="skill-duel-modal__portrait-image">
                  {defender.name[0]}
                </div>
                {!initiatorWon && !isTie && (
                  <div className="skill-duel-modal__winner-badge">👑</div>
                )}
              </div>
              <div className="skill-duel-modal__combatant-info">
                <h3 className="skill-duel-modal__combatant-name war-text-display">
                  {defender.name}
                </h3>
                <div className="skill-duel-modal__combatant-role">
                  Defender
                </div>
              </div>
            </div>

            <div className="skill-duel-modal__combatant-stats">
              <ResourceSegments
                current={defender.ap.current}
                max={defender.ap.max}
                type="ap"
                compact
              />
              <StatusList
                effects={defender.statusEffects}
                size="sm"
                showDuration={false}
              />
            </div>

            <div className="skill-duel-modal__roll-area">
              {isAwaitingDefense && canDefend ? (
                <div className="skill-duel-modal__defense-selection">
                  <SkillSelector
                    entity={defender}
                    selectedSkill={selectedDefenseSkill}
                    onSkillChange={setSelectedDefenseSkill}
                    label="Choose Defense Skill:"
                    placeholder="Select a skill..."
                  />
                  <div className="skill-duel-modal__dice-config">
                    <label className="skill-duel-modal__dice-label">
                      Dice:
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={diceCount}
                        onChange={(e) =>
                          setDiceCount(Number(e.target.value))
                        }
                        className="skill-duel-modal__dice-input"
                      />
                    </label>
                    <label className="skill-duel-modal__dice-checkbox">
                      <input
                        type="checkbox"
                        checked={keepHighest}
                        onChange={(e) => setKeepHighest(e.target.checked)}
                      />
                      Keep Highest
                    </label>
                  </div>
                </div>
              ) : contest.defenderSkill ? (
                <>
                  <div className="skill-duel-modal__skill-label">
                    {contest.defenderSkill}
                  </div>
                  {contest.defenderRoll && (
                    <div className="skill-duel-modal__dice">
                      <div className="skill-duel-modal__dice-values">
                        {contest.defenderRoll.rawDice.map((die, i) => (
                          <div
                            key={i}
                            className={`skill-duel-modal__die ${
                              die === contest.defenderRoll!.selectedDie
                                ? "skill-duel-modal__die--selected"
                                : ""
                            }`}
                          >
                            {die}
                          </div>
                        ))}
                      </div>
                      <div className="skill-duel-modal__total war-text-mono">
                        Total: {contest.defenderRoll.total}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="skill-duel-modal__waiting">Awaiting roll...</div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="skill-duel-modal__actions">
          {canDefend && (
            <button
              className="skill-duel-modal__action-btn skill-duel-modal__action-btn--defend"
              onClick={handleDefend}
              disabled={!selectedDefenseSkill}
            >
              🛡️ Defend with {selectedDefenseSkill || "..."}
            </button>
          )}
          {canAcknowledge && (
            <button
              className="skill-duel-modal__action-btn skill-duel-modal__action-btn--acknowledge"
              onClick={onAcknowledge}
            >
              ✓ Acknowledge Result
            </button>
          )}
        </div>

        {/* Audit Trail */}
        {contest.initiatorRoll && (
          <details className="skill-duel-modal__audit">
            <summary className="skill-duel-modal__audit-summary">
              Show Details
            </summary>
            <div className="skill-duel-modal__audit-content war-text-mono">
              <div>Attacker: {contest.initiatorRoll.audit}</div>
              {contest.defenderRoll && (
                <div>Defender: {contest.defenderRoll.audit}</div>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
};

export default SkillDuelModal;
