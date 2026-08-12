import type React from "react";

import { countByStatus, type RunState } from "../useRunStream.js";

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
  children
}: {
  run: RunState | null;
  /** The run switcher, when a walk covers more than one guide. */
  children?: React.ReactNode;
}): JSX.Element => {
  const counts = run ? countByStatus(run) : null;
  const cells = run ? run.procedures.flatMap((procedure) => procedure.stepKeys) : [];

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
