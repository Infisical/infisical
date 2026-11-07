import * as React from "react";
import { useRouterState } from "@tanstack/react-router";

import { cn } from "../lib/utils";

import styles from "./route-progress.module.css";

export type RouteProgressProps = {
  pending?: boolean;
  className?: string;
};

/** A thin bar along the top of the viewport while the router resolves a navigation. */
export function RouteProgress({ pending, className }: RouteProgressProps) {
  const routerPending = useRouterState({ select: (state) => state.status === "pending" });
  const active = pending ?? routerPending;
  const [run, setRun] = React.useState(0);
  React.useEffect(() => {
    if (active) setRun((current) => current + 1);
  }, [active]);
  let state = "idle";
  if (active) state = "loading";
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
