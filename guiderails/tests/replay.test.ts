import { describe, expect, it } from "vitest";

import {
  parameterizeLocators,
  recordablePrefix,
  resolveLocators,
  type StepResultLike
} from "../src/run/replay.js";
import type { ResolvedLocator, StepOutcome } from "../src/types.js";

const locator = (name: string): ResolvedLocator => ({
  action: "click",
  role: "button",
  name,
  value: null
});

const step = (
  procedureIndex: number,
  docStepIndex: number,
  outcome: StepOutcome,
  withLocators = true
): StepResultLike => ({
  procedureIndex,
  docStepIndex,
  instruction: `step ${docStepIndex}`,
  outcome,
  resolvedLocators: withLocators && outcome === "passed" ? [locator(`btn-${docStepIndex}`)] : []
});

const indices = (results: StepResultLike[]): number[] =>
  recordablePrefix(results).map((recorded) => recorded.docStepIndex);

describe("recordablePrefix", () => {
  it("records everything when the whole walk passed", () => {
    expect(
      indices([step(1, 1, "passed"), step(1, 2, "passed"), step(1, 3, "passed")])
    ).toEqual([1, 2, 3]);
  });

  it("records the passing prefix and stops at the first failure", () => {
    // This is the case the old all-or-nothing rule got wrong: three good steps were thrown
    // away because a fourth broke, leaving the guide permanently on the model-driven path.
    expect(
      indices([
        step(1, 1, "passed"),
        step(1, 2, "passed"),
        step(1, 3, "passed"),
        step(1, 4, "failed"),
        step(1, 5, "unverified")
      ])
    ).toEqual([1, 2, 3]);
  });

  it("records nothing when the very first step failed", () => {
    expect(indices([step(1, 1, "failed"), step(1, 2, "unverified")])).toEqual([]);
  });

  it("continues through a skipped step without recording it", () => {
    // A registry skip is deliberate and happens identically next run, so it does not change
    // the browser state and must not truncate the prefix.
    expect(
      indices([step(1, 1, "passed"), step(1, 2, "skipped"), step(1, 3, "passed")])
    ).toEqual([1, 3]);
  });

  it("stops at an unverified step even though nothing failed", () => {
    // Unverified means the step needed something outside this instance, so a reader would have
    // done something we did not. Replaying past it would act on a state we cannot reproduce.
    expect(
      indices([step(1, 1, "passed"), step(1, 2, "unverified"), step(1, 3, "passed")])
    ).toEqual([1]);
  });

  it("treats each procedure independently", () => {
    // A break in procedure 1 must not cost procedure 2 its own passing prefix.
    expect(
      indices([
        step(1, 1, "passed"),
        step(1, 2, "failed"),
        step(2, 1, "passed"),
        step(2, 2, "passed")
      ])
    ).toEqual([1, 1, 2]);
  });

  it("keeps procedures in order regardless of input order", () => {
    const recorded = recordablePrefix([
      step(2, 1, "passed"),
      step(1, 1, "passed"),
      step(2, 2, "passed")
    ]);
    expect(recorded.map((r) => r.procedureIndex)).toEqual([1, 2, 2]);
  });

  it("skips a passing step that resolved no locators", () => {
    // Nothing to replay, so recording an empty entry would just make replay a no-op that
    // reports success without having verified anything.
    expect(
      indices([step(1, 1, "passed", false), step(1, 2, "passed")])
    ).toEqual([2]);
  });

  it("carries the locators through", () => {
    const [first] = recordablePrefix([step(1, 1, "passed")]);
    expect(first?.locators).toEqual([locator("btn-1")]);
  });
});

describe("locator parameterization", () => {
  // Fixture values are regenerated every run, so a recording that stores the resolved value
  // can only ever match the run that produced it.
  const fixtureValues = {
    projectId: "65b16dd3-e522-499e-acca-c4e3ba3b0d18",
    projectSlug: "guiderails-cccad85b-ii-fo",
    subjectName: "guiderails-subject-868a0d62",
    environment: "dev",
    secretName: "DATABASE_URL"
  };

  it("replaces a generated name with its placeholder", () => {
    const [stored] = parameterizeLocators(
      [{ action: "click", role: "button", name: "guiderails-subject-868a0d62 Member Project", value: null }],
      fixtureValues
    );
    expect(stored?.name).toBe("{{fixture.subjectName}} Member Project");
  });

  it("leaves short stable values alone so unrelated labels are not corrupted", () => {
    // "dev" is a fixture value, but replacing it everywhere would turn the real UI label
    // "Development" into "{{fixture.environment}}elopment".
    const [stored] = parameterizeLocators(
      [{ action: "select", role: "combobox", name: "Environment", value: "Development" }],
      fixtureValues
    );
    expect(stored?.value).toBe("Development");
  });

  it("round-trips back to the current run's values", () => {
    const recorded = parameterizeLocators(
      [{ action: "click", role: "button", name: "guiderails-subject-868a0d62 Member", value: null }],
      fixtureValues
    );
    const nextRun = { ...fixtureValues, subjectName: "guiderails-subject-1f4c9ab2" };
    const [replayed] = resolveLocators(recorded, nextRun);
    expect(replayed?.name).toBe("guiderails-subject-1f4c9ab2 Member");
  });

  it("leaves an unknown placeholder intact rather than blanking it", () => {
    const [replayed] = resolveLocators(
      [{ action: "click", role: null, name: "{{fixture.notAThing}}", value: null }],
      fixtureValues
    );
    expect(replayed?.name).toBe("{{fixture.notAThing}}");
  });

  it("handles a null name without throwing", () => {
    const [stored] = parameterizeLocators(
      [{ action: "expect_visible", role: null, name: null, value: null }],
      fixtureValues
    );
    expect(stored?.name).toBeNull();
  });
});
