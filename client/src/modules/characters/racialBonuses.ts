import { applyModifiers } from "@shared/rules/modifiers";
import type { Character, DefinitionsResponse, ModifierWithSource } from "../../api/client";
import type { NamedDefinition } from "../../api/client";

const getSkillCode = (skill: NamedDefinition): string => skill.code ?? skill.id;

export const computeRacialSkillBonuses = (
  definitions: DefinitionsResponse | null,
  character: Character | null
): Record<string, number> => {
  if (!definitions || !character) return {} as Record<string, number>;

  const baseSkills = Object.fromEntries(
    definitions.skills.map((skill) => [getSkillCode(skill), { score: 0, racialBonus: 0 }])
  );
  const baseState = { skills: baseSkills } as Record<string, unknown>;

  const applicable = (definitions.modifiers as ModifierWithSource[]).filter((m) => {
    if (m.sourceType === "race") return m.sourceKey === character.raceKey;
    if (m.sourceType === "subrace") return m.sourceKey === character.subraceKey;
    return false;
  });

  const state = applyModifiers({ baseState, modifiers: applicable });
  const result: Record<string, number> = {};
  for (const skill of definitions.skills) {
    const code = getSkillCode(skill);
    const entry = (state.skills as Record<string, any> | undefined)?.[code];
    result[code] = typeof entry?.racialBonus === "number" ? entry.racialBonus : 0;
  }
  return result;
};
