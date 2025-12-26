/**
 * SkillSelector Component
 *
 * Dropdown selector for an entity's skills with modifiers displayed.
 * Used for initiating skill contests and selecting defense skills.
 * Groups skills by attribute categories (Physical, Mental, Spiritual, Will, Hybrid).
 */

import React from "react";
import type { CombatEntity } from "@shared/rules/combat";
import { SKILL_ATTRIBUTE_MAP, normalizeSkillCode } from "../../modules/characters/skillMetadata";

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
  const skillEntries = Object.entries(skills);

  // Categorize skills based on their attributes
  const categorizedSkills = React.useMemo(() => {
    const categories: Record<string, Array<[string, number]>> = {
      'Physical': [],
      'Mental': [],
      'Spiritual': [],
      'Will': [],
      'Subsistence': [], // Physical+Mental
      'Intuition': [],   // Physical+Spiritual
      'Presence': [],    // Physical+Will
      'Cunning': [],     // Mental+Will
      'Sagacity': [],    // Mental+Spiritual
      'Benediction': [], // Spiritual+Will
      'Other': [],
    };

    for (const [name, modifier] of skillEntries) {
      const normalizedName = normalizeSkillCode({ id: name, name });
      const attrs = SKILL_ATTRIBUTE_MAP[normalizedName] || [];

      if (attrs.length === 0) {
        categories['Other'].push([name, modifier]);
      } else if (attrs.length === 1) {
        const attrLabel = attrs[0].charAt(0) + attrs[0].slice(1).toLowerCase();
        categories[attrLabel]?.push([name, modifier]);
      } else if (attrs.length === 2) {
        // Map dual-attribute skills to their category
        const attrKey = attrs.join('+');
        if (attrKey === 'PHYSICAL+MENTAL') categories['Subsistence'].push([name, modifier]);
        else if (attrKey === 'PHYSICAL+SPIRITUAL') categories['Intuition'].push([name, modifier]);
        else if (attrKey === 'PHYSICAL+WILL') categories['Presence'].push([name, modifier]);
        else if (attrKey === 'MENTAL+WILL') categories['Cunning'].push([name, modifier]);
        else if (attrKey === 'MENTAL+SPIRITUAL') categories['Sagacity'].push([name, modifier]);
        else if (attrKey === 'SPIRITUAL+WILL') categories['Benediction'].push([name, modifier]);
        else categories['Other'].push([name, modifier]);
      }
    }

    // Filter out empty categories and sort skills within each category
    return Object.entries(categories)
      .filter(([_, skills]) => skills.length > 0)
      .map(([category, skills]) => [
        category,
        skills.sort(([a], [b]) => a.localeCompare(b))
      ] as const);
  }, [skillEntries]);

  const selectId = "skill-select";

  return (
    <div className="skill-selector">
      <label htmlFor={selectId}>{label}</label>
      {skillEntries.length === 0 ? (
        <input
          id={selectId}
          type="text"
          value={selectedSkill ?? ""}
          onChange={(e) => onSkillChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="skill-select"
        />
      ) : (
        <select
          id={selectId}
          value={selectedSkill ?? ""}
          onChange={(e) => onSkillChange(e.target.value)}
          disabled={disabled}
          className="skill-select"
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {categorizedSkills.map(([category, skills]) => (
            <optgroup key={category} label={`${category} Skills`}>
              {skills.map(([skillName, modifier]) => (
                <option key={skillName} value={skillName}>
                  {skillName} ({modifier >= 0 ? "+" : ""}
                  {modifier})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
    </div>
  );
};

export default SkillSelector;
