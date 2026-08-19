import { countByStatus, type RunState } from "../useRunStream.js";

/**
 * One chip per guide, shown only when a walk covers more than one.
 *
 * Without this a multi-guide walk is write-only: the rail follows the newest run, so the moment
 * guide 2 starts, guide 1's findings are unreachable even though the client still holds every event.
 *
 * Selecting a chip pins the view. Nothing is pinned by default, so a single-guide walk behaves as
 * though this component did not exist, and an unattended run still follows along on its own.
 */
export const RunTabs = ({
  runs,
  activeId,
  pinnedId,
  onPin
}: {
  runs: RunState[];
  activeId: string;
  pinnedId: string | null;
  onPin: (runId: string | null) => void;
}): JSX.Element | null => {
  const real = runs.filter((run) => run.runId !== "");
  if (real.length < 2) return null;

  return (
    <nav className="runtabs">
      {real.map((run) => {
        const counts = countByStatus(run);
        const failed = counts.failed > 0;
        return (
          <button
            type="button"
            key={run.runId}
            className={`runtab${run.runId === activeId ? " runtab--active" : ""}${
              failed ? " runtab--failed" : ""
            }`}
            // Clicking the pinned chip unpins, which is the only way back to following the newest.
            onClick={() => onPin(pinnedId === run.runId ? null : run.runId)}
          >
            <span className="runtab__title">{run.title || run.guide}</span>
            <span className="runtab__tally">
              {counts.passed}/{counts.passed + counts.failed + counts.unverified + counts.skipped}
            </span>
          </button>
        );
      })}
      {pinnedId ? <span className="eyebrow">pinned</span> : null}
    </nav>
  );
};
