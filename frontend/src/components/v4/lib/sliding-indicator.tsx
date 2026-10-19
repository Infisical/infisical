import { motion, useReducedMotion } from "motion/react";

import { exit, fade, snap, spring } from "./motion";
import type { IndicatorState } from "./use-measured-indicator";

/**
 * The raised chip behind the selected item. It moves on transforms and size with the moderate
 * spring, snaps on the first measure and under reduced motion, and cross-fades instead of travelling.
 */
export function SlidingIndicator({
  state,
  className
}: {
  state: IndicatorState;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const travel = state.instant || reduced ? snap : spring.moderate;
  const appear = state.visible ? fade.enter : exit.moderate;
  return (
    <motion.span
      aria-hidden
      className={className}
      initial={false}
      animate={{
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height,
        opacity: state.visible ? 1 : 0
      }}
      transition={{
        default: travel,
        opacity: state.instant ? snap : appear
      }}
    />
  );
}
