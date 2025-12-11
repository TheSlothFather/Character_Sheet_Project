import type { NamedDefinition } from "../../api/client";

export type AttributeKey = "PHYSICAL" | "MENTAL" | "SPIRITUAL" | "WILL";

const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  PHYSICAL: "Physical",
  MENTAL: "Mental",
  SPIRITUAL: "Spiritual",
  WILL: "Will"
};

export const SKILL_ATTRIBUTE_MAP: Record<string, AttributeKey[]> = {
  MARTIAL_PROWESS: ["PHYSICAL", "WILL"],
  ILDAKAR_FACULTY: ["MENTAL", "SPIRITUAL"],
  PSIONIC_TECHNIQUE: ["MENTAL"],
  RESIST_PSIONICS: ["MENTAL"],
  BATTLE: ["PHYSICAL"],
  CONCEAL: ["PHYSICAL"],
  FORAGE: ["PHYSICAL", "MENTAL"],
  NAVIGATE: ["PHYSICAL", "SPIRITUAL"],
  RESIST_TOXINS: ["PHYSICAL"],
  SENSE_SUPERNATURAL: ["SPIRITUAL"],
  SEDUCE: ["PHYSICAL", "WILL"],
  FEAT_OF_AUSTERITY: ["WILL"],
  RESIST_SUPERNATURAL: ["SPIRITUAL"],
  FEAT_OF_STRENGTH: ["PHYSICAL"],
  FEAT_OF_AGILITY: ["PHYSICAL"],
  SEARCH: ["MENTAL"],
  IDENTIFY: ["MENTAL", "SPIRITUAL"],
  DECEIVE: ["MENTAL", "WILL"],
  TRACK: ["PHYSICAL", "MENTAL"],
  INTIMIDATE: ["PHYSICAL", "WILL"],
  WILL_DAKAR: ["WILL"],
  ACADEMIC_RECALL: ["MENTAL"],
  INTERPRET: ["MENTAL", "SPIRITUAL"],
  ENDURE: ["WILL"],
  CRAFT: ["PHYSICAL", "MENTAL"],
  ANIMAL_HUSBANDRY: ["PHYSICAL", "SPIRITUAL"],
  FEAT_OF_DEFIANCE: ["WILL"]
};

const CATEGORY_LABELS: Record<string, string> = {
  "MENTAL+PHYSICAL": "Subsistence",
  "PHYSICAL+SPIRITUAL": "Intuition",
  "PHYSICAL+WILL": "Presence",
  "MENTAL+SPIRITUAL": "Sagacity",
  "MENTAL+WILL": "Cunning",
  "SPIRITUAL+WILL": "Benediction"
};

const CATEGORY_ORDER = [
  "MENTAL+PHYSICAL",
  "PHYSICAL+SPIRITUAL",
  "PHYSICAL+WILL",
  "MENTAL+SPIRITUAL",
  "MENTAL+WILL",
  "SPIRITUAL+WILL"
];

export const getSkillCode = (skill: { id: string; code?: string }): string => skill.code ?? skill.id;

export const normalizeSkillCode = (skill: { id: string; code?: string; name?: string }): string =>
  (skill.code ?? skill.id ?? skill.name ?? "").toUpperCase();

export const getSkillAttributes = (skill: NamedDefinition | string): AttributeKey[] => {
  const key = typeof skill === "string" ? skill : normalizeSkillCode(skill);
  return SKILL_ATTRIBUTE_MAP[key] ?? [];
};

const buildCategoryKey = (attributes: AttributeKey[]): string => {
  if (!attributes.length) return "uncategorized";
  const unique = Array.from(new Set(attributes)).sort();
  return unique.join("+");
};

const formatCategoryLabel = (attributes: AttributeKey[]): string => {
  if (!attributes.length) return "Uncategorized";
  const sorted = Array.from(new Set(attributes)).sort();
  const key = sorted.join("+");
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  return sorted.map((attr) => ATTRIBUTE_LABELS[attr]).join(" + ");
};

export const groupSkillsByCategory = (
  skills: NamedDefinition[]
): { key: string; label: string; skills: NamedDefinition[] }[] => {
  const groups = new Map<string, { key: string; label: string; skills: NamedDefinition[] }>();

  skills.forEach((skill) => {
    const attributes = getSkillAttributes(skill);
    const categoryKey = buildCategoryKey(attributes);
    const label = formatCategoryLabel(attributes);
    if (!groups.has(categoryKey)) {
      groups.set(categoryKey, { key: categoryKey, label, skills: [] });
    }
    groups.get(categoryKey)?.skills.push(skill);
  });

  const orderedKeys = Array.from(groups.keys()).sort((a, b) => {
    const aIdx = CATEGORY_ORDER.indexOf(a);
    const bIdx = CATEGORY_ORDER.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  return orderedKeys.map((key) => groups.get(key)!) as {
    key: string;
    label: string;
    skills: NamedDefinition[];
  }[];
};
