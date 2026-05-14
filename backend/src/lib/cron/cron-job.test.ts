import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cronJobFactory } from "./cron-job";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

// ── helpers ───────────────────────────────────────────────────────────────────

const makeRedis = () => ({
  set: vi.fn().mockResolvedValue(null),
  get: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(0),
  hset: vi.fn().mockResolvedValue(1),
  hgetall: vi.fn().mockResolvedValue(null),
  zrangebyscore: vi.fn().mockResolvedValue([]),
  zadd: vi.fn().mockResolvedValue(1),
  zrem: vi.fn().mockResolvedValue(1),
  eval: vi.fn().mockResolvedValue(0)
});

const makeRedlock = () => ({
  using: vi.fn(async (_keys: string[], _duration: number, fn: (signal: AbortSignal) => Promise<void>) => {
    const controller = new AbortController();
    return fn(controller.signal);
  })
});

// Use a cast via unknown to satisfy the type system for the mocks
type FakeDeps = {
  redis: ReturnType<typeof makeRedis>;
  redlock: ReturnType<typeof makeRedlock>;
};
const makeFactory = (deps?: Partial<FakeDeps>) => {
  const redis = deps?.redis ?? makeRedis();
  const redlock = deps?.redlock ?? makeRedlock();
  return {
    ...cronJobFactory({
      redis: redis as never,
      redlock: redlock as never,
      slotRefreshMs: 50,
      enqueueIntervalMs: 100,
      processIntervalMs: 100,
      slotTtlMs: 200,
      leaseDurationMs: 1000
    }),
    redis,
    redlock
  };
};

// ── lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("register", () => {
  test("throws on invalid cron pattern", () => {
    const { register } = makeFactory();
    expect(() => register({ name: "x", pattern: "not-a-cron", handler: vi.fn(), runHashTtlS: 3600 })).toThrow();
  });

  test("throws on duplicate name", () => {
    const { register } = makeFactory();
    register({ name: "x", pattern: "0 0 * * *", handler: vi.fn(), runHashTtlS: 3600 });
    expect(() => register({ name: "x", pattern: "0 0 * * *", handler: vi.fn(), runHashTtlS: 3600 })).toThrow(
      "already registered"
    );
  });

  test("disabled entry is skipped", async () => {
    const { register, start, stop, redis } = makeFactory();
    register({ name: "x", pattern: "0 0 * * *", handler: vi.fn(), runHashTtlS: 3600, enabled: false });
    start();
    expect(redis.eval).not.toHaveBeenCalled();
    await stop();
  });
});

describe("slot election", () => {
  test("claims slot 0 on boot when free", async () => {
    const redis = makeRedis();
    redis.set.mockResolvedValueOnce("OK");
    const { start, stop } = makeFactory({ redis });
    start();
    // Let the immediate claimOrRefreshSlot call in start() complete
    await Promise.resolve();
    expect(redis.set).toHaveBeenCalledWith("{cron}:slot:0", expect.any(String), "PX", expect.any(Number), "NX");
    await stop();
  });

  test("falls through to slot 1 when slot 0 is held", async () => {
    const redis = makeRedis();
    redis.set.mockResolvedValueOnce(null).mockResolvedValueOnce("OK");
    const { start, stop } = makeFactory({ redis });
    start();
    await Promise.resolve();
    expect(redis.set).toHaveBeenNthCalledWith(1, "{cron}:slot:0", expect.any(String), "PX", expect.any(Number), "NX");
    expect(redis.set).toHaveBeenNthCalledWith(2, "{cron}:slot:1", expect.any(String), "PX", expect.any(Number), "NX");
    await stop();
  });

  test("sits idle when all slots are held", async () => {
    const redis = makeRedis();
    redis.set.mockResolvedValue(null);
    const { register, start, stop } = makeFactory({ redis });
    register({ name: "x", pattern: "0 0 * * *", handler: vi.fn(), runHashTtlS: 3600 });
    start();
    await Promise.resolve();
    expect(redis.eval).not.toHaveBeenCalled();
    await stop();
  });

  test("refreshes held slot on next interval", async () => {
    const redis = makeRedis();
    redis.set.mockResolvedValueOnce("OK").mockResolvedValue("OK");
    const { start, stop } = makeFactory({ redis });
    start();
    await Promise.resolve();
    vi.advanceTimersByTime(60);
    await Promise.resolve();
    const xxCalls = redis.set.mock.calls.filter((c) => (c as string[]).includes("XX"));
    expect(xxCalls.length).toBeGreaterThan(0);
    await stop();
  });

  test("re-attempts NX after slot refresh fails", async () => {
    const redis = makeRedis();
    redis.set.mockResolvedValueOnce("OK").mockResolvedValueOnce(null).mockResolvedValueOnce("OK");
    const { start, stop } = makeFactory({ redis });
    start();
    vi.advanceTimersByTime(60);
    await Promise.resolve();
    const nxCalls = redis.set.mock.calls.filter((c) => (c as string[]).includes("NX"));
    expect(nxCalls.length).toBeGreaterThanOrEqual(2);
    await stop();
  });
});

