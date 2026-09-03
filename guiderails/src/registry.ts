import fs from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { REGISTRY_DIR, REPO_ROOT } from "./paths.js";
import type { GuideRegistryEntry } from "./types.js";

/**
 * The registry is the opt-in surface: a guide is only ever walked because a file here says
 * to. It lives as sidecar YAML rather than MDX frontmatter because docs/ currently has
 * exactly six frontmatter keys repo-wide and zero non-Mintlify ones, and because
 * skip-reasons and fixture wiring are test metadata that should not ship on a published
 * page.
 */

const requireString = (value: unknown, field: string, file: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${file}: "${field}" must be a non-empty string`);
  }
  return value.trim();
};

const optionalString = (value: unknown, field: string, file: string): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`${file}: "${field}" must be a string or null`);
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const requireBoolean = (value: unknown, field: string, file: string): boolean => {
  if (typeof value !== "boolean") throw new Error(`${file}: "${field}" must be a boolean`);
  return value;
};

const requireStringArray = (value: unknown, field: string, file: string): string[] => {
  if (!Array.isArray(value)) throw new Error(`${file}: "${field}" must be an array`);
  return value.map((item, i) => requireString(item, `${field}[${i}]`, file));
};

const parseEntry = (raw: unknown, file: string): GuideRegistryEntry => {
  if (!raw || typeof raw !== "object") throw new Error(`${file}: expected a YAML mapping`);
  const record = raw as Record<string, unknown>;

  const guide = requireString(record.guide, "guide", file);
  const absolute = path.join(REPO_ROOT, guide);
  if (!fs.existsSync(absolute)) {
    throw new Error(`${file}: guide "${guide}" does not exist at ${absolute}`);
  }

  const watch = requireStringArray(record.watch, "watch", file);
  if (watch.length === 0) {
    throw new Error(
      `${file}: "watch" is empty, so no code change could ever select this guide. ` +
        `List the paths whose change should re-verify it.`
    );
  }

  const skipSteps = (record.skipSteps === undefined ? [] : record.skipSteps) as unknown;
  if (!Array.isArray(skipSteps) || skipSteps.some((n) => typeof n !== "number")) {
    throw new Error(`${file}: "skipSteps" must be an array of step numbers`);
  }

  return {
    guide,
    fixture: requireString(record.fixture, "fixture", file),
    watch,
    critical: requireBoolean(record.critical, "critical", file),
    tab: optionalString(record.tab, "tab", file),
    skipSteps: skipSteps as number[],
    requiresLicense: requireBoolean(record.requiresLicense, "requiresLicense", file),
    notes: optionalString(record.notes, "notes", file)
  };
};

export const loadRegistry = (): GuideRegistryEntry[] => {
  if (!fs.existsSync(REGISTRY_DIR)) return [];

  const entries: GuideRegistryEntry[] = [];
  const seen = new Map<string, string>();

  for (const name of fs.readdirSync(REGISTRY_DIR).sort()) {
    if (!name.endsWith(".yaml") && !name.endsWith(".yml")) continue;
    const file = path.join(REGISTRY_DIR, name);
    const entry = parseEntry(parseYaml(fs.readFileSync(file, "utf8")), `guides/${name}`);

    const previous = seen.get(entry.guide);
    if (previous) {
      throw new Error(
        `guides/${name}: "${entry.guide}" is already registered by ${previous}. ` +
          `One registry file per guide.`
      );
    }
    seen.set(entry.guide, `guides/${name}`);
    entries.push(entry);
  }

  return entries;
};

/**
 * Resolves guide names from the command line against the registry.
 *
 * Names are matched by substring so `folder` finds
 * `docs/documentation/platform/folder.mdx` without anyone typing the whole path. An empty list
 * means the whole registry, which is what every command wants as its default.
 *
 * An ambiguous or unknown name is an error rather than a best guess: silently walking a different
 * guide than the one asked for is worse than refusing, and the error lists what is available.
 */
export const resolveRegistryTargets = (names: string[]): GuideRegistryEntry[] => {
  const registry = loadRegistry();
  if (names.length === 0) return registry;

  const available = (): string =>
    registry.map((entry) => `  ${entry.guide}`).join("\n");

  return names.map((name) => {
    const exact = registry.find((entry) => entry.guide === name);
    if (exact) return exact;

    const matches = registry.filter((entry) => entry.guide.includes(name));
    if (matches.length === 1 && matches[0]) return matches[0];

    if (matches.length > 1) {
      throw new Error(
        `"${name}" matches more than one registered guide:\n${matches
          .map((entry) => `  ${entry.guide}`)
          .join("\n")}\nBe more specific.`
      );
    }

    throw new Error(`"${name}" is not a registered guide. Registered:\n${available()}`);
  });
};

export const findRegistryEntry = (guide: string): GuideRegistryEntry | undefined => {
  const normalized = guide.replace(/^\.\//, "");
  return loadRegistry().find(
    (entry) => entry.guide === normalized || entry.guide.endsWith(normalized)
  );
};
