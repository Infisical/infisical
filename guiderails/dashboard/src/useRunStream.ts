import { useEffect, useRef, useState } from "react";

import {
  stepKey,
  type PlanOutlineProcedure,
  type RunEvent,
  type StepKey,
  type WireMessage
} from "../../src/live/protocol.js";

/**
 * The socket, and the reduction of its events into something renderable.
 *
 * The only plumbing file in the app: every component below this is a pure function of the state
 * shape declared here.
 *
 * Two rules the whole file exists to enforce. Every step lookup goes through `stepKey`, never
 * through `docStepIndex` alone, because that index is only unique within a procedure. And the step
 * map is seeded from `run_plan` up front, so upcoming steps can be listed before they run.
 */

export type ActivityEntry =
  | { kind: "thinking"; id: number; text: string }
  | { kind: "text"; id: number; text: string }
  | { kind: "tool"; id: number; name: string; arg: string | null; state: ToolState; detail: string }
  | { kind: "finding"; id: number; severity: string; summary: string };

export type ToolState = "running" | "ok" | "failed";

export type StepState = {
  key: StepKey;
  procedureIndex: number;
  docStepIndex: number;
  instruction: string;
  status: "upcoming" | "running" | "passed" | "failed" | "skipped" | "unverified";
  mode: "replay" | "agent" | null;
  /** What an active agent is waiting on. Replay never adopts an agent phase. */
  agentPhase: "thinking" | "acting" | null;
  detail: string | null;
  activity: ActivityEntry[];
};

export type ProcedureState = {
  index: number;
  heading: string | null;
  stepKeys: StepKey[];
};

export type RunState = {
  runId: string;
  guide: string;
  title: string;
  baseUrl: string;
  fixture: string;
  totalSteps: number;
  startedAt: string;
  procedures: ProcedureState[];
  steps: Map<StepKey, StepState>;
  /** The step activity is attached to. Null before the first step and after the last. */
  currentKey: StepKey | null;
  /** Everything not attributable to a step: fixture setup, replay notices. */
  log: string[];
  finished: { passed: number; failed: number; skipped: number; unverified: number } | null;
};

export type StreamState = {
  runs: RunState[];
  frame: string | null;
  connection: "connecting" | "open" | "closed";
  /** False while the buffered history is arriving, so the client can skip entry animations. */
  live: boolean;
};

export const emptyState: StreamState = { runs: [], frame: null, connection: "connecting", live: false };

const outcomeStatus = {
  passed: "passed",
  failed: "failed",
  skipped: "skipped",
  unverified: "unverified"
} as const;

/**
 * Mutates in place behind a fresh top-level object.
 *
 * A structural clone per event is not viable: frames arrive several times a second and a run holds
 * hundreds of activity entries. Every consumer re-reads from the returned root, and the components
 * that render a step are keyed by `stepKey`, so React still repaints what changed.
 */
export const reduce = (state: StreamState, event: RunEvent): StreamState => {
  const runs = state.runs;
  const current = runs[runs.length - 1];

  switch (event.type) {
    case "run_started": {
      // A placeholder segment holds whatever was logged before any run announced itself, which is
      // the CLI starting up. It is identified by its empty runId, and the first real run adopts its
      // log rather than showing a headless log panel above an empty rail.
      const placeholder = current && current.runId === "" ? current : null;
      if (placeholder) runs.pop();
      runs.push({
        runId: event.runId,
        guide: event.guide,
        title: event.title,
        baseUrl: event.baseUrl,
        fixture: event.fixture,
        totalSteps: event.totalSteps,
        startedAt: event.startedAt,
        procedures: [],
        steps: new Map(),
        currentKey: null,
        log: placeholder ? placeholder.log : [],
        finished: null
      });
      return { ...state, runs };
    }

    case "run_plan": {
      const run = runs.find((candidate) => candidate.runId === event.runId) ?? current;
      if (!run) return state;
      run.procedures = event.procedures.map((procedure: PlanOutlineProcedure) => ({
        index: procedure.index,
        heading: procedure.heading,
        stepKeys: procedure.steps.map((step) => stepKey(step.procedureIndex, step.docStepIndex))
      }));
      for (const procedure of event.procedures) {
        for (const step of procedure.steps) {
          const key = stepKey(step.procedureIndex, step.docStepIndex);
          run.steps.set(key, {
            key,
            procedureIndex: step.procedureIndex,
            docStepIndex: step.docStepIndex,
            instruction: step.instruction,
            status: "upcoming",
            mode: null,
            agentPhase: null,
            detail: null,
            activity: []
          });
        }
      }
      return { ...state, runs };
    }

    case "step_started": {
      const step = lookup(current, event.procedureIndex, event.docStepIndex);
      if (!step || !current) return state;
      step.status = "running";
      step.mode = event.mode;
      step.agentPhase = event.mode === "agent" ? "thinking" : null;
      // The plan is the source of truth for the instruction, but a step reached without a plan
      // event still has to render something.
      step.instruction = event.instruction;
      current.currentKey = step.key;
      return { ...state, runs };
    }

    case "step_result": {
      const step = lookup(current, event.procedureIndex, event.docStepIndex);
      if (!step) return state;
      step.status = outcomeStatus[event.outcome];
      step.agentPhase = null;
      step.detail = event.detail;
      // currentKey deliberately stays put. A result arrives before the next step starts, and
      // clearing it here would blank the rail between every pair of steps.
      return { ...state, runs };
    }

    case "thinking":
    case "assistant_text": {
      const step = currentStep(current);
      if (!step) return appendLog(state, event.text);
      if (step.mode === "agent") step.agentPhase = "thinking";
      step.activity.push({
        kind: event.type === "thinking" ? "thinking" : "text",
        id: nextEntryId(),
        text: event.text
      });
      return { ...state, runs };
    }

    case "tool_call": {
      const step = currentStep(current);
      if (!step) return state;
      if (step.mode === "agent") step.agentPhase = "acting";
      step.activity.push({
        kind: "tool",
        id: event.id,
        name: event.name,
        arg: event.arg,
        state: "running",
        detail: ""
      });
      return { ...state, runs };
    }

    case "tool_result": {
      const step = currentStep(current);
      if (!step) return state;
      const entry = step.activity.find(
        (candidate) => candidate.kind === "tool" && candidate.id === event.id
      );
      // An orphan means history truncation dropped the call. Guessing which chip it belonged to
      // would be worse than dropping it, which is why the id is on the wire at all.
      if (!entry || entry.kind !== "tool") return state;
      entry.state = event.ok ? "ok" : "failed";
      entry.detail = event.detail;
      if (step.mode === "agent") step.agentPhase = "thinking";
      return { ...state, runs };
    }

    case "finding": {
      const step = currentStep(current);
      if (!step) return state;
      step.activity.push({
        kind: "finding",
        id: nextEntryId(),
        severity: event.severity,
        summary: event.summary
      });
      return { ...state, runs };
    }

    case "run_finished": {
      const run = runs.find((candidate) => candidate.runId === event.runId) ?? current;
      if (!run) return state;
      run.finished = {
        passed: event.passed,
        failed: event.failed,
        skipped: event.skipped,
        unverified: event.unverified
      };
      run.currentKey = null;
      return { ...state, runs };
    }

    case "frame":
      return { ...state, frame: event.jpegBase64 };

    case "log":
      return appendLog(state, event.text);

    default:
      return state;
  }
};

