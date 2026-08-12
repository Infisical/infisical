import { useEffect, useRef } from "react";

import type { StepState } from "../useRunStream.js";
import { ActivityEntry } from "./ActivityEntry.js";

/**
 * One step. Collapsed to a single line unless it is the one running.
 *
 * The marker carries the outcome, so the rail is readable at a glance without reading any prose:
 * a check for verified, a cross for failed, a hollow circle for not yet reached.
 */

const MARKER: Record<StepState["status"], string> = {
  upcoming: "○",
  running: "▸",
  passed: "✓",
  failed: "✕",
  skipped: "–",
  unverified: "?"
};

export const StepRow = ({
  step,
  isCurrent,
  autoScroll
}: {
  step: StepState;
  isCurrent: boolean;
  /** False while buffered history is replaying, so a reload does not animate through every step. */
  autoScroll: boolean;
}): JSX.Element => {
  const element = useRef<HTMLDivElement>(null);

  /**
   * A failed step keeps its activity, unlike a passing one.
   *
   * Collapsing everything but the current step left the finished view with no trace of any tool call
   * or finding, which is the whole output of the run: after the last step there is no current step,
   * so the rail showed a column of one-line rows and nothing about why any of them failed.
   */
  const showActivity = isCurrent || step.status === "failed";
  const hasFinding =
    showActivity && step.activity.some((entry) => entry.kind === "finding");

  useEffect(() => {
    if (!isCurrent || !autoScroll) return;
    element.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isCurrent, autoScroll, step.activity.length]);

  return (
    <div ref={element} className={`step step--${step.status}`}>
      <div className="step__marker">{MARKER[step.status]}</div>
      <div>
        <div className="step__instruction">
          {step.instruction || <span className="eyebrow">no instruction recorded</span>}
          {isCurrent && step.mode ? <span className="step__mode">{step.mode}</span> : null}
        </div>

        {showActivity && step.activity.length > 0 ? (
          <div className="activity">
            {step.activity.map((entry) => (
              <ActivityEntry key={`${entry.kind}-${entry.id}`} entry={entry} />
            ))}
          </div>
        ) : null}

        {/* A failure's reason stays visible after the step collapses: it is the whole output of the
            run, and hiding it behind "scroll back up" defeats the point of watching. Unless a finding
            is already on screen saying the same thing in fewer words, which is the usual case: the
            agent reports the finding and then blocks with a longer version of it. */}
        {step.status === "failed" && step.detail && !hasFinding ? (
          <div className="step__detail">{step.detail}</div>
        ) : null}
      </div>
    </div>
  );
};
