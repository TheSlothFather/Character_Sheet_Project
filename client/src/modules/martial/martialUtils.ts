import Papa from "papaparse";

export type EquipmentKind = "Weapon" | "Armor";

export interface MartialAbility {
  id: string;
  kind: EquipmentKind;
  category: string;
  name: string;
  mpCost: number;
  energyCost: string;
  actionPointCost: string;
  damage: string;
  damageType: string;
  range: string;
  abilityType: string;
  description: string;
  twoHanded?: boolean;
}

interface MartialCsvRow {
  Category: string;
  "Energy Cost": string;
  "Action Point Cost": string;
  Damage: string;
  Type: string;
  Range: string;
  MP: string;
  "Two-Handed?"?: string;
  "Ability Name": string;
  "Ability Type": string;
  Description: string;
}

const cleanText = (value: string | undefined): string => (value ?? "").trim();

const toDisplayValue = (value: string | undefined): string => {
  const cleaned = cleanText(value);
  if (!cleaned || cleaned === "—") return "—";
  return cleaned;
};

const parseBoolean = (value: string | undefined): boolean | undefined => {
  const cleaned = cleanText(value);
  if (!cleaned) return undefined;
  return /^y(es)?$/i.test(cleaned);
};

export const parseMartialCsv = (csvText: string, kind: EquipmentKind): MartialAbility[] => {
  const parsed = Papa.parse<MartialCsvRow>(csvText, {
    header: true,
    skipEmptyLines: true
  });

  if (parsed.errors.length) {
    console.warn(`Errors while parsing ${kind} CSV`, parsed.errors);
  }

  const abilityCounts = new Map<string, number>();
  const abilities: MartialAbility[] = [];

  for (const row of parsed.data || []) {
    const category = cleanText(row.Category);
    const name = cleanText(row["Ability Name"]);

    if (!category || !name) continue;

    const key = `${kind}:${category}:${name}`;
    const occurrence = (abilityCounts.get(key) ?? 0) + 1;
    abilityCounts.set(key, occurrence);
    const id = occurrence === 1 ? key : `${key}#${occurrence}`;

    const ability: MartialAbility = {
      id,
      kind,
      category,
      name,
      mpCost: Number(row.MP) || 0,
      energyCost: toDisplayValue(row["Energy Cost"]),
      actionPointCost: toDisplayValue(row["Action Point Cost"]),
      damage: toDisplayValue(row.Damage),
      damageType: toDisplayValue(row.Type),
      range: toDisplayValue(row.Range),
      abilityType: toDisplayValue(row["Ability Type"]),
      description: toDisplayValue(row.Description),
      twoHanded: parseBoolean(row["Two-Handed?"])
    };

    abilities.push(ability);
  }

  return abilities.sort((a, b) => {
    if (a.category === b.category) return a.name.localeCompare(b.name);
    return a.category.localeCompare(b.category);
  });
};

export const DEFAULT_MP_POOL = 20;
