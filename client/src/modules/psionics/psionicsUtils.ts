import Papa from "papaparse";

export interface PsionicAbility {
  id: string;
  tree: string;
  name: string;
  tier: number;
  prerequisiteNames: string[];
  prerequisiteIds: string[];
  description: string;
  energyCost: number;
  formula?: string;
}

interface PsionicsCsvRow {
  "Ability Tree": string;
  Ability: string;
  Tier: string;
  Prerequisite?: string;
  Description: string;
  "Energy Cost": string;
  Formula?: string;
}

export const DEFAULT_PSI_POINTS = 0;

export const evaluateFormula = (formula: string, mental: number): number | null => {
  const trimmed = formula.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/\s+/g, "");
  if (!/^([0-9]+|[+*]|Mental)+$/i.test(normalized)) {
    return null;
  }

  const terms = normalized.split("+");
  let total = 0;

  for (const term of terms) {
    if (!term) return null;
    const factors = term.split("*");
    let termValue = 1;

    for (const factor of factors) {
      if (!factor) return null;
      if (/^mental$/i.test(factor)) {
        termValue *= mental;
      } else {
        const numeric = Number(factor);
        if (!Number.isFinite(numeric)) return null;
        termValue *= numeric;
      }
    }

    total += termValue;
  }

  return total;
};

const parsePrerequisites = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
};

export const parsePsionicsCsv = (csvText: string): PsionicAbility[] => {
  const parsed = Papa.parse<PsionicsCsvRow>(csvText, {
    header: true,
    skipEmptyLines: true
  });

  if (parsed.errors.length) {
    console.warn("Errors while parsing psionics CSV", parsed.errors);
  }

  const abilityBuckets = new Map<string, PsionicAbility[]>();
  const abilities: PsionicAbility[] = [];

  for (const row of parsed.data || []) {
    if (!row.Ability) continue;
    const tree = row["Ability Tree"];
    const name = row.Ability;
    const key = `${tree}:${name}`;

    const prerequisiteNames = parsePrerequisites(row.Prerequisite);

    const priorEntries = abilityBuckets.get(key) ?? [];
    const occurrence = priorEntries.length + 1;
    const id = occurrence === 1 ? key : `${key}#${occurrence}`;

    const prerequisiteIds = prerequisiteNames.map((prereq) => {
      const prereqKey = `${tree}:${prereq}`;
      const prereqBucket = abilityBuckets.get(prereqKey);
      if (!prereqBucket || prereqBucket.length === 0) {
        return prereqKey;
      }
      return prereqBucket[prereqBucket.length - 1].id;
    });

    const ability: PsionicAbility = {
      id,
      tree,
      name,
      tier: Number(row.Tier),
      prerequisiteNames,
      prerequisiteIds,
      description: row.Description,
      energyCost: Number(row["Energy Cost"]),
      formula: row.Formula?.trim() || undefined
    };

    abilities.push(ability);
    priorEntries.push(ability);
    abilityBuckets.set(key, priorEntries);
  }

  return abilities.sort((a, b) => {
    if (a.tree === b.tree) {
      if (a.tier === b.tier) return a.name.localeCompare(b.name);
      return a.tier - b.tier;
    }
    return a.tree.localeCompare(b.tree);
  });
};

export const isAbilityUnlocked = (
  ability: PsionicAbility,
  purchased: Set<string>,
  options?: { allowTier1WithoutPrereq?: boolean }
): boolean => {
  const allowTier1WithoutPrereq = options?.allowTier1WithoutPrereq ?? true;

  if (!allowTier1WithoutPrereq && ability.tier === 1 && ability.prerequisiteIds.length === 0) {
    return purchased.has(ability.id);
  }

  return ability.prerequisiteIds.every((id) => purchased.has(id));
};

export const replaceMentalAttributePlaceholders = (text: string, mental: number): string => {
  const withMultipliers = text.replace(/mental attribute\s*x\s*(\d+)/gi, (_, multiplier: string) => {
    const parsedMultiplier = Number(multiplier);
    return Number.isFinite(parsedMultiplier) ? String(mental * parsedMultiplier) : String(mental);
  });

  return withMultipliers.replace(/mental attribute/gi, String(mental));
};
