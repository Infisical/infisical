import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { COMPILED_DIR, REPO_ROOT } from "../src/paths.js";
import { loadRegistry } from "../src/registry.js";
import type { GuidePlan } from "../src/types.js";

/**
 * Guards the committed plan artifacts.
 *
 * These files are checked into git and read on machines that are not the one that produced them,
 * so anything machine-specific in them is a bug rather than an inconvenience. An absolute path
 * would break every other checkout, leak the compiling developer's home directory into history,
 * and make two developers compiling the same unchanged guide produce different bytes.
 */

const planFiles = (): string[] => {
  if (!fs.existsSync(COMPILED_DIR)) return [];
  return fs
    .readdirSync(COMPILED_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(COMPILED_DIR, name));
};

const readPlan = (file: string): GuidePlan =>
  JSON.parse(fs.readFileSync(file, "utf8")) as GuidePlan;

describe("committed plan artifacts", () => {
  const files = planFiles();

  it("there is at least one to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("contain nothing machine-specific", () => {
    // Belt and braces over the per-field check below: catches a filesystem path appearing in any
    // field a future change might add, not just the ones we know about today.
    //
    // Deliberately not "no string starting with a slash". Image references are stored exactly as
    // the MDX wrote them, and `/images/platform/...` is a docs-root-relative URL that is correct
    // and portable. What must never appear is a real filesystem location.
    for (const file of files) {
      const raw = fs.readFileSync(file, "utf8");
      const label = path.basename(file);

      expect(raw, `${label} embeds the repo root`).not.toContain(REPO_ROOT);
      expect(raw, `${label} embeds a home directory`).not.toMatch(
        /(?:\/Users\/|\/home\/|[A-Za-z]:\\\\Users\\\\)/
      );
    }
  });

  it("store every source quote as a repo-relative docs path", () => {
    for (const file of files) {
      for (const step of readPlan(file).steps) {
        for (const action of step.actions) {
          const quoted = action.sourceQuote.file;
          expect(path.isAbsolute(quoted), `${quoted} should be repo-relative`).toBe(false);
          expect(quoted.startsWith("docs/"), `${quoted} should start with docs/`).toBe(true);
        }
      }
    }
  });

  it("point at files that exist in this checkout", () => {
    // The real test of portability: resolve each stored path against this repo root and open it.
    for (const file of files) {
      for (const step of readPlan(file).steps) {
        for (const action of step.actions) {
          const resolved = path.join(REPO_ROOT, action.sourceQuote.file);
          expect(fs.existsSync(resolved), `${action.sourceQuote.file} does not exist`).toBe(true);
        }
      }
    }
  });

  it("name a guide that is still registered", () => {
    const registered = new Set(loadRegistry().map((entry) => entry.guide));
    for (const file of files) {
      const plan = readPlan(file);
      expect(registered.has(plan.guide), `${plan.guide} has a plan but is not registered`).toBe(
        true
      );
    }
  });

  it("give every action a non-empty quote", () => {
    // The compiler drops unquoted actions, so an empty quote here means something bypassed it.
    for (const file of files) {
      for (const step of readPlan(file).steps) {
        for (const action of step.actions) {
          expect(action.sourceQuote.text.trim().length).toBeGreaterThan(0);
          expect(action.sourceQuote.line).toBeGreaterThan(0);
        }
      }
    }
  });
});
