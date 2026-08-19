import fs from "node:fs";

import { loadRegistry } from "../registry.js";
import { capSelection, selectGuides } from "../select.js";

const DEFAULT_PR_LIMIT = 4;

/**
 * Resolves which guides a run should walk.
 *
 *   --changed-files <file>   newline-separated list, e.g. from `git diff --name-only`
 *   --all                    the whole registry, for the nightly sweep
 *   --limit <n>              cap for PR runs; anything dropped is reported, not hidden
 */
export const runSelect = async (argv: string[]): Promise<number> => {
  const asJson = argv.includes("--json");
  const all = argv.includes("--all");

  const limitIndex = argv.indexOf("--limit");
  const limit =
    limitIndex >= 0 ? Number.parseInt(argv[limitIndex + 1] ?? "", 10) : DEFAULT_PR_LIMIT;
  if (!Number.isFinite(limit) || limit < 1) {
    process.stderr.write("--limit expects a positive integer\n");
    return 2;
  }

  if (all) {
    const selections = loadRegistry().map((entry) => ({
      entry,
      reasons: ["--all: full registry sweep"]
    }));
    return emit(selections, [], asJson);
  }

  const listIndex = argv.indexOf("--changed-files");
  if (listIndex < 0) {
    process.stderr.write(
      "usage: guiderails select (--all | --changed-files <path>) [--limit n] [--json]\n"
    );
    return 2;
  }

  const listPath = argv[listIndex + 1];
  if (!listPath || !fs.existsSync(listPath)) {
    process.stderr.write(`--changed-files: no such file "${listPath ?? ""}"\n`);
    return 2;
  }

  const changed = fs.readFileSync(listPath, "utf8").split("\n");
  const { selected, dropped } = capSelection(selectGuides(changed), limit);
  return emit(selected, dropped, asJson);
};

type Emitted = { entry: { guide: string; critical: boolean }; reasons: string[] };

const emit = (selected: Emitted[], dropped: Emitted[], asJson: boolean): number => {
  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          selected: selected.map((s) => ({ guide: s.entry.guide, reasons: s.reasons })),
          dropped: dropped.map((s) => ({ guide: s.entry.guide, reasons: s.reasons }))
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  if (selected.length === 0) {
    process.stdout.write("no guides selected\n");
    return 0;
  }

  for (const selection of selected) {
    process.stdout.write(`${selection.entry.guide}\n`);
    for (const reason of selection.reasons) process.stdout.write(`    ${reason}\n`);
  }

  // Never let a cap read as full coverage.
  if (dropped.length > 0) {
    process.stdout.write(`\ndropped ${dropped.length} guide(s) over the limit:\n`);
    for (const selection of dropped) process.stdout.write(`    ${selection.entry.guide}\n`);
  }

  return 0;
};
