import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** `__dirname` does not exist under ESM; derive it from the module URL instead. */
const here = path.dirname(fileURLToPath(import.meta.url));

const findRepoRoot = (start: string): string => {
  let current = start;
  for (;;) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not locate the repository root walking up from ${start}`);
    }
    current = parent;
  }
};

export const REPO_ROOT = findRepoRoot(here);
export const DOCS_ROOT = path.join(REPO_ROOT, "docs");
export const GUIDERAILS_ROOT = path.join(REPO_ROOT, "guiderails");
export const REGISTRY_DIR = path.join(GUIDERAILS_ROOT, "guides");
export const COMPILED_DIR = path.join(GUIDERAILS_ROOT, "compiled");
export const RESOLVED_DIR = path.join(GUIDERAILS_ROOT, "resolved");
export const REPORTS_DIR = path.join(GUIDERAILS_ROOT, "reports");

/**
 * Accepts an absolute path, a repo-relative path, a docs-relative path, or a substring.
 *
 * The substring form exists so working on one page does not mean typing its full path:
 * `extract folder` finds `docs/documentation/platform/folder.mdx`. Unlike the registry-based
 * resolver this searches all of docs/, because linting or extracting an unregistered page is a
 * perfectly reasonable thing to want.
 *
 * An ambiguous substring is an error listing the matches rather than a guess, for the same reason
 * everywhere else: quietly operating on a different page than the one asked for is worse than
 * refusing.
 */
export const resolveGuidePath = (input: string): string => {
  if (path.isAbsolute(input)) return input;

  const withExtension = input.endsWith(".mdx") ? input : `${input}.mdx`;
  const candidates = [
    path.join(REPO_ROOT, input),
    path.join(DOCS_ROOT, input),
    path.join(REPO_ROOT, withExtension),
    path.join(DOCS_ROOT, withExtension)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }

  const needle = input.replace(/\.mdx$/, "");
  let matches = listDocGuides().filter((guide) => guide.includes(needle));

  // `folder` matches folder.mdx, folder-structure.mdx and pam/folders/overview.mdx. Naming a page
  // exactly should win over merely appearing in another page's path, so prefer a filename match
  // when there is exactly one.
  if (matches.length > 1) {
    const byFilename = matches.filter(
      (guide) => path.basename(guide) === `${needle}.mdx`
    );
    if (byFilename.length === 1) matches = byFilename;
  }

  if (matches.length === 1 && matches[0]) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `"${input}" matches ${matches.length} guides:\n${matches
        .map((guide) => `  ${path.relative(REPO_ROOT, guide)}`)
        .join("\n")}\nBe more specific.`
    );
  }

  throw new Error(
    `No guide found for "${input}". Tried these paths, then searched docs/ for the name:\n  ${candidates
      .map((candidate) => path.relative(REPO_ROOT, candidate))
      .join("\n  ")}`
  );
};

/**
 * Anything that can end up in a committed artifact or a report is stored repo-relative.
 *
 * An absolute path in `compiled/*.json` would break on every other machine, leak whoever ran the
 * compile out of their home directory, and make the artifact differ byte-for-byte between two
 * developers compiling the same unchanged guide.
 */
export const repoRelative = (absolute: string): string =>
  path.isAbsolute(absolute) ? path.relative(REPO_ROOT, absolute) : absolute;

/** The inverse, for the places that actually have to open the file. */
export const fromRepoRelative = (relative: string): string =>
  path.isAbsolute(relative) ? relative : path.join(REPO_ROOT, relative);

/** Every hand-written .mdx under docs/, excluding the generated api-reference tree. */
export const listDocGuides = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "api-reference") continue;
        walk(full);
      } else if (entry.name.endsWith(".mdx")) {
        out.push(full);
      }
    }
  };
  walk(DOCS_ROOT);
  return out.sort();
};
