import React from "react";
import ancillariesData from "../../data/ancillaries.json";
import { api, Character } from "../../api/client";
import { useDefinitions } from "../definitions/DefinitionsContext";
import { useSelectedCharacter } from "../characters/SelectedCharacterContext";
import { getSkillCode, normalizeSkillCode } from "../characters/skillMetadata";
import weaponsCsv from "../../data/weapons.csv?raw";
import armorCsv from "../../data/armor.csv?raw";
import { parseMartialCsv, MartialAbility } from "../martial/martialUtils";
import { parseMagicFaculties } from "../magic/magicParser";
import facultiesText from "../../data/magic-faculties.txt?raw";
import {
  AncillaryMetadata,
  getAncillaryStorageKey,
  persistAncillarySelection,
  readAncillarySelection
} from "./storage";

type RawAncillary = {
  id: string;
  name: string;
  requirements: string[];
  description: string;
};

type RawAncestryGroup = {
  id: string;
  name: string;
  entries: { id: string; name: string; description: string }[];
};

type AncillaryEntry = {
  id: string;
  name: string;
  description: string;
  requirements: string[];
  category: "general" | "ancestry";
  ancestryGroup?: string;
  ancestryGroupId?: string;
};

const data = ancillariesData as {
  ancestryGroups: RawAncestryGroup[];
  ancillaries: RawAncillary[];
};

const ANCESTRY_GROUP_ACCESS: Record<string, { raceKey: string; subraceKey?: string }> = {
  "thairin-inin": { raceKey: "ININ", subraceKey: "THAIRIN" },
  "grazin-inin": { raceKey: "ININ", subraceKey: "GRAZIN" },
  "bryonin-inin": { raceKey: "ININ", subraceKey: "BRYONIN" },
  "jiinin-inin": { raceKey: "ININ", subraceKey: "JIININ" },
  "rivanonin-inin": { raceKey: "ININ", subraceKey: "RIVANONIN" },
  "melfarionin-inin": { raceKey: "ININ", subraceKey: "MELFARIONIN" },
  "thuilin-inin": { raceKey: "ININ", subraceKey: "THUILIN" },
  "letelin-inin": { raceKey: "ININ", subraceKey: "LETELIN" },
  anz: { raceKey: "ANZ" },
  "phi-ilin": { raceKey: "PHIILIN" },
  cerevu: { raceKey: "CEREVU" },
  venii: { raceKey: "VENII" },
  freinin: { raceKey: "FREININ" }
};

const SKILL_ALIASES: Record<string, string> = {
  ANIMAL_HANDLING: "ANIMAL_HUSBANDRY"
};

const normalizeName = (value: string | undefined): string => (value ?? "").trim().toLowerCase();

const MARTIAL_STORAGE_PREFIX = "martial_prowess_v2";
const ILDAKAR_BACKGROUNDS = new Set([
  "thermomancy",
  "graviturgist",
  "vivomancer",
  "electromancer",
  "pneumancer",
  "photomancer"
].map(normalizeName));

type MartialProgress = {
  totalUnlocked: number;
  unlockedByCategory: Map<string, number>;
  spentByCategory: Map<string, number>;
  categoryCosts: Map<string, number>;
  categoryAbilityCounts: Map<string, number>;
  categoriesByName: Map<string, Set<string>>;
};

type IldakarProgress = {
  unlocked: Set<string>;
  basicUnlocked: number;
  advancedUnlocked: number;
  totalBasic: number;
  totalAdvanced: number;
};

const buildMartialCatalog = () => {
  const weaponAbilities = parseMartialCsv(weaponsCsv, "Weapon");
  const armorAbilities = parseMartialCsv(armorCsv, "Armor");
  const abilities = [...weaponAbilities, ...armorAbilities];

  const abilityMap = new Map<string, MartialAbility>();
  const categoryCosts = new Map<string, number>();
  const categoryAbilityCounts = new Map<string, number>();
  const categoriesByName = new Map<string, Set<string>>();

  abilities.forEach((ability) => {
    abilityMap.set(ability.id, ability);
    const key = `${ability.kind}:${ability.category}`;
    categoryCosts.set(key, (categoryCosts.get(key) ?? 0) + ability.mpCost);
    categoryAbilityCounts.set(key, (categoryAbilityCounts.get(key) ?? 0) + 1);

    const normalizedName = normalizeName(ability.category);
    if (!categoriesByName.has(normalizedName)) categoriesByName.set(normalizedName, new Set());
    categoriesByName.get(normalizedName)?.add(key);
  });

  return { abilityMap, categoryCosts, categoryAbilityCounts, categoriesByName };
};

const MARTIAL_CATALOG = buildMartialCatalog();

const readMartialState = (characterId: string | null | undefined): { purchased: Set<string> } => {
  if (typeof window === "undefined" || !characterId) return { purchased: new Set() };
  try {
    const raw = window.localStorage.getItem(`${MARTIAL_STORAGE_PREFIX}:${characterId}`);
    if (!raw) return { purchased: new Set() };
    const parsed = JSON.parse(raw) as { purchased?: string[] };
    const purchased = Array.isArray(parsed.purchased) ? parsed.purchased : [];
    return { purchased: new Set(purchased.filter((id) => MARTIAL_CATALOG.abilityMap.has(id))) };
  } catch (err) {
    console.warn("Unable to read martial prowess state", err);
    return { purchased: new Set() };
  }
};

