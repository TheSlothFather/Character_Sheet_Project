/**
 * DiceRollConfig Component
 *
 * Reusable dice configuration UI for setting up rolls.
 * Allows selecting dice count and keep highest/lowest option.
 */

import React from "react";
import "./WarChronicle.css";

export interface DiceRollConfigProps {
  diceCount: number;
  keepHighest: boolean;
  onDiceCountChange: (count: number) => void;
  onKeepHighestChange: (keepHighest: boolean) => void;
  minDice?: number;
  maxDice?: number;
  disabled?: boolean;
  className?: string;
}

export const DiceRollConfig: React.FC<DiceRollConfigProps> = ({
  diceCount,
  keepHighest,
  onDiceCountChange,
  onKeepHighestChange,
  minDice = 1,
  maxDice = 10,
  disabled = false,
  className = "",
}) => {
  const configClasses = [
    "dice-roll-config",
    disabled && "dice-roll-config--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={configClasses}>
      <div className="dice-roll-config__field">
        <label className="dice-roll-config__label">
          Dice Count:
          <input
            type="number"
            min={minDice}
            max={maxDice}
            value={diceCount}
            onChange={(e) => onDiceCountChange(Number(e.target.value))}
            className="dice-roll-config__input war-text-mono"
            disabled={disabled}
          />
        </label>
        <div className="dice-roll-config__preview war-text-mono">
          {diceCount}d100
        </div>
      </div>

      <div className="dice-roll-config__field">
        <label className="dice-roll-config__checkbox-label">
          <input
            type="checkbox"
            checked={keepHighest}
            onChange={(e) => onKeepHighestChange(e.target.checked)}
            disabled={disabled}
            className="dice-roll-config__checkbox"
          />
          <span className="dice-roll-config__checkbox-text">
            Keep {keepHighest ? "Highest" : "Lowest"}
          </span>
        </label>
      </div>

      <div className="dice-roll-config__description">
        Roll {diceCount} {diceCount === 1 ? "die" : "dice"} and use the{" "}
        {keepHighest ? "highest" : "lowest"} result
      </div>
    </div>
  );
};

export default DiceRollConfig;