describe("claim and execute", () => {
  test("boundary cache skips eval when timestamp unchanged", async () => {
    const redis = makeRedis();
    redis.set.mockResolvedValue("OK");
    redis.eval.mockResolvedValue(1);
    const { register, start, stop } = makeFactory({ redis });
    register({ name: "x", pattern: "0 0 * * *", handler: vi.fn(), runHashTtlS: 3600 });
    start();
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    const firstCount = redis.eval.mock.calls.length;
    vi.advanceTimersByTime(30_000);
    await Promise.resolve();
    expect(redis.eval.mock.calls.length).toBe(firstCount);
    await stop();
  });

  test("skips row whose name is not in local registry", async () => {
    const redis = makeRedis();
    redis.set.mockResolvedValue("OK");
    redis.zrangebyscore.mockResolvedValue(["unknown:1000000000000"]);
    redis.hgetall.mockResolvedValue({ name: "unknown", status: "pending", attempts: "0" });
    const redlock = makeRedlock();
    const { register, start, stop } = makeFactory({ redis, redlock });
    register({ name: "x", pattern: "0 0 * * *", handler: vi.fn(), runHashTtlS: 3600 });
    start();
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    expect(redlock.using).not.toHaveBeenCalled();
    await stop();
  });
});

// Multi-key Lua scripts (currently just ENQUEUE_RUN_LUA) must pass keys that
// hash to the same Redis Cluster slot, otherwise the server returns CROSSSLOT
// in cluster mode and every enqueue tick fails silently. This invariant test
// guards the {cron} hash-tag convention against future regressions, mirroring
// the per-queue {<name>} pattern that queue-service.ts already uses for BullMQ.
describe("redis cluster compatibility", () => {
  // Extracts the Redis Cluster hash tag (text between the first `{` and `}`)
  // from a key, or undefined if the key isn't tagged. Two keys hash to the
  // same slot iff this returns a non-empty equal value for both.
  const hashTagOf = (key: unknown): string | undefined => {
    const s = String(key);
    const start = s.indexOf("{");
    if (start < 0) return undefined;
    const end = s.indexOf("}", start + 1);
    if (end <= start + 1) return undefined;
    return s.slice(start + 1, end);
  };

  test("multi-key Lua EVAL passes keys that share a Cluster hash tag", async () => {
    vi.setSystemTime(new Date("2024-01-01T00:00:30Z"));
    const redis = makeRedis();
    redis.set.mockResolvedValue("OK");
    redis.eval.mockResolvedValue(1);

    const { register, start, stop } = makeFactory({ redis });
    register({ name: "x", pattern: "* * * * *", handler: vi.fn(), runHashTtlS: 3600 });
    start();

    // Drive at least one enqueue tick (enqueueIntervalMs=100 in makeFactory).
    await vi.advanceTimersByTimeAsync(150);

    // ENQUEUE_RUN_LUA is the only multi-key script (KEYS[1]=run, KEYS[2]=pending).
    // Identify its eval call by numKeys === 2 (RELEASE_SLOT_IF_MINE_LUA uses 1).
    const multiKeyEvalCalls = redis.eval.mock.calls.filter((c) => c[1] === 2);
    expect(multiKeyEvalCalls.length).toBeGreaterThan(0);

    for (const call of multiKeyEvalCalls) {
      const numKeys = Number(call[1]);
      const keys = (call as unknown[]).slice(2, 2 + numKeys);
      const tags = keys.map(hashTagOf);
      // Every key in a multi-key EVAL must carry a non-empty hash tag and
      // every tag must match — that's the precondition for Redis Cluster to
      // accept the command without returning CROSSSLOT.
      expect(tags.every((t) => t && t.length > 0)).toBe(true);
      expect(new Set(tags).size).toBe(1);
    }

    await stop();
  });
});

