import { describe, expect, it } from "vitest";

import { isTitleEcho, stepWork } from "../src/run/index.js";
import type { GuideStep, PlanStep, SourceQuote } from "../src/types.js";

/**
 * The two guards that stop a step's own heading being reported as a UI defect.
 *
 * Both are modelled on `secret-sharing.mdx`, whose procedure 1 step 3 is titled "Configure Secret
 * Share", compiles to nothing but a screenshot, and made the agent compare that title against a
 * dialog headed "Share a Secret". The guide never claimed the dialog was called that.
 */

const quote: SourceQuote = {
  text: "Configure Secret Share",
  file: "docs/documentation/platform/secret-sharing.mdx",
  line: 20
};

const planStep = (actions: PlanStep["actions"]): PlanStep => ({
  procedureIndex: 1,
  docStepIndex: 3,
  instruction: "Configure the shared secret's content and expiration settings.",
  actions
});

const docStep = (over: Partial<GuideStep> = {}): GuideStep => ({
  index: 3,
  title: "Configure Secret Share",
  prose: "Configure Secret Share",
  boldTargets: [],
  navPaths: [],
  images: [],
  codeBlocks: [],
  fields: [],
  callouts: [],
  line: 20,
  file: "docs/documentation/platform/secret-sharing.mdx",
  ...over
});

const field = (label: string) => ({ label, description: "", required: false, type: null });

describe("stepWork", () => {
  it("sends a step with real actions to the agent unchanged", () => {
    const step = planStep([{ kind: "click", target: "Add Secret", role: null, sourceQuote: quote }]);
    expect(stepWork(step, docStep())).toEqual({ kind: "perform" });
  });

  it("treats a screenshot-only step that names fields as a gap check", () => {
    const step = planStep([
      { kind: "expect_screenshot", docImage: "../share-secret.png", sourceQuote: quote }
    ]);
    const named = docStep({ fields: [field("Your Secret"), field("Max Views")] });

    expect(stepWork(step, named)).toEqual({
      kind: "gap-check",
      named: ["Your Secret", "Max Views"]
    });
  });

  it("counts bold targets as named, not only documented fields", () => {
    // A step can point at UI without documenting a form, and the style guide asks for bold.
    const step = planStep([
      { kind: "expect_screenshot", docImage: "../x.png", sourceQuote: quote }
    ]);
    expect(stepWork(step, docStep({ boldTargets: ["Advanced Settings"] }))).toEqual({
      kind: "gap-check",
      named: ["Advanced Settings"]
    });
  });

  it("calls a step that names nothing informational", () => {
    // docker 2.4 is "Repeat these steps for each key-value pair" — no title, no image, no target.
    // pr-workflows 1.2 describes something the app does by itself. Neither claims anything about
    // the UI, so neither can be checked, and sending them to the agent only invites invention.
    const step = planStep([
      { kind: "expect_screenshot", docImage: "../x.png", sourceQuote: quote }
    ]);
    expect(stepWork(step, docStep({ title: null }))).toEqual({ kind: "informational" });
    expect(stepWork(step, undefined)).toEqual({ kind: "informational" });
  });

  it("does not treat an external-only step as work", () => {
    const step = planStep([
      { kind: "external", reason: "needs an AWS console", sourceQuote: quote }
    ]);
    expect(stepWork(step, docStep()).kind).not.toBe("perform");
  });

  it("drops duplicates and blanks from the named list", () => {
    const step = planStep([
      { kind: "expect_screenshot", docImage: "../x.png", sourceQuote: quote }
    ]);
    const named = docStep({ fields: [field("Max Views"), field("  ")], boldTargets: ["Max Views"] });
    expect(stepWork(step, named)).toEqual({ kind: "gap-check", named: ["Max Views"] });
  });
});

describe("isTitleEcho", () => {
  const mismatch = { severity: "MISMATCH" as const, docSays: "Configure Secret Share" };

  it("drops a mismatch that cites the step's own heading", () => {
    const step = planStep([
      { kind: "expect_screenshot", docImage: "../share-secret.png", sourceQuote: quote }
    ]);
    expect(isTitleEcho(mismatch, step, docStep())).toBe(true);
  });

  it("keeps it when the guide really did ask for that string", () => {
    // Caught by a real run: "Navigate to the Secret Sharing tab" is the heading, and it compiles to
    // navigate ["Secret Sharing"]. Matching the two by equality said the guide never asked for the
    // title, and the guard silently swallowed a correct finding that the app had moved Secret
    // Sharing out of the project sidebar. Suppressing real drift is worse than the noise this
    // guard removes, so containment either way keeps the finding.
    const step = planStep([{ kind: "navigate", path: ["Secret Sharing"], sourceQuote: quote }]);
    const navigational = docStep({ title: "Navigate to the Secret Sharing tab" });

    expect(
      isTitleEcho(
        { severity: "MISMATCH", docSays: "Navigate to the Secret Sharing tab" },
        step,
        navigational
      )
    ).toBe(false);
  });

  it("still drops one when the step asks for nothing at all", () => {
    // The containment rule must not swing so far that the original false positive comes back: a
    // screenshot-only step names no target, so nothing can contain the title.
    const step = planStep([
      { kind: "expect_screenshot", docImage: "../share-secret.png", sourceQuote: quote }
    ]);
    expect(isTitleEcho(mismatch, step, docStep())).toBe(true);
  });

  it("keeps a mismatch about a control the step clicks", () => {
    const step = planStep([
      { kind: "click", target: "Configure Secret Share", role: null, sourceQuote: quote }
    ]);
    expect(isTitleEcho(mismatch, step, docStep())).toBe(false);
  });

  it("ignores punctuation and case, as the quote checker does", () => {
    const step = planStep([
      { kind: "expect_screenshot", docImage: "../x.png", sourceQuote: quote }
    ]);
    expect(
      isTitleEcho({ severity: "MISMATCH", docSays: "configure  secret share" }, step, docStep())
    ).toBe(true);
  });

  it("leaves every other severity alone", () => {
    // A BLOCKER means the reader could not proceed, which is true regardless of what it cites.
    const step = planStep([
      { kind: "expect_screenshot", docImage: "../x.png", sourceQuote: quote }
    ]);
    expect(isTitleEcho({ severity: "BLOCKER", docSays: "Configure Secret Share" }, step, docStep()))
      .toBe(false);
  });

  it("leaves a mismatch that cites something else alone", () => {
    const step = planStep([
      { kind: "expect_screenshot", docImage: "../x.png", sourceQuote: quote }
    ]);
    expect(isTitleEcho({ severity: "MISMATCH", docSays: "Max Views" }, step, docStep())).toBe(false);
  });

  it("does nothing when the step has no title", () => {
    const step = planStep([]);
    expect(isTitleEcho(mismatch, step, docStep({ title: null }))).toBe(false);
  });
});
