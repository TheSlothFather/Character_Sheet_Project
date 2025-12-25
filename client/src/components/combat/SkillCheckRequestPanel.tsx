/**
 * SkillCheckRequestPanel Component
 *
 * GM interface for requesting skill checks from players.
 * Allows GM to select a player entity, skill, and optional target number.
 */

import React from "react";
import type { CombatEntity } from "@shared/rules/combat";
import "./WarChronicle.css";

export interface SkillCheckRequestPanelProps {
  playerEntities: CombatEntity[];
  onRequestSkillCheck: (
    targetPlayerId: string,
    targetEntityId: string,
    skill: string,
    targetNumber?: number
  ) => void;
  disabled?: boolean;
  className?: string;
}

export const SkillCheckRequestPanel: React.FC<SkillCheckRequestPanelProps> = ({
  playerEntities,
  onRequestSkillCheck,
  disabled = false,
  className = "",
}) => {
  const [selectedEntityId, setSelectedEntityId] = React.useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = React.useState<string>("");
  const [targetNumber, setTargetNumber] = React.useState<string>("");
  const [useTargetNumber, setUseTargetNumber] = React.useState(false);

  const selectedEntity = playerEntities.find((e) => e.id === selectedEntityId);

  // Extract player ID from controller string (format: "player:uuid")
  const getPlayerIdFromController = (controller: string): string => {
    if (controller.startsWith("player:")) {
      return controller.substring(7);
    }
    return controller;
  };

  const handleRequest = () => {
    if (!selectedEntity || !selectedSkill) return;

    const playerId = getPlayerIdFromController(selectedEntity.controller as string);
    const tn = useTargetNumber && targetNumber ? parseInt(targetNumber, 10) : undefined;

    onRequestSkillCheck(playerId, selectedEntity.id, selectedSkill, tn);

    // Reset form
    setSelectedSkill("");
    setTargetNumber("");
    setUseTargetNumber(false);
  };

  const canRequest = selectedEntity && selectedSkill.trim() !== "" && !disabled;

  if (playerEntities.length === 0) {
    return (
      <div className="skill-check-request-panel skill-check-request-panel--empty">
        <p>No player-controlled entities in combat</p>
      </div>
    );
  }

  const panelClasses = [
    "skill-check-request-panel",
    disabled && "skill-check-request-panel--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Get available skills from selected entity
  const availableSkills = selectedEntity
    ? Object.entries(selectedEntity.skills).sort(([a], [b]) => a.localeCompare(b))
    : [];

  return (
    <div className={panelClasses}>
      {/* Header */}
      <div className="skill-check-request-panel__header">
        <h3 className="skill-check-request-panel__title war-text-display">
          Request Skill Check
        </h3>
      </div>

      {/* Entity Selection */}
      <div className="skill-check-request-panel__section">
        <label className="skill-check-request-panel__label">
          Select Player:
          <select
            value={selectedEntityId || ""}
            onChange={(e) => {
              setSelectedEntityId(e.target.value || null);
              setSelectedSkill("");
            }}
            disabled={disabled}
            className="skill-check-request-panel__select"
          >
            <option value="">Choose player...</option>
            {playerEntities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Skill Selection */}
      {selectedEntity && (
        <div className="skill-check-request-panel__section">
          <label className="skill-check-request-panel__label">
            Skill to Check:
            {availableSkills.length > 0 ? (
              <select
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(e.target.value)}
                disabled={disabled}
                className="skill-check-request-panel__select"
              >
                <option value="">Choose skill...</option>
                {availableSkills.map(([skillName, modifier]) => (
                  <option key={skillName} value={skillName}>
                    {skillName} ({modifier >= 0 ? "+" : ""}{modifier})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(e.target.value)}
                placeholder="Enter skill name..."
                disabled={disabled}
                className="skill-check-request-panel__input"
              />
            )}
          </label>
        </div>
      )}

      {/* Target Number (Optional) */}
      {selectedEntity && selectedSkill && (
        <div className="skill-check-request-panel__section">
          <label className="skill-check-request-panel__checkbox-label">
            <input
              type="checkbox"
              checked={useTargetNumber}
              onChange={(e) => setUseTargetNumber(e.target.checked)}
              disabled={disabled}
            />
            Set Target Number (DC)
          </label>

          {useTargetNumber && (
            <input
              type="number"
              value={targetNumber}
              onChange={(e) => setTargetNumber(e.target.value)}
              placeholder="Target number..."
              min={1}
              max={200}
              disabled={disabled}
              className="skill-check-request-panel__input skill-check-request-panel__input--number"
            />
          )}
        </div>
      )}

      {/* Request Button */}
      <button
        className="skill-check-request-panel__request-btn"
        onClick={handleRequest}
        disabled={!canRequest}
      >
        Request {selectedSkill || "Skill"} Check
      </button>

      {/* Decorative border */}
      <div className="skill-check-request-panel__border" aria-hidden="true" />
    </div>
  );
};

export default SkillCheckRequestPanel;
