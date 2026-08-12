import type { RunState, StreamState } from "../useRunStream.js";

/**
 * What is being walked, and whether the stream is still attached.
 *
 * The connection state earns its place: with a screencast on screen, a dead socket and a paused run
 * look identical, and during a demo that is the difference between "wait for it" and "reload".
 */

const connectionStatus = (
  state: StreamState,
  run: RunState | null
): { className: string; label: string } => {
  if (state.connection === "closed") return { className: "status--lost", label: "reconnecting" };
  if (state.connection === "connecting") return { className: "status--done", label: "connecting" };
  if (run?.finished) return { className: "status--done", label: "finished" };
  return { className: "status--live", label: "live" };
};

export const Header = ({
  state,
  run
}: {
  state: StreamState;
  run: RunState | null;
}): JSX.Element => {
  const status = connectionStatus(state, run);

  return (
    <header className="header">
      <h1 className="header__title">{run?.title || "guiderails"}</h1>
      <span className="header__guide">{run?.guide || "waiting for a run"}</span>
      <div className="header__meta">
        {run?.fixture ? <span className="chip">fixture {run.fixture}</span> : null}
        <span className={`status ${status.className}`}>
          <span className="status__dot" />
          {status.label}
        </span>
      </div>
    </header>
  );
};
