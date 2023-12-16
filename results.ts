import fs, { readFile, writeFile } from "node:fs/promises";
import simpleGit, { ResetMode } from "simple-git";

export type Results = {
  items: string[];
  skills: string[];
  equipment: { section: string; line: string }[];
  modifiers: { section: string; line: string[] }[];
  fullness: string[];
  inebriety: string[];
  effects: string[];
  outfits: string[];
  monsters: string[];
  familiars: string[];
};

export const newResults = () => ({
  items: [],
  skills: [],
  equipment: [],
  modifiers: [],
  fullness: [],
  inebriety: [],
  effects: [],
  outfits: [],
  monsters: [],
  familiars: [],
});

const naturalSortTransformer = (v: string) => {
  const piece = v.split("\n").at(-1) ?? "";
  const [, name] = piece.match(/^(?:\[\d+])(.*?)$/) ?? [, piece];
  return name;
};

const naturalSort = (a: string, b: string) =>
  naturalSortTransformer(a).localeCompare(
    naturalSortTransformer(b),
    undefined,
    { numeric: true, sensitivity: "base" },
  );

async function exists(path: string) {
  try {
    await fs.access(path);
    return true;
  } catch (error) {
    return false;
  }
}

const BRANCH = "main"

async function prepRepo() {
  if (await exists("kolmafia")) {
    const repo = simpleGit("kolmafia");
    await repo.reset(ResetMode.HARD);
    await repo.checkoutBranch(BRANCH, "origin");
    await repo.pull();
    return repo;
  }

  await simpleGit().clone("https://github.com/kolmafia/kolmafia", "kolmafia", {
    "--branch": BRANCH,
    "--single-branch": null,
    "--depth": 1,
  });
  return simpleGit("kolmafia");
}

export async function processResults(results: Results) {
  const repo = await prepRepo();

  await processItems(results.items);
  await processSkills(results.skills);
  await processEquipment(results.equipment);
  await processSimpleAlphabetical("fullness.txt", results.fullness);
  await processSimpleAlphabetical("inebriety.txt", results.inebriety);
  await processSimpleAlphabetical("outfits.txt", results.outfits, true);
  await processSimpleAlphabetical("statuseffects.txt", results.effects, true);
  await processSimpleAlphabetical("familiars.txt", results.familiars, true);
  await processMonsters(results.monsters);
  await processModifiers(results.modifiers);

  const diff = await repo.diff();
  console.log(diff);
}

async function processItems(items: Results["items"]) {
  const file = "kolmafia/src/data/items.txt";
  items.sort();

  const itemFile = await readFile(file, "utf-8");
  const lines = itemFile.trim().split("\n");

  let i = 1;
  let id = 0;
  while (true) {
    if (items.length === 0) break;
    if (lines.includes(items[0])) {
      items.shift();
      continue;
    }

    if (lines[i]?.startsWith("#")) {
      i++;
      continue;
    }

    const incoming = Number(items[0].split("\t")[0]);
    if (lines[i] === undefined) {
      lines.push((id + 1).toString());
    }

    id = Number(lines[i].split("\t")[0]);

    if (id !== incoming) {
      i++;
      continue;
    }

    const placeholder = lines[i]?.trim() === incoming.toString();

    lines.splice(i++, placeholder ? 1 : 0, items.shift()!);
  }

  await writeFile(file, lines.join("\n"));
}

async function processSkills(skills: Results["skills"]) {
  const path = "kolmafia/src/data/classskills.txt";
  skills.sort();

  const file = await readFile(path, "utf-8");
  const lines = file.trim().split("\n");

  let i = 1;
  let id = 0;
  let lastIdLine = 0;
  while (true) {
    if (skills.length === 0) break;

    if (lines.includes(skills[0])) {
      skills.shift();
      continue;
    }


    if (lines[i]?.startsWith("#") || lines[i]?.length === 0) {
      i++;
      continue;
    }

    const incoming = Number(skills[0].split("\t")[0]);
    let newId = Number(lines[i].split("\t")[0]);
    if (lines[i] === undefined) {
      lines.push((id + 1).toString());
    }

    // If we hit a new block, back up and treat it like the end of the file
    if (newId > incoming) {
      i = lastIdLine + 1;
      newId = id + 1;
      lines.splice(i, 0, newId.toString());
    }

    id = newId;
    lastIdLine = i;

    if (id > incoming) break;

    if (id !== incoming) {
      i++;
      continue;
    }

    const placeholder = lines[i]?.trim() === incoming.toString();

    lines.splice(i++, placeholder ? 1 : 0, skills.shift()!);
  }

  await writeFile(path, lines.join("\n"));
}

function normaliseSection(section: string) {
  switch (section) {
    case "offhand":
      return "off-hand items";
    case "accessory":
      return "accessories";
    case "food":
    case "pants":
      return section;
    case "drink":
      return "booze";
    case "skill":
      return "passive skills";
    case "misc":
      return "everything else";
    default:
      return `${section}s`;
  }
}

