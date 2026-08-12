import { describe, expect, it } from "vitest";

import { stepKey, type RunEvent } from "../src/live/protocol.js";
import { emptyState, reduce, type StreamState } from "../dashboard/src/useRunStream.js";

/**
 * The dashboard's reducer, which is where the step-identity bug did its worst damage: keyed on
 * `docStepIndex` alone it rendered three rows for folder.mdx's five steps, and let procedure 2's
 * outcome repaint procedure 1's passing step as failed.
 *
 * Tested here rather than in the browser because it is pure, and because a rendering test would only
 * fail after someone had already noticed the rail looked wrong.
 */

const START: RunEvent = {
  type: "run_started",
  runId: "run-1",
  guide: "docs/documentation/platform/folder.mdx",
  title: "Folders",
  baseUrl: "http://localhost:8080",
  fixture: "project-with-secrets",
  totalSteps: 5,
  startedAt: "2026-08-12T00:00:00.000Z"
};

/** folder.mdx's real shape: five steps across three procedures, three distinct step indices. */
const PLAN: RunEvent = {
  type: "run_plan",
  runId: "run-1",
  procedures: [
    {
      index: 1,
      heading: "Creating folders",
      steps: [
        { procedureIndex: 1, docStepIndex: 1, instruction: "Add a new folder" },
        { procedureIndex: 1, docStepIndex: 2, instruction: "Name it" }
      ]
    },
    {
      index: 2,
      heading: "Comparing folders",
      steps: [{ procedureIndex: 2, docStepIndex: 1, instruction: "Compare across environments" }]
    },
    {
      index: 3,
      heading: "Replicating folder contents",
      steps: [
        { procedureIndex: 3, docStepIndex: 1, instruction: "Select the source" },
        { procedureIndex: 3, docStepIndex: 2, instruction: "Copy" }
      ]
    }
  ]
};

/**
 * The reducer mutates the run objects it is handed, so each call starts from its own arrays rather
 * than from the shared `emptyState`, which one test would otherwise fill in for the next.
 */
const apply = (events: RunEvent[], from: StreamState = emptyState): StreamState => {
  const fresh: StreamState = { ...from, runs: [], frame: null };
  return events.reduce<StreamState>((state, event) => reduce(state, event), fresh);
};

const run = (state: StreamState) => {
  const last = state.runs[state.runs.length - 1];
  if (!last) throw new Error("no run in state");
  return last;
};

describe("run_plan", () => {
  it("seeds every step up front, so upcoming steps can be listed", () => {
    const state = apply([START, PLAN]);
    expect(run(state).steps.size).toBe(5);
    expect([...run(state).steps.values()].every((step) => step.status === "upcoming")).toBe(true);
  });

  it("keeps five steps under three distinct indices apart", () => {
    const state = apply([START, PLAN]);
    expect([...run(state).steps.keys()]).toEqual(["1.1", "1.2", "2.1", "3.1", "3.2"]);
  });

  it("groups them by procedure with the heading", () => {
    const state = apply([START, PLAN]);
    expect(run(state).procedures.map((procedure) => procedure.heading)).toEqual([
      "Creating folders",
      "Comparing folders",
      "Replicating folder contents"
    ]);
  });
});

describe("step identity", () => {
  it("does not let one procedure's outcome overwrite another's step", () => {
    // The exact bug: procedure 1 step 1 passes, then procedure 2 step 1 fails, and the passing step
    // used to flip to failed because both events said "step 1".
    const state = apply([
      START,
      PLAN,
      { type: "step_started", procedureIndex: 1, docStepIndex: 1, instruction: "a", mode: "agent" },
      { type: "step_result", procedureIndex: 1, docStepIndex: 1, outcome: "passed", detail: "ok" },
      { type: "step_started", procedureIndex: 2, docStepIndex: 1, instruction: "b", mode: "agent" },
      { type: "step_result", procedureIndex: 2, docStepIndex: 1, outcome: "failed", detail: "no" }
    ]);

    expect(run(state).steps.get(stepKey(1, 1))?.status).toBe("passed");
    expect(run(state).steps.get(stepKey(2, 1))?.status).toBe("failed");
  });

  it("attaches activity to the step that is running, not to a same-numbered one", () => {
    const state = apply([
      START,
      PLAN,
      { type: "step_started", procedureIndex: 1, docStepIndex: 1, instruction: "a", mode: "agent" },
      { type: "tool_call", id: 1, name: "click", arg: "Add" },
      { type: "step_started", procedureIndex: 2, docStepIndex: 1, instruction: "b", mode: "agent" },
      { type: "tool_call", id: 2, name: "snapshot", arg: null }
    ]);

    expect(run(state).steps.get(stepKey(1, 1))?.activity).toHaveLength(1);
    expect(run(state).steps.get(stepKey(2, 1))?.activity).toHaveLength(1);
  });

  it("invents a step when the plan never mentioned it", () => {
    // Only reachable if history truncation drops run_plan. Showing the step beats ignoring
    // everything about it.
    const state = apply([
      START,
      { type: "step_started", procedureIndex: 9, docStepIndex: 4, instruction: "x", mode: "replay" }
    ]);
    expect(run(state).steps.get(stepKey(9, 4))?.instruction).toBe("x");
  });
});

