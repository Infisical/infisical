import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { extractGuide } from "../src/extract/index.js";
import { stepKey } from "../src/live/protocol.js";
import { COMPILED_DIR, DOCS_ROOT, REPO_ROOT, resolveGuidePath } from "../src/paths.js";
import { planOutline } from "../src/run/index.js";
import type { GuidePlan } from "../src/types.js";

/**
 * Pins shut a bug class that produced three separate defects: `docStepIndex` is 1-based *within a
 * procedure*, so using it alone as a step's identity collapses distinct steps together.
 *
 * folder.mdx is the fixture because it is the smallest committed plan that actually exhibits the
 * collision — its (procedure, step) pairs are (1,1) (1,2) (2,1) (3,1) (3,2), five steps under
 * three distinct indices. A test written against a plan with one procedure would pass either way.
 */

const FOLDER_PLAN = path.join(COMPILED_DIR, "documentation-platform-folder.json");

const readPlan = (file: string): GuidePlan =>
  JSON.parse(fs.readFileSync(file, "utf8")) as GuidePlan;

describe("planOutline", () => {
  const plan = readPlan(FOLDER_PLAN);
  const doc = extractGuide(resolveGuidePath(plan.guide), {
    repoRoot: REPO_ROOT,
    docsRoot: DOCS_ROOT
  });
  const outline = planOutline(plan, doc);

  it("groups five steps into three procedures rather than three steps", () => {
    // The header used to say 5 while the rail rendered 3 rows.
    expect(outline.map((procedure) => procedure.steps.length)).toEqual([2, 1, 2]);
    expect(outline.flatMap((procedure) => procedure.steps).length).toBe(plan.steps.length);
  });

  it("keeps procedures in document order", () => {
    expect(outline.map((procedure) => procedure.index)).toEqual([1, 2, 3]);
  });

  it("labels each procedure with its heading", () => {
    // The heading is the only thing that makes two steps both called "step 1" legible.
    for (const procedure of outline) {
      expect(procedure.heading, `procedure ${procedure.index}`).toBeTruthy();
    }
    const headings = new Set(outline.map((procedure) => procedure.heading));
    expect(headings.size).toBe(outline.length);
  });

  it("carries both halves of every step's identity", () => {
    const keys = outline
      .flatMap((procedure) => procedure.steps)
      .map((step) => stepKey(step.procedureIndex, step.docStepIndex));
    expect(keys).toEqual(["1.1", "1.2", "2.1", "3.1", "3.2"]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("carries the instruction each step will be judged against", () => {
    for (const step of outline.flatMap((procedure) => procedure.steps)) {
      expect(step.instruction.length).toBeGreaterThan(0);
    }
  });

  it("survives a plan whose procedures are not contiguous", () => {
    // A registry `skipSteps` or a compile that drops an untestable procedure can leave a gap.
    // First-appearance order, not a range, is what makes that safe.
    const sparse: GuidePlan = {
      ...plan,
      steps: plan.steps.filter((step) => step.procedureIndex !== 2)
    };
    expect(planOutline(sparse, doc).map((procedure) => procedure.index)).toEqual([1, 3]);
  });

  it("leaves the heading null when the doc has no procedure at that index", () => {
    const orphaned: GuidePlan = {
      ...plan,
      steps: plan.steps.map((step) => ({ ...step, procedureIndex: 99 }))
    };
    expect(planOutline(orphaned, doc)[0]?.heading).toBeNull();
  });
});

describe("stepKey", () => {
  it("distinguishes the same step index in different procedures", () => {
    // The collision behind all three bugs, stated as plainly as it can be.
    expect(stepKey(1, 1)).not.toBe(stepKey(2, 1));
  });

  it("is stable for the same pair", () => {
    expect(stepKey(3, 2)).toBe(stepKey(3, 2));
  });
});
