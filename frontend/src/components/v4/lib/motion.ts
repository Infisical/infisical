import type { Transition } from "motion/react";

/** Millisecond mirrors of the motion tokens, for timers that wait out a motion. Guarded by motion.test.ts. */
export const motionMs = {
  fast: 80,
  moderate: 160,
  slow: 240,
  exit: { fast: 32, moderate: 120, slow: 96 }
} as const;

const seconds = (ms: number) => ms / 1000;

/** Enters and moves, by the size of what moves. Critically damped except the slow tier. */
export const spring = {
  fast: { type: "spring", duration: seconds(motionMs.fast), bounce: 0 },
  moderate: { type: "spring", duration: seconds(motionMs.moderate), bounce: 0 },
  slow: { type: "spring", duration: seconds(motionMs.slow), bounce: 0.12 }
} as const satisfies Record<string, Transition>;

/** Leaving, one tier quicker than entering. */
export const exit = {
  fast: { type: "tween", duration: seconds(motionMs.exit.fast), ease: "easeOut" },
  moderate: { type: "tween", duration: seconds(motionMs.exit.moderate), ease: "easeOut" },
  slow: { type: "tween", duration: seconds(motionMs.exit.slow), ease: "easeOut" }
} as const satisfies Record<string, Transition>;

/** Opacity and color fades that carry state, so they stay when travel is reduced. */
export const fade = {
  enter: { type: "tween", duration: seconds(motionMs.fast), ease: "easeOut" },
  exit: exit.fast
} as const satisfies Record<string, Transition>;

export const snap = { duration: 0 } as const satisfies Transition;
