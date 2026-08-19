import { loadRegistry } from "./registry.js";
import type { GuideRegistryEntry } from "./types.js";

/**
 * Maps a set of changed files to the guides that need re-verifying. Deterministic on
 * purpose: no model decides what gets tested, so the same PR always selects the same
 * guides and a reviewer can predict the check's scope from the registry alone.
 */

const REGEX_METACHARACTERS = new Set([
  ".",
  "+",
  "^",
  "$",
  "{",
  "}",
  "(",
  ")",
  "|",
  "[",
  "]",
  "\\"
]);

/**
 * Minimal glob matcher covering the forms the registry uses: `**` across path separators,
 * `*` within a segment, `?` for one character. Written out rather than pulled from a
 * dependency because the pattern surface is small and fully under our control.
 *
 * Built as a single left-to-right pass rather than a chain of string replacements. The
 * chained version is subtly wrong, and was: each rule can insert regex syntax that a later
 * rule then matches and corrupts. Expanding the double-star rule emits a group containing
 * a literal question mark, and a subsequent question-mark rule happily rewrites it. One
 * pass never revisits what it has already emitted.
 */
export const matchGlob = (pattern: string, filePath: string): boolean => {
  let expression = "";

  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];

    if (char === "*") {
      if (pattern[i + 1] === "*") {
        // A double star followed by a slash has to be able to match nothing at all, so
        // `a/**/b` matches plain `a/b` as well as `a/x/y/b`.
        if (pattern[i + 2] === "/") {
          expression += "(?:.*/)?";
          i += 2;
        } else {
          expression += ".*";
          i += 1;
        }
      } else {
        expression += "[^/]*";
      }
      continue;
    }

    if (char === "?") {
      expression += "[^/]";
      continue;
    }

    if (char !== undefined) {
      expression += REGEX_METACHARACTERS.has(char) ? `\\${char}` : char;
    }
  }

  return new RegExp(`^${expression}$`).test(filePath);
};

export type Selection = {
  entry: GuideRegistryEntry;
  /** Why this guide was selected, for the PR comment and the job log. */
  reasons: string[];
};

export const selectGuides = (changedFiles: string[]): Selection[] => {
  const normalized = changedFiles
    .map((file) => file.trim().replace(/^\.\//, ""))
    .filter((file) => file.length > 0);

  const selections: Selection[] = [];

  for (const entry of loadRegistry()) {
    const reasons: string[] = [];

    // A direct edit to the guide itself always selects it.
    if (normalized.includes(entry.guide)) {
      reasons.push(`${entry.guide} was edited directly`);
    }

    // So does an edit to watched source, or to a snippet the guide inlines.
    for (const pattern of entry.watch) {
      const hits = normalized.filter((file) => matchGlob(pattern, file));
      if (hits.length === 0) continue;
      const shown = hits.slice(0, 3).join(", ");
      const more = hits.length > 3 ? ` (+${hits.length - 3} more)` : "";
      reasons.push(`matched watch "${pattern}": ${shown}${more}`);
    }

    if (reasons.length > 0) selections.push({ entry, reasons });
  }

  return selections;
};

/**
 * Caps how many guides a single PR check will walk. Nightly runs the whole registry; PR
 * runs stay fast so the check lands while the author is still looking at the page.
 * Anything dropped is returned rather than discarded, so the report can say what it
 * skipped instead of reading as full coverage.
 */
export const capSelection = (
  selections: Selection[],
  limit: number
): { selected: Selection[]; dropped: Selection[] } => {
  if (selections.length <= limit) return { selected: selections, dropped: [] };

  // Critical guides earn their slots first; the rest keep a stable alphabetical order.
  const ordered = [...selections].sort((a, b) => {
    if (a.entry.critical !== b.entry.critical) return a.entry.critical ? -1 : 1;
    return a.entry.guide.localeCompare(b.entry.guide);
  });

  return { selected: ordered.slice(0, limit), dropped: ordered.slice(limit) };
};
