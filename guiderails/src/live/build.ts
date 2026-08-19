import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { GUIDERAILS_ROOT } from "../paths.js";

/**
 * Builds the dashboard on demand, and only when its sources have actually changed.
 *
 * The alternatives were worse. Committing `dist/` puts a minified bundle in every diff and
 * reintroduces exactly the staleness problem `guideDocHash` exists to prevent — a dashboard built
 * from an older protocol would silently render `undefined`. A `postinstall` hook makes a Vite
 * failure break `npm ci` for someone who only wanted to run `lint-images`.
 *
 * So: hash the sources, compare against a stamp written next to the output, and shell out to Vite's
 * JS API only on a mismatch. `--live` works immediately after `npm ci`, nothing built is committed,
 * and no install or CI step changes.
 */

export const DASHBOARD_DIR = path.join(GUIDERAILS_ROOT, "dashboard");
export const DASHBOARD_DIST = path.join(DASHBOARD_DIR, "dist");

const STAMP = path.join(DASHBOARD_DIST, ".sources-hash");

/**
 * Everything the bundle's bytes depend on.
 *
 * `src/live/protocol.ts` is in the list because the dashboard imports it from outside its own
 * directory: it is the one file where editing the Node side changes the browser bundle, which is
 * the whole point of having a shared contract.
 */
const hashInputs = (): string[] => {
  const files: string[] = [
    path.join(GUIDERAILS_ROOT, "src", "live", "protocol.ts"),
    path.join(DASHBOARD_DIR, "index.html"),
    path.join(DASHBOARD_DIR, "vite.config.ts"),
    path.join(DASHBOARD_DIR, "tsconfig.json")
  ];

  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort(byName)) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(path.join(DASHBOARD_DIR, "src"));
  walk(path.join(DASHBOARD_DIR, "public"));

  return files.filter((file) => fs.existsSync(file));
};

const byName = (a: fs.Dirent, b: fs.Dirent): number => (a.name < b.name ? -1 : 1);

/**
 * Paths as well as contents: renaming a component without changing a byte of it still changes the
 * bundle, and hashing contents alone would call that a cache hit.
 */
export const sourcesHash = (): string => {
  const digest = crypto.createHash("sha256");
  for (const file of hashInputs()) {
    digest.update(path.relative(GUIDERAILS_ROOT, file));
    digest.update("\0");
    digest.update(fs.readFileSync(file));
    digest.update("\0");
  }
  return digest.digest("hex").slice(0, 16);
};

const readStamp = (): string | null => {
  try {
    return fs.readFileSync(STAMP, "utf8").trim();
  } catch {
    return null;
  }
};

export type BuildResult =
  | { ok: true; dist: string; built: boolean }
  | { ok: false; reason: string };

/**
 * Never throws.
 *
 * A walk costs API calls and a Docker instance, so losing one because the UI would not compile is
 * not an acceptable trade. The caller prints the reason and falls back to the console reporter,
 * which is the same call `src/run/screencast.ts` already makes when CDP is unavailable.
 */
export const ensureDashboardBuild = async (): Promise<BuildResult> => {
  const expected = sourcesHash();

  if (readStamp() === expected && fs.existsSync(path.join(DASHBOARD_DIST, "index.html"))) {
    return { ok: true, dist: DASHBOARD_DIST, built: false };
  }

  // Imported lazily and by name so that an install without dev dependencies fails here, with an
  // actionable message, rather than at the top of a module every CLI command loads.
  let build: (typeof import("vite"))["build"];
  try {
    ({ build } = await import("vite"));
  } catch {
    return {
      ok: false,
      reason: "vite is not installed (it is a devDependency). Run `npm install` in guiderails/."
    };
  }

  try {
    await build({
      root: DASHBOARD_DIR,
      configFile: path.join(DASHBOARD_DIR, "vite.config.ts"),
      logLevel: "warn"
    });
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  // After the build, because `emptyOutDir` wipes dist/ — writing the stamp first would delete it
  // and re-build on every run.
  fs.writeFileSync(STAMP, `${expected}\n`);
  return { ok: true, dist: DASHBOARD_DIST, built: true };
};