describe("retry backoff and handler timeout", () => {
  // Helper: wires up the mock chain so the factory will pick up a single
  // pending run for cron name "x" and invoke the registered handler.
  const setupPendingRun = (redis: ReturnType<typeof makeRedis>, runIdScheduledAt: number) => {
    redis.set.mockResolvedValue("OK"); // slot claim succeeds
    redis.eval.mockResolvedValue(1); // enqueue succeeds
    redis.zrangebyscore.mockResolvedValue([`x:${runIdScheduledAt}`]);
    redis.hgetall.mockResolvedValue({
      name: "x",
      status: "pending",
      attempts: "0",
      enqueued_at_ms: "0"
    });
  };

  test("non-final failure updates zset score to a future next_attempt_at", async () => {
    // Early in a minute: default 30s backoff fits comfortably before next fire.
    vi.setSystemTime(new Date("2024-01-01T00:00:05Z"));
    const redis = makeRedis();
    setupPendingRun(redis, Date.parse("2024-01-01T00:00:00Z"));

    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    const { register, start, stop } = makeFactory({ redis });
    register({ name: "x", pattern: "* * * * *", handler, runHashTtlS: 3600, maxAttempts: 3 });
    start();

    // Slot claim + enqueue + process tick + handler reject
    await vi.advanceTimersByTimeAsync(300);

    expect(handler).toHaveBeenCalled();
    expect(redis.zadd).toHaveBeenCalled();
    const zaddArgs = redis.zadd.mock.calls[0] as unknown[];
    expect(Number(zaddArgs[1])).toBeGreaterThan(Date.now());

    // Status hash was updated to pending with next_attempt_at
    const wroteNextAttempt = redis.hset.mock.calls.some((c) =>
      (c as unknown[]).some((arg) => arg === "next_attempt_at")
    );
    expect(wroteNextAttempt).toBe(true);

    await stop();
  });

  test("retry whose backoff overflows next fire is marked failed (zrem, not zadd)", async () => {
    // 5s before next minute: backoffBase=30s overflows the interval.
    vi.setSystemTime(new Date("2024-01-01T00:00:55Z"));
    const redis = makeRedis();
    setupPendingRun(redis, Date.parse("2024-01-01T00:00:00Z"));

    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    const { register, start, stop } = makeFactory({ redis });
    register({ name: "x", pattern: "* * * * *", handler, runHashTtlS: 3600, maxAttempts: 5 });
    start();

    await vi.advanceTimersByTimeAsync(300);

    expect(handler).toHaveBeenCalled();
    // Guard short-circuits before zadd
    expect(redis.zadd).not.toHaveBeenCalled();
    expect(redis.zrem).toHaveBeenCalled();
    // Status flipped to failed
    const wroteFailed = redis.hset.mock.calls.some((c) =>
      (c as unknown[]).some((arg, i, arr) => arg === "status" && arr[i + 1] === "failed")
    );
    expect(wroteFailed).toBe(true);

    await stop();
  });

  test("hung handler is marked failed-final (not pending-retry) to prevent zombie concurrency", async () => {
    vi.setSystemTime(new Date("2024-01-01T00:00:30Z"));
    const redis = makeRedis();
    setupPendingRun(redis, Date.parse("2024-01-01T00:00:00Z"));

    const handler = vi.fn().mockImplementation(() => new Promise<void>(() => {})); // never resolves
    // Build factory inline because makeFactory doesn't expose handlerTimeoutMs.
    const redlock = makeRedlock();
    const f = cronJobFactory({
      redis: redis as never,
      redlock: redlock as never,
      slotRefreshMs: 50,
      enqueueIntervalMs: 100,
      processIntervalMs: 100,
      slotTtlMs: 200,
      leaseDurationMs: 1000,
      handlerTimeoutMs: 200,
      // Bound the test's stop() drain. The handler hangs forever and new ticks
      // keep dispatching it, so without a short drainTimeoutMs the cleanup
      // would block until the production default (25s) and time the test out.
      drainTimeoutMs: 50
    });
    f.register({ name: "x", pattern: "* * * * *", handler, runHashTtlS: 3600, maxAttempts: 3 });
    f.start();

    // Slot + enqueue + handler starts hanging, then past handlerTimeoutMs.
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(500);

    expect(handler).toHaveBeenCalled();
    // The handler-timeout setTimeout's reject path writes last_error containing
    // "exceeded" — strongest evidence the timeout fired and the catch ran.
    const wroteTimeoutError = redis.hset.mock.calls.some((c) =>
      (c as unknown[]).some((arg) => typeof arg === "string" && arg.includes("exceeded"))
    );
    expect(wroteTimeoutError).toBe(true);

    // Regression guard: handlerTimeoutMs must mark the run failed-final so a
    // retry doesn't race with the still-running zombie. zrem (failed-final
    // path) must fire; zadd (pending-retry path) must NOT.
    const wroteFailed = redis.hset.mock.calls.some((c) =>
      (c as unknown[]).some((arg, i, arr) => arg === "status" && arr[i + 1] === "failed")
    );
    expect(wroteFailed).toBe(true);
    expect(redis.zrem).toHaveBeenCalled();
    expect(redis.zadd).not.toHaveBeenCalled();

    // Advance past drainTimeoutMs so stop() can resolve via the drain timeout.
    const stopPromise = f.stop();
    await vi.advanceTimersByTimeAsync(100);
    await stopPromise;
  });
});

