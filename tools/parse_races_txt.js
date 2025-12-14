const fs = require("fs");
const path = require("path");

const INPUT_PATH = process.argv[2] || path.join(__dirname, "../data/races.txt");
const OUTPUT_PATH = process.argv[3] || path.join(__dirname, "../data/race-content.json");

const SKILL_ALIASES = {
  RECALL_ACADEMICS: "ACADEMIC_RECALL",
  ACADEMIC_RECALL: "ACADEMIC_RECALL",
  ATTUNE_WONDROUS_ITEM: "ATTUNE_WONDEROUS_ITEM",
  ATTUNE_WONDEROUS_ITEMS: "ATTUNE_WONDEROUS_ITEM",
  FEAT_OF_STRENGTH: "FEAT_OF_STRENGTH",
  FEAT_OF_AGILITY: "FEAT_OF_AGILITY",
  FEAT_OF_AUSTERITY: "FEAT_OF_AUSTERITY",
  FEAT_OF_DEFIANCE: "FEAT_OF_DEFIANCE",
  FEAT_OF_STEALTH: "CONCEAL",
  WILL_DAKAR: "WILL_DAKAR",
  PSIONIC_TECHNIQUE: "PSIONIC_TECHNIQUE",
  MARTIAL_PROWESS: "MARTIAL_PROWESS",
  ILDAKAR_FACULTY: "ILDAKAR_FACULTY",
  DIVINE_INTERVENTION: "DIVINE_INTERVENTION",
  RESIST_SUPERNATURAL: "RESIST_SUPERNATURAL",
  RESIST_PSIONICS: "RESIST_PSIONICS",
  RESIST_TOXINS: "RESIST_TOXINS",
  FEAT_OF_AUSTERITYCANNOT_USE_SEDUCE: "FEAT_OF_AUSTERITY",
  FEAT_OF_AGILITY_CANNOT_USE_SEDUCE: "FEAT_OF_AGILITY",
  FEAT_OF_AGILITY_CANNOT_USE_SEDUCE_: "FEAT_OF_AGILITY",
  ATTUNE_WONDROUS_ITEM: "ATTUNE_WONDEROUS_ITEM",
  ATTUNE_WONDROUS_ITEMS: "ATTUNE_WONDEROUS_ITEM",
  DEDUCE: "DEDUCE"
};

const raceNames = ["Inin", "Anz", "Phi’ilin", "Cerevu", "Venii", "Freinin"];

