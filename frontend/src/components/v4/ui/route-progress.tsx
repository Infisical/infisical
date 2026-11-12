import * as React from "react";

import { cn } from "../lib/utils";

import styles from "./route-progress.module.css";

export type RouteProgressProps = {
  /** Whether a navigation is resolving; the app reads it from its router. */
  pending: boolean;
  className?: string;
};

/** A thin bar along the top of the viewport while the router resolves a navigation. */
export function RouteProgress({ pending, className }: RouteProgressProps) {
  const [run, setRun] = React.useState(0);
  React.useEffect(() => {
    if (pending) setRun((current) => current + 1);
  }, [pending]);
  let state = "idle";
  if (pending) state = "loading";
  else if (run > 0) state = "done";
  return (
    <div
      aria-hidden="true"
      data-slot="route-progress"
      data-state={state}
      className={cn(styles.progress, className)}
    >
      <div key={run} className={styles.bar} />
    </div>
  );
}
RouteProgress.displayName = "RouteProgress";