describe("tool calls", () => {
  const withCall = (): StreamState =>
    apply([
      START,
      PLAN,
      { type: "step_started", procedureIndex: 1, docStepIndex: 1, instruction: "a", mode: "agent" },
      { type: "tool_call", id: 7, name: "click", arg: "Add Secret" }
    ]);

  it("shows a call as in-flight before its result", () => {
    const entry = run(withCall()).steps.get(stepKey(1, 1))?.activity[0];
    expect(entry).toMatchObject({ kind: "tool", state: "running", name: "click" });
  });

  it("resolves the matching call, not the newest one", () => {
    const state = reduce(reduce(withCall(), { type: "tool_call", id: 8, name: "snapshot", arg: null }), {
      type: "tool_result",
      id: 7,
      name: "click",
      ok: false,
      detail: "no such label"
    });
    const activity = run(state).steps.get(stepKey(1, 1))?.activity ?? [];
    expect(activity[0]).toMatchObject({ id: 7, state: "failed", detail: "no such label" });
    expect(activity[1]).toMatchObject({ id: 8, state: "running" });
  });

  it("drops a result whose call is not on screen", () => {
    const state = reduce(withCall(), {
      type: "tool_result",
      id: 999,
      name: "click",
      ok: true,
      detail: "ok"
    });
    expect(run(state).steps.get(stepKey(1, 1))?.activity).toHaveLength(1);
  });
});

describe("agent phase", () => {
  it("moves from thinking to acting and back until the step completes", () => {
    let state = apply([
      START,
      PLAN,
      { type: "step_started", procedureIndex: 1, docStepIndex: 1, instruction: "a", mode: "agent" }
    ]);
    expect(run(state).steps.get(stepKey(1, 1))?.agentPhase).toBe("thinking");

    state = reduce(state, { type: "tool_call", id: 1, name: "click", arg: "Add" });
    expect(run(state).steps.get(stepKey(1, 1))?.agentPhase).toBe("acting");

    state = reduce(state, { type: "tool_result", id: 1, name: "click", ok: true, detail: "ok" });
    expect(run(state).steps.get(stepKey(1, 1))?.agentPhase).toBe("thinking");

    state = reduce(state, {
      type: "step_result",
      procedureIndex: 1,
      docStepIndex: 1,
      outcome: "passed",
      detail: "ok"
    });
    expect(run(state).steps.get(stepKey(1, 1))?.agentPhase).toBeNull();
  });

  it("does not describe deterministic replay as thinking", () => {
    const state = apply([
      START,
      PLAN,
      { type: "step_started", procedureIndex: 1, docStepIndex: 1, instruction: "a", mode: "replay" }
    ]);
    expect(run(state).steps.get(stepKey(1, 1))?.agentPhase).toBeNull();
  });
});

describe("frames and logs", () => {
  it("keeps only the newest frame", () => {
    const state = apply([START, { type: "frame", jpegBase64: "a" }, { type: "frame", jpegBase64: "b" }]);
    expect(state.frame).toBe("b");
  });

  it("adopts a log emitted before the run announced itself", () => {
    // The CLI logs while the fixture is building, which is before run_started on an older stream.
    const state = apply([{ type: "log", text: "bootstrapping" }, START]);
    expect(state.runs).toHaveLength(1);
    expect(run(state).log).toEqual(["bootstrapping"]);
    expect(run(state).runId).toBe("run-1");
  });
});

describe("multiple guides", () => {
  it("keeps the earlier run addressable after the next one starts", () => {
    const state = apply([
      START,
      PLAN,
      { type: "step_result", procedureIndex: 1, docStepIndex: 1, outcome: "passed", detail: "ok" },
      { type: "run_finished", runId: "run-1", passed: 1, failed: 0, skipped: 0, unverified: 4 },
      { ...START, runId: "run-2", guide: "docs/other.mdx", title: "Other" } as RunEvent
    ]);

    expect(state.runs).toHaveLength(2);
    expect(state.runs[0]?.steps.get(stepKey(1, 1))?.status).toBe("passed");
    expect(state.runs[1]?.title).toBe("Other");
  });

  it("routes a late run_finished to the run it names", () => {
    const state = apply([
      START,
      { ...START, runId: "run-2", guide: "docs/other.mdx" } as RunEvent,
      { type: "run_finished", runId: "run-1", passed: 3, failed: 0, skipped: 0, unverified: 0 }
    ]);
    expect(state.runs[0]?.finished?.passed).toBe(3);
    expect(state.runs[1]?.finished).toBeNull();
  });
});
