import { normalizeSkillCode, type AttributeKey } from "../characters/skillMetadata";
import type { BestiaryAbility } from "../../api/gm";

export type ParsedBestiaryEntry = {
  name: string;
  rank: string;
  groupName?: string;
  heroName?: string;
  lieutenantName?: string;
  armorType?: string;
  energyBars?: number;
  attributes: Partial<Record<AttributeKey, number>> & {
    energy?: number;
    ap?: number;
    dr?: number;
    energy_bars?: number;
  };
  skills: Record<string, number>;
  abilities: BestiaryAbility[];
  tags?: string[];
  type?: string;
  description?: string;
  immunities?: string[];
  resistances?: string[];
  weaknesses?: string[];
};

export type BestiaryParseMessage = {
  blockIndex: number;
  message: string;
  block: string;
  entryName?: string;
  level: "error" | "warning";
};

export type BestiaryParseResult = {
  groupName?: string;
  entries: ParsedBestiaryEntry[];
  messages: BestiaryParseMessage[];
};

const RANK_MATCH = /\b(Hero|Lieutenant|Minion|NPC)\b/i;
const ATTRIBUTE_MAP: Record<string, AttributeKey> = {
  physical: "PHYSICAL",
  mental: "MENTAL",
  spiritual: "SPIRITUAL",
  will: "WILL"
};

const parseHeader = (line: string): { name: string; rank: string; tags: string[] } | null => {
  const match = line.match(/^(.+?)\s*\((.+)\)$/);
  if (!match) return null;
  const name = match[1].trim();
  const meta = match[2];
  const rankMatch = meta.match(RANK_MATCH);
  const rank = rankMatch ? rankMatch[1] : "";
  const tags = meta
    .split(/,\s*/)
    .map((value) => value.trim())
    .filter((value) => value && !value.toLowerCase().includes("rank"));
  return { name, rank, tags };
};

const parseAttributesLine = (
  line: string,
  attributes: ParsedBestiaryEntry["attributes"]
): void => {
  const regex = /(\d+)\s*(Physical|Mental|Spiritual|Will)/gi;
  let match = regex.exec(line);
  while (match) {
    const value = Number(match[1]);
    const key = ATTRIBUTE_MAP[match[2].toLowerCase()];
    attributes[key] = value;
    match = regex.exec(line);
  }
};

const parseSkillLine = (
  line: string,
  skills: Record<string, number>,
  knownSkills: Set<string>,
  messages: BestiaryParseMessage[],
  blockIndex: number,
  entryName: string
): void => {
  const match = line.match(/([+-]?\d+)\s+(.+)/);
  if (!match) return;
  const value = Number(match[1]);
  const name = match[2].trim();
  if (!Number.isFinite(value) || !name) return;
  const code = normalizeSkillCode({ name });
  if (!code) return;
  skills[code] = value;
  if (knownSkills.size && !knownSkills.has(code)) {
    messages.push({
      blockIndex,
      entryName,
      message: `Unknown skill '${name}' parsed as ${code}.`,
      block: line,
      level: "warning"
    });
  }
};

const parseEnergyAp = (
  line: string,
  attributes: ParsedBestiaryEntry["attributes"],
  entry: ParsedBestiaryEntry,
  messages: BestiaryParseMessage[],
  blockIndex: number,
  entryName: string
): void => {
  const energyMatch = line.match(/(\d+)\s*energy/i);
  if (energyMatch) {
    attributes.energy = Number(energyMatch[1]);
  } else if (/energy/i.test(line)) {
    messages.push({
      blockIndex,
      entryName,
      message: "Energy mentioned but no numeric value found.",
      block: line,
      level: "warning"
    });
  }
  const barsMatch = line.match(/x\s*(\d+)\s*bars?/i);
  if (barsMatch) {
    const barsValue = Number(barsMatch[1]);
    if (Number.isFinite(barsValue)) {
      entry.energyBars = barsValue;
      attributes.energy_bars = barsValue;
    }
  }
  const apMatch = line.match(/(\d+)\s*ap/i);
  if (apMatch) {
    attributes.ap = Number(apMatch[1]);
  } else if (/\bap\b/i.test(line)) {
    messages.push({
      blockIndex,
      entryName,
      message: "AP mentioned but no numeric value found.",
      block: line,
      level: "warning"
    });
  }
};