async function processEquipment(equipment: Results["equipment"]) {
  const path = "kolmafia/src/data/equipment.txt";

  const grouped = equipment.reduce(
    (acc, { section, line }) => ({
      ...acc,
      [section]: [...(acc[section] || []), line].toSorted(naturalSort),
    }),
    {} as Record<string, string[]>,
  );

  const file = await readFile(path, "utf-8");
  const lines = file.trim().split("\n");

  for (const [section, newLines] of Object.entries(grouped)) {
    let sectionStart = lines.findIndex((l) =>
      l.toLowerCase().startsWith(`# ${normaliseSection(section)} section`),
    );
    if (sectionStart < 0) console.log("Couldn't find section", section);

    sectionStart += 2;

    let sectionEnd = lines.findIndex(
      (l, i) => i > sectionStart && l.match(/# .*? section/),
    );

    sectionEnd = sectionEnd > 0 ? sectionEnd - 1 : lines.length;

    lines.splice(
      sectionStart,
      sectionEnd - sectionStart,
      ...[...lines.slice(sectionStart, sectionEnd), ...newLines.filter(v => !lines.includes(v))].toSorted(
        naturalSort,
      ),
    );
  }

  if (lines[lines.length - 1] !== "") {
    lines.push("");
  }

  await writeFile(path, lines.join("\n"));
}

function coalesceComments(
  lines: string[],
  coaleseIf = (line: string) => line.startsWith("#"),
) {
  let i = 0;

  let handlingComment = false;
  while (i < lines.length) {
    let newLine = lines[i];
    if (handlingComment) {
      const [prev] = lines.splice(--i, 1);
      newLine = `${prev}\n${newLine}`;
    }
    handlingComment = coaleseIf(lines[i]);
    lines[i] = newLine;
    i++;
  }

  return lines;
}

async function processSimpleAlphabetical(
  filename: string,
  values: string[],
  fillGaps = false,
) {
  const path = `kolmafia/src/data/${filename}`;

  const file = await readFile(path, "utf-8");
  const lines = file.trim().split("\n");

  const start = lines.findIndex(
    (v, i) => i > 0 && v !== "" && !v.startsWith("#"),
  );

  let i = start;

  const sectionLines = coalesceComments(lines.slice(start, lines.length));

  lines.splice(
    start,
    lines.length - start,
    ...[...sectionLines, ...values.filter(v => !sectionLines.includes(v))].toSorted(naturalSort),
  );

  if (lines[lines.length - 1] !== "") {
    lines.push("");
  }

  let finished = lines.join("\n");

  if (fillGaps) {
    const lines = finished.split("\n");
    i = start;
    let lastId = 0;
    while (i < lines.length) {
      if (lines[i].startsWith("#") || lines[i] === "") {
        i++;
        continue;
      }
      const id = Number(lines[i].split("\t")[0]);
      const fill = id - (lastId + 1);
      lines.splice(
        i,
        0,
        ...Array(fill)
          .fill(0)
          .map((v, i) => (i + lastId + 1).toString()),
      );
      lastId = id;
      i += fill + 1;
    }
    finished = lines.join("\n");
  }

  await writeFile(path, finished);
}

async function processMonsters(monsters: Results["monsters"]) {
  const path = `kolmafia/src/data/monsters.txt`;

  const file = await readFile(path, "utf-8");
  await writeFile(
    path,
    `${file.trim()}\n\n# NEW MONSTERS - DO NOT COMMIT THIS TEXT\n${monsters
      .toSorted()
      .join("\n")}\n`,
  );
}

async function processModifiers(modifiers: Results["modifiers"]) {
  const path = "kolmafia/src/data/modifiers.txt";

  const grouped = modifiers.reduce(
    (acc, { section, line }) => ({
      ...acc,
      [section]: [...(acc[section] || []), line.join("\n")].toSorted(naturalSort),
    }),
    {} as Record<string, string[]>,
  );

  const file = await readFile(path, "utf-8");
  const lines = file.trim().split("\n");

  for (const [section, newLines] of Object.entries(grouped)) {
    let sectionStart = lines.findIndex((l) =>
      l.toLowerCase().startsWith(`# ${normaliseSection(section)} section`),
    );
    if (sectionStart < 0) console.log("Couldn't find section", section);

    sectionStart += 2;

    let sectionEnd = lines.findIndex(
      (l, i) => i > sectionStart && l.match(/# .*? section/),
    );

    sectionEnd = sectionEnd > 0 ? sectionEnd - 1 : lines.length;

    const sectionLines = coalesceComments(
      lines.slice(sectionStart, sectionEnd),
      (c) => c.startsWith("# ***"),
    );

    const compareTransformer = (v: string) => {
      const actual = v.split("\n").at(-1)!;
      const piece = actual.startsWith("# ")
        ? actual.slice(2)
        : actual.split("\t").slice(1).join("\t");
      const [,name] = piece.match(/^(?:\[\d+])(.*?)$/) ?? [piece, piece];
      return name;
    };

    const nonDupeLines = newLines.filter(v => !sectionLines.includes(v.split("\n").at(0)!));
    
    if (nonDupeLines.length === 0) continue;

    lines.splice(
      sectionStart,
      sectionEnd - sectionStart,
      ...[...sectionLines, ...nonDupeLines].toSorted((a, b) =>
        compareTransformer(a).localeCompare(compareTransformer(b), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    );
  }

  if (lines[lines.length - 1] !== "") {
    lines.push("");
  }

  await writeFile(path, lines.join("\n"));
}
