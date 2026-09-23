import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { logger } from "@app/lib/logger";

import { startLocalRefresh, TLocalRefreshHandle } from "./local-refresh";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const INTERVAL_MS = 5 * 60 * 1000;

describe("startLocalRefresh", () => {
  let handle: TLocalRefreshHandle | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    handle?.stop();
    handle = undefined;
    vi.useRealTimers();
  });

  test("first run lands at the random offset, within [0, interval)", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    handle = startLocalRefresh({ name: "t", intervalMs: INTERVAL_MS, task, random: () => 0.4 });

    await vi.advanceTimersByTimeAsync(0.4 * INTERVAL_MS - 1);
    expect(task).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  test.each([
    [0, 0],
    [0.999999999, INTERVAL_MS - 1],
    [1, INTERVAL_MS - 1],
    [-1, 0]
  ])("clamps offset for random()=%s to %sms", async (randomValue, expectedDelay) => {
    const task = vi.fn().mockResolvedValue(undefined);
    handle = startLocalRefresh({ name: "t", intervalMs: INTERVAL_MS, task, random: () => randomValue });

    if (expectedDelay > 0) {
      await vi.advanceTimersByTimeAsync(expectedDelay - 1);
      expect(task).not.toHaveBeenCalled();
    }
    await vi.advanceTimersByTimeAsync(expectedDelay > 0 ? 1 : 0);
    expect(task).toHaveBeenCalledTimes(1);
  });

  test("default random source keeps the offset inside the interval", async () => {
    for (let i = 0; i < 20; i += 1) {
      const task = vi.fn().mockResolvedValue(undefined);
      const h = startLocalRefresh({ name: "t", intervalMs: INTERVAL_MS, task });
      // eslint-disable-next-line no-await-in-loop
      await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1);
      expect(task).toHaveBeenCalledTimes(1);
      h.stop();
    }
  });

  test("runs every interval after the first run", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    handle = startLocalRefresh({ name: "t", intervalMs: INTERVAL_MS, task, random: () => 0 });

    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1);
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(task).toHaveBeenCalledTimes(5);
  });

  test("skips ticks while a previous run is still in flight", async () => {
    let release: () => void = () => {};
    let active = 0;
    let maxActive = 0;
    const task = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      active -= 1;
    });

    handle = startLocalRefresh({ name: "slow", intervalMs: INTERVAL_MS, task, random: () => 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(task).toHaveBeenCalledTimes(1);
    expect(maxActive).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("previous run still in progress [name=slow]"));

    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: "slow", duration_ms: INTERVAL_MS * 3 }),
      expect.stringContaining("exceeded 1000ms")
    );

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(task).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });

  test("an error in one run does not stop later runs", async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockImplementationOnce(() => {
        throw new Error("sync boom");
      })
      .mockResolvedValue(undefined);

    handle = startLocalRefresh({ name: "flaky", intervalMs: INTERVAL_MS, task, random: () => 0 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    expect(task).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(expect.any(Error), expect.stringContaining("[name=flaky]"));
  });

  test("logs duration at debug and warns only above the threshold", async () => {
    const task = vi.fn(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
    });

    handle = startLocalRefresh({
      name: "timed",
      intervalMs: INTERVAL_MS,
      task,
      random: () => 0,
      slowRunThresholdMs: 500
    });
    await vi.advanceTimersByTimeAsync(200);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ name: "timed", duration_ms: 200 }),
      expect.stringContaining("[name=timed]")
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("stop() before the first run cancels it", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    handle = startLocalRefresh({ name: "t", intervalMs: INTERVAL_MS, task, random: () => 0.5 });

    handle.stop();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 5);
    expect(task).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("stop() after runs have started cancels future runs", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    handle = startLocalRefresh({ name: "t", intervalMs: INTERVAL_MS, task, random: () => 0 });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(task).toHaveBeenCalledTimes(2);

    handle.stop();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 5);
    expect(task).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("stop() is idempotent", () => {
    handle = startLocalRefresh({ name: "t", intervalMs: INTERVAL_MS, task: vi.fn() });
    handle.stop();
    expect(() => handle?.stop()).not.toThrow();
  });

  test("offset and interval timers are unref'd so they never hold the process open", async () => {
    vi.useRealTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const task = vi.fn();

    try {
      handle = startLocalRefresh({ name: "t", intervalMs: INTERVAL_MS, task, random: () => 0 });
      const offsetTimer = setTimeoutSpy.mock.results[0]?.value as NodeJS.Timeout;
      expect(offsetTimer.hasRef()).toBe(false);

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
      expect(task).toHaveBeenCalledTimes(1);
      const intervalTimer = setIntervalSpy.mock.results[0]?.value as NodeJS.Timeout;
      expect(intervalTimer.hasRef()).toBe(false);
    } finally {
      setTimeoutSpy.mockRestore();
      setIntervalSpy.mockRestore();
    }
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid interval %s", (intervalMs) => {
    expect(() => startLocalRefresh({ name: "bad", intervalMs, task: vi.fn() })).toThrow(/positive number/);
  });
});
