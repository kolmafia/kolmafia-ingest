import fs, { readFile, writeFile } from "node:fs/promises";
import simpleGit, { ResetMode } from "simple-git";

export type Results = {
  items: string[];
  skills: string[];
  equipment: { section: string; line: string }[];
  modifiers: { section: string; line: string[] }[];
  fullness: string[];
  inebriety: string[];
  spleen: string[];
  effects: string[];
  outfits: string[];
  monsters: string[];
  familiars: string[];
  shop: string[];
};

export const newResults = () => ({
  items: [],
  skills: [],
  equipment: [],
  modifiers: [],
  fullness: [],
  inebriety: [],
  spleen: [],
  effects: [],
  outfits: [],
  monsters: [],
  familiars: [],
  shop: [],
});

// Utils

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
    case "spleen":
      return "spleen toxins";
    case "skill":
      return "passive skills";
    case "misc":
      return "everything else";
    default:
      return `${section}s`;
  }
}

async function prepRepo(branch: string) {
  if (await exists("kolmafia")) {
    const repo = simpleGit("kolmafia");
    await repo.reset(ResetMode.HARD);
    await repo.checkout(branch);
    await repo.pull();
    return repo;
  }

  await simpleGit().clone("https://github.com/kolmafia/kolmafia", "kolmafia", {
    "--branch": branch,
    "--single-branch": null,
    "--depth": 1,
  });
  return simpleGit("kolmafia");
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

// Processers

export async function processResults(results: Results, branch: string) {
  const repo = await prepRepo(branch);

  console.log("Equipment");
  await processEquipment(results.equipment);
  console.log("Items");
  await processItems(results.items);
  console.log("Mods");
  await processModifiers(results.modifiers);
  console.log("Monsters");
  await processMonsters(results.monsters);
  console.log("Shop");
  await processShop(results.shop);
  console.log("Familiars");
  await processSimpleAlphabetical("familiars.txt", results.familiars, true);
  console.log("Food");
  await processSimpleAlphabetical("fullness.txt", results.fullness);
  console.log("Booze");
  await processSimpleAlphabetical("inebriety.txt", results.inebriety);
  console.log("Spleen");
  await processSimpleAlphabetical("spleenhit.txt", results.spleen);
  console.log("Outfits");
  await processSimpleAlphabetical("outfits.txt", results.outfits, true);
  console.log("Status Effects");
  await processSimpleAlphabetical("statuseffects.txt", results.effects, true);
  console.log("Skills");
  await processSkills(results.skills);

  const diff = await repo.diff();
  console.log(diff);
}

async function processItems(items: Results["items"]) {
  if (items.length === 0) {
    return;
  }

  const file = "kolmafia/src/data/items.txt";
  items.sort((a, b) => Number(a.split("\t")[0]) - Number(b.split("\t")[0]));

  const itemFile = await readFile(file, "utf-8");
  const lines = itemFile.trim().split("\n");

  let i = 1;
  let id = 0;
  while (true) {
    if (items.length === 0) break;
    // data line might end with plural
    if (lines.some(l => l.startsWith(items[0]))) {
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

  await writeFile(file, lines.join("\n") + "\n");
}

async function processSkills(skills: Results["skills"]) {
  if (skills.length === 0) {
    return;
  }

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

  await writeFile(path, lines.join("\n") + "\n");
}

async function processEquipment(equipment: Results["equipment"]) {
  if (equipment.length === 0) {
    return;
  }

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
      ...[
        ...lines.slice(sectionStart, sectionEnd),
        ...newLines.filter((v) => !lines.includes(v)),
      ].toSorted(naturalSort),
    );
  }

  if (lines[lines.length - 1] !== "") {
    lines.push("");
  }

  await writeFile(path, lines.join("\n"));
}

async function processSimpleAlphabetical(
  filename: string,
  values: string[],
  fillGaps = false,
) {
  if (values.length === 0) {
    return;
  }

  const path = `kolmafia/src/data/${filename}`;

  const file = await readFile(path, "utf-8");
  const lines = file.trim().split("\n");

  const start = lines.findIndex(
    (v, i) => i > 0 && v !== "" && !v.startsWith("#"),
  );

  let i = start;

  const sectionLines = coalesceComments(lines.slice(start, lines.length));
  const dedupedLines = values.filter((v) => !sectionLines.includes(v));

  lines.splice(
    start,
    lines.length - start,
    ...[
      ...sectionLines.filter(
        (v) =>
          !v.match(/\d+/) || !dedupedLines.find((l) => l.startsWith(`${v}\t`)),
      ),
      ...dedupedLines,
    ].toSorted(naturalSort),
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
      if (fill > -1) {
        lines.splice(
          i,
          0,
          ...Array(fill)
            .fill(0)
            .map((v, i) => (i + lastId + 1).toString()),
        );
        lastId = id;
        i += fill + 1;
      } else {
        i++;
      }
    }
    finished = lines.join("\n");
  }

  await writeFile(path, finished);
}

