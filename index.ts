import fs from "fs/promises";

import { discover, discoverFamiliar, discoverMonster } from "./discover";
import { newResults, processResults } from "./results";

async function main(file: string) {
  const session = await fs.readFile(file, "utf-8");

  const results = newResults();

  for (const discovery of session.matchAll(/-{20}\n(.*?)\n-{20}/sg)) {
    discover(results, discovery[1].split("\n"));
  }
  for (const monster of session.matchAll(/\*\*\* Monster '(.*?)' has monsterId = (\d+) and image '(.*?)'/g)) {
    discoverMonster(results, Number(monster[2]), monster[1], monster[3]);
  }
  for (const familiar of session.matchAll(/New familiar: "(.*?)" hatches into "(.*?)" \((\d+)\) @ (.*)/g)) {
    discoverFamiliar(results, Number(familiar[3]), familiar[2], familiar[4], familiar[1]);
  }

  await processResults(results);
}

main("../../KoLmafia/sessions/gausie_20231215.txt");