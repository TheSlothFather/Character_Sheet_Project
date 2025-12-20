export type WoundType = "blunt" | "burn" | "freeze" | "laceration" | "mental" | "necrosis" | "spiritual";

export type StatusKey =
  | "BLESSED"
  | "BLINDED"
  | "BURNING"
  | "CHARMED"
  | "CRUSHING"
  | "CURSED"
  | "DAZED"
  | "DEAFENED"
  | "ENRAGED"
  | "FREEZING"
  | "HASTENED"
  | "INTOXICATED"
  | "BLEEDING"
  | "PRONE"
  | "RENDED"
  | "ROTTING"
  | "SLOWED"
  | "STUPIFICATION"
  | "SUFFOCATING"
  | "UNCONSCIOUS";

export type WoundCounts = Partial<Record<WoundType, number>>;

export interface WoundPenaltySummary {
  movementEnergyMultiplier: number;
  physicalSkillPenalty: number;
  mentalSkillPenalty: number;
  spiritualSkillPenalty: number;
  actionPointPenalty: number;
  energyPerRoundPenalty: number;
  maxEnergyPenalty: number;
}

export const WOUND_DEFINITIONS: { key: WoundType; label: string }[] = [
  { key: "blunt", label: "Blunt" },
  { key: "burn", label: "Burn" },
  { key: "freeze", label: "Freeze" },
  { key: "laceration", label: "Laceration" },
  { key: "mental", label: "Mental" },
  { key: "necrosis", label: "Necrosis" },
  { key: "spiritual", label: "Spiritual" }
];

export const STATUS_WOUND_TICKS: Record<StatusKey, { woundType: WoundType; amount: number } | null> = {
  BLESSED: null,
  BLINDED: null,
  BURNING: { woundType: "burn", amount: 1 },
  CHARMED: null,
  CRUSHING: { woundType: "blunt", amount: 1 },
  CURSED: null,
  DAZED: null,
  DEAFENED: null,
  ENRAGED: null,
  FREEZING: { woundType: "freeze", amount: 1 },
  HASTENED: null,
  INTOXICATED: null,
  BLEEDING: { woundType: "laceration", amount: 1 },
  PRONE: null,
  RENDED: { woundType: "spiritual", amount: 1 },
  ROTTING: { woundType: "necrosis", amount: 1 },
  SLOWED: null,
  STUPIFICATION: { woundType: "mental", amount: 1 },
  SUFFOCATING: null,
  UNCONSCIOUS: null
};

export const getStatusWoundTick = (statusKey: string): { woundType: WoundType; amount: number } | null => {
  if (statusKey in STATUS_WOUND_TICKS) {
    return STATUS_WOUND_TICKS[statusKey as StatusKey];
  }
  return null;
};

const readCount = (counts: WoundCounts, type: WoundType): number => {
  const value = counts[type];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

export const computeWoundPenalties = (counts: WoundCounts): WoundPenaltySummary => {
  const blunt = readCount(counts, "blunt");
  const burn = readCount(counts, "burn");
  const freeze = readCount(counts, "freeze");
  const laceration = readCount(counts, "laceration");
  const mental = readCount(counts, "mental");
  const necrosis = readCount(counts, "necrosis");
  const spiritual = readCount(counts, "spiritual");

  return {
    movementEnergyMultiplier: 1 + blunt,
    physicalSkillPenalty: -3 * burn,
    mentalSkillPenalty: -3 * mental,
    spiritualSkillPenalty: -3 * spiritual,
    actionPointPenalty: -1 * freeze,
    energyPerRoundPenalty: -3 * laceration,
    maxEnergyPenalty: -3 * necrosis
  };
};
