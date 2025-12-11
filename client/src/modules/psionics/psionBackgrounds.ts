export const PSIONICS_STORAGE_KEY = "psionics_skill_tree_v1";

export type PsionBackgroundKey =
  | "psychometrist"
  | "telekineticist"
  | "telepath"
  | "hypnotist"
  | "dynakineticist"
  | "illusionist";

export interface PsionBackgroundConfig {
  psiBonus: number;
  granted: { tree: string; name: string }[];
  options: { tree: string; name: string }[];
  picksRequired: number;
}

export const PSION_BACKGROUND_CONFIG: Record<PsionBackgroundKey, PsionBackgroundConfig> = {
  psychometrist: {
    psiBonus: 1,
    granted: [{ tree: "Psychometry", name: "Psychometry" }],
    options: [
      { tree: "Psychometry", name: "Claircognizance" },
      { tree: "Psychometry", name: "Clairvoyance" },
      { tree: "Psychometry", name: "Identify" },
      { tree: "Psychometry", name: "Psychoscopy" },
      { tree: "Psychometry", name: "Track" }
    ],
    picksRequired: 2
  },
  telekineticist: {
    psiBonus: 1,
    granted: [{ tree: "Telekinesis", name: "Telekinesis" }],
    options: [
      { tree: "Telekinesis", name: "Levitation" },
      { tree: "Telekinesis", name: "Psychokinesis" },
      { tree: "Telekinesis", name: "Dynakinesis" },
      { tree: "Telekinesis", name: "Psychometabolism" },
      { tree: "Telekinesis", name: "Density" }
    ],
    picksRequired: 2
  },
  telepath: {
    psiBonus: 1,
    granted: [{ tree: "Telepathy", name: "Telepathy" }],
    options: [
      { tree: "Telepathy", name: "Pry" },
      { tree: "Telepathy", name: "Sense Presence" },
      { tree: "Telepathy", name: "Communicate" },
      { tree: "Telepathy", name: "Interfere" },
      { tree: "Telepathy", name: "Interconnect" }
    ],
    picksRequired: 2
  },
  hypnotist: {
    psiBonus: 1,
    granted: [{ tree: "Hypnosis", name: "Hypnosis" }],
    options: [
      { tree: "Hypnosis", name: "Pathokinesis" },
      { tree: "Hypnosis", name: "Illusion" },
      { tree: "Hypnosis", name: "Possession" },
      { tree: "Hypnosis", name: "Mnokinesis" },
      { tree: "Hypnosis", name: "Override" }
    ],
    picksRequired: 2
  },
  dynakineticist: {
    psiBonus: 1,
    granted: [
      { tree: "Telekinesis", name: "Telekinesis" },
      { tree: "Telekinesis", name: "Dynakinesis" }
    ],
    options: [
      { tree: "Telekinesis", name: "Shield" },
      { tree: "Telekinesis", name: "Field" },
      { tree: "Telekinesis", name: "Force" }
    ],
    picksRequired: 2
  },
  illusionist: {
    psiBonus: 1,
    granted: [
      { tree: "Hypnosis", name: "Hypnosis" },
      { tree: "Hypnosis", name: "Illusion" }
    ],
    options: [
      { tree: "Hypnosis", name: "Amplify I" },
      { tree: "Hypnosis", name: "Dampen" },
      { tree: "Hypnosis", name: "Alter Illusion" }
    ],
    picksRequired: 2
  }
};
