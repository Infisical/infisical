import { useEffect, useRef } from "react";

import type { StepState } from "../useRunStream.js";
import { ActivityEntry } from "./ActivityEntry.js";

/**
 * One step. Collapsed to a single line unless it is the one running.
 *
 * The marker carries both the documented step index and outcome, so the rail is readable at a
 * glance without losing the order expressed in the guide.
 */

const MARKER: Record<StepState["status"], string> = {
  upcoming: "○",
  running: "",
  passed: "✓",
  failed: "✕",
  skipped: "–",
  unverified: "○"
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
  const toolCount = step.activity.filter((entry) => entry.kind === "tool").length;
  let toolLabelRendered = false;

  useEffect(() => {
    if (!isCurrent || !autoScroll) return;
    element.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isCurrent, autoScroll, step.activity.length]);

  return (
    <div ref={element} className={`step step--${step.status}`}>
      <div className="step__marker">
        <span className="step__index">{step.docStepIndex}</span>
        <span className="step__status" aria-label={step.status}>
          {step.status === "running" ? (
            <span className="agent-pulse" aria-hidden="true" />
          ) : (
            MARKER[step.status]
          )}
        </span>
      </div>
      <div>
        <div className="step__instruction">
          {step.instruction || <span className="eyebrow">no instruction recorded</span>}
          {isCurrent && step.mode ? <span className="step__mode">{step.mode}</span> : null}
        </div>

        {step.agentPhase === "thinking" ? (
          <div className="step__thinking" role="status">
            <span>Thinking</span>
            <span className="step__thinking-dots" aria-hidden="true">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </div>
        ) : null}

        {showActivity && step.activity.length > 0 ? (
          <div className="activity">
            {step.activity.map((entry) => {
              const showToolLabel = entry.kind === "tool" && !toolLabelRendered;
              if (showToolLabel) toolLabelRendered = true;
              return (
                <div key={`${entry.kind}-${entry.id}`}>
                  {showToolLabel ? (
                    <div className="activity__tool-label">
                      called {toolCount === 1 ? "tool" : "tools"}
                    </div>
                  ) : null}
                  <ActivityEntry entry={entry} />
                </div>
              );
            })}
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