const parseDr = (
  line: string,
  attributes: ParsedBestiaryEntry["attributes"],
  entry: ParsedBestiaryEntry,
  messages: BestiaryParseMessage[],
  blockIndex: number,
  entryName: string
): void => {
  const drMatch = line.match(/(\d+)\s*dr/i);
  if (drMatch) {
    attributes.dr = Number(drMatch[1]);
    const armorMatch = line.match(/\(([^)]+)\)/);
    if (armorMatch) {
      entry.armorType = armorMatch[1].trim();
    }
  } else if (/\bdr\b/i.test(line)) {
    messages.push({
      blockIndex,
      entryName,
      message: "DR mentioned but no numeric value found.",
      block: line,
      level: "warning"
    });
  }
};

type DefenseParseResult = {
  immunities: string[];
  resistances: string[];
  weaknesses: string[];
  matched: boolean;
};

/**
 * Parse defense-related lines for immunities, resistances, and weaknesses/vulnerabilities.
 * Handles patterns like:
 * - "Immune to Necrosis and Poison Damage, Resistant to Unholy Damage"
 * - "Immune to Necrosis Damage, Resistant to Mental Damage, Vulnerable to Burn Damage"
 * - "Cannot be killed by Necrosis Damage"
 * - "Cannot be killed by Necrosis or Blunt Damage"
 */
const parseDefenses = (line: string): DefenseParseResult => {
  const immunities: string[] = [];
  const resistances: string[] = [];
  const weaknesses: string[] = [];
  let matched = false;

  // Normalize common variations
  const normalized = line
    .replace(/Damage Type/gi, "Damage")
    .replace(/\s+/g, " ")
    .trim();

  // Pattern: "Immune to X [and Y] Damage"
  const immuneMatches = normalized.matchAll(/Immune\s+to\s+([^,]+?)(?:\s+Damage)?(?:,|$)/gi);
  for (const match of immuneMatches) {
    matched = true;
    const segment = match[1].trim().replace(/\s+Damage$/i, "");
    // Handle "X and Y" patterns
    const parts = segment.split(/\s+and\s+/i);
    for (const part of parts) {
      const cleaned = part.trim();
      if (cleaned && !immunities.includes(cleaned)) {
        immunities.push(cleaned);
      }
    }
  }

  // Pattern: "Cannot be killed by X [or Y] Damage"
  const cannotKillMatch = normalized.match(/Cannot\s+be\s+killed\s+by\s+([^,]+?)(?:\s+Damage)?(?:,|$)/i);
  if (cannotKillMatch) {
    matched = true;
    const segment = cannotKillMatch[1].trim().replace(/\s+Damage$/i, "");
    // Handle "X or Y" patterns
    const parts = segment.split(/\s+or\s+/i);
    for (const part of parts) {
      const cleaned = part.trim();
      if (cleaned && !immunities.includes(cleaned)) {
        immunities.push(cleaned);
      }
    }
  }

  // Pattern: "Resistant to X [and Y] Damage"
  const resistMatches = normalized.matchAll(/Resistant\s+to\s+([^,]+?)(?:\s+Damage)?(?:,|$)/gi);
  for (const match of resistMatches) {
    matched = true;
    const segment = match[1].trim().replace(/\s+Damage$/i, "");
    const parts = segment.split(/\s+and\s+/i);
    for (const part of parts) {
      const cleaned = part.trim();
      if (cleaned && !resistances.includes(cleaned)) {
        resistances.push(cleaned);
      }
    }
  }

  // Pattern: "Vulnerable to X [and Y] Damage" (with optional parenthetical notes)
  const vulnerableMatches = normalized.matchAll(/Vulnerable\s+to\s+([^,(]+?)(?:\s+Damage)?(?:\s*\([^)]*\))?(?:,|$)/gi);
  for (const match of vulnerableMatches) {
    matched = true;
    const segment = match[1].trim().replace(/\s+Damage$/i, "");
    const parts = segment.split(/\s+and\s+/i);
    for (const part of parts) {
      const cleaned = part.trim();
      if (cleaned && !weaknesses.includes(cleaned)) {
        weaknesses.push(cleaned);
      }
    }
  }

  return { immunities, resistances, weaknesses, matched };
};

