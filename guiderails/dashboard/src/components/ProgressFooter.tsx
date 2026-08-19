import type React from "react";

import type { RunState, StepState } from "../useRunStream.js";

/**
 * One cell per step, in plan order, plus the tally.
 *
 * A cell rather than a filled bar because the interesting fact is not "how far along" but "how many
 * of these actually verified" — a run that is 100% complete and 40% failed should not look finished
 * and fine.
 *
 * The tally comes from the step map, not from `run_finished`, so it is right during the run too.
 * `run_finished`'s counts are the harness's own and are used only as a cross-check.
 */

export const ProgressFooter = ({
  run,
  selectedProcedureIndex,
  children
}: {
  run: RunState | null;
  selectedProcedureIndex: number | null;
  /** The run switcher, when a walk covers more than one guide. */
  children?: React.ReactNode;
}): JSX.Element => {
  const procedure = run
    ? (run.procedures.find((candidate) => candidate.index === selectedProcedureIndex) ??
      run.procedures[0])
    : undefined;
  const cells = procedure?.stepKeys ?? [];
  const counts = run && procedure ? countSteps(run, cells) : null;

  return (
    <footer className="footer">
      {children}
      <div className="progress">
        {cells.length === 0 ? (
          <div className="progress__cell" />
        ) : (
          cells.map((key) => (
            <div
              key={key}
              className={`progress__cell progress__cell--${run?.steps.get(key)?.status ?? "upcoming"}`}
            />
          ))
        )}
      </div>

      {counts ? (
        <div className="footer__counts">
          <span className="footer__count footer__count--passed">
            <strong>{counts.passed}</strong> verified
          </span>
          <span className="footer__count footer__count--failed">
            <strong>{counts.failed}</strong> failed
          </span>
          <span className="footer__count footer__count--unverified">
            <strong>{counts.unverified + counts.skipped}</strong> not verified
          </span>
          <span className="footer__count">
            <strong>{cells.length}</strong> steps
          </span>
        </div>
      ) : null}
    </footer>
  );
};

const countSteps = (
  run: RunState,
  stepKeys: string[]
): Record<StepState["status"], number> => {
  const counts: Record<StepState["status"], number> = {
    upcoming: 0,
    running: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    unverified: 0
  };
  for (const key of stepKeys) {
    const step = run.steps.get(key);
    if (step) counts[step.status] += 1;
  }
  return counts;
};
