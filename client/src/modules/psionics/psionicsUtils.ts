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

export const DEFAULT_PSI_POINTS = 15;

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

  const abilityMap = new Map<string, PsionicAbility>();

  for (const row of parsed.data || []) {
    if (!row.Ability) continue;
    const tree = row["Ability Tree"];
    const name = row.Ability;
    const key = `${tree}:${name}`;
    if (abilityMap.has(key)) continue;

    const prerequisiteNames = parsePrerequisites(row.Prerequisite);

    abilityMap.set(key, {
      id: key,
      tree,
      name,
      tier: Number(row.Tier),
      prerequisiteNames,
      prerequisiteIds: prerequisiteNames.map((prereq) => `${tree}:${prereq}`),
      description: row.Description,
      energyCost: Number(row["Energy Cost"]),
      formula: row.Formula?.trim() || undefined
    });
  }

  return Array.from(abilityMap.values()).sort((a, b) => {
    if (a.tree === b.tree) {
      if (a.tier === b.tier) return a.name.localeCompare(b.name);
      return a.tier - b.tier;
    }
    return a.tree.localeCompare(b.tree);
  });
};

export const isAbilityUnlocked = (ability: PsionicAbility, purchased: Set<string>): boolean =>
  ability.prerequisiteIds.every((id) => purchased.has(id));
