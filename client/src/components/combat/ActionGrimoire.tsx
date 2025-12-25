/**
 * ActionGrimoire Component
 *
 * Leather-bound spellbook interface for declaring actions.
 * Features tabbed action categories and target selection.
 */

import React from "react";
import type { CombatEntity, ActionType, DiceRoll } from "@shared/rules/combat";
import { SkillSelector } from "./SkillSelector";
import { DiceRollConfig } from "./DiceRollConfig";
import "./WarChronicle.css";

export interface ActionGrimoireProps {
  entity: CombatEntity;
  enemies: CombatEntity[];
  onDeclareAction: (type: ActionType, apCost: number, targetId?: string) => void;
  onInitiateSkillContest?: (targetId: string, skill: string, roll: DiceRoll) => void;
  onEndTurn: () => void;
  disabled?: boolean;
  className?: string;
}

// Action configuration
const ACTION_TABS: {
  type: ActionType;
  icon: string;
  label: string;
  description: string;
  apCost: number;
  needsTarget: boolean;
}[] = [
  {
    type: "attack",
    icon: "⚔️",
    label: "Attack",
    description: "Strike at a foe with your weapon",
    apCost: 2,
    needsTarget: true,
  },
  {
    type: "spell",
    icon: "🔮",
    label: "Spell",
    description: "Cast a magical spell",
    apCost: 2,
    needsTarget: true,
  },
  {
    type: "ability",
    icon: "⚡",
    label: "Ability",
    description: "Use a special ability",
    apCost: 2,
    needsTarget: true,
  },
  {
    type: "movement",
    icon: "🦶",
    label: "Move",
    description: "Change position on the battlefield",
    apCost: 1,
    needsTarget: false,
  },
  {
    type: "item",
    icon: "🎒",
    label: "Item",
    description: "Use an item from your inventory",
    apCost: 1,
    needsTarget: false,
  },
];

