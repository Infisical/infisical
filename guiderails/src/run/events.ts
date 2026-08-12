import { EventEmitter } from "node:events";

import type { Finding, StepOutcome } from "../types.js";

/**
 * One event stream, two consumers: the terminal reporter and the live dashboard's WebSocket.
 *
 * Keeping them on the same stream means the dashboard can never show something the log does
 * not, which matters for a demo: a divergence between what the audience sees and what the run
 * actually did would be worse than having no dashboard.
 */

export type RunEvent =
  | { type: "run_started"; guide: string; baseUrl: string; totalSteps: number; fixture: string }
  | { type: "step_started"; docStepIndex: number; instruction: string; mode: "replay" | "agent" }
  | { type: "thinking"; text: string }
  | { type: "assistant_text"; text: string }
  | { type: "tool_call"; name: string }
  | { type: "finding"; severity: string; summary: string }
  | { type: "step_result"; docStepIndex: number; outcome: StepOutcome; detail: string }
  | { type: "frame"; jpegBase64: string }
  | { type: "log"; text: string }
  | { type: "run_finished"; passed: number; failed: number; skipped: number; unverified: number };

export class RunEvents {
  private readonly emitter = new EventEmitter();

  /** Replayed to any dashboard client that connects mid-run, so a late joiner sees context. */
  private readonly history: RunEvent[] = [];

  private static readonly MAX_HISTORY = 500;

  /** Frames are volatile and large; only the newest is worth replaying. */
  private latestFrame: RunEvent | null = null;

  on(listener: (event: RunEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  replay(): RunEvent[] {
    return this.latestFrame ? [...this.history, this.latestFrame] : [...this.history];
  }

  private emit(event: RunEvent): void {
    if (event.type === "frame") {
      this.latestFrame = event;
    } else {
      this.history.push(event);
      if (this.history.length > RunEvents.MAX_HISTORY) this.history.shift();
    }
    this.emitter.emit("event", event);
  }

  runStarted(guide: string, baseUrl: string, totalSteps: number, fixture: string): void {
    this.emit({ type: "run_started", guide, baseUrl, totalSteps, fixture });
  }

  stepStarted(docStepIndex: number, instruction: string, mode: "replay" | "agent"): void {
    this.emit({ type: "step_started", docStepIndex, instruction, mode });
  }

  thinking(text: string): void {
    this.emit({ type: "thinking", text });
  }

  assistantText(text: string): void {
    this.emit({ type: "assistant_text", text });
  }

  toolCall(name: string): void {
    this.emit({ type: "tool_call", name });
  }

  finding(severity: string, summary: string): void {
    this.emit({ type: "finding", severity, summary });
  }

  stepResult(docStepIndex: number, outcome: StepOutcome, detail: string): void {
    this.emit({ type: "step_result", docStepIndex, outcome, detail });
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
    this.emit({ type: "run_finished", ...counts });
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
        process.stdout.write(`  step ${event.docStepIndex} [${event.mode}] ${event.instruction}\n`);
        break;
      case "tool_call":
        process.stdout.write(`      . ${event.name}\n`);
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
