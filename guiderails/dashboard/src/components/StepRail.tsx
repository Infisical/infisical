import type { RunState } from "../useRunStream.js";
import { StepRow } from "./StepRow.js";

/**
 * The whole plan, grouped by procedure, with the current step expanded.
 *
 * Every row is addressed by its `stepKey`, never by `docStepIndex`, which is 1-based *within* a
 * procedure. The old rail keyed on that index alone and so rendered three rows for folder.mdx's five
 * steps, and let procedure 2's outcome repaint procedure 1's passing step as failed.
 *
 * The heading is what makes two steps both called "step 1" legible to whoever is watching.
 */

export const StepRail = ({
  run,
  live
}: {
  run: RunState | null;
  live: boolean;
}): JSX.Element => {
  if (!run || run.procedures.length === 0) {
    return (
      <aside className="rail">
        <div className="rail__empty">
          {run?.log.length ? run.log[run.log.length - 1] : "waiting for a plan…"}
        </div>
      </aside>
    );
  }

  return (
    <aside className="rail">
      {run.procedures.map((procedure) => (
        <section className="rail__procedure" key={procedure.index}>
          <div className="rail__heading">
            <span className="eyebrow">procedure {procedure.index}</span>
            <span className="rail__heading-text">{procedure.heading ?? ""}</span>
          </div>
          {procedure.stepKeys.map((key) => {
            const step = run.steps.get(key);
            if (!step) return null;
            return (
              <StepRow
                key={key}
                step={step}
                isCurrent={run.currentKey === key}
                autoScroll={live}
              />
            );
          })}
        </section>
      ))}

      {/* Fixture setup and replay notices: not attributable to a step, but the first thing to look
          at when a run does nothing for ten seconds. */}
      {run.log.length > 0 ? (
        <div className="rail__log">
          {run.log.slice(-6).map((line, index) => (
            <span key={`${index}-${line}`}>{line}</span>
          ))}
        </div>
      ) : null}
    </aside>
  );
};
