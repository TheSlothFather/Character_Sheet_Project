export type FacultyCategory = "Basic" | "Advanced";

export interface FacultyConfig {
  name: string;
  category: FacultyCategory;
}

export interface TierDetails {
  label: string;
  content: string;
}

export interface ParsedFaculty {
  name: string;
  category: FacultyCategory;
  sourceFound: boolean;
  intro?: string;
  tiers: TierDetails[];
  rawSection?: string;
}

export const MAGIC_FACULTIES: FacultyConfig[] = [
  { name: "Thermomancy", category: "Basic" },
  { name: "Electromancy", category: "Basic" },
  { name: "Vivomancy", category: "Basic" },
  { name: "Graviturgy", category: "Basic" },
  { name: "Pneumancy", category: "Basic" },
  { name: "Photomancy", category: "Basic" },
  { name: "Tribomancy", category: "Advanced" },
  { name: "Artificy", category: "Advanced" },
  { name: "Astromancy", category: "Advanced" },
  { name: "Transmutation", category: "Advanced" },
  { name: "Oscillomancy", category: "Advanced" },
  { name: "Telechronomancy", category: "Advanced" }
];

const cleanText = (raw: string): string => raw.replace(/\r\n/g, "\n").replace("\ufeff", "");

const splitIntoSections = (raw: string, facultyNames: string[]): Map<string, string> => {
  const normalized = cleanText(raw);
  const positions = facultyNames
    .map((name) => {
      const match = new RegExp(name, "i").exec(normalized);
      return { name, index: match ? match.index : -1 };
    })
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index);

  const sections = new Map<string, string>();
  positions.forEach((current, idx) => {
    const start = current.index;
    const end = idx + 1 < positions.length ? positions[idx + 1].index : normalized.length;
    const slice = normalized.slice(start, end).trim();
    sections.set(current.name, slice);
  });

  return sections;
};

const buildTiers = (lines: string[]): TierDetails[] => {
  const tiers: TierDetails[] = [];
  let current: { label: string; buffer: string[] } | null = null;
  const tierPattern = /^TIER\s*(\d[^]*)$/i;

  lines.forEach((line) => {
    const trimmed = line.trimEnd();
    const match = tierPattern.exec(trimmed);
    if (match) {
      if (current) {
        tiers.push({ label: current.label, content: current.buffer.join("\n").trim() });
      }
      current = { label: `Tier ${match[1].trim()}`, buffer: [] };
      return;
    }

    if (current) {
      current.buffer.push(trimmed);
    }
  });

  if (current) {
    tiers.push({ label: current.label, content: current.buffer.join("\n").trim() });
  }

  return tiers;
};

const parseSection = (section: string | undefined): { intro?: string; tiers: TierDetails[]; raw?: string } => {
  if (!section) return { tiers: [] };

  const lines = section.split("\n");
  const [, ...rest] = lines; // drop the name line
  const introLines: string[] = [];
  const bodyLines: string[] = [];
  let encounteredTier = false;

  rest.forEach((line) => {
    if (!encounteredTier && /^TIER\s*\d/i.test(line)) {
      encounteredTier = true;
    }
    if (encounteredTier) {
      bodyLines.push(line);
    } else {
      introLines.push(line);
    }
  });

  const tiers = buildTiers(bodyLines);
  const intro = introLines.join("\n").trim();

  return { intro: intro || undefined, tiers, raw: section };
};

export const parseMagicFaculties = (raw: string): ParsedFaculty[] => {
  const sectionMap = splitIntoSections(raw, MAGIC_FACULTIES.map((f) => f.name));

  return MAGIC_FACULTIES.map((faculty) => {
    const section = sectionMap.get(faculty.name);
    const parsed = parseSection(section);
    return {
      name: faculty.name,
      category: faculty.category,
      sourceFound: Boolean(section),
      intro: parsed.intro,
      tiers: parsed.tiers,
      rawSection: parsed.raw
    };
  });
};