function slugify(text) {
  return text
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function normalizeSkill(name) {
  const code = slugify(name);
  return SKILL_ALIASES[code] || code;
}

function parseAttributes(line) {
  const result = {};
  if (!line) return result;
  const matches = line.replace(/^Attributes:\s*/i, "").split(/[,;]/);
  matches.forEach((part) => {
    const match = part.trim().match(/([+-]?\d+)\s*(\w+)/);
    if (!match) return;
    const value = Number(match[1]);
    const key = slugify(match[2]);
    if (!Number.isFinite(value)) return;
    result[key] = (result[key] || 0) + value;
  });
  return result;
}

function parseDisciplines(line) {
  const data = { martialProwess: 0, ildakarFaculty: 0, psiPoints: 0, deityCapPerSpirit: 0 };
  if (!line) return data;
  const martial = line.match(/([+-]?\d+)\s*Martial Prowess/i);
  const ildakar = line.match(/([+-]?\d+)\s*Ildakar Faculty/i);
  const psi = line.match(/([+-]?\d+)\s*Psi-Points/i);
  const deity = line.match(/([+-]?\d+)\s*\/\s*Spiritual/i);
  if (martial) data.martialProwess = Number(martial[1]);
  if (ildakar) data.ildakarFaculty = Number(ildakar[1]);
  if (psi) data.psiPoints = Number(psi[1]);
  if (deity) {
    data.deityCapPerSpirit = Number(deity[1]) || 0;
  }
  return data;
}

function parseSkills(lines) {
  const bonuses = {};
  lines.forEach((line) => {
    const cleaned = line.replace(/[()]/g, "");
    cleaned
      .split(/[,;]/)
      .map((part) => part.trim())
      .forEach((part) => {
        if (!part) return;
        const match = part.match(/([+-]?\d+)\s+(.+)/);
        if (!match) return;
        const value = Number(match[1]);
        if (!Number.isFinite(value)) return;
        const skillName = match[2].trim();
        const cleanedName = skillName.replace(/\s*cannot.*/i, "").trim();
        const code = normalizeSkill(cleanedName);
        bonuses[code] = (bonuses[code] || 0) + value;
      });
  });
  return bonuses;
}

function parseBlock(blockLines, parentRaceKey) {
  const name = blockLines[0].trim();
  const key = slugify(name);
  const descEndIdx = blockLines.findIndex((ln) => /Disciplines:/i.test(ln) || /Attributes:/i.test(ln) || /Skills:/i.test(ln));
  const description = blockLines.slice(1, descEndIdx === -1 ? blockLines.length : descEndIdx).join("\n").trim();
  const disciplineLine = blockLines.find((ln) => /Disciplines:/i.test(ln)) || "";
  const attributeLine = blockLines.find((ln) => /Attributes:/i.test(ln)) || "";
  const skillsStart = blockLines.findIndex((ln) => /^Skills:/i.test(ln));
  let skillLines = [];
  if (skillsStart !== -1) {
    for (let i = skillsStart + 1; i < blockLines.length; i++) {
      const ln = blockLines[i];
      if (/^Features:/i.test(ln) || /^Available/i.test(ln)) break;
      if (!ln.trim()) break;
      skillLines.push(ln.trim());
    }
  }

  const disciplines = parseDisciplines(disciplineLine);
  const attributes = parseAttributes(attributeLine);
  const skills = parseSkills(skillLines);

  if (disciplines.martialProwess) {
    skills.MARTIAL_PROWESS = (skills.MARTIAL_PROWESS || 0) + disciplines.martialProwess;
  }
  if (disciplines.ildakarFaculty) {
    skills.ILDAKAR_FACULTY = (skills.ILDAKAR_FACULTY || 0) + disciplines.ildakarFaculty;
  }

  return {
    key,
    name,
    parentRaceKey,
    description,
    disciplines,
    attributes,
    skills
  };
}

function splitBlocks(lines) {
  const blocks = [];
  let current = [];
  lines.forEach((line) => {
    if (!line.trim()) {
      if (current.length) {
        blocks.push(current);
        current = [];
      }
      return;
    }
    current.push(line);
  });
  if (current.length) blocks.push(current);
  return blocks;
}

function parseRaces(text) {
  const lines = text.split(/\r?\n/);
  const raceSegments = [];
  raceNames.forEach((race) => {
    const idx = lines.findIndex((ln) => ln.trim() === race);
    if (idx !== -1) raceSegments.push({ race, index: idx });
  });
  raceSegments.sort((a, b) => a.index - b.index);

  const parsed = { races: [], raceEntries: [], subraceEntries: [] };

  raceSegments.forEach((seg, i) => {
    const start = seg.index;
    const end = i < raceSegments.length - 1 ? raceSegments[i + 1].index : lines.length;
    const segmentLines = lines.slice(start, end).filter((ln) => ln !== undefined);
    const raceKey = slugify(seg.race);

    if (seg.race === "Inin") {
      const subraceHeader = segmentLines.findIndex((ln) => ln.toLowerCase().includes("subraces"));
      const descriptionLines = segmentLines.slice(1, subraceHeader === -1 ? segmentLines.length : subraceHeader);
      parsed.races.push({ key: raceKey, name: seg.race, description: descriptionLines.join("\n").trim() });
      const remaining = subraceHeader === -1 ? [] : segmentLines.slice(subraceHeader + 1);
      const blocks = splitBlocks(remaining);
      blocks.forEach((block) => {
        const entry = parseBlock(block, raceKey);
        parsed.subraceEntries.push(entry);
      });
    } else {
      const block = splitBlocks(segmentLines.slice(1))[0] || [];
      const entry = parseBlock([seg.race, ...(block || [])], raceKey);
      parsed.races.push({ key: raceKey, name: seg.race, description: entry.description });
      parsed.raceEntries.push({ ...entry, key: raceKey, name: seg.race });
    }
  });

  return parsed;
}

function main() {
  const text = fs.readFileSync(INPUT_PATH, "utf8");
  const parsed = parseRaces(text);

  const attributesPath = path.join(__dirname, "../docs/races_output/attributes.json");
  const skillsPath = path.join(__dirname, "../docs/races_output/skills.json");
  const attributes = JSON.parse(fs.readFileSync(attributesPath, "utf8"));
  const skills = JSON.parse(fs.readFileSync(skillsPath, "utf8"));

  const raceDetails = {};
  [...parsed.raceEntries, ...parsed.subraceEntries].forEach((entry) => {
    raceDetails[entry.key] = {
      disciplines: entry.disciplines,
      attributes: entry.attributes,
      skills: entry.skills,
      deityCapPerSpirit: entry.disciplines.deityCapPerSpirit || 0
    };
  });

  const modifiers = [];
  [...parsed.raceEntries, ...parsed.subraceEntries].forEach((entry) => {
    Object.entries(entry.skills).forEach(([code, value]) => {
      modifiers.push({
        id: `RACE_${entry.key}_${code}`,
        sourceType: entry.parentRaceKey ? "subrace" : "race",
        sourceKey: entry.key,
        targetPath: `skills.${code}.racialBonus`,
        operation: "add",
        valueExpression: { type: "number", value }
      });
    });
  });

  const content = {
    ruleset: { key: "adurun-core", name: "Adûrun Core" },
    attributes: attributes.map((attr) => ({ key: attr.code || attr.key, name: attr.name || attr.code, description: attr.description || "" })),
    skills: skills.map((skill) => ({ key: skill.code || skill.key, name: skill.name || skill.code, description: skill.description || "" })),
    races: parsed.races.map((race) => ({ key: race.key, name: race.name, description: race.description })),
    subraces: parsed.subraceEntries.map((s) => ({ key: s.key, raceKey: s.parentRaceKey, name: s.name, description: s.description })),
    feats: [],
    items: [],
    statusEffects: [],
    derivedStats: [],
    modifiers,
    raceDetails
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(content, null, 2));
  console.log(`Wrote ${OUTPUT_PATH}`);
}

if (require.main === module) {
  main();
}