const summarizeMartialProgress = (characterId: string | null | undefined): MartialProgress => {
  const { purchased } = readMartialState(characterId);
  const unlockedByCategory = new Map<string, number>();
  const spentByCategory = new Map<string, number>();

  purchased.forEach((id) => {
    const ability = MARTIAL_CATALOG.abilityMap.get(id);
    if (!ability) return;
    const key = `${ability.kind}:${ability.category}`;
    unlockedByCategory.set(key, (unlockedByCategory.get(key) ?? 0) + 1);
    spentByCategory.set(key, (spentByCategory.get(key) ?? 0) + ability.mpCost);
  });

  return {
    totalUnlocked: purchased.size,
    unlockedByCategory,
    spentByCategory,
    categoryCosts: MARTIAL_CATALOG.categoryCosts,
    categoryAbilityCounts: MARTIAL_CATALOG.categoryAbilityCounts,
    categoriesByName: MARTIAL_CATALOG.categoriesByName
  };
};

const buildSkillLookup = (definitions: ReturnType<typeof useDefinitions>["data"] | null): Map<string, string> => {
  const lookup = new Map<string, string>();
  (definitions?.skills ?? []).forEach((skill) => {
    const normalized = normalizeSkillCode(skill);
    lookup.set(normalized, getSkillCode(skill));
  });
  return lookup;
};

const resolveSkillCode = (lookup: Map<string, string>, raw: string): string | null => {
  const normalized = normalizeSkillCode({ name: raw });
  if (lookup.has(normalized)) return lookup.get(normalized) ?? null;
  if (SKILL_ALIASES[normalized]) return SKILL_ALIASES[normalized];
  return null;
};

const buildSkillTotals = (character: Character | null, lookup: Map<string, string>): Record<string, number> => {
  const totals: Record<string, number> = {};
  lookup.forEach((code) => {
    totals[code] = 0;
  });

  Object.entries(character?.skillAllocations ?? {}).forEach(([code, value]) => {
    totals[code] = (totals[code] ?? 0) + value;
  });

  Object.entries(character?.skillBonuses ?? {}).forEach(([code, value]) => {
    totals[code] = (totals[code] ?? 0) + value;
  });

  return totals;
};

const FACULTY_CATALOG = parseMagicFaculties(facultiesText);
const FACULTY_LOOKUP = new Map(FACULTY_CATALOG.map((faculty) => [normalizeName(faculty.name), faculty]));

const WEAPON_MASTERY_ID = "weapon-mastery-choose-weapon-category";

const summarizeIldakarFaculties = (characterId: string | null | undefined): IldakarProgress => {
  if (!characterId || typeof window === "undefined") {
    return { unlocked: new Set(), basicUnlocked: 0, advancedUnlocked: 0, totalBasic: 0, totalAdvanced: 0 };
  }

  let stored: Record<string, boolean> = {};
  try {
    const raw = window.localStorage.getItem(`unlocked_faculties_${characterId}`);
    stored = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch (err) {
    console.warn("Unable to read stored Ildakar faculties", err);
  }

  const unlocked = new Set<string>();
  let basicUnlocked = 0;
  let advancedUnlocked = 0;
  FACULTY_CATALOG.forEach((faculty) => {
    const normalized = normalizeName(faculty.name);
    const isUnlocked = Boolean(stored[normalized] ?? stored[faculty.name]);
    if (!isUnlocked) return;
    unlocked.add(faculty.name);
    if (faculty.category === "Basic") basicUnlocked += 1;
    if (faculty.category === "Advanced") advancedUnlocked += 1;
  });

  const totalBasic = FACULTY_CATALOG.filter((faculty) => faculty.category === "Basic").length;
  const totalAdvanced = FACULTY_CATALOG.filter((faculty) => faculty.category === "Advanced").length;

  return { unlocked, basicUnlocked, advancedUnlocked, totalBasic, totalAdvanced };
};

const collectBackgrounds = (backgrounds: Character["backgrounds"] | undefined): { backgrounds: Set<string>; flaws: Set<string> } => {
  const backgroundSet = new Set<string>();
  const flaws = new Set<string>();
  if (!backgrounds) return { backgrounds: backgroundSet, flaws };

  const push = (value: string | string[] | undefined) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((v) => backgroundSet.add(normalizeName(v)));
      return;
    }
    backgroundSet.add(normalizeName(value));
  };

  push(backgrounds.family);
  push(backgrounds.childhood);
  push(backgrounds.adolescence);
  push(backgrounds.adulthood);
  push(backgrounds.incitingIncident);
  (backgrounds.flaws ?? []).forEach((flaw) => flaws.add(normalizeName(flaw)));

  return { backgrounds: backgroundSet, flaws };
};

const resolveRaceNames = (
  character: Character | null,
  raceMap: Map<string, string>,
  subraceMap: Map<string, { name: string; raceKey: string }>
): Set<string> => {
  const races = new Set<string>();
  if (!character) return races;

  const raceName = character.raceKey ? raceMap.get(character.raceKey) ?? character.raceKey : undefined;
  const subraceName = character.subraceKey ? subraceMap.get(character.subraceKey)?.name ?? character.subraceKey : undefined;

  if (raceName) races.add(normalizeName(raceName));
  if (subraceName) races.add(normalizeName(subraceName));
  return races;
};

