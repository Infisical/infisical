import type { RunState } from "../useRunStream.js";
import { StepRow } from "./StepRow.js";

/**
 * The whole plan, with the current step expanded.
 *
 * Every row is addressed by its `stepKey`, never by `docStepIndex`, which is 1-based *within* a
 * procedure. The old rail keyed on that index alone and so rendered three rows for folder.mdx's five
 * steps, and let procedure 2's outcome repaint procedure 1's passing step as failed.
 *
 * A single procedure is presented as a flat list. Multiple procedures use tabs because their step
 * indices restart at 1, and stacking every procedure makes the rail deeper without adding context.
 */

export const StepRail = ({
  run,
  live,
  selectedProcedureIndex,
  onSelectProcedure
}: {
  run: RunState | null;
  live: boolean;
  selectedProcedureIndex: number | null;
  onSelectProcedure: (procedureIndex: number) => void;
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

  const hasMultipleProcedures = run.procedures.length > 1;
  const selectedProcedure = hasMultipleProcedures
    ? (run.procedures.find((procedure) => procedure.index === selectedProcedureIndex) ??
      run.procedures[0])
    : run.procedures[0];

  if (!selectedProcedure) return <aside className="rail" />;

  return (
    <aside className="rail">
      {hasMultipleProcedures ? (
        <nav className="rail__procedure-tabs" aria-label="Procedures" role="tablist">
          {run.procedures.map((procedure) => {
            const statuses = procedure.stepKeys.flatMap((key) => {
              const step = run.steps.get(key);
              return step ? [step.status] : [];
            });
            const failed = statuses.includes("failed");
            const running = statuses.includes("running");
            const active = procedure.index === selectedProcedure.index;

            return (
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className={`rail__procedure-tab${active ? " rail__procedure-tab--active" : ""}${
                  failed ? " rail__procedure-tab--failed" : ""
                }${running ? " rail__procedure-tab--running" : ""}`}
                key={procedure.index}
                onClick={() => onSelectProcedure(procedure.index)}
              >
                <span className="rail__procedure-index">
                  {String(procedure.index).padStart(2, "0")}
                </span>
                <span className="rail__procedure-label">
                  {procedure.heading ?? `Procedure ${procedure.index}`}
                </span>
              </button>
            );
          })}
        </nav>
      ) : null}

      <section
        className="rail__procedure"
        aria-label={
          hasMultipleProcedures
            ? (selectedProcedure.heading ?? `Procedure ${selectedProcedure.index}`)
            : undefined
        }
      >
        {selectedProcedure.stepKeys.map((key) => {
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
