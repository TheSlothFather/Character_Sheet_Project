import type { NamedDefinition } from "../../api/client";

export type AttributeKey = "PHYSICAL" | "MENTAL" | "SPIRITUAL" | "WILL";

const ATTRIBUTE_ORDER: AttributeKey[] = ["PHYSICAL", "MENTAL", "SPIRITUAL", "WILL"];

const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  PHYSICAL: "Physical Skills",
  MENTAL: "Mental Skills",
  SPIRITUAL: "Spiritual Skills",
  WILL: "Will Skills"
};

export const SKILL_ATTRIBUTE_MAP: Record<string, AttributeKey[]> = {
  ACADEMIC_RECALL: ["MENTAL"],
  ANIMAL_HUSBANDRY: ["PHYSICAL", "SPIRITUAL"],
  ARTISTRY: ["SPIRITUAL", "WILL"],
  ATTUNE_WONDEROUS_ITEM: ["SPIRITUAL"],
  BATTLE: ["PHYSICAL"],
  CRAFT: ["MENTAL", "PHYSICAL"],
  CONCEAL: ["PHYSICAL"],
  DEDUCE: ["MENTAL", "SPIRITUAL"],
  DECEIVE: ["MENTAL", "WILL"],
  DIVINE_INTERVENTION: ["SPIRITUAL"],
  ENDURE: ["WILL"],
  FEAT_OF_AGILITY: ["PHYSICAL"],
  FEAT_OF_AUSTERITY: ["WILL"],
  FEAT_OF_DEFIANCE: ["WILL"],
  FEAT_OF_STRENGTH: ["PHYSICAL"],
  FORAGE: ["MENTAL", "PHYSICAL"],
  GATHER_INTELLIGENCE: ["MENTAL", "WILL"],
  HEAL: ["PHYSICAL", "SPIRITUAL"],
  IDENTIFY: ["MENTAL", "SPIRITUAL"],
  INCITE_FATE: ["SPIRITUAL", "WILL"],
  INTIMIDATE: ["PHYSICAL", "WILL"],
  INTERPRET: ["MENTAL", "SPIRITUAL"],
  ILDAKAR_FACULTY: [],
  MARTIAL_PROWESS: [],
  NAVIGATE: ["PHYSICAL", "SPIRITUAL"],
  PARLEY: ["SPIRITUAL", "WILL"],
  PERFORM: ["PHYSICAL", "WILL"],
  PERSEVERE: ["WILL"],
  PSIONIC_TECHNIQUE: ["MENTAL"],
  RESIST_PSIONICS: ["MENTAL"],
  RESIST_SUPERNATURAL: ["SPIRITUAL"],
  RESIST_TOXINS: ["PHYSICAL"],
  SEDUCE: ["PHYSICAL", "WILL"],
  SENSE_SUPERNATURAL: ["SPIRITUAL"],
  SEARCH: ["MENTAL"],
  TRACK: ["MENTAL", "PHYSICAL"],
  TRADE: ["MENTAL", "WILL"],
  TRANSLATE: ["MENTAL"],
  WILL_DAKAR: ["WILL"],
  WORSHIP: ["SPIRITUAL"]
};

const CATEGORY_LABELS: Record<string, string> = {
  PHYSICAL: "Physical Skills",
  MENTAL: "Mental Skills",
  SPIRITUAL: "Spiritual Skills",
  WILL: "Will Skills",
  "PHYSICAL+MENTAL": "Subsistence Skills",
  "PHYSICAL+SPIRITUAL": "Intuition Skills",
  "PHYSICAL+WILL": "Presence Skills",
  "MENTAL+WILL": "Cunning Skills",
  "MENTAL+SPIRITUAL": "Sagacity Skills",
  "SPIRITUAL+WILL": "Benediction Skills"
};

const CATEGORY_ORDER = [
  "PHYSICAL",
  "MENTAL",
  "SPIRITUAL",
  "WILL",
  "PHYSICAL+MENTAL",
  "PHYSICAL+SPIRITUAL",
  "PHYSICAL+WILL",
  "MENTAL+WILL",
  "MENTAL+SPIRITUAL",
  "SPIRITUAL+WILL"
];

export const getSkillCode = (skill: { id: string; code?: string }): string => skill.code ?? skill.id;

export const normalizeSkillCode = (skill: { id: string; code?: string; name?: string }): string =>
  (skill.code ?? skill.id ?? skill.name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const getSkillAttributes = (skill: NamedDefinition | string): AttributeKey[] => {
  const key = typeof skill === "string" ? skill : normalizeSkillCode(skill);
  return SKILL_ATTRIBUTE_MAP[key] ?? [];
};

const sortAttributes = (attributes: AttributeKey[]): AttributeKey[] => {
  const attributeRank = new Map(ATTRIBUTE_ORDER.map((attr, index) => [attr, index]));
  return Array.from(new Set(attributes)).sort((a, b) => (attributeRank.get(a) ?? 99) - (attributeRank.get(b) ?? 99));
};

const buildCategoryKey = (attributes: AttributeKey[]): string => {
  if (!attributes.length) return "uncategorized";
  return sortAttributes(attributes).join("+");
};

const formatCategoryLabel = (attributes: AttributeKey[]): string => {
  if (!attributes.length) return "Uncategorized";
  const sorted = sortAttributes(attributes);
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