describe("min-age gate", () => {
  test("redlock is skipped while run is fresh, then fires once minProcessAgeMs has elapsed", async () => {
    vi.setSystemTime(new Date("2024-01-01T00:00:30Z"));
    const enqueuedAt = Date.now(); // captured at fake-clock baseline

    const redis = makeRedis();
    redis.set.mockResolvedValue("OK"); // slot claim succeeds
    redis.zrangebyscore.mockResolvedValue([`x:${enqueuedAt}`]);
    redis.hgetall.mockResolvedValue({
      name: "x",
      status: "pending",
      attempts: "0",
      enqueued_at_ms: String(enqueuedAt)
    });

    const redlock = makeRedlock();
    const f = cronJobFactory({
      redis: redis as never,
      redlock: redlock as never,
      slotRefreshMs: 50,
      enqueueIntervalMs: 100,
      processIntervalMs: 100,
      slotTtlMs: 200,
      leaseDurationMs: 1000,
      minProcessAgeMs: 500
    });
    f.register({ name: "x", pattern: "* * * * *", handler: vi.fn(), runHashTtlS: 3600 });
    f.start();

    // Process ticks at 100 / 200 / 300ms have all seen the run, but age
    // (300ms) < minProcessAgeMs (500ms) — redlock must remain idle.
    await vi.advanceTimersByTimeAsync(300);
    expect(redlock.using).not.toHaveBeenCalled();

    // The tick at ≥500ms sees age ≥ 500ms and clears the gate.
    await vi.advanceTimersByTimeAsync(300); // total 600ms elapsed
    expect(redlock.using).toHaveBeenCalled();

    await f.stop();
  });
});

