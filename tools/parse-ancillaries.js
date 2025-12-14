const fs = require("fs");
const path = require("path");

const inputPath = path.join(__dirname, "../data/ancillaries.txt");
const outputPath = path.join(__dirname, "../data/ancillaries.json");
const clientOutputPath = path.join(__dirname, "../client/src/data/ancillaries.json");

function loadLines(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "...");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/--+/g, "-") || "item";
}

function parseAncestry(lines, endIndex) {
  const groups = [];
  let current = null;

  for (let i = 0; i < endIndex; i += 1) {
    const line = lines[i];
    if (/^ancestry ancillaries/i.test(line)) continue;
    if (/^ancillaries\b/i.test(line)) continue;
    if (!line.includes(":")) {
      current = { id: slugify(line), name: line, entries: [] };
      groups.push(current);
      continue;
    }
    if (!current) continue;
    const [name, ...rest] = line.split(":");
    current.entries.push({
      id: `${current.id}:${slugify(name.trim())}`,
      name: name.trim(),
      description: rest.join(":").trim()
    });
  }

  return groups;
}

function parseAncillaries(lines, startIndex) {
  const ancillaries = [];
  const isRequirementsLine = (line) => typeof line === "string" && line.toLowerCase().startsWith("requirements:");

  for (let i = startIndex; i < lines.length; ) {
    const name = lines[i];
    const requirementsHeader = lines[i + 1];
    if (!name || !isRequirementsLine(requirementsHeader)) {
      i += 1;
      continue;
    }

    i += 2; // skip name + Requirements header
    const requirements = [];
    const inlineRequirement = requirementsHeader.slice("Requirements:".length).trim();
    if (inlineRequirement) {
      requirements.push(inlineRequirement);
    }
    while (i < lines.length && (lines[i].startsWith("-") || lines[i].startsWith("+"))) {
      requirements.push(lines[i]);
      i += 1;
    }

    const descriptionParts = [];
    while (i < lines.length) {
      const lookahead = lines[i + 1];
      if (isRequirementsLine(lookahead)) break;
      const current = lines[i];
      if (isRequirementsLine(current)) break;
      descriptionParts.push(current);
      i += 1;
    }

    ancillaries.push({
      id: slugify(name),
      name,
      requirements,
      description: descriptionParts.join("\n")
    });
  }
  return ancillaries;
}

function main() {
  const lines = loadLines(inputPath);
  let ancHeadingIdx = lines.findIndex((line) => line.toLowerCase() === "ancillaries");
  if (ancHeadingIdx === -1) {
    ancHeadingIdx = lines.findIndex((line) => /^ancillaries\b/i.test(line));
  }
  if (ancHeadingIdx === -1) {
    throw new Error("Unable to find ancillaries heading");
  }

  const ancestryGroups = parseAncestry(lines, ancHeadingIdx);
  const ancillaries = parseAncillaries(lines, ancHeadingIdx + 1);

  const payload = { ancestryGroups, ancillaries };
  const serialized = JSON.stringify(payload, null, 2);
  fs.writeFileSync(outputPath, serialized, "utf8");
  fs.mkdirSync(path.dirname(clientOutputPath), { recursive: true });
  fs.writeFileSync(clientOutputPath, serialized, "utf8");

  console.log(`Parsed ${ancestryGroups.length} ancestry groups and ${ancillaries.length} ancillaries.`);
}

main();