const extractAttributeTargets = (targetText: string): { keys: string[]; mode: "any" | "all" } => {
  const lower = targetText.toLowerCase();
  const mode: "any" | "all" = lower.includes(" or ") ? "any" : lower.includes(" and ") ? "all" : lower.includes(",") ? "any" : "all";
  const parts = targetText
    .replace(/[()]/g, "")
    .split(/,|\bor\b|\band\b|\/|&/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const keys: string[] = [];
  parts.forEach((part) => {
    const normalized = part.toUpperCase();
    if (["PHYSICAL", "MENTAL", "SPIRITUAL", "WILL"].includes(normalized)) {
      keys.push(normalized);
    }
  });

  return { keys, mode };
};

const extractSkillTargets = (
  targetText: string,
  lookup: Map<string, string>
): { codes: string[]; mode: "any" | "all"; original: string[] } => {
  const lower = targetText.toLowerCase();
  const mode: "any" | "all" = lower.includes(" or ") || lower.includes(",") ? "any" : "all";
  const parts = targetText
    .replace(/[()]/g, "")
    .split(/,|\bor\b|\band\b|\/|&/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const codes: string[] = [];
  const original: string[] = [];

  parts.forEach((part) => {
    const code = resolveSkillCode(lookup, part);
    if (code) {
      codes.push(code);
      original.push(part);
    }
  });

  return { codes, mode, original };
};

const evaluateNumericRequirement = (
  raw: string,
  ctx: RequirementContext,
  threshold: number,
  targetText: string
): RequirementResult => {
  const attributes = extractAttributeTargets(targetText);
  if (attributes.keys.length > 0) {
    const results = attributes.keys.map((key) => {
      const value = ctx.attributes[key] ?? 0;
      return { key, met: value >= threshold, value };
    });

    const met = attributes.mode === "all" ? results.every((r) => r.met) : results.some((r) => r.met);
    const failed = results.filter((r) => !r.met);
    return {
      requirement: raw,
      met,
      detail: met ? undefined : failed.map((r) => `${r.key} ${r.value}/${threshold}`).join(", ")
    };
  }

  const skills = extractSkillTargets(targetText, ctx.skillLookup);
  if (skills.codes.length > 0) {
    const results = skills.codes.map((code, idx) => {
      const value = ctx.skills[code] ?? 0;
      return { code, label: skills.original[idx] ?? code, met: value >= threshold, value };
    });
    const met = skills.mode === "all" ? results.every((r) => r.met) : results.some((r) => r.met);
    const failed = results.filter((r) => !r.met);
    return {
      requirement: raw,
      met,
      detail: met ? undefined : failed.map((r) => `${r.label} ${r.value}/${threshold}`).join(", ")
    };
  }

  return { requirement: raw, met: false, detail: "Requirement could not be matched" };
};

const matchesAny = (options: string[], candidates: Set<string>): boolean =>
  options.some((opt) => candidates.has(normalizeName(opt)));

const evaluateMartialRequirement = (
  raw: string,
  cleaned: string,
  normalized: string,
  ctx: RequirementContext
): RequirementResult | null => {
  if (!normalized.includes("martial prowess")) return null;

  const progress = ctx.martial;
  const availableCategoriesWithAll = Array.from(progress.categoryAbilityCounts.entries()).filter(
    ([key, total]) => (progress.unlockedByCategory.get(key) ?? 0) >= total
  );

  const categoriesByName = Array.from(progress.categoriesByName.entries()).filter(([name]) =>
    normalized.includes(name)
  );

  const abilityCountMatch = cleaned.match(/at least\s*(\d+)\s+martial prowess abilities/i);
  const categoryCountMatch = cleaned.match(/(\d+)\s+martial prowess categories? with all/i);
  const genericCountMatch = cleaned.match(/at least\s*(\d+)/i);

  const requiredAbilityCount = abilityCountMatch
    ? Number(abilityCountMatch[1])
    : normalized.includes("abilities unlocked") && genericCountMatch
    ? Number(genericCountMatch[1])
    : null;
  const requiredCategoryCount = categoryCountMatch
    ? Number(categoryCountMatch[1])
    : normalized.includes("categories with all")
    ? 1
    : null;

  if (requiredCategoryCount !== null) {
    const categoriesWithAll = availableCategoriesWithAll.length;
    const categoriesMet = categoriesWithAll >= requiredCategoryCount;
    const abilitiesMet = requiredAbilityCount === null || progress.totalUnlocked >= requiredAbilityCount;
    const met = categoriesMet && abilitiesMet;
    const details: string[] = [];
    if (!categoriesMet) details.push(`${categoriesWithAll}/${requiredCategoryCount} categories complete`);
    if (!abilitiesMet && requiredAbilityCount !== null)
      details.push(`Martial Prowess abilities ${progress.totalUnlocked}/${requiredAbilityCount}`);
    return { requirement: raw, met, detail: details.join("; ") || undefined };
  }

  if (normalized.includes("all martial prowess abilities unlocked")) {
    const met = availableCategoriesWithAll.length > 0;
    const detail = met ? undefined : "No categories have all Martial Prowess abilities unlocked";
    return { requirement: raw, met, detail };
  }

  if (normalized.includes("abilities unlocked")) {
    if (categoriesByName.length > 0 && requiredAbilityCount !== null) {
      const met = categoriesByName.some(([, keys]) =>
        Array.from(keys).some((key) => (progress.unlockedByCategory.get(key) ?? 0) >= requiredAbilityCount)
      );
      const detail = met ? undefined : "Not enough abilities unlocked in the specified category";
      return { requirement: raw, met, detail };
    }

    if (requiredAbilityCount !== null) {
      const met = progress.totalUnlocked >= requiredAbilityCount;
      const detail = met ? undefined : `Martial Prowess abilities ${progress.totalUnlocked}/${requiredAbilityCount}`;
      return { requirement: raw, met, detail };
    }

    const met = progress.totalUnlocked > 0;
    return { requirement: raw, met, detail: met ? undefined : "No Martial Prowess abilities unlocked" };
  }

  if (normalized.includes("double the points") || normalized.includes("more points than are required")) {
    const factor = normalized.includes("double the points") ? 2 : 1;
    const candidate = Array.from(progress.categoryCosts.entries()).find(([key, cost]) => {
      const spent = progress.spentByCategory.get(key) ?? 0;
      return spent >= cost * factor;
    });
    const met = Boolean(candidate);
    const detail = met
      ? undefined
      : `No category has ${factor === 2 ? "double" : "more than"} the points needed (${factor}x cost)`;
    return { requirement: raw, met, detail };
  }

  if (normalized.includes("base abilities") && normalized.includes("martial prowess")) {
    const met = availableCategoriesWithAll.length > 0;
    const detail = met ? undefined : "No Martial Prowess category has all base abilities unlocked";
    return { requirement: raw, met, detail };
  }

  if (normalized.includes("long range")) {
    const targetCategories = progress.categoriesByName.get("long range");
    const count = targetCategories
      ? Array.from(targetCategories).reduce((sum, key) => sum + (progress.unlockedByCategory.get(key) ?? 0), 0)
      : 0;
    const met = count > 0;
    const detail = met ? undefined : "No Long Range Martial Prowess abilities unlocked";
    return { requirement: raw, met, detail };
  }

  return { requirement: raw, met: false, detail: "Manual verification required" };
};

const evaluateNonNumericRequirement = (raw: string, ctx: RequirementContext): RequirementResult => {
  const cleaned = raw.replace(/^[-+]/, "").trim();
  const normalized = normalizeName(cleaned);

  if (!normalized) return { requirement: raw, met: true };

  const martialResult = evaluateMartialRequirement(raw, cleaned, normalized, ctx);
  if (martialResult) return martialResult;

  if (normalized.includes("ancillar")) {
    const matchingId = Array.from(ctx.ancillaryNames.entries()).find(([name]) => normalized.includes(name))?.[1];
    const met = matchingId ? ctx.ancillaries.has(matchingId) : false;
    return { requirement: raw, met, detail: met ? undefined : "Prerequisite ancillary not selected" };
  }

  if (normalized.includes("background")) {
    const tokens = cleaned
      .replace(/background/gi, "")
      .split(/,|\bor\b|\band\b/)
      .map((p) => p.trim())
      .filter(Boolean);
    const met =
      tokens.length === 0
        ? false
        : tokens.some((token) => {
            const normalizedToken = normalizeName(token);
            if (normalizedToken === "ildakar") {
              return matchesAny(Array.from(ILDAKAR_BACKGROUNDS), ctx.backgrounds);
            }
            return ctx.backgrounds.has(normalizedToken);
          });
    return { requirement: raw, met, detail: met ? undefined : "Missing required background" };
  }

  if (normalized.includes("flaw")) {
    const tokens = cleaned.replace(/flaw/gi, "").split(/,|\bor\b|\band\b/);
    const met = tokens.some((token) => ctx.flaws.has(normalizeName(token)));
    return { requirement: raw, met, detail: met ? undefined : "Missing required flaw" };
  }

  if (normalized.includes("race") || cleaned.match(/\banz\b|\bganz|\bgraz|\bjiin/i)) {
    const tokens = cleaned
      .replace(/race/gi, "")
      .split(/,|\bor\b|\band\b/)
      .map((p) => p.trim())
      .filter(Boolean);
    const met = matchesAny(tokens, ctx.races);
    return { requirement: raw, met, detail: met ? undefined : "Race or subrace mismatch" };
  }

  if (normalized.includes("martial prowess")) {
    const total = ctx.skills.MARTIAL_PROWESS ?? 0;
    const countMatch = cleaned.match(/(\d+)/);
    if (countMatch) {
      const needed = Number(countMatch[1]);
      const met = total >= needed;
      return { requirement: raw, met, detail: met ? undefined : `Martial Prowess ${total}/${needed}` };
    }
    return { requirement: raw, met: total > 0, detail: total > 0 ? undefined : "No Martial Prowess recorded" };
  }

  if (normalized.includes("ildakar")) {
    const { ildakar } = ctx;
    const basicMatch = cleaned.match(/at\s+least\s*(\d+)\s*basic/i);
    const advancedMatch = cleaned.match(/at\s+least\s*(\d+)\s*advanced/i);
    const totalMatch = cleaned.match(/at\s+least\s*(\d+)/i);
    const specificFaculty = Array.from(FACULTY_LOOKUP.entries()).find(([name]) => normalized.includes(name))?.[1];

    if (specificFaculty) {
      const met = ildakar.unlocked.has(specificFaculty.name);
      return {
        requirement: raw,
        met,
        detail: met ? undefined : `${specificFaculty.name} not unlocked`
      };
    }

    const needBasic = basicMatch ? Number(basicMatch[1]) : null;
    const needAdvanced = advancedMatch ? Number(advancedMatch[1]) : null;
    const needTotal = totalMatch ? Number(totalMatch[1]) : null;

    const basicMet = needBasic === null || ildakar.basicUnlocked >= needBasic;
    const advancedMet = needAdvanced === null || ildakar.advancedUnlocked >= needAdvanced;
    const totalMet = needTotal === null || ildakar.unlocked.size >= needTotal;
    const allBasicMet = normalized.includes("all basic")
      ? ildakar.totalBasic > 0 && ildakar.basicUnlocked >= ildakar.totalBasic
      : true;

    const met = basicMet && advancedMet && totalMet && allBasicMet && ildakar.unlocked.size > 0;

    const detailParts: string[] = [];
    if (!basicMet && needBasic !== null) detailParts.push(`Basic ${ildakar.basicUnlocked}/${needBasic}`);
    if (!advancedMet && needAdvanced !== null) detailParts.push(`Advanced ${ildakar.advancedUnlocked}/${needAdvanced}`);
    if (!totalMet && needTotal !== null) detailParts.push(`Faculties ${ildakar.unlocked.size}/${needTotal}`);
    if (!allBasicMet && normalized.includes("all basic")) detailParts.push("Not all basic faculties unlocked");

    return {
      requirement: raw,
      met,
      detail: detailParts.join("; ") || (met ? undefined : "No Ildakar Faculty unlocked")
    };
  }

  return { requirement: raw, met: false, detail: "Manual verification required" };
};

const evaluateRequirement = (req: string, ctx: RequirementContext): RequirementResult => {
  const trimmed = req.trim();
  if (!trimmed) return { requirement: req, met: true };

  if (trimmed.startsWith("+")) {
    const segments = trimmed.match(/\+\s*\d+[^\+]*(?=(?:\+\s*\d+)|$)/g);
    const parts = segments && segments.length > 0 ? segments : [trimmed];
    const results = parts.map((segment) => {
      const match = segment.match(/^\+(\d+)\s*(.*)$/);
      if (!match) return { requirement: segment, met: false, detail: "Invalid format" } as RequirementResult;
      const threshold = Number(match[1]);
      const targetText = match[2].trim();
      return evaluateNumericRequirement(segment, ctx, threshold, targetText);
    });
    const met = results.every((r) => r.met);
    const detail = results.filter((r) => !r.met).map((r) => r.detail).filter(Boolean).join("; ") || undefined;
    return { requirement: req, met, detail };
  }

  return evaluateNonNumericRequirement(req, ctx);
};

const evaluateAllRequirements = (requirements: string[], ctx: RequirementContext): RequirementResult[] =>
  requirements.map((req) => evaluateRequirement(req, ctx));

type RequirementResult = {
  requirement: string;
  met: boolean;
  detail?: string;
};

type RequirementContext = {
  character: Character | null;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  backgrounds: Set<string>;
  flaws: Set<string>;
  races: Set<string>;
  ancillaries: Set<string>;
  ancillaryNames: Map<string, string>;
  skillLookup: Map<string, string>;
  martial: MartialProgress;
  ildakar: IldakarProgress;
};

const buildEntries = (): AncillaryEntry[] => {
  const ancestry = data.ancestryGroups.flatMap((group) =>
    group.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      requirements: [group.name],
      category: "ancestry" as const,
      ancestryGroup: group.name,
      ancestryGroupId: group.id
    }))
  );

  const general = data.ancillaries.map((entry) => ({
    ...entry,
    category: "general" as const
  }));

  return [...ancestry, ...general];
};

