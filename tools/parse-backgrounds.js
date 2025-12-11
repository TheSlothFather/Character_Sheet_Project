const fs = require("fs");
const path = require("path");

const SOURCE = path.join(__dirname, "../Backgrounds.txt");
const OUTPUT = path.join(__dirname, "../client/src/data/backgrounds.json");

const text = fs.readFileSync(SOURCE, "utf8");
const lines = text.split(/\r?\n/);

const stageMarkers = [
  { regex: /^1\.\s*Family/i, stage: "Family" },
  { regex: /^2\.\s*Childhood/i, stage: "Childhood" },
  { regex: /^3\.\s*Adolescence/i, stage: "Adolescence" },
  { regex: /^4\.\s*Adulthood/i, stage: "Adulthood" },
  { regex: /^Flaws:?/i, stage: "Flaws" },
  { regex: /^5\.\s*Inciting Incident/i, stage: "Inciting Incident" }
];

/** @type {Array<{stage:string; category?:string; name:string; details:string; startingWealth?:string; startingEquipment?:string; feature?:string;}>} */
const entries = [];
let currentStage = null;
let currentCategory = null;
let currentEntry = null;

const pushCurrent = () => {
  if (!currentEntry) return;
  entries.push(currentEntry);
  currentEntry = null;
};

const isCategoryLine = (line) => {
  if (!line || line.startsWith("*")) return false;
  if (/^Starting (Wealth|Equipment):/i.test(line)) return false;
  if (/^Feature:/i.test(line)) return false;
  if (/^Choose one/i.test(line)) return false;
  if (/^For flaws,/i.test(line)) return false;
  if (/^For Inciting Incidents,/i.test(line)) return false;
  if (/^Your starting wealth/i.test(line)) return false;
  if (/^(Pauper|Insignificant|Moderate|Significant|Wealthy)/i.test(line)) return false;
  return true;
};

for (const rawLine of lines) {
  const line = rawLine.trim();
  if (!line) continue;

  const stageMarker = stageMarkers.find((m) => m.regex.test(line));
  if (stageMarker) {
    pushCurrent();
    currentStage = stageMarker.stage;
    currentCategory = null;
    continue;
  }

  if (!currentStage) continue;

  if (currentStage === "Adulthood" && isCategoryLine(line) && !line.startsWith("*")) {
    currentCategory = line;
    continue;
  }

  if (line.startsWith("*")) {
    pushCurrent();
    const match = line.match(/^\*\s*([^:]+):\s*(.*)$/);
    if (!match) continue;
    const [, name, details] = match;
    currentEntry = {
      stage: currentStage,
      category: currentStage === "Adulthood" ? currentCategory ?? undefined : undefined,
      name: name.trim(),
      details: details.trim()
    };
    continue;
  }

  if (!currentEntry) continue;

  if (line.startsWith("Starting Wealth:")) {
    currentEntry.startingWealth = line.replace(/^[^:]+:/, "").trim();
  } else if (line.startsWith("Starting Equipment:")) {
    currentEntry.startingEquipment = line.replace(/^[^:]+:/, "").trim();
  } else if (line.startsWith("Feature:")) {
    currentEntry.feature = line.replace(/^[^:]+:/, "").trim();
  }
}

pushCurrent();

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(entries, null, 2));

console.log(`Parsed ${entries.length} background entries to ${OUTPUT}`);
