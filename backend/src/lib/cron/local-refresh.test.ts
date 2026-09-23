import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { logger } from "@app/lib/logger";

import { startLocalRefresh, TLocalRefreshHandle } from "./local-refresh";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const INTERVAL_MS = 5 * 60 * 1000;
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

const mockRandom = (value: number) => vi.spyOn(Math, "random").mockReturnValue(value);

describe("startLocalRefresh", () => {
  let handle: TLocalRefreshHandle | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    handle?.stop();
    handle = undefined;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("first run lands at the random offset, within [0, interval)", async () => {
    mockRandom(0.4);
    const task = vi.fn().mockResolvedValue(undefined);
    handle = startLocalRefresh({ name: "t", intervalMs: INTERVAL_MS, task });

    await vi.advanceTimersByTimeAsync(0.4 * INTERVAL_MS - 1);
    expect(task).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  test.each([
    [0, 0],
    [0.999999999, INTERVAL_MS - 1]
  ])("offset for Math.random()=%s is %sms", async (randomValue, expectedDelay) => {
    mockRandom(randomValue);
    const task = vi.fn().mockResolvedValue(undefined);
    handle = startLocalRefresh({ name: "t", intervalMs: INTERVAL_MS, task });

    if (expectedDelay > 0) {
      await vi.advanceTimersByTimeAsync(expectedDelay - 1);
      expect(task).not.toHaveBeenCalled();
    }
    await vi.advanceTimersByTimeAsync(expectedDelay > 0 ? 1 : 0);
    expect(task).toHaveBeenCalledTimes(1);
  });

  test("real random source keeps the offset inside the interval", async () => {
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
    mockRandom(0);
    const task = vi.fn().mockResolvedValue(undefined);
    handle = startLocalRefresh({ name: "t", intervalMs: INTERVAL_MS, task });

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
    mockRandom(0);
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

    handle = startLocalRefresh({ name: "slow", intervalMs: INTERVAL_MS, task });
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
    mockRandom(0);
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockImplementationOnce(() => {
        throw new Error("sync boom");
      })
      .mockResolvedValue(undefined);

    handle = startLocalRefresh({ name: "flaky", intervalMs: INTERVAL_MS, task });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    expect(task).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(expect.any(Error), expect.stringContaining("[name=flaky]"));
  });

  test("logs duration at debug and warns only above the threshold", async () => {
    mockRandom(0);
    const task = vi.fn(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
    });

    handle = startLocalRefresh({ name: "timed", intervalMs: INTERVAL_MS, task, slowRunThresholdMs: 500 });
    await vi.advanceTimersByTimeAsync(200);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ name: "timed", duration_ms: 200 }),
      expect.stringContaining("[name=timed]")
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("stop() before the first run cancels it", async () => {
    mockRandom(0.5);
    const task = vi.fn().mockResolvedValue(undefined);
    handle = startLocalRefresh({ name: "t", intervalMs: INTERVAL_MS, task });

    handle.stop();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 5);
    expect(task).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("stop() after runs have started cancels future runs", async () => {
    mockRandom(0);
    const task = vi.fn().mockResolvedValue(undefined);
    handle = startLocalRefresh({ name: "t", intervalMs: INTERVAL_MS, task });

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
    mockRandom(0);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const task = vi.fn();

    handle = startLocalRefresh({ name: "t", intervalMs: INTERVAL_MS, task });
    const offsetTimer = setTimeoutSpy.mock.results[0]?.value as NodeJS.Timeout;
    expect(offsetTimer.hasRef()).toBe(false);

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(task).toHaveBeenCalledTimes(1);
    const intervalTimer = setIntervalSpy.mock.results[0]?.value as NodeJS.Timeout;
    expect(intervalTimer.hasRef()).toBe(false);
  });

  test("accepts the largest interval Node can schedule", () => {
    handle = startLocalRefresh({ name: "max", intervalMs: MAX_TIMER_DELAY_MS, task: vi.fn() });
    expect(vi.getTimerCount()).toBe(1);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, MAX_TIMER_DELAY_MS + 1, 30 * 24 * 60 * 60 * 1000])(
    "rejects invalid interval %s",
    (intervalMs) => {
      expect(() => startLocalRefresh({ name: "bad", intervalMs, task: vi.fn() })).toThrow(/positive number/);
    }
  );
});