const ALL_ENTRIES = buildEntries();
const GENERAL_ENTRIES = ALL_ENTRIES.filter((entry) => entry.category === "general");
const ANCESTRY_ENTRIES = ALL_ENTRIES.filter((entry) => entry.category === "ancestry");
const ANCESTRY_GROUPS_BY_ID = new Map(data.ancestryGroups.map((group) => [group.id, group]));

const summarizeAllowed = (character: Character | null): { total: number; tierAdvancements: number } => {
  if (!character) {
    return { total: 2, tierAdvancements: 0 };
  }
  const tierAdvancements = Math.max(0, Math.floor((character.level - 1) / 5));
  const total = 2 + tierAdvancements * 2;
  return { total, tierAdvancements };
};

const isAncestryAllowedForCharacter = (groupId: string | undefined, character: Character | null): boolean => {
  if (!groupId || !character) return false;
  const rule = ANCESTRY_GROUP_ACCESS[groupId];
  if (!rule) return false;
  if (rule.raceKey !== (character.raceKey ?? "")) return false;
  if (rule.subraceKey && rule.subraceKey !== (character.subraceKey ?? "")) return false;
  return true;
};

const cardStyle: React.CSSProperties = {
  background: "#11151d",
  border: "1px solid #2c3543",
  borderRadius: 10,
  padding: "1rem",
  color: "#e8edf7"
};

