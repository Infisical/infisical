import type { StepOutcome } from "../types.js";

/**
 * The wire contract between the run and anything watching it.
 *
 * This lives apart from `src/run/events.ts` so the Node side and the browser side import one
 * definition rather than two that drift. Adding a field now type-errors the dashboard instead of
 * silently rendering `undefined`.
 *
 * Only a type is imported from outside, so a bundler erases it before resolution.
 */

/**
 * The only correct identity for a step.
 *
 * `docStepIndex` is 1-based *within a procedure* (see `GuideStep.index` in types.ts), so keying on
 * it alone collapses distinct steps together. It is not a hypothetical: the committed plan for
 * folder.mdx has (procedure, step) pairs (1,1) (1,2) (2,1) (3,1) (3,2) — five steps under three
 * distinct indices — and secret-sharing has eleven steps under six. Keying on the index alone has
 * already caused three separate bugs: a step list that rendered three rows for five steps, a
 * passing step repainted as failed when a later procedure's step 1 overwrote it, and a replay that
 * ran one procedure's clicks while reporting against another's.
 *
 * One exported implementation, so the emitter and the client cannot disagree about it.
 */
export type StepKey = string;

export const stepKey = (procedureIndex: number, docStepIndex: number): StepKey =>
  `${procedureIndex}.${docStepIndex}`;

export type PlanOutlineStep = {
  procedureIndex: number;
  docStepIndex: number;
  instruction: string;
};

export type PlanOutlineProcedure = {
  index: number;
  /** `Procedure.heading`. What makes two different "step 1"s legible to a reader. */
  heading: string | null;
  steps: PlanOutlineStep[];
};

export type RunEvent =
  | {
      type: "run_started";
      runId: string;
      /** Repo-relative path, e.g. docs/documentation/platform/folder.mdx. */
      guide: string;
      /** `GuideDoc.title`: what the page calls itself. */
      title: string;
      baseUrl: string;
      fixture: string;
      totalSteps: number;
      startedAt: string;
    }
  /**
   * Every step of the plan, up front, emitted immediately after run_started.
   *
   * Without this the client only learns a step exists when it starts, so it cannot list what is
   * coming or check anything off. Grouped by procedure because the heading is the only thing that
   * distinguishes two steps that are both called "step 1".
   */
  | { type: "run_plan"; runId: string; procedures: PlanOutlineProcedure[] }
  | {
      type: "step_started";
      procedureIndex: number;
      docStepIndex: number;
      instruction: string;
      mode: "replay" | "agent";
    }
  | { type: "thinking"; text: string }
  | { type: "assistant_text"; text: string }
  /**
   * Emitted *before* the tool runs, so a click that hangs shows as in-flight rather than as
   * nothing at all. `id` pairs it with the result below; if history truncation drops the call, the
   * client can discard the orphaned result instead of guessing what it belonged to.
   */
  | { type: "tool_call"; id: number; name: string; arg: string | null }
  | { type: "tool_result"; id: number; name: string; ok: boolean; detail: string }
  | { type: "finding"; severity: string; summary: string }
  | {
      type: "step_result";
      procedureIndex: number;
      docStepIndex: number;
      outcome: StepOutcome;
      detail: string;
    }
  | { type: "frame"; jpegBase64: string }
  | { type: "log"; text: string }
  | {
      type: "run_finished";
      runId: string;
      passed: number;
      failed: number;
      skipped: number;
      unverified: number;
    };

/**
 * Transport-level only, kept out of RunEvent so the console reporter never has to know about
 * anything that is not a fact about the run. Lets the client render a few hundred replayed events
 * without animating each one.
 */
export type WireMessage = RunEvent | { type: "replay_end" };
