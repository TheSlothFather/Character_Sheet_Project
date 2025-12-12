import { TierDetails } from "./magicParser";

export type SpellGoal = "Damage" | "Control" | "Mobility" | "Support" | "Hazard";

export interface SpellSegment {
  name: string;
  primaryEffect: string;
  consequence?: string;
  statusesPrimary: string[];
  statusesRing: string[];
  tags: string[];
}

export interface SpellGenerationConfig {
  primaryFaculty: string;
  secondaryFaculty?: string;
  primaryTier: number;
  secondaryTier?: number;
  goals: SpellGoal[];
  seed: string;
  allowOpposedRing: boolean;
}

export interface GeneratedSpell {
  name: string;
  tagline: string;
  primaryFaculty: string;
  secondaryFaculty?: string;
  primaryTier: number;
  secondaryTier?: number;
  primarySegment: SpellSegment;
  ringSegment?: SpellSegment;
  resonantSegment?: SpellSegment;
  aspectPlan: Record<string, number>;
  totalCost: number;
  tags: string[];
  cautions: string[];
  seed: string;
}

const ASPECT_COSTS = [
  { tier: 1, cost: 1 },
  { tier: 2, cost: 9 },
  { tier: 3, cost: 27 },
  { tier: 4, cost: 57 },
  { tier: 5, cost: 99 },
  { tier: 6, cost: 153 }
];

const keywordTagMap: Record<string, string[]> = {
  burn: ["Fire", "Damage"],
  heat: ["Fire", "Damage"],
  flame: ["Fire", "Damage"],
  melt: ["Fire", "Damage"],
  smoke: ["Obscure", "Control"],
  blind: ["Control"],
  freeze: ["Cold", "Control"],
  cold: ["Cold"],
  frost: ["Cold"],
  slow: ["Control"],
  prone: ["Control"],
  unconscious: ["Control"],
  push: ["Mobility"],
  pull: ["Mobility"],
  gravity: ["Mobility", "Control"],
  lift: ["Mobility"],
  hazard: ["Hazard"],
  terrain: ["Hazard"],
  barrier: ["Support"],
  shield: ["Support"],
  heal: ["Support"],
  energy: ["Support"],
  stun: ["Control"],
  shock: ["Damage"],
  lightning: ["Damage"],
  radiance: ["Damage", "Support"],
  corrosion: ["Damage"],
  poison: ["Damage"],
  bleed: ["Damage"],
  flight: ["Mobility"],
  velocity: ["Mobility"],
  anchor: ["Control"],
  silence: ["Control"]
};

const baseCautions = [
  "Clamp total aspect cost to the caster's AP/Energy budget and downgrade tiers if over budget.",
  "Avoid stacking redundant statuses—merge overlapping Burning/Freezing stacks into a single intensity line.",
  "If the ring contradicts the core effect (e.g., upward lift plus crushing gravity), use the dominant goal to decide which wins"
];

const rng = (seed: string) => {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    const t = (h ^= h >>> 16) >>> 0;
    return (t & 0xfffffff) / 0x10000000;
  };
};

const getAspectCost = (tier: number): number => ASPECT_COSTS.find((row) => row.tier === tier)?.cost ?? 0;

const clampTier = (value: number) => Math.max(1, Math.min(6, Math.round(value)));

const deriveTags = (text: string, statuses: string[]): string[] => {
  const aggregate = `${text} ${statuses.join(" ")}`.toLowerCase();
  const tags = new Set<string>();
  Object.entries(keywordTagMap).forEach(([keyword, mapped]) => {
    if (aggregate.includes(keyword)) {
      mapped.forEach((tag) => tags.add(tag));
    }
  });
  if (/burn/i.test(aggregate) && /cold|freeze|frost/i.test(aggregate)) {
    tags.add("Thermal");
  }
  return Array.from(tags);
};

const normalizeStatuses = (raw: string[]): string[] =>
  raw
    .join(",")
    .split(/[,;]/)
    .map((status) => status.trim())
    .filter(Boolean);

