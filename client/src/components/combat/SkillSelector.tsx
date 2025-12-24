/**
 * SkillSelector Component
 *
 * Dropdown selector for an entity's skills with modifiers displayed.
 * Used for initiating skill contests and selecting defense skills.
 */

import React from "react";
import type { CombatEntity } from "@shared/rules/combat";

export interface SkillSelectorProps {
  entity: CombatEntity | null;
  selectedSkill: string | null;
  onSkillChange: (skill: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const SkillSelector: React.FC<SkillSelectorProps> = ({
  entity,
  selectedSkill,
  onSkillChange,
  label = "Select Skill",
  placeholder = "Choose a skill...",
  disabled = false,
}) => {
  if (!entity) {
    return (
      <div className="skill-selector">
        <label>{label}</label>
        <select disabled>
          <option>No entity selected</option>
        </select>
      </div>
    );
  }

  // Get skill list from entity's skills map
  const skills = entity.skills || {};
  const skillEntries = Object.entries(skills).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <div className="skill-selector">
      <label htmlFor="skill-select">{label}</label>
      <select
        id="skill-select"
        value={selectedSkill ?? ""}
        onChange={(e) => onSkillChange(e.target.value)}
        disabled={disabled || skillEntries.length === 0}
        className="skill-select"
      >
        <option value="" disabled>
          {skillEntries.length === 0 ? "No skills available" : placeholder}
        </option>
        {skillEntries.map(([skillName, modifier]) => (
          <option key={skillName} value={skillName}>
            {skillName} ({modifier >= 0 ? "+" : ""}
            {modifier})
          </option>
        ))}
      </select>
    </div>
  );
};

export default SkillSelector;