export const ActionGrimoire: React.FC<ActionGrimoireProps> = ({
  entity,
  enemies,
  onDeclareAction,
  onInitiateSkillContest,
  onEndTurn,
  disabled = false,
  className = "",
}) => {
  const [selectedTab, setSelectedTab] = React.useState<ActionType>("attack");
  const [selectedTarget, setSelectedTarget] = React.useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = React.useState<string | null>(null);
  const [diceCount, setDiceCount] = React.useState(2);
  const [keepHighest, setKeepHighest] = React.useState(true);
  const [showSkillSelection, setShowSkillSelection] = React.useState(false);

  const selectedAction = ACTION_TABS.find((tab) => tab.type === selectedTab);
  const canAfford = selectedAction ? entity.ap.current >= selectedAction.apCost : false;
  const needsTarget = selectedAction?.needsTarget ?? false;
  const needsSkillContest = (selectedAction?.type === "attack" || selectedAction?.type === "spell") && onInitiateSkillContest;
  const canSubmit = !disabled && canAfford && (!needsTarget || selectedTarget) && (!needsSkillContest || (showSkillSelection && selectedSkill));

  const handleSubmit = () => {
    if (!canSubmit || !selectedAction) return;

    // If this action needs a skill contest, initiate it
    if (needsSkillContest && selectedTarget && selectedSkill && onInitiateSkillContest) {
      // Roll dice client-side
      const rawValues = Array.from({ length: diceCount }, () =>
        Math.floor(Math.random() * 100) + 1
      );
      const skillModifier = entity.skills[selectedSkill] || 0;

      const roll: DiceRoll = {
        diceCount,
        diceSize: 100,
        rawValues,
        keepHighest,
        modifier: skillModifier,
      };

      onInitiateSkillContest(selectedTarget, selectedSkill, roll);
    } else {
      // Regular action declaration
      onDeclareAction(
        selectedAction.type,
        selectedAction.apCost,
        needsTarget ? selectedTarget ?? undefined : undefined
      );
    }

    // Reset selection
    setSelectedTarget(null);
    setSelectedSkill(null);
    setShowSkillSelection(false);
  };

  const handleTargetSelected = (targetId: string) => {
    setSelectedTarget(targetId);
    if (needsSkillContest) {
      setShowSkillSelection(true);
    }
  };

  const grimoireClasses = [
    "action-grimoire",
    disabled && "action-grimoire--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (disabled) {
    return (
      <div className={`${grimoireClasses} action-grimoire--closed`}>
        <div className="action-grimoire__closed-state">
          <div className="action-grimoire__book-cover">
            <div className="action-grimoire__book-title war-text-display">
              Action Grimoire
            </div>
            <div className="action-grimoire__lock">🔒</div>
          </div>
          <p className="action-grimoire__waiting-text">
            Awaiting your turn...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={grimoireClasses}>
      {/* Header */}
      <div className="action-grimoire__header">
        <h3 className="action-grimoire__title war-text-display">
          📖 Declare Action
        </h3>
        <button
          className="action-grimoire__end-turn"
          onClick={onEndTurn}
          title="End your turn"
        >
          <span className="action-grimoire__end-turn-icon">⏭️</span>
          <span className="action-grimoire__end-turn-text">End Turn</span>
        </button>
      </div>

      {/* Action Tabs */}
      <div className="action-grimoire__tabs">
        {ACTION_TABS.map((tab) => {
          const isSelected = selectedTab === tab.type;
          const isAffordable = entity.ap.current >= tab.apCost;

          return (
            <button
              key={tab.type}
              className={`action-grimoire__tab ${
                isSelected ? "action-grimoire__tab--selected" : ""
              } ${!isAffordable ? "action-grimoire__tab--disabled" : ""}`}
              onClick={() => {
                setSelectedTab(tab.type);
                setSelectedTarget(null);
              }}
              disabled={!isAffordable}
              title={`${tab.label} (${tab.apCost} AP)`}
            >
              <span className="action-grimoire__tab-icon">{tab.icon}</span>
              <span className="action-grimoire__tab-label">{tab.label}</span>
              <span className="action-grimoire__tab-cost war-text-mono">
                {tab.apCost} AP
              </span>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="action-grimoire__content">
        {selectedAction && (
          <>
            {/* Action Description */}
            <div className="action-grimoire__description">
              <p className="action-grimoire__description-text">
                {selectedAction.description}
              </p>
              <div className="action-grimoire__cost-display">
                <span className="action-grimoire__cost-label">Cost:</span>
                <span className="action-grimoire__cost-value war-text-mono">
                  {selectedAction.apCost} AP
                </span>
              </div>
            </div>

            {/* Target Selection */}
            {needsTarget && (
              <div className="action-grimoire__targets">
                <label className="action-grimoire__targets-label">
                  Select Target:
                </label>
                {enemies.length === 0 ? (
                  <p className="action-grimoire__no-targets">
                    No valid targets available
                  </p>
                ) : (
                  <div className="action-grimoire__target-grid">
                    {enemies.map((enemy) => (
                      <button
                        key={enemy.id}
                        className={`action-grimoire__target ${
                          selectedTarget === enemy.id
                            ? "action-grimoire__target--selected"
                            : ""
                        }`}
                        onClick={() => handleTargetSelected(enemy.id)}
                      >
                        <span className="action-grimoire__target-name">
                          {enemy.name}
                        </span>
                        <span className="action-grimoire__target-info war-text-mono">
                          {enemy.ap.current}/{enemy.ap.max} AP
                        </span>
                        {enemy.statusEffects.length > 0 && (
                          <span className="action-grimoire__target-status">
                            {enemy.statusEffects.length} effect
                            {enemy.statusEffects.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Skill Selection for Contest Actions */}
            {showSkillSelection && (
              <div className="action-grimoire__skill-section">
                <SkillSelector
                  entity={entity}
                  selectedSkill={selectedSkill}
                  onSkillChange={setSelectedSkill}
                  label="Attack Skill:"
                  placeholder="Choose your attack skill..."
                />

                <DiceRollConfig
                  diceCount={diceCount}
                  keepHighest={keepHighest}
                  onDiceCountChange={setDiceCount}
                  onKeepHighestChange={setKeepHighest}
                />
              </div>
            )}

            {/* Submit Button */}
            <button
              className="action-grimoire__submit"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              <span className="action-grimoire__submit-icon">
                {selectedAction.icon}
              </span>
              <span className="action-grimoire__submit-text">
                {needsSkillContest && showSkillSelection ? "Roll Attack" : `Declare ${selectedAction.label}`}
              </span>
            </button>
          </>
        )}
      </div>

      {/* Decorative Page Edge */}
      <div className="action-grimoire__page-edge" aria-hidden="true" />
    </div>
  );
};

export default ActionGrimoire;