export const parseTierSegments = (tier: TierDetails): SpellSegment[] => {
  const lines = tier.content.split("\n").map((line) => line.trim()).filter(Boolean);
  const segments: SpellSegment[] = [];
  let current: SpellSegment | null = null;
  let mode: "primary" | "consequence" | "statuses" | null = null;

  lines.forEach((line) => {
    if (/primary effect/i.test(line)) {
      if (current) {
        current.tags = deriveTags(`${current.primaryEffect} ${current.consequence ?? ""}`, [
          ...current.statusesPrimary,
          ...current.statusesRing
        ]);
        segments.push(current);
      }
      const name = line.split("–")[0].trim() || tier.label;
      current = { name, primaryEffect: "", consequence: "", statusesPrimary: [], statusesRing: [], tags: [] };
      mode = "primary";
      return;
    }

    if (/environmental consequence/i.test(line)) {
      mode = "consequence";
      return;
    }

    if (/^statuses/i.test(line)) {
      mode = "statuses";
      return;
    }

    if (!current) {
      current = { name: tier.label, primaryEffect: "", consequence: "", statusesPrimary: [], statusesRing: [], tags: [] };
      mode = "primary";
    }

    if (mode === "primary") {
      current.primaryEffect = current.primaryEffect ? `${current.primaryEffect} ${line}` : line;
    } else if (mode === "consequence") {
      current.consequence = current.consequence ? `${current.consequence} ${line}` : line;
    } else if (mode === "statuses") {
      if (/^primary:/i.test(line)) {
        current.statusesPrimary.push(...normalizeStatuses([line.replace(/^primary:/i, "")]));
      } else if (/^ring:/i.test(line)) {
        current.statusesRing.push(...normalizeStatuses([line.replace(/^ring:/i, "")]));
      } else {
        current.statusesPrimary.push(...normalizeStatuses([line]));
      }
    }
  });

  if (current) {
    current.tags = deriveTags(`${current.primaryEffect} ${current.consequence ?? ""}`, [
      ...current.statusesPrimary,
      ...current.statusesRing
    ]);
    segments.push(current);
  }

  if (segments.length === 0) {
    const fallback: SpellSegment = {
      name: tier.label,
      primaryEffect: tier.content,
      statusesPrimary: [],
      statusesRing: [],
      tags: deriveTags(tier.content, [])
    };
    segments.push(fallback);
  }

  return segments;
};

const pickBestSegment = (segments: SpellSegment[], goals: SpellGoal[], random: () => number): SpellSegment => {
  const goalTags: Record<SpellGoal, string[]> = {
    Damage: ["Damage", "Fire", "Shock", "Cold"],
    Control: ["Control", "Obscure"],
    Mobility: ["Mobility", "Gravity", "Flight"],
    Support: ["Support"],
    Hazard: ["Hazard", "Terrain"]
  };

  const ranked = segments.map((segment) => {
    const overlap = goals.reduce((score, goal) => {
      const expected = goalTags[goal] ?? [];
      const matches = expected.filter((tag) => segment.tags.includes(tag)).length;
      return score + matches;
    }, 0);
    return { segment, overlap };
  });

  const max = Math.max(...ranked.map((entry) => entry.overlap));
  const candidates = ranked.filter((entry) => entry.overlap === max).map((entry) => entry.segment);
  return candidates[Math.floor(random() * candidates.length)] || segments[0];
};

