/**
 * GmSkillActionPanel Component
 *
 * GM interface for initiating contests or straight skill checks.
 * Allows selecting any roller/target, skill, and roll configuration.
 */

import React from "react";
import type { CombatEntity, DiceRoll } from "@shared/rules/combat";
import { SkillSelector } from "./SkillSelector";
import { DiceRollConfig } from "./DiceRollConfig";
import "./WarChronicle.css";

export interface GmSkillActionPanelProps {
  entities: CombatEntity[];
  onInitiateContest: (params: {
    initiatorEntityId: string;
    targetEntityId: string;
    skill: string;
    roll: DiceRoll;
    gmCanResolve?: boolean;
  }) => Promise<void> | void;
  onRequestSkillCheck: (params: {
    targetPlayerId: string;
    targetEntityId: string;
    skill: string;
    targetNumber?: number;
    diceCount?: number;
    keepHighest?: boolean;
    gmCanResolve?: boolean;
  }) => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}

const getPlayerIdFromController = (controller: string): string => {
  if (controller.startsWith("player:")) {
    return controller.substring(7);
  }
  return "gm";
};

export const GmSkillActionPanel: React.FC<GmSkillActionPanelProps> = ({
  entities,
  onInitiateContest,
  onRequestSkillCheck,
  disabled = false,
  className = "",
}) => {
  const [selectedRollerId, setSelectedRollerId] = React.useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = React.useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = React.useState<string | null>(null);
  const [diceCount, setDiceCount] = React.useState(2);
  const [keepHighest, setKeepHighest] = React.useState(true);
  const [useTargetNumber, setUseTargetNumber] = React.useState(false);
  const [targetNumber, setTargetNumber] = React.useState("");
  const [forceCheck, setForceCheck] = React.useState(false);
  const [allowGmResolve, setAllowGmResolve] = React.useState(false);

  const sortedEntities = React.useMemo(
    () => [...entities].sort((a, b) => a.name.localeCompare(b.name)),
    [entities]
  );

  const selectedRoller = sortedEntities.find((entity) => entity.id === selectedRollerId) ?? null;
  const selectedTarget = sortedEntities.find((entity) => entity.id === selectedTargetId) ?? null;
  const isContestMode = !!selectedTargetId && !forceCheck;
  const isCheckMode = !isContestMode;
  const gmResolveCandidate = isContestMode
    ? selectedTarget?.controller.startsWith("player:")
    : selectedRoller?.controller.startsWith("player:");

  React.useEffect(() => {
    if (forceCheck) {
      setSelectedTargetId(null);
    }
  }, [forceCheck]);

  React.useEffect(() => {
    if (selectedRollerId && selectedTargetId === selectedRollerId) {
      setSelectedTargetId(null);
    }
  }, [selectedRollerId, selectedTargetId]);

  React.useEffect(() => {
    if (!gmResolveCandidate) {
      setAllowGmResolve(false);
    }
  }, [gmResolveCandidate]);

  const availableTargets = React.useMemo(
    () => sortedEntities.filter((entity) => entity.id !== selectedRollerId),
    [sortedEntities, selectedRollerId]
  );

  const handleSubmit = async () => {
    if (!selectedRoller || !selectedSkill) return;

    if (isContestMode) {
      if (!selectedTarget) return;

      const rawValues = Array.from({ length: diceCount }, () =>
        Math.floor(Math.random() * 100) + 1
      );
      const skillModifier = selectedRoller.skills[selectedSkill] ?? 0;
      const roll: DiceRoll = {
        diceCount,
        diceSize: 100,
        rawValues,
        keepHighest,
        modifier: skillModifier,
      };

      try {
        await onInitiateContest({
          initiatorEntityId: selectedRoller.id,
          targetEntityId: selectedTarget.id,
          skill: selectedSkill,
          roll,
          gmCanResolve: allowGmResolve,
        });
        setSelectedTargetId(null);
        setSelectedSkill(null);
        setAllowGmResolve(false);
      } catch {
        return;
      }
      return;
    }

    const playerId = getPlayerIdFromController(selectedRoller.controller as string);
    const tn = useTargetNumber && targetNumber ? parseInt(targetNumber, 10) : undefined;
    const gmCanResolve = selectedRoller.controller === "gm" ? true : allowGmResolve;

    try {
      await onRequestSkillCheck({
        targetPlayerId: playerId,
        targetEntityId: selectedRoller.id,
        skill: selectedSkill,
        targetNumber: typeof tn === "number" && Number.isFinite(tn) ? tn : undefined,
        diceCount,
        keepHighest,
        gmCanResolve,
      });
      setSelectedSkill(null);
      setUseTargetNumber(false);
      setTargetNumber("");
      setAllowGmResolve(false);
    } catch {
      return;
    }
  };

  const canSubmit = !!selectedRoller && !!selectedSkill && !disabled && (isCheckMode || !!selectedTarget);

  const panelClasses = [
    "skill-check-request-panel",
    disabled && "skill-check-request-panel--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (sortedEntities.length === 0) {
    return (
      <div className="skill-check-request-panel skill-check-request-panel--empty">
        <p>No entities available</p>
      </div>
    );
  }

  return (
    <div className={panelClasses}>
      <div className="skill-check-request-panel__header">
        <h3 className="skill-check-request-panel__title war-text-display">
          Skill Actions
        </h3>
      </div>

      <div className="skill-check-request-panel__section">
        <label className="skill-check-request-panel__label">
          Roller:
          <select
            value={selectedRollerId || ""}
            onChange={(e) => {
              setSelectedRollerId(e.target.value || null);
              setSelectedSkill(null);
            }}
            disabled={disabled}
            className="skill-check-request-panel__select"
          >
            <option value="">Choose entity...</option>
            {sortedEntities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="skill-check-request-panel__section">
        <label className="skill-check-request-panel__checkbox-label">
          <input
            type="checkbox"
            checked={forceCheck}
            onChange={(e) => setForceCheck(e.target.checked)}
            disabled={disabled}
          />
          Straight check (skip contest target)
        </label>
      </div>

      <div className="skill-check-request-panel__section">
        <label className="skill-check-request-panel__label">
          Target:
          <select
            value={selectedTargetId || ""}
            onChange={(e) => setSelectedTargetId(e.target.value || null)}
            disabled={disabled || forceCheck || !selectedRoller}
            className="skill-check-request-panel__select"
          >
            <option value="">No target (skill check)</option>
            {availableTargets.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="skill-check-request-panel__section">
        <SkillSelector
          entity={selectedRoller}
          selectedSkill={selectedSkill}
          onSkillChange={setSelectedSkill}
          label="Skill:"
          placeholder="Choose skill..."
          disabled={disabled || !selectedRoller}
        />
      </div>

      <div className="skill-check-request-panel__section">
        <DiceRollConfig
          diceCount={diceCount}
          keepHighest={keepHighest}
          onDiceCountChange={setDiceCount}
          onKeepHighestChange={setKeepHighest}
          disabled={disabled || !selectedRoller}
        />
      </div>

      {isCheckMode && selectedRoller && selectedSkill && (
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

      {gmResolveCandidate && (
        <div className="skill-check-request-panel__section">
          <label className="skill-check-request-panel__checkbox-label">
            <input
              type="checkbox"
              checked={allowGmResolve}
              onChange={(e) => setAllowGmResolve(e.target.checked)}
              disabled={disabled}
            />
            Allow GM to roll for player
          </label>
        </div>
      )}

      <button
        className="skill-check-request-panel__request-btn"
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        {isContestMode
          ? `Initiate Contest${selectedTarget ? ` vs ${selectedTarget.name}` : ""}`
          : `Request ${selectedSkill || "Skill"} Check`}
      </button>

      <div className="skill-check-request-panel__border" aria-hidden="true" />
    </div>
  );
};

export default GmSkillActionPanel;
