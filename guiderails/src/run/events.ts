import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

import { stepKey, type PlanOutlineProcedure, type RunEvent } from "../live/protocol.js";
import type { Finding, StepOutcome } from "../types.js";

/**
 * One event stream, two consumers: the terminal reporter and the live dashboard's WebSocket.
 *
 * Keeping them on the same stream means the dashboard can never show something the log does
 * not, which matters for a demo: a divergence between what the audience sees and what the run
 * actually did would be worse than having no dashboard.
 *
 * The event shapes themselves live in `../live/protocol.ts`, shared with the browser.
 */

export type { RunEvent } from "../live/protocol.js";

/**
 * One guide's worth of buffered history.
 *
 * Segmenting per run fixes two real defects in the flat buffer this replaces. A second guide's
 * `run_started` used to make the client wipe the first guide entirely, and once the buffer
 * overflowed, `run_started` was the *first* thing evicted, so a reconnecting client never learned
 * which guide the remaining events belonged to and appended them onto whatever was already on
 * screen.
 */
type RunSegment = {
  /** null for events emitted before any run started, which the fixture log used to be. */
  runId: string | null;
  /**
   * `run_started` and `run_plan`. Never evicted: a client connecting after the tail has overflowed
   * still has to learn which guide it is looking at and what the steps are.
   */
  header: RunEvent[];
  /** Capped. The oldest chatter is the least interesting thing on screen. */
  tail: RunEvent[];
};

export class RunEvents {
  private readonly emitter = new EventEmitter();

  /**
   * One segment per guide. Unbounded on purpose: the count is bounded by the number of guides in
   * a single CLI invocation, which is at most the registry size.
   */
  private readonly segments: RunSegment[] = [];

  private static readonly MAX_TAIL_PER_RUN = 500;

  /** Frames are volatile and large; only the newest is worth replaying. */
  private latestFrame: RunEvent | null = null;

  private runId: string | null = null;

  private nextToolCallId = 1;

  on(listener: (event: RunEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  replay(): RunEvent[] {
    const events = this.segments.flatMap((segment) => [...segment.header, ...segment.tail]);
    // Newest frame last, so it wins regardless of where it fell chronologically.
    return this.latestFrame ? [...events, this.latestFrame] : events;
  }

  private currentSegment(): RunSegment {
    const last = this.segments[this.segments.length - 1];
    if (last) return last;
    const opening: RunSegment = { runId: null, header: [], tail: [] };
    this.segments.push(opening);
    return opening;
  }

  private emit(event: RunEvent): void {
    if (event.type === "frame") {
      this.latestFrame = event;
    } else if (event.type === "run_started") {
      this.segments.push({ runId: event.runId, header: [event], tail: [] });
    } else if (event.type === "run_plan") {
      this.currentSegment().header.push(event);
    } else {
      const segment = this.currentSegment();
      segment.tail.push(event);
      if (segment.tail.length > RunEvents.MAX_TAIL_PER_RUN) segment.tail.shift();
    }
    this.emitter.emit("event", event);
  }

  /**
   * Feeds an already-formed event in, as though it had just happened.
   *
   * Only `guiderails live` uses this, to play a recorded walk back through the same buffering and
   * segmenting a real run gets — so a reload mid-playback rebuilds correctly, exactly as it would
   * against a live walk.
   */
  ingest(event: RunEvent): void {
    if (event.type === "run_started") this.runId = event.runId;
    this.emit(event);
  }

  /** Mints and returns the run id, which later events on this run carry. */
  runStarted(params: {
    guide: string;
    title: string;
    baseUrl: string;
    fixture: string;
    totalSteps: number;
  }): string {
    this.runId = randomUUID();
    this.emit({
      type: "run_started",
      runId: this.runId,
      startedAt: new Date().toISOString(),
      ...params
    });
    return this.runId;
  }

  runPlan(procedures: PlanOutlineProcedure[]): void {
    this.emit({ type: "run_plan", runId: this.runId ?? "", procedures });
  }

  stepStarted(
    procedureIndex: number,
    docStepIndex: number,
    instruction: string,
    mode: "replay" | "agent"
  ): void {
    this.emit({ type: "step_started", procedureIndex, docStepIndex, instruction, mode });
  }

  thinking(text: string): void {
    this.emit({ type: "thinking", text });
  }

  assistantText(text: string): void {
    this.emit({ type: "assistant_text", text });
  }

  /** Returns the id to pass to `toolResult` once the tool has run. */
  toolCall(name: string, arg: string | null = null): number {
    const id = this.nextToolCallId;
    this.nextToolCallId += 1;
    this.emit({ type: "tool_call", id, name, arg });
    return id;
  }

  toolResult(id: number, name: string, ok: boolean, detail: string): void {
    this.emit({ type: "tool_result", id, name, ok, detail });
  }

  finding(severity: string, summary: string): void {
    this.emit({ type: "finding", severity, summary });
  }

  stepResult(
    procedureIndex: number,
    docStepIndex: number,
    outcome: StepOutcome,
    detail: string
  ): void {
    this.emit({ type: "step_result", procedureIndex, docStepIndex, outcome, detail });
  }

  frame(jpegBase64: string): void {
    this.emit({ type: "frame", jpegBase64 });
  }

  log(text: string): void {
    this.emit({ type: "log", text });
  }

  runFinished(counts: {
    passed: number;
    failed: number;
    skipped: number;
    unverified: number;
  }): void {
    this.emit({ type: "run_finished", runId: this.runId ?? "", ...counts });
  }
}

/** Prints the stream to stdout. Used when nobody is watching a dashboard. */
export const attachConsoleReporter = (events: RunEvents): (() => void) => {
  const icon: Record<StepOutcome, string> = {
    passed: "pass",
    failed: "FAIL",
    skipped: "skip",
    unverified: "unvr"
  };

  return events.on((event) => {
    switch (event.type) {
      case "run_started":
        process.stdout.write(
          `\n${event.guide}\n  against ${event.baseUrl}, fixture ${event.fixture}, ${event.totalSteps} step(s)\n\n`
        );
        break;
      case "step_started":
        // The composite key, because two different steps both used to print "step 1".
        process.stdout.write(
          `  step ${stepKey(event.procedureIndex, event.docStepIndex)} [${event.mode}] ${event.instruction}\n`
        );
        break;
      case "tool_call":
        // Reproduces the previous single-string form exactly, now that name and argument are
        // separate fields on the wire.
        process.stdout.write(`      . ${event.name}${event.arg ? ` ${event.arg}` : ""}\n`);
        break;
      case "tool_result":
        // Only on failure. A successful tool is already implied by the call line, but a failure
        // was previously invisible in the terminal.
        if (!event.ok) process.stdout.write(`      x ${event.name}: ${event.detail}\n`);
        break;
      case "finding":
        process.stdout.write(`      ! ${event.severity}: ${event.summary}\n`);
        break;
      case "step_result":
        process.stdout.write(`      ${icon[event.outcome]}  ${event.detail}\n`);
        break;
      case "log":
        process.stdout.write(`  ${event.text}\n`);
        break;
      case "run_finished":
        process.stdout.write(
          `\n  ${event.passed} passed, ${event.failed} failed, ${event.skipped} skipped, ${event.unverified} unverified\n`
        );
        break;
      default:
        break;
    }
  });
};

export const findingLine = (finding: Finding): string =>
  `${finding.severity}/${finding.blame} ${finding.guide}:${finding.sourceQuote.line} ${finding.summary}`;
