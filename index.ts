import fs from "fs/promises";
import { command, option, positional, run } from "cmd-ts";
import { File } from "cmd-ts/batteries/fs";

import { discover, discoverFamiliar, discoverMonster } from "./discover";
import { newResults, processResults } from "./results";

async function main(file: string, branch: string) {
  const contents = await fs.readFile(file, "utf-8");
  let results = newResults();

  if (file.endsWith(".json")) {
    results = {
      ...results,
      ...JSON.parse(contents),
    };
  } else {
    const session = contents.replaceAll("\r\n", "\n");

    for (const discovery of session.matchAll(/-{20}\n(.*?)\n-{20}/gs)) {
      discover(results, discovery[1].split("\n"));
    }
    for (const monster of session.matchAll(
      /\*\*\* Monster '(.*?)' has monsterId = (\d+) and image '(.*?)'/g,
    )) {
      discoverMonster(results, Number(monster[2]), monster[1], monster[3]);
    }
    for (const familiar of session.matchAll(
      /New familiar: "(.*?)" hatches into "(.*?)" \((\d+)\) @ (.*)/g,
    )) {
      discoverFamiliar(
        results,
        Number(familiar[3]),
        familiar[2],
        familiar[4],
        familiar[1],
      );
    }
  }

  await processResults(results, branch);
}

const app = command({
  name: "kolmafia-ingress",
  args: {
    file: positional({
      type: File,
    }),
    branch: option({
      long: "branch",
      short: "b",
      description: "Branch to diff against (defaults to main)",
      defaultValue: () => "main",
    }),
  },
  handler: ({ file, branch }) => {
    main(file, branch);
  },
});

run(app, process.argv.slice(2));
