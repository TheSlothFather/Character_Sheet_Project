/**
 * NpcActionPanel Component
 *
 * GM interface for controlling NPC offensive actions.
 * Allows GM to select NPC, target player, choose skill, and roll attacks.
 */

import React from "react";
import type { CombatEntity, DiceRoll } from "@shared/rules/combat";
import { SkillSelector } from "./SkillSelector";
import { DiceRollConfig } from "./DiceRollConfig";
import "./WarChronicle.css";

export interface NpcActionPanelProps {
  npcEntities: CombatEntity[];
  targetableEntities: CombatEntity[];
  activeNpcId?: string | null;
  onInitiateAttack: (attackerId: string, targetId: string, skill: string, roll: DiceRoll) => void;
  disabled?: boolean;
  className?: string;
}

export const NpcActionPanel: React.FC<NpcActionPanelProps> = ({
  npcEntities,
  targetableEntities,
  activeNpcId,
  onInitiateAttack,
  disabled = false,
  className = "",
}) => {
  const [selectedNpcId, setSelectedNpcId] = React.useState<string | null>(activeNpcId || null);
  const [selectedTargetId, setSelectedTargetId] = React.useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = React.useState<string | null>(null);
  const [diceCount, setDiceCount] = React.useState(2);
  const [keepHighest, setKeepHighest] = React.useState(true);

  // Auto-select active NPC if provided
  React.useEffect(() => {
    if (activeNpcId) {
      setSelectedNpcId(activeNpcId);
    }
  }, [activeNpcId]);

  const selectedNpc = npcEntities.find(e => e.id === selectedNpcId);
  const canAttack = selectedNpc && selectedTargetId && selectedSkill && !disabled;

  const handleAttack = () => {
    if (!canAttack || !selectedNpc) return;

    // Roll dice
    const rawValues = Array.from({ length: diceCount }, () =>
      Math.floor(Math.random() * 100) + 1
    );
    const skillModifier = selectedNpc.skills[selectedSkill!] || 0;

    const roll: DiceRoll = {
      diceCount,
      diceSize: 100,
      rawValues,
      keepHighest,
      modifier: skillModifier,
    };

    onInitiateAttack(selectedNpc.id, selectedTargetId!, selectedSkill!, roll);

    // Reset selections
    setSelectedTargetId(null);
    setSelectedSkill(null);
  };

  if (npcEntities.length === 0) {
    return (
      <div className="npc-action-panel npc-action-panel--empty">
        <p>No GM-controlled entities available</p>
      </div>
    );
  }

  const panelClasses = [
    "npc-action-panel",
    disabled && "npc-action-panel--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={panelClasses}>
      {/* Header */}
      <div className="npc-action-panel__header">
        <h3 className="npc-action-panel__title war-text-display">
          ⚔️ NPC Attack
        </h3>
      </div>

      {/* NPC Selector */}
      {!activeNpcId && (
        <div className="npc-action-panel__npc-select">
          <label className="npc-action-panel__label">
            Select NPC:
            <select
              value={selectedNpcId || ""}
              onChange={(e) => {
                setSelectedNpcId(e.target.value);
                setSelectedSkill(null);
              }}
              disabled={disabled}
              className="npc-action-panel__select"
            >
              <option value="" disabled>Choose NPC...</option>
              {npcEntities.map((npc) => (
                <option key={npc.id} value={npc.id}>
                  {npc.name} ({npc.ap.current}/{npc.ap.max} AP)
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Active NPC Display */}
      {activeNpcId && selectedNpc && (
        <div className="npc-action-panel__active-npc">
          <div className="npc-action-panel__npc-name war-text-display">
            {selectedNpc.name}
          </div>
          <div className="npc-action-panel__npc-resources war-text-mono">
            {selectedNpc.ap.current}/{selectedNpc.ap.max} AP
          </div>
        </div>
      )}

      {/* Target Selection */}
      {selectedNpc && (
        <div className="npc-action-panel__targets">
          <label className="npc-action-panel__label">Select Target:</label>
          {targetableEntities.length === 0 ? (
            <p className="npc-action-panel__no-targets">No targets available</p>
          ) : (
            <div className="npc-action-panel__target-grid">
              {targetableEntities.map((target) => (
                <button
                  key={target.id}
                  className={`npc-action-panel__target ${
                    selectedTargetId === target.id
                      ? "npc-action-panel__target--selected"
                      : ""
                  }`}
                  onClick={() => setSelectedTargetId(target.id)}
                  disabled={disabled}
                >
                  <span className="npc-action-panel__target-name">
                    {target.name}
                  </span>
                  <span className="npc-action-panel__target-info war-text-mono">
                    {target.energy.current}/{target.energy.max} HP
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Skill and Dice Configuration */}
      {selectedNpc && selectedTargetId && (
        <div className="npc-action-panel__attack-config">
          <SkillSelector
            entity={selectedNpc}
            selectedSkill={selectedSkill}
            onSkillChange={setSelectedSkill}
            label="Attack Skill:"
            placeholder="Choose attack skill..."
            disabled={disabled}
          />

          <DiceRollConfig
            diceCount={diceCount}
            keepHighest={keepHighest}
            onDiceCountChange={setDiceCount}
            onKeepHighestChange={setKeepHighest}
            disabled={disabled}
          />
        </div>
      )}

      {/* Attack Button */}
      {selectedNpc && selectedTargetId && (
        <button
          className="npc-action-panel__attack-btn"
          onClick={handleAttack}
          disabled={!canAttack}
        >
          <span className="npc-action-panel__attack-icon">⚔️</span>
          Attack {targetableEntities.find(t => t.id === selectedTargetId)?.name}
        </button>
      )}

      {/* Decorative border */}
      <div className="npc-action-panel__border" aria-hidden="true" />
    </div>
  );
};

export default NpcActionPanel;
