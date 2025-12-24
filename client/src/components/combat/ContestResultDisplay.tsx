/**
 * ContestResultDisplay Component
 *
 * Displays the results of a skill contest with critical tier animations and styling.
 * Shows winner, loser, totals, and critical tier (normal, wicked, vicious, brutal).
 */

import React from "react";
import type { ContestOutcome, CriticalTier } from "@shared/rules/combat";

export interface ContestResultDisplayProps {
  isOpen: boolean;
  onClose: () => void;
  outcome: ContestOutcome | null;
  winnerName: string;
  loserName: string;
  winnerSkill?: string;
  loserSkill?: string;
}

const getCriticalTierLabel = (tier: CriticalTier): string => {
  switch (tier) {
    case "normal":
      return "Success";
    case "wicked":
      return "Wicked Critical!";
    case "vicious":
      return "Vicious Critical!!";
    case "brutal":
      return "BRUTAL CRITICAL!!!";
  }
};

const getCriticalTierClass = (tier: CriticalTier): string => {
  return `critical-${tier}`;
};

export const ContestResultDisplay: React.FC<ContestResultDisplayProps> = ({
  isOpen,
  onClose,
  outcome,
  winnerName,
  loserName,
  winnerSkill,
  loserSkill,
}) => {
  if (!isOpen || !outcome) return null;

  const criticalLabel = getCriticalTierLabel(outcome.criticalTier);
  const criticalClass = getCriticalTierClass(outcome.criticalTier);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-content contest-result-display ${criticalClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Contest Result</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {outcome.isTie ? (
            <div className="result-tie">
              <h3>It's a Tie!</h3>
              <p>
                Both combatants rolled <strong>{outcome.winnerTotal}</strong>
              </p>
            </div>
          ) : (
            <>
              <div className={`result-header ${criticalClass}`}>
                <h3 className="critical-tier-label">{criticalLabel}</h3>
              </div>

              <div className="result-comparison">
                <div className="result-winner">
                  <h4>Winner</h4>
                  <p className="entity-name">{winnerName}</p>
                  {winnerSkill && <p className="skill-name">{winnerSkill}</p>}
                  <p className="total-value">{outcome.winnerTotal}</p>
                </div>

                <div className="result-vs">
                  <span>VS</span>
                </div>

                <div className="result-loser">
                  <h4>Loser</h4>
                  <p className="entity-name">{loserName}</p>
                  {loserSkill && <p className="skill-name">{loserSkill}</p>}
                  <p className="total-value">{outcome.loserTotal}</p>
                </div>
              </div>

              <div className="result-details">
                <p className="margin-of-victory">
                  Margin: {outcome.winnerTotal - outcome.loserTotal}
                </p>
                {outcome.criticalTier !== "normal" && (
                  <p className="critical-explanation">
                    {outcome.criticalTier === "wicked" &&
                      "Winner rolled 50% higher than loser"}
                    {outcome.criticalTier === "vicious" &&
                      "Winner rolled 100% higher than loser"}
                    {outcome.criticalTier === "brutal" &&
                      "Winner rolled 200% higher than loser"}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <style>{`
        .contest-result-display {
          min-width: 400px;
        }

        .critical-normal {
          /* Standard styling */
        }

        .critical-wicked {
          border: 2px solid gold;
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
        }

        .critical-wicked .critical-tier-label {
          color: gold;
          text-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
        }

        .critical-vicious {
          border: 2px solid #ff6b35;
          box-shadow: 0 0 30px rgba(255, 107, 53, 0.6);
          animation: pulse-vicious 1.5s infinite;
        }

        .critical-vicious .critical-tier-label {
          color: #ff6b35;
          text-shadow: 0 0 15px rgba(255, 107, 53, 0.9);
        }

        .critical-brutal {
          border: 3px solid #8b0000;
          box-shadow: 0 0 40px rgba(139, 0, 0, 0.8);
          background: linear-gradient(135deg, rgba(139, 0, 0, 0.1), rgba(0, 0, 0, 0.2));
          animation: pulse-brutal 1s infinite;
        }

        .critical-brutal .critical-tier-label {
          color: #ff0000;
          text-shadow: 0 0 20px rgba(255, 0, 0, 1);
          font-size: 1.5em;
          animation: shake 0.5s infinite;
        }

        @keyframes pulse-vicious {
          0%, 100% { box-shadow: 0 0 30px rgba(255, 107, 53, 0.6); }
          50% { box-shadow: 0 0 45px rgba(255, 107, 53, 0.9); }
        }

        @keyframes pulse-brutal {
          0%, 100% { box-shadow: 0 0 40px rgba(139, 0, 0, 0.8); }
          50% { box-shadow: 0 0 60px rgba(255, 0, 0, 1); }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }

        .result-comparison {
          display: flex;
          align-items: center;
          justify-content: space-around;
          margin: 20px 0;
          gap: 20px;
        }

        .result-winner,
        .result-loser {
          flex: 1;
          text-align: center;
          padding: 15px;
          border-radius: 8px;
        }

        .result-winner {
          background: rgba(0, 255, 0, 0.1);
          border: 1px solid rgba(0, 255, 0, 0.3);
        }

        .result-loser {
          background: rgba(255, 0, 0, 0.1);
          border: 1px solid rgba(255, 0, 0, 0.3);
        }

        .result-vs {
          font-weight: bold;
          font-size: 1.5em;
          opacity: 0.6;
        }

        .entity-name {
          font-weight: bold;
          font-size: 1.2em;
          margin: 5px 0;
        }

        .skill-name {
          font-style: italic;
          opacity: 0.8;
          margin: 3px 0;
        }

        .total-value {
          font-size: 2em;
          font-weight: bold;
          margin-top: 10px;
        }

        .result-details {
          text-align: center;
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.2);
        }

        .margin-of-victory {
          font-size: 1.1em;
          font-weight: bold;
        }

        .critical-explanation {
          margin-top: 10px;
          font-style: italic;
          opacity: 0.9;
        }

        .result-tie {
          text-align: center;
          padding: 30px;
        }

        .result-tie h3 {
          font-size: 2em;
          margin-bottom: 15px;
        }
      `}</style>
    </div>
  );
};

export default ContestResultDisplay;
