import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogThrottle, formatSuppressed } from "./log-throttle";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createLogThrottle", () => {
  it("should always let the first occurrence through so the onset is visible immediately", () => {
    const throttle = createLogThrottle({ windowMs: 1000, maxPerWindow: 1, maxTrackedKeys: 8 });

    expect(throttle.take("ca-1")).toEqual({ shouldLog: true, suppressed: 0 });
  });

  it("should suppress after the budget is spent and keep counting what it dropped", () => {
    const throttle = createLogThrottle({ windowMs: 1000, maxPerWindow: 1, maxTrackedKeys: 8 });

    throttle.take("ca-1");
    expect(throttle.take("ca-1")).toEqual({ shouldLog: false, suppressed: 1 });
    expect(throttle.take("ca-1")).toEqual({ shouldLog: false, suppressed: 2 });
    expect(throttle.take("ca-1")).toEqual({ shouldLog: false, suppressed: 3 });
  });

  it("should report the suppressed count on the next log rather than losing it", () => {
    const throttle = createLogThrottle({ windowMs: 1000, maxPerWindow: 1, maxTrackedKeys: 8 });

    throttle.take("ca-1");
    throttle.take("ca-1");
    throttle.take("ca-1");

    vi.advanceTimersByTime(1000);

    expect(throttle.take("ca-1")).toEqual({ shouldLog: true, suppressed: 2 });
    vi.advanceTimersByTime(1000);
    expect(throttle.take("ca-1")).toEqual({ shouldLog: true, suppressed: 0 });
  });

  it("should budget each key separately so a noisy key cannot hide another key's onset", () => {
    const throttle = createLogThrottle({ windowMs: 1000, maxPerWindow: 1, maxTrackedKeys: 8 });

    throttle.take("ca-noisy");
    expect(throttle.take("ca-noisy").shouldLog).toBe(false);
    expect(throttle.take("ca-quiet").shouldLog).toBe(true);
  });

  it("should honour a budget above one within the window", () => {
    const throttle = createLogThrottle({ windowMs: 1000, maxPerWindow: 3, maxTrackedKeys: 8 });

    expect(throttle.take("k").shouldLog).toBe(true);
    expect(throttle.take("k").shouldLog).toBe(true);
    expect(throttle.take("k").shouldLog).toBe(true);
    expect(throttle.take("k").shouldLog).toBe(false);
  });

  it("should bound its own key map so throttling cannot become the leak it prevents", () => {
    const throttle = createLogThrottle({ windowMs: 60_000, maxPerWindow: 1, maxTrackedKeys: 4 });

    for (let i = 0; i < 1000; i += 1) throttle.take(`key-${i}`);

    expect(throttle.getTrackedKeyCount()).toBeLessThanOrEqual(4);
  });
});

describe("formatSuppressed", () => {
  it("should render nothing when no log was dropped", () => {
    expect(formatSuppressed(0)).toBe("");
  });

  it("should render the count when logs were dropped", () => {
    expect(formatSuppressed(42)).toBe(" [suppressedSinceLastLog=42]");
  });
});