async function processMonsters(monsters: Results["monsters"]) {
  if (monsters.length === 0) {
    return;
  }

  const path = `kolmafia/src/data/monsters.txt`;

  const file = await readFile(path, "utf-8");
  await writeFile(
    path,
    `${file.trim()}\n\n# NEW MONSTERS - DO NOT COMMIT THIS TEXT\n${monsters
      .toSorted()
      .join("\n")}\n`,
  );
}

async function processShop(shop: Results["shop"]) {
  if (shop.length === 0) {
    return;
  }

  const path = `kolmafia/src/data/coinmasters.txt`;

  const file = await readFile(path, "utf-8");
  const lines = file.trim().split("\n");

  const grouped = shop.reduce(
    (acc, line) => {
      const name = line.split("\t")[0];
      return {
        ...acc,
        [name]: [...(acc[name] || []), line],
      };
    },
    {} as Record<string, string[]>,
  );

  for (const [shop, newLines] of Object.entries(grouped)) {
    const start = lines.findIndex((l) => l.startsWith(shop));
    const shopStart = start < 0 ? lines.length : start;
    const end = lines.indexOf("", start);
    const shopEnd = end < 0 ? lines.length : end;

    const shopLines = lines.slice(shopStart, shopEnd);
    const dedupedLines = newLines.filter((l) => !shopLines.includes(l));

    // Add preceding newline for new shops
    if (start < 0) dedupedLines.push("");

    lines.splice(
      shopStart,
      shopEnd - shopStart,
      ...[...shopLines, ...dedupedLines].toSorted((a, b) =>
        a
          .split("\t")
          .at(-1)!
          .slice(3)
          .localeCompare(b.split("\t").at(-1)!.slice(3), undefined, {
            sensitivity: "base",
            numeric: true,
          }),
      ),
    );
  }

  if (lines[lines.length - 1] !== "") {
    lines.push("");
  }

  await writeFile(path, lines.join("\n"));
}

const modifierSortTransformer = (v: string) => {
  const actual = v.split("\n").at(-1)!;
  const piece = actual.startsWith("# ")
    ? actual.slice(2, actual.indexOf(":"))
    : actual.split("\t").slice(1).join("\t");
  const [, name] = piece.match(/^(?:\[\d+])(.*?)$/) ?? [piece, piece];
  return name;
};

function modifierSort(a: string, b: string) {
  const transformedA = modifierSortTransformer(a);
  const transformedB = modifierSortTransformer(b);
  return transformedA.localeCompare(transformedB, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

async function processModifiers(modifiers: Results["modifiers"]) {
  if (modifiers.length === 0) {
    return;
  }

  const path = "kolmafia/src/data/modifiers.txt";

  const grouped = modifiers
    // All non-comment lines make it through, if they're commented they must include a colon
    .filter(({ line }) => !line[0].startsWith("#") || line[0].includes(":"))
    .reduce(
      (acc, { section, line }) => ({
        ...acc,
        [section]: [...(acc[section] || []), line.join("\n")],
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
      (c) => c.startsWith("# *"),
    );

    const nonDupeLines = newLines.filter(
      (v) => !sectionLines.includes(v.split("\n").at(0)!),
    );

    if (nonDupeLines.length === 0) continue;

    lines.splice(
      sectionStart,
      sectionEnd - sectionStart,
      ...[...sectionLines, ...nonDupeLines].toSorted(modifierSort),
    );
  }

  if (lines[lines.length - 1] !== "") {
    lines.push("");
  }

  await writeFile(path, lines.join("\n"));
}