let entryId = 0;
const nextEntryId = (): number => {
  entryId -= 1;
  // Negative, so an activity id can never collide with a tool call id, which counts up from 1.
  return entryId;
};

const lookup = (
  run: RunState | undefined,
  procedureIndex: number,
  docStepIndex: number
): StepState | undefined => {
  if (!run) return undefined;
  const key = stepKey(procedureIndex, docStepIndex);
  const existing = run.steps.get(key);
  if (existing) return existing;

  // No plan event, which happens if history truncation ever drops one. Better to show the step
  // than to silently ignore everything about it.
  const created: StepState = {
    key,
    procedureIndex,
    docStepIndex,
    instruction: "",
    status: "upcoming",
    mode: null,
    agentPhase: null,
    detail: null,
    activity: []
  };
  run.steps.set(key, created);
  return created;
};

const currentStep = (run: RunState | undefined): StepState | undefined =>
  run?.currentKey ? run.steps.get(run.currentKey) : undefined;

const appendLog = (state: StreamState, text: string): StreamState => {
  const run = state.runs[state.runs.length - 1];
  if (run) {
    run.log.push(text);
    return { ...state, runs: state.runs };
  }
  // Before any run: a placeholder segment, adopted by the first run_started.
  state.runs.push({
    runId: "",
    guide: "",
    title: "",
    baseUrl: "",
    fixture: "",
    totalSteps: 0,
    startedAt: "",
    procedures: [],
    steps: new Map(),
    currentKey: null,
    log: [text],
    finished: null
  });
  return { ...state, runs: state.runs };
};

const RECONNECT_MS = [500, 1000, 2000, 4000, 8000];

export const useRunStream = (): StreamState => {
  const [state, setState] = useState<StreamState>(emptyState);
  const attempt = useRef(0);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let timer: number | null = null;
    let closed = false;

    const connect = (): void => {
      // Derived from location, not hardcoded: `ws://` breaks the moment this is behind https, and
      // the port has to follow the dev server when the socket is proxied.
      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${scheme}://${window.location.host}/events`);

      socket.addEventListener("open", () => {
        attempt.current = 0;
        // Reset rather than merge: the server replays its whole history on connect, so keeping the
        // old runs would duplicate every step in the rail.
        setState({ ...emptyState, connection: "open" });
      });

      socket.addEventListener("message", (message) => {
        const parsed = JSON.parse(String(message.data)) as WireMessage;
        if (parsed.type === "replay_end") {
          setState((previous) => ({ ...previous, live: true }));
          return;
        }
        setState((previous) => reduce(previous, parsed));
      });

      socket.addEventListener("close", () => {
        if (closed) return;
        setState((previous) => ({ ...previous, connection: "closed", live: false }));
        const delay = RECONNECT_MS[Math.min(attempt.current, RECONNECT_MS.length - 1)] ?? 8000;
        attempt.current += 1;
        timer = window.setTimeout(connect, delay);
      });
    };

    connect();

    return () => {
      closed = true;
      if (timer !== null) window.clearTimeout(timer);
      socket?.close();
    };
  }, []);

  return state;
};

/** The run on screen: the newest, because a multi-guide walk shows them in sequence. */
export const activeRun = (state: StreamState): RunState | null =>
  state.runs[state.runs.length - 1] ?? null;

export const countByStatus = (run: RunState): Record<StepState["status"], number> => {
  const counts: Record<StepState["status"], number> = {
    upcoming: 0,
    running: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    unverified: 0
  };
  for (const step of run.steps.values()) counts[step.status] += 1;
  return counts;
};
