import { Results } from "./results";

function isNumeric(value: string) {
  return /^-?\d+$/.test(value);
}

function isImage(value: string) {
  return value.endsWith(".gif");
}

function isDescid(value: string) {
  return /^[a-f0-9]{32}$/.test(value);
}

const EQUIPMENTS = [
  "weapon",
  "offhand",
  "container",
  "accessory",
  "shirt",
  "pants",
  "hat",
];
const SECTIONS = [...EQUIPMENTS, "food", "drink", "spleen", "potion"];

function getSection(types: string[]) {
  return types.find((t) => SECTIONS.includes(t)) ?? "misc";
}

const ITEM_CACHE: string[] = [];

function discoverItem(results: Results, discovery: string[]) {
  const item = discovery[0].split("\t");

  if (ITEM_CACHE.includes(item[0])) return;
  ITEM_CACHE.push(item[0]);

  results.items.push(discovery[0]);

  if (discovery.length === 1) return;

  const types = item[4].split(", ");

  const section = getSection(types);

  if (EQUIPMENTS.includes(section)) {
    results.equipment.push({ section, line: discovery[1] });
    results.modifiers.push({ section, line: discovery.slice(2) });
    return;
  }

  if (section === "food") {
    results.fullness.push(discovery[1]);
    results.modifiers.push({ section, line: discovery.slice(2) });
    return;
  }

  if (section === "drink") {
    results.inebriety.push(discovery[1]);
    results.modifiers.push({ section, line: discovery.slice(2) });
    return;
  }

  if (section === "spleen") {
    results.spleen.push(discovery[1]);
    results.modifiers.push({ section, line: discovery.slice(2) });
    return;
  }

  if (section && discovery[1] !== `# ${item[1]}`) {
    results.modifiers.push({ section, line: discovery.slice(1) });
    return;
  }
}

function discoverSkill(results: Results, discovery: string[]) {
  results.skills.push(discovery[0]);

  if (discovery.length === 1) return;

  results.modifiers.push({ section: "skill", line: discovery.slice(1) });
}

function discoverEffect(results: Results, discovery: string[]) {
  results.effects.push(discovery[0]);

  if (discovery.length === 1) return;

  results.modifiers.push({ section: "status effect", line: discovery.slice(1) });
}

function discoverOutfit(results: Results, discovery: string[]) {
  const id = discovery[0].slice(0, discovery[0].indexOf("\t") + 1);

  // Outfit logs are improved over time, so replace instead of push
  const idx = results.outfits.findIndex((v) => v.startsWith(id));
  results.outfits[idx > -1 ? idx : results.outfits.length] = discovery[0];

  if (idx < 0 || discovery.length === 1) return;

  results.modifiers.push({ section: "outfit", line: discovery.slice(1) });
}

function discoverShop(results: Results, discovery: string[]) {
  results.shop.push(...discovery);
}

export function discoverMonster(
  results: Results,
  id: number,
  name: string,
  image: string,
) {
  results.monsters.push(`${name}\t${id}\t${image}\t`);
}

export function discoverFamiliar(
  results: Results,
  id: number,
  name: string,
  image: string,
  hatchling: string,
) {
  const equip = "";
  const types = "";
  results.familiars.push(
    `${id}\t${name}\t${image}\t${types}\t${hatchling}\t${equip}\t0\t0\t0\t0`,
  );
}

const DISCOVERY_CACHE: string[] = [];

export function discover(results: Results, discovery: string[]) {
  if (DISCOVERY_CACHE.includes(discovery.join("\n"))) {
    return;
  }
  DISCOVERY_CACHE.push(discovery.join("\n"));

  const last = discovery[discovery.length - 1];
  if (last.startsWith("Item\t")) return discoverItem(results, discovery);
  if (last.startsWith("Skill\t")) return discoverSkill(results, discovery);
  if (last.startsWith("Effect\t")) return discoverEffect(results, discovery);
  if (last.startsWith("Outfit\t")) return discoverOutfit(results, discovery);
  if (last.match(/\tROW\d+$/)) return discoverShop(results, discovery);

  const pieces = discovery[0].split("\t");
  if (
    (pieces.length === 7 || pieces.length === 8) &&
    isNumeric(pieces[2]) &&
    isImage(pieces[3])
  )
    return discoverItem(results, discovery);
  if ((pieces.length === 6 || pieces.length === 7) && isImage(pieces[2])) {
    if (isDescid(pieces[3])) {
      return discoverEffect(results, discovery);
    } else {
      return discoverSkill(results, discovery);
    }
  }

  console.log("Did not identify", discovery);
}
