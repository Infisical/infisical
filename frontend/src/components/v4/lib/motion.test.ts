import { expect, it } from "vitest";

import tokens from "../tokens.json";
import { exit, motionMs, spring } from "./motion";

const durations = Object.fromEntries(
  tokens.motion.tokens
    .filter((token) => token.name.startsWith("duration-"))
    .map((token) => [token.name.replace("duration-", ""), Number.parseInt(token.value, 10)])
);

it("mirrors the enter duration tokens", () => {
  expect({
    fast: durations.fast,
    moderate: durations.moderate,
    slow: durations.slow
  }).toEqual({ fast: motionMs.fast, moderate: motionMs.moderate, slow: motionMs.slow });
});

it("mirrors the exit duration tokens", () => {
  expect({
    fast: durations["exit-fast"],
    moderate: durations["exit-moderate"],
    slow: durations["exit-slow"]
  }).toEqual(motionMs.exit);
});

it("leaves every exit quicker than its enter", () => {
  expect(motionMs.exit.fast).toBeLessThan(motionMs.fast);
  expect(motionMs.exit.moderate).toBeLessThan(motionMs.moderate);
  expect(motionMs.exit.slow).toBeLessThan(motionMs.slow);
});

it("derives the springs and exit tweens from the same durations", () => {
  expect(spring.fast.duration * 1000).toBe(motionMs.fast);
  expect(spring.moderate.duration * 1000).toBe(motionMs.moderate);
  expect(spring.slow.duration * 1000).toBe(motionMs.slow);
  expect(exit.fast.duration * 1000).toBe(motionMs.exit.fast);
  expect(exit.moderate.duration * 1000).toBe(motionMs.exit.moderate);
  expect(exit.slow.duration * 1000).toBe(motionMs.exit.slow);
});
