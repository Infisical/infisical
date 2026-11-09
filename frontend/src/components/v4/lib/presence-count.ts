import * as React from "react";

export type PresenceReport = (delta: number) => void;

/**
 * Counts descendants that report themselves through context, so a container styles itself from
 * React state instead of a :has() selector, which would make every DOM change below it relayout the document.
 */
export function usePresenceCount() {
  const [count, setCount] = React.useState(0);
  const report = React.useCallback<PresenceReport>(
    (delta) => setCount((value) => value + delta),
    []
  );
  return [count > 0, report] as const;
}

/** Reports to the nearest counter while active holds. */
export function useReportPresence(report: PresenceReport | null | undefined, active: boolean) {
  React.useLayoutEffect(() => {
    if (!active || !report) return undefined;
    report(1);
    return () => report(-1);
  }, [active, report]);
}