describe("stop", () => {
  // Locally mirrored from the retry-backoff suite — `setupPendingRun` lives in
  // that describe's scope, but the graceful-shutdown tests below need the same
  // pending-run fixture without coupling the two suites.
  const setupPendingRun = (redis: ReturnType<typeof makeRedis>, runIdScheduledAt: number) => {
    redis.set.mockResolvedValue("OK");
    redis.eval.mockResolvedValue(1);
    redis.zrangebyscore.mockResolvedValue([`x:${runIdScheduledAt}`]);
    redis.hgetall.mockResolvedValue({
      name: "x",
      status: "pending",
      attempts: "0",
      enqueued_at_ms: "0"
    });
  };

  // Identifies the slot-release eval (only Lua script that contains `del`).
  const isSlotReleaseEval = (call: unknown[]): boolean => typeof call[0] === "string" && call[0].includes("del");

  test("releases held slot atomically", async () => {
    const redis = makeRedis();
    redis.set.mockResolvedValue("OK");
    redis.eval.mockResolvedValue(1);
    const { start, stop } = makeFactory({ redis });
    start();
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    await stop();
    const lastEval = redis.eval.mock.calls.at(-1) as unknown[];
    expect(lastEval[0]).toContain("del");
    expect(String(lastEval[2])).toContain("{cron}:slot:");
  });

  // Regression guard for the BullMQ Worker.close() drain semantics: stop()
  // must wait for in-flight handlers to settle before releasing the slot,
  // otherwise destructive handlers (rotations, deletions) get torn down
  // mid-flight and leases linger until their TTL elapses.
  test("drains in-flight handler before releasing the slot", async () => {
    vi.setSystemTime(new Date("2024-01-01T00:00:30Z"));
    const redis = makeRedis();
    setupPendingRun(redis, Date.parse("2024-01-01T00:00:00Z"));

    // Deferred-style handler: the test resolves it manually so we can assert
    // ordering between handler completion and slot release. Multiple ticks
    // can fire while the handler is in-flight (status stays "pending" in the
    // mock), so we collect every resolver to release them all together.
    const pendingResolvers: Array<() => void> = [];
    const handler = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          pendingResolvers.push(resolve);
        })
    );
    const redlock = makeRedlock();
    const f = cronJobFactory({
      redis: redis as never,
      redlock: redlock as never,
      slotRefreshMs: 50,
      enqueueIntervalMs: 100,
      processIntervalMs: 100,
      slotTtlMs: 200,
      leaseDurationMs: 1000,
      handlerTimeoutMs: 60_000,
      drainTimeoutMs: 5_000
    });
    f.register({ name: "x", pattern: "* * * * *", handler, runHashTtlS: 3600, maxAttempts: 3 });
    f.start();

    // Drive ticks until at least one handler is mid-execution.
    await vi.advanceTimersByTimeAsync(300);
    expect(handler).toHaveBeenCalled();
    expect(pendingResolvers.length).toBeGreaterThan(0);
    expect(redis.eval.mock.calls.some(isSlotReleaseEval)).toBe(false);

    // Begin stop() but don't await yet — the drain race must keep it pending
    // while handlers are still in flight.
    const stopPromise = f.stop();

    // Flush a couple of microtask cycles. clearInterval has fired, but the
    // slot release must not yet have been issued.
    await Promise.resolve();
    await Promise.resolve();
    expect(redis.eval.mock.calls.some(isSlotReleaseEval)).toBe(false);

    // Release every in-flight handler. Once the chain
    //   handler.resolve → markCompleted → redlock.using.resolve → inFlight.delete
    // settles for all of them, drain wins the race and stop() proceeds to
    // slot release.
    pendingResolvers.forEach((resolve) => resolve());
    await stopPromise;

    expect(redis.eval.mock.calls.some(isSlotReleaseEval)).toBe(true);
  });

  // The orchestrator's grace period (e.g. Kubernetes' default 30s) caps how
  // long shutdown can block. drainTimeoutMs guards against a single hung
  // handler holding stop() open past that window — anything still in flight
  // after the timeout falls back to lease-TTL crash recovery.
  test("respects drainTimeoutMs when an in-flight handler hangs", async () => {
    vi.setSystemTime(new Date("2024-01-01T00:00:30Z"));
    const redis = makeRedis();
    setupPendingRun(redis, Date.parse("2024-01-01T00:00:00Z"));

    const handler = vi.fn().mockImplementation(() => new Promise<void>(() => {})); // never resolves
    const redlock = makeRedlock();
    const f = cronJobFactory({
      redis: redis as never,
      redlock: redlock as never,
      slotRefreshMs: 50,
      enqueueIntervalMs: 100,
      processIntervalMs: 100,
      slotTtlMs: 200,
      leaseDurationMs: 1000,
      // Long enough that handlerTimeoutMs doesn't naturally drain inFlight.
      handlerTimeoutMs: 60_000,
      drainTimeoutMs: 200
    });
    f.register({ name: "x", pattern: "* * * * *", handler, runHashTtlS: 3600, maxAttempts: 3 });
    f.start();

    await vi.advanceTimersByTimeAsync(300);
    expect(handler).toHaveBeenCalled();

    const stopPromise = f.stop();
    // Advance past drainTimeoutMs so the timeout branch wins the race.
    await vi.advanceTimersByTimeAsync(300);
    await stopPromise;

    // Slot is released even though the handler is still hung — recovery is
    // delegated to the lease TTL on a replacement pod.
    expect(redis.eval.mock.calls.some(isSlotReleaseEval)).toBe(true);
  });
});