const buildAspectPlan = (goals: SpellGoal[], primaryTier: number, rngFn: () => number): Record<string, number> => {
  const aspects = ["Intensity", "Area", "Range", "Duration", "Origins", "Compound"];
  const basePlan: Record<string, number> = aspects.reduce((acc, aspect) => ({ ...acc, [aspect]: 1 }), {} as Record<string, number>);

  goals.forEach((goal) => {
    if (goal === "Damage") {
      basePlan.Intensity += 2;
      basePlan.Range += 1;
    }
    if (goal === "Control") {
      basePlan.Area += 2;
      basePlan.Duration += 1;
      basePlan.Compound += 1;
    }
    if (goal === "Mobility") {
      basePlan.Range += 1;
      basePlan.Duration += 1;
    }
    if (goal === "Support") {
      basePlan.Duration += 1;
      basePlan.Compound += 1;
    }
    if (goal === "Hazard") {
      basePlan.Area += 1;
      basePlan.Duration += 1;
    }
  });

  aspects.forEach((aspect) => {
    basePlan[aspect] = clampTier(basePlan[aspect] + rngFn());
  });

  basePlan.Intensity = clampTier(Math.max(basePlan.Intensity, primaryTier));

  return basePlan;
};

const computeTotalCost = (plan: Record<string, number>): number =>
  Object.values(plan).reduce((sum, tier) => sum + getAspectCost(tier), 0);

const buildTagline = (segment: SpellSegment, ring?: SpellSegment, resonant?: SpellSegment): string => {
  const pieces = [segment.primaryEffect];
  if (ring) pieces.push(`Ring: ${ring.consequence || ring.primaryEffect}`);
  if (resonant) pieces.push(`Resonates with ${resonant.name.toLowerCase()}`);
  return pieces.join(" · ");
};

const nameFragments = {
  prefix: ["Plasma", "Frost", "Graviton", "Pulse", "Veil", "Cinder", "Glacier", "Aether", "Shard", "Arc"],
  suffix: ["Bloom", "Collapse", "Spiral", "Crown", "Breach", "Torrent", "Shell", "Vortex", "Bridge", "Rift"]
};

const makeName = (primaryFaculty: string, rngFn: () => number, tags: string[]): string => {
  const primaryTag = tags[0] || primaryFaculty.split(" ")[0];
  const prefix = nameFragments.prefix[Math.floor(rngFn() * nameFragments.prefix.length)];
  const suffix = nameFragments.suffix[Math.floor(rngFn() * nameFragments.suffix.length)];
  return `${primaryTag} ${prefix} ${suffix}`;
};

export const generateSpell = (
  config: SpellGenerationConfig,
  primaryTierDetails: TierDetails | undefined,
  secondaryTierDetails?: TierDetails
): GeneratedSpell => {
  const random = rng(config.seed);
  const primarySegments = primaryTierDetails ? parseTierSegments(primaryTierDetails) : [];
  const secondarySegments = secondaryTierDetails ? parseTierSegments(secondaryTierDetails) : [];

  const primarySegment = pickBestSegment(primarySegments, config.goals, random);
  const ringSegment = config.allowOpposedRing && primarySegments.length > 1 ? primarySegments.find((seg) => seg !== primarySegment) : undefined;
  const resonantSegment = config.secondaryFaculty && secondarySegments.length > 0 ? pickBestSegment(secondarySegments, config.goals, random) : undefined;

  const aspectPlan = buildAspectPlan(config.goals, config.primaryTier, random);
  const totalCost = computeTotalCost(aspectPlan);

  const tags = Array.from(new Set([...
    primarySegment.tags,
    ...(ringSegment?.tags ?? []),
    ...(resonantSegment?.tags ?? [])
  ]));

  const cautions = [
    ...baseCautions,
    ...(ringSegment ? ["If the opposed ring would nullify the primary zone, shrink its area or reduce its tier by one."] : []),
    resonantSegment ? `Blend ${config.secondaryFaculty} by merging statuses instead of stacking damage twice.` : ""
  ].filter(Boolean);

  const name = makeName(config.primaryFaculty, random, tags);
  const tagline = buildTagline(primarySegment, ringSegment, resonantSegment);

  return {
    name,
    tagline,
    primaryFaculty: config.primaryFaculty,
    secondaryFaculty: config.secondaryFaculty,
    primaryTier: config.primaryTier,
    secondaryTier: config.secondaryTier,
    primarySegment,
    ringSegment,
    resonantSegment,
    aspectPlan,
    totalCost,
    tags,
    cautions,
    seed: config.seed
  };
};
