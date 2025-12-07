// Content import pipeline skeleton. This will map a ContentPack
// (from YAML/JSON) into database rows. For now this is just a stub
// with validation hooks; wiring to Postgres can be added once the
// DB layer is chosen (Prisma/Knex/etc.).

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import type { ContentPack } from "./content-types";

export function loadContentPackFromFile(filePath: string): ContentPack {
  const ext = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, "utf8");
  let data: any;
  if (ext === ".yaml" || ext === ".yml") {
    data = yaml.load(raw);
  } else if (ext === ".json") {
    data = JSON.parse(raw);
  } else {
    throw new Error(`Unsupported content file extension: ${ext}`);
  }
  validateContentPackShape(data);
  return data as ContentPack;
}

function validateContentPackShape(data: any): void {
  if (!data || typeof data !== "object") {
    throw new Error("Content pack must be an object");
  }
  if (!data.ruleset || typeof data.ruleset.key !== "string") {
    throw new Error("Content pack must include ruleset with key");
  }
  // Minimal structural checks; deeper validation can be added later.
  const arrays = [
    "attributes",
    "skills",
    "races",
    "subraces",
    "feats",
    "items",
    "statusEffects",
    "derivedStats"
  ];
  for (const key of arrays) {
    if (!Array.isArray((data as any)[key])) {
      throw new Error(`Content pack must include array field: ${key}`);
    }
  }
}

