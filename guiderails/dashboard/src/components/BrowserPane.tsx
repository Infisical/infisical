import { useEffect, useRef, useState } from "react";

/**
 * The screencast, letterboxed.
 *
 * Frames arrive as base64 JPEGs several times a second, so the `<img>` element is created once and
 * only its `src` changes. Re-mounting it per frame produced a visible flash where the old frame was
 * torn down before the new one had decoded.
 */

const PIP_MS = 220;

export const BrowserPane = ({
  frame,
  baseUrl,
  stale
}: {
  frame: string | null;
  baseUrl: string;
  /** True when an earlier run is pinned, so the newest frame is not of the guide on screen. */
  stale: boolean;
}): JSX.Element => {
  const [pip, setPip] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!frame) return;
    setPip(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPip(false), PIP_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [frame]);

  return (
    <section className="stage">
      <div className="stage__frame">
        {frame && !stale ? (
          <img className="stage__image" src={`data:image/jpeg;base64,${frame}`} alt="" />
        ) : stale ? (
          <div className="stage__empty">
            <span className="eyebrow">viewing an earlier guide</span>
          </div>
        ) : (
          <div className="stage__empty">
            <span className="eyebrow">no frames yet</span>
          </div>
        )}
      </div>
      <div className="stage__url">
        <span className={`stage__pip${pip ? " stage__pip--on" : ""}`} />
        <span>{baseUrl || "—"}</span>
      </div>
    </section>
  );
};