const pillStyle: React.CSSProperties = {
  background: "#0f141c",
  border: "1px solid #2a3242",
  borderRadius: 8,
  padding: "0.5rem 0.75rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  color: "#e8edf7"
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  background: "#1f2937",
  border: "1px solid #374151",
  color: "#c7d2fe",
  borderRadius: 6,
  padding: "0.15rem 0.5rem",
  fontSize: 12,
  fontWeight: 700
};

export const AncillariesPage: React.FC = () => {
  const { selectedId } = useSelectedCharacter();
  const { data: definitions } = useDefinitions();
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [showEligibleOnly, setShowEligibleOnly] = React.useState(false);

  const skillLookup = React.useMemo(() => buildSkillLookup(definitions), [definitions]);
  const ancillaryNames = React.useMemo(
    () => new Map<string, string>(ALL_ENTRIES.map((entry) => [normalizeName(entry.name), entry.id])),
    []
  );

  const storageKey = React.useMemo(() => getAncillaryStorageKey(selectedId), [selectedId]);

  const [{ selected: selectedAncillaries, metadata }, setSelection] = React.useState(() => readAncillarySelection(selectedId));

  const setSelectedAncillaries = React.useCallback(
    (updater: React.SetStateAction<string[]>) => {
      setSelection((prev) => {
        const nextSelected = typeof updater === "function" ? (updater as (ids: string[]) => string[])(prev.selected) : updater;
        const validIds = new Set(ALL_ENTRIES.map((entry) => entry.id));
        const filtered = nextSelected.filter((id) => validIds.has(id));
        const nextMetadata: AncillaryMetadata = {};
        filtered.forEach((id) => {
          if (prev.metadata[id]) nextMetadata[id] = prev.metadata[id];
        });
        return { selected: filtered, metadata: nextMetadata };
      });
    },
    []
  );

  const updateMetadata = React.useCallback((id: string, data: Record<string, unknown>) => {
    setSelection((prev) => ({
      selected: prev.selected,
      metadata: { ...prev.metadata, [id]: { ...prev.metadata[id], ...data } }
    }));
  }, []);

  React.useEffect(() => {
    setSelection(readAncillarySelection(selectedId));
  }, [storageKey]);

  React.useEffect(() => {
    persistAncillarySelection(selectedId, { selected: selectedAncillaries, metadata });
  }, [metadata, selectedAncillaries, selectedId, storageKey]);

  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await api.listCharacters();
        setCharacters(list);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load characters";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const selectedCharacter = React.useMemo(
    () => characters.find((ch) => ch.id === selectedId) ?? null,
    [characters, selectedId]
  );

  const { backgrounds: backgroundSet, flaws } = React.useMemo(
    () => collectBackgrounds(selectedCharacter?.backgrounds),
    [selectedCharacter]
  );

  const raceMap = React.useMemo(() => new Map((definitions?.races ?? []).map((race) => [race.id, race.name])), [definitions]);
  const subraceMap = React.useMemo(
    () =>
      new Map(
        (definitions?.subraces ?? []).map((subrace) => [subrace.id, { name: subrace.name, raceKey: subrace.parentId ?? "" }])
      ),
    [definitions]
  );

  const raceNames = React.useMemo(() => resolveRaceNames(selectedCharacter, raceMap, subraceMap), [raceMap, selectedCharacter, subraceMap]);

  const selectedRaceName = selectedCharacter?.raceKey ? raceMap.get(selectedCharacter.raceKey) ?? selectedCharacter.raceKey : undefined;
  const selectedSubraceName =
    selectedCharacter?.subraceKey && subraceMap.get(selectedCharacter.subraceKey)?.name
      ? subraceMap.get(selectedCharacter.subraceKey)?.name
      : selectedCharacter?.subraceKey;

  const { total: allowed, tierAdvancements } = summarizeAllowed(selectedCharacter);
  const remaining = Math.max(allowed - selectedAncillaries.length, 0);

  const skillTotals = React.useMemo(() => buildSkillTotals(selectedCharacter, skillLookup), [selectedCharacter, skillLookup]);

  const martialProgress = React.useMemo(() => summarizeMartialProgress(selectedCharacter?.id ?? selectedId), [
    selectedCharacter?.id,
    selectedId
  ]);

  const ildakarProgress = React.useMemo(() => summarizeIldakarFaculties(selectedCharacter?.id ?? selectedId), [
    selectedCharacter?.id,
    selectedId
  ]);

  const weaponCategoryOptions = React.useMemo(
    () =>
      Array.from(martialProgress.categoryAbilityCounts.entries())
        .filter(([key]) => key.startsWith("Weapon:"))
        .map(([key, total]) => {
          const unlocked = martialProgress.unlockedByCategory.get(key) ?? 0;
          return {
            key,
            label: key.replace(/^Weapon:/, ""),
            unlocked,
            total,
            complete: unlocked >= total
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    [martialProgress.categoryAbilityCounts, martialProgress.unlockedByCategory]
  );

  const selectedWeaponCategory = (metadata[WEAPON_MASTERY_ID]?.weaponCategory as string) ?? "";
  const selectedWeaponCategoryState = weaponCategoryOptions.find((opt) => opt.key === selectedWeaponCategory);
  const weaponCategoryComplete = selectedWeaponCategoryState ? selectedWeaponCategoryState.complete : false;

  const requirementContext = React.useMemo<RequirementContext>(
    () => ({
      character: selectedCharacter,
      attributes: (selectedCharacter?.attributes as Record<string, number>) ?? {},
      skills: skillTotals,
      backgrounds: backgroundSet,
      flaws,
      races: raceNames,
      ancillaries: new Set(selectedAncillaries),
      ancillaryNames,
      skillLookup,
      martial: martialProgress,
      ildakar: ildakarProgress
    }),
    [
      ancillaryNames,
      backgroundSet,
      flaws,
      ildakarProgress,
      martialProgress,
      raceNames,
      selectedAncillaries,
      selectedCharacter,
      selectedId,
      skillLookup,
      skillTotals
    ]
  );

  const evaluateEntryRequirements = React.useCallback(
    (entry: AncillaryEntry) =>
      entry.category === "ancestry"
        ? entry.requirements.map((req) => ({ requirement: req, met: true }))
        : evaluateAllRequirements(entry.requirements, requirementContext),
    [requirementContext]
  );

  const ancestryAllowedGroups = React.useMemo(() => {
    const groups = data.ancestryGroups.filter((group) => isAncestryAllowedForCharacter(group.id, selectedCharacter));
    return new Set(groups.map((group) => group.id));
  }, [selectedCharacter]);

  const allowedAncestryEntries = React.useMemo(
    () => ANCESTRY_ENTRIES.filter((entry) => ancestryAllowedGroups.has(entry.ancestryGroupId ?? "")),
    [ancestryAllowedGroups]
  );

  const ancestryLevelEligible = selectedCharacter ? selectedCharacter.level === 1 : false;

  const allowedAncestryGroupNames = React.useMemo(
    () => Array.from(ancestryAllowedGroups).map((id) => ANCESTRY_GROUPS_BY_ID.get(id)?.name ?? id),
    [ancestryAllowedGroups]
  );

  const ancestryAvailabilityLabel = !selectedCharacter
    ? "Select a character with a race/subrace to unlock ancestry ancillaries."
    : allowedAncestryGroupNames.length > 0
    ? `${allowedAncestryGroupNames.join(", ")}${ancestryLevelEligible ? "" : " (locked after level 1)"}`
    : "No ancestry ancillaries available for this character.";

  const availableEntries = React.useMemo(() => {
    const allowedIds = new Set(allowedAncestryEntries.map((entry) => entry.id));
    return ALL_ENTRIES.filter((entry) => entry.category === "general" || allowedIds.has(entry.id));
  }, [allowedAncestryEntries]);

  const filterTerm = search.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    const matchesEligibility = (entry: AncillaryEntry) => {
      const ancestryAllowed =
        entry.category === "general" ||
        (isAncestryAllowedForCharacter(entry.ancestryGroupId, selectedCharacter) &&
          (ancestryLevelEligible || selectedAncillaries.includes(entry.id)));

      const requirementsMet = evaluateEntryRequirements(entry).every((req) => req.met);
      return ancestryAllowed && requirementsMet;
    };

    const pool = showEligibleOnly ? availableEntries.filter(matchesEligibility) : availableEntries;

    if (!filterTerm) return pool;
    return pool.filter((entry) => {
      const haystack = [entry.name, entry.description, entry.ancestryGroup ?? "", ...entry.requirements]
        .join(" \n ")
        .toLowerCase();
      return haystack.includes(filterTerm);
    });
  }, [ancestryLevelEligible, availableEntries, evaluateEntryRequirements, filterTerm, selectedAncillaries, selectedCharacter, showEligibleOnly]);

  const selectedDetails = selectedAncillaries
    .map((id) => filtered.find((entry) => entry.id === id) || ALL_ENTRIES.find((e) => e.id === id))
    .filter(Boolean) as AncillaryEntry[];

  const toggleSelect = (id: string) => {
    const entry = ALL_ENTRIES.find((candidate) => candidate.id === id);
    if (entry?.category === "ancestry") {
      if (!isAncestryAllowedForCharacter(entry.ancestryGroupId, selectedCharacter)) return;
      if (!ancestryLevelEligible && !selectedAncillaries.includes(id)) return;
    }
    if (selectedAncillaries.includes(id)) {
      setSelectedAncillaries((prev) => prev.filter((existing) => existing !== id));
      return;
    }
    if (selectedAncillaries.length >= allowed) return;
    setSelectedAncillaries((prev) => [...prev, id]);
  };

  const renderAncillaryCard = (entry: AncillaryEntry, showRemove: boolean) => {
    const isSelected = selectedAncillaries.includes(entry.id);
    const buttonLabel = showRemove || isSelected ? "Remove" : "Add";
    const ancestryBlocked =
      entry.category === "ancestry" &&
      (!isAncestryAllowedForCharacter(entry.ancestryGroupId, selectedCharacter) || (!ancestryLevelEligible && !isSelected));
    const requirementResults = evaluateEntryRequirements(entry);
    const requirementsBlocked = requirementResults.some((result) => !result.met);
    const isWeaponMastery = entry.id === WEAPON_MASTERY_ID;
    const storedCategory = (metadata[entry.id]?.weaponCategory as string) ?? "";
    const weaponCategoryState = storedCategory
      ? weaponCategoryOptions.find((opt) => opt.key === storedCategory)
      : selectedWeaponCategoryState;
    const weaponCategoryBlocked =
      isWeaponMastery && (!weaponCategoryState || !weaponCategoryState.complete || !storedCategory);

    const disabled =
      !showRemove && (isSelected || remaining <= 0 || ancestryBlocked || requirementsBlocked || weaponCategoryBlocked);

    return (
      <div key={entry.id} style={{ ...cardStyle, marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
              <h4 style={{ margin: 0 }}>{entry.name}</h4>
              <span style={badgeStyle}>{entry.category === "general" ? "General" : "Ancestry"}</span>
              {entry.ancestryGroup && (
                <span style={{ ...badgeStyle, color: "#a5f3fc", borderColor: "#155e75", background: "#0b1220" }}>
                  {entry.ancestryGroup}
                </span>
              )}
            </div>
            {entry.requirements.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontWeight: 700, marginBottom: 2, fontSize: 13 }}>Requirements</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {requirementResults.map((req) => (
                    <li
                      key={`${entry.id}-${req.requirement}`}
                      style={{
                        marginBottom: 2,
                        color: req.met ? "#34d399" : "#f87171",
                        fontWeight: 600
                      }}
                    >
                      {req.requirement}
                      {!req.met && req.detail ? ` — ${req.detail}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ whiteSpace: "pre-line", color: "#cbd5e1", fontSize: 14 }}>{entry.description}</div>
            {entry.category === "ancestry" && !ancestryLevelEligible && !isSelected && (
              <div style={{ color: "#fbbf24", marginTop: 6, fontSize: 13 }}>Ancestry ancillaries can only be added at level 1.</div>
            )}
            {isWeaponMastery && (
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                <label style={{ fontWeight: 700 }}>Choose Weapon Category</label>
                <select
                  value={storedCategory}
                  onChange={(e) => updateMetadata(entry.id, { weaponCategory: e.target.value })}
                  style={{
                    padding: "0.45rem 0.6rem",
                    borderRadius: 6,
                    background: "#0b1017",
                    color: "#e5e7eb",
                    border: "1px solid #2f3542"
                  }}
                >
                  <option value="">Select a weapon category</option>
                  {weaponCategoryOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label} — {opt.unlocked}/{opt.total} abilities unlocked
                    </option>
                  ))}
                </select>
                {storedCategory && (
                  <div style={{ fontSize: 13, color: weaponCategoryBlocked ? "#f87171" : "#34d399" }}>
                    {weaponCategoryState
                      ? weaponCategoryState.complete
                        ? "All abilities purchased."
                        : `This category still needs ${weaponCategoryState.total - weaponCategoryState.unlocked} abilities.`
                      : "Select a valid category."}
                  </div>
                )}
                {weaponCategoryBlocked && (
                  <div style={{ color: "#f87171", fontSize: 13 }}>
                    You must fully purchase a weapon category before taking Weapon Mastery.
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <button
              onClick={() => toggleSelect(entry.id)}
              disabled={disabled}
              style={{
                padding: "0.4rem 0.75rem",
                borderRadius: 8,
                border: showRemove || isSelected ? "1px solid #b91c1c" : "1px solid #374151",
                background: showRemove || isSelected ? "#2c1515" : "#142031",
                color: showRemove || isSelected ? "#fecaca" : "#e5e7eb",
                cursor: disabled ? "not-allowed" : "pointer",
                minWidth: 90
              }}
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem" }}>Ancillaries</h2>
      <p style={{ marginTop: 0, color: "#cbd5e1" }}>
        Choose 2 ancillaries at character creation. You gain 2 more picks at every Character Tier Advancement (levels 6, 11, 16,
        and so on). Entries stay locked until the listed prerequisites are satisfied for the selected character.
      </p>
      <p style={{ marginTop: 0, color: "#cbd5e1" }}>
        Ancestry ancillaries are locked to your character’s race and subrace (when applicable) and can only be chosen at level 1.
      </p>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 12 }}>
        <div style={pillStyle}>
          <div>
            <div style={{ fontWeight: 700 }}>Selected Character</div>
            <div style={{ color: "#9ca3af", fontSize: 14 }}>
              {loading ? "Loading..." : selectedCharacter ? `${selectedCharacter.name} (Level ${selectedCharacter.level})` : "None"}
            </div>
            {selectedCharacter && (
              <div style={{ color: "#9ca3af", fontSize: 13 }}>
                Race: {selectedRaceName ?? "Unknown"}
                {selectedSubraceName ? ` / ${selectedSubraceName}` : ""}
              </div>
            )}
          </div>
        </div>
        <div style={pillStyle}>
          <div>
            <div style={{ fontWeight: 700 }}>Allowed Ancillaries</div>
            <div style={{ color: "#9ca3af", fontSize: 14 }}>
              Base 2 + {tierAdvancements} tier advancements × 2
            </div>
          </div>
          <div style={{ fontWeight: 800, color: remaining === 0 ? "#fbbf24" : "#34d399" }}>{allowed}</div>
        </div>
        <div style={pillStyle}>
          <div>
            <div style={{ fontWeight: 700 }}>Remaining Picks</div>
            <div style={{ color: "#9ca3af", fontSize: 14 }}>Available to assign</div>
          </div>
          <div style={{ fontWeight: 800, color: remaining > 0 ? "#34d399" : "#f87171" }}>{remaining}</div>
        </div>
        <div style={pillStyle}>
          <div>
            <div style={{ fontWeight: 700 }}>Ancestry Access</div>
            <div style={{ color: "#9ca3af", fontSize: 14 }}>{ancestryAvailabilityLabel}</div>
          </div>
          <div style={{ fontWeight: 800, color: ancestryLevelEligible ? "#34d399" : "#fbbf24" }}>
            {ancestryLevelEligible ? "Level 1" : selectedCharacter ? `Level ${selectedCharacter.level}` : ""}
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>Search Ancillaries</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, requirement, or description"
            style={{
              flex: 1,
              padding: "0.6rem 0.75rem",
              borderRadius: 8,
              border: "1px solid #2f3542",
              background: "#0b1017",
              color: "#e5e7eb"
            }}
          />
          <button
            type="button"
            onClick={() => setShowEligibleOnly((prev) => !prev)}
            style={{
              padding: "0.6rem 0.9rem",
              borderRadius: 8,
              border: showEligibleOnly ? "1px solid #10b981" : "1px solid #2f3542",
              background: showEligibleOnly ? "#0b3b2a" : "#0b1017",
              color: showEligibleOnly ? "#a7f3d0" : "#e5e7eb",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontWeight: 700
            }}
          >
            {showEligibleOnly ? "Showing Eligible" : "Show Eligible"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, alignItems: "start" }}>
        <div>
          <div style={{ ...cardStyle, position: "sticky", top: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Chosen Ancillaries</h3>
              <span style={{ ...badgeStyle, background: "#0f172a", borderColor: "#1f2937" }}>
                {selectedAncillaries.length}/{allowed}
              </span>
            </div>
            {selectedDetails.length === 0 ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>No ancillaries selected yet.</p>
            ) : (
              selectedDetails.map((entry) => renderAncillaryCard(entry, true))
            )}
          </div>
        </div>
        <div>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>All Ancillaries</h3>
              <span style={{ ...badgeStyle, background: "#0f172a", borderColor: "#1f2937" }}>{filtered.length}</span>
            </div>
            {filtered.map((entry) => renderAncillaryCard(entry, false))}
          </div>
        </div>
      </div>
    </div>
  );
};