const parseRange = (line: string): string | undefined => {
  const rangeMatch = line.match(/(\d+\s*-\s*\d+|\d+)\s*range/i);
  if (!rangeMatch) return undefined;
  return rangeMatch[1].replace(/\s+/g, "");
};

const parseDamage = (line: string): string | undefined => {
  const damageMatch = line.match(/(\d+[^,;]*damage)/i);
  if (!damageMatch) return undefined;
  return damageMatch[1].trim();
};

const buildAbility = (options: {
  type: string;
  name?: string;
  description?: string;
  phase?: string;
  range?: string;
  damage?: string;
  rules?: string;
}): BestiaryAbility => ({
  type: options.type,
  name: options.name,
  description: options.description,
  phase: options.phase,
  range: options.range,
  damage: options.damage,
  rules: options.rules
});

export const parseBestiaryImport = (
  input: string,
  options?: { knownSkillCodes?: string[] }
): BestiaryParseResult => {
  const cleaned = input.replace(/\r/g, "").trim();
  if (!cleaned) {
    return {
      entries: [],
      messages: [{ blockIndex: 0, message: "No content provided.", block: "", level: "error" }]
    };
  }

  const knownSkills = new Set((options?.knownSkillCodes ?? []).map((code) => code.toUpperCase()));
  const rawBlocks = cleaned.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  let groupName: string | undefined;
  const blocks = [...rawBlocks];
  if (blocks.length && !/\(.+\)/.test(blocks[0])) {
    groupName = blocks.shift();
  }

  const entries: ParsedBestiaryEntry[] = [];
  const messages: BestiaryParseMessage[] = [];

  blocks.forEach((block, blockIndex) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const header = lines[0];
    const parsedHeader = parseHeader(header);
    if (!parsedHeader || !parsedHeader.name) {
      messages.push({
        blockIndex,
        message: "Missing or invalid header line.",
        block,
        level: "error"
      });
      return;
    }
    if (!parsedHeader.rank) {
      messages.push({
        blockIndex,
        entryName: parsedHeader.name,
        message: `Missing rank for ${parsedHeader.name}.`,
        block,
        level: "error"
      });
      return;
    }

    const attributes: ParsedBestiaryEntry["attributes"] = {};
    const skills: Record<string, number> = {};
    const abilities: BestiaryAbility[] = [];
    const immunities: string[] = [];
    const resistances: string[] = [];
    const weaknesses: string[] = [];
    let section: "attributes" | "skills" | null = null;
    let currentPhase: string | null = null;

    const entryRecord: ParsedBestiaryEntry = {
      name: parsedHeader.name,
      rank: parsedHeader.rank,
      groupName,
      attributes,
      skills,
      abilities,
      tags: parsedHeader.tags,
      immunities,
      resistances,
      weaknesses
    };

    let description: string | undefined;
    let heroName: string | undefined;
    let lieutenantName: string | undefined;
    for (let idx = 1; idx < lines.length; idx += 1) {
      const line = lines[idx];
      const heroRefMatch = line.match(/^Hero:\s*(.+)$/i);
      if (heroRefMatch) {
        heroName = heroRefMatch[1].trim();
        continue;
      }
      const lieutenantRefMatch = line.match(/^Lieutenant:\s*(.+)$/i);
      if (lieutenantRefMatch) {
        lieutenantName = lieutenantRefMatch[1].trim();
        continue;
      }
      const descriptionMatch = line.match(/^(Notes|Description):\s*(.+)$/i);
      if (descriptionMatch) {
        description = descriptionMatch[2].trim();
        continue;
      }
      if (/^Attributes:/i.test(line)) {
        section = "attributes";
        continue;
      }
      if (/^Skill Investments:/i.test(line)) {
        section = "skills";
        continue;
      }
      const featureMatch = line.match(/^Feature\s*\d+\s*\[(.+?)\]:\s*(.+)$/i);
      if (featureMatch) {
        abilities.push(buildAbility({ type: "feature", name: featureMatch[1], description: featureMatch[2] }));
        section = null;
        continue;
      }
      const commandMatch = line.match(/^Command Ability\s*\d+\s*\[(.+?)\]:\s*(.+)$/i);
      if (commandMatch) {
        abilities.push(buildAbility({ type: "command", name: commandMatch[1], description: commandMatch[2] }));
        section = null;
        continue;
      }
      const phaseMatch = line.match(/^Phase\s*\d+/i);
      if (phaseMatch) {
        currentPhase = line;
        section = null;
        continue;
      }

      if (section === "attributes") {
        parseAttributesLine(line, attributes);
        continue;
      }
      if (section === "skills") {
        parseSkillLine(line, skills, knownSkills, messages, blockIndex, parsedHeader.name);
        continue;
      }

      parseEnergyAp(line, attributes, entryRecord, messages, blockIndex, parsedHeader.name);
      parseDr(line, attributes, entryRecord, messages, blockIndex, parsedHeader.name);

      // Parse defenses (immunities, resistances, weaknesses)
      const defenseResult = parseDefenses(line);
      if (defenseResult.matched) {
        for (const immunity of defenseResult.immunities) {
          if (!immunities.includes(immunity)) {
            immunities.push(immunity);
          }
        }
        for (const resistance of defenseResult.resistances) {
          if (!resistances.includes(resistance)) {
            resistances.push(resistance);
          }
        }
        for (const weakness of defenseResult.weaknesses) {
          if (!weaknesses.includes(weakness)) {
            weaknesses.push(weakness);
          }
        }
      }

      const actionMatch = line.match(/^([^:]+):\s*(.+)$/);
      if (actionMatch) {
        const name = actionMatch[1].trim();
        const description = actionMatch[2].trim();
        abilities.push(
          buildAbility({
            type: currentPhase ? "phase-action" : "action",
            name,
            description,
            phase: currentPhase ?? undefined,
            range: parseRange(description),
            damage: parseDamage(description)
          })
        );
        continue;
      }

      if (currentPhase) {
        abilities.push(
          buildAbility({
            type: "phase-rule",
            name: currentPhase,
            description: line,
            phase: currentPhase
          })
        );
        continue;
      }

      if (/movement actions/i.test(line)) {
        abilities.push(buildAbility({ type: "action-economy", name: "Action Economy", description: line }));
        continue;
      }

      if (/damage/i.test(line) || /range/i.test(line)) {
        abilities.push(
          buildAbility({
            type: "action",
            name: "Attack",
            description: line,
            range: parseRange(line),
            damage: parseDamage(line)
          })
        );
      }
    }

    entryRecord.heroName = heroName;
    entryRecord.lieutenantName = lieutenantName;
    entryRecord.description = description;
    if (entryRecord.energyBars && entryRecord.energyBars > 1) {
      entryRecord.abilities.push(
        buildAbility({
          type: "phase-unlock",
          name: "Phase Unlock",
          rules: `Unlock the next phase each time energy reaches 0 (${entryRecord.energyBars} total bars).`
        })
      );
    }
    entries.push(entryRecord);
  });

  return { groupName, entries, messages };
};
