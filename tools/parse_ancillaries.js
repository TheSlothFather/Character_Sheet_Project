const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_PATH = path.join(ROOT, 'client', 'src', 'data', 'ancillaries.json');

const slugify = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const readLines = (filename) => fs.readFileSync(path.join(DATA_DIR, filename), 'utf8').split(/\r?\n/);

const parseBlockFile = (filename) => {
  const lines = readLines(filename);
  const entries = [];
  let idx = 0;

  const isEntryStart = (i) => Boolean(lines[i] && lines[i + 1] && lines[i + 1].trim() === 'Requirements:');

  while (idx < lines.length) {
    if (!isEntryStart(idx)) {
      idx += 1;
      continue;
    }

    const name = lines[idx].trim();
    idx += 2; // skip name and "Requirements:" line

    const requirements = [];
    while (idx < lines.length && lines[idx].trim() !== '') {
      requirements.push(lines[idx].trim());
      idx += 1;
    }

    while (idx < lines.length && lines[idx].trim() === '') idx += 1;

    const descriptionLines = [];
    while (idx < lines.length) {
      if (isEntryStart(idx)) break;
      if (lines[idx].trim() === '' && isEntryStart(idx + 1)) break;
      if (lines[idx].trim().endsWith(' Ancillaries')) break;
      if (lines[idx].trim() !== '') descriptionLines.push(lines[idx].trim());
      idx += 1;
    }

    const description = descriptionLines.join(' ').replace(/\s+/g, ' ').trim();
    entries.push({
      id: slugify(name),
      name,
      requirements,
      description
    });
  }

  return entries;
};

const parseAncestry = (filename) => {
  const lines = readLines(filename);
  const groups = [];
  let current = null;

  lines.forEach((raw) => {
    const line = raw.replace(/\ufeff/g, '').trim();
    if (!line) return;
    if (line.endsWith(' Ancillaries')) return;

    if (!line.includes(':')) {
      if (current) groups.push(current);
      current = { name: line, id: slugify(line), entries: [] };
      return;
    }

    if (!current) return;
    const [name, descriptionPart] = line.split(/:/, 2);
    const description = descriptionPart.trim();
    current.entries.push({
      id: slugify(name),
      name: name.trim(),
      description
    });
  });

  if (current) groups.push(current);
  return groups;
};

const main = () => {
  const general = parseBlockFile('general_ancillaries.txt');
  const mechanical = parseBlockFile('mechanical_ancillaries.txt');
  const ancestryGroups = parseAncestry('ancestry_ancillaries.txt');

  const mechanicalIds = new Set(mechanical.map((entry) => entry.id));

  const merged = [...general];
  mechanical.forEach((entry) => {
    const exists = merged.find((candidate) => candidate.id === entry.id);
    if (exists) {
      exists.requirements = exists.requirements.length ? exists.requirements : entry.requirements;
      exists.description = exists.description || entry.description;
    } else {
      merged.push(entry);
    }
  });

  const output = {
    ancestryGroups: ancestryGroups.map((group) => ({
      ...group,
      entries: group.entries.map((entry) => ({ ...entry, mechanical: /\[Mechanical\]/i.test(entry.description) }))
    })),
    ancillaries: merged.map((entry) => ({ ...entry, mechanical: mechanicalIds.has(entry.id) }))
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Wrote ${output.ancillaries.length} ancillaries and ${output.ancestryGroups.length} ancestry groups to ${OUTPUT_PATH}`);
};

main();
