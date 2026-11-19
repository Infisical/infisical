import { describe, expect, it, vi } from "vitest";

import { createConcurrencyLimiter, createKeyedConcurrencyLimiter } from "./concurrency-limiter";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe("createConcurrencyLimiter", () => {
  it("should run work immediately while under the limit", async () => {
    const limiter = createConcurrencyLimiter({ limit: 2, maxWaitMs: 1000, maxQueueDepth: 64 });

    await expect(limiter.run(async () => "done")).resolves.toBe("done");
    expect(limiter.getActiveCount()).toBe(0);
  });

  it("should never exceed the concurrency limit", async () => {
    const limiter = createConcurrencyLimiter({ limit: 2, maxWaitMs: 5000, maxQueueDepth: 64 });
    const gate = deferred();
    let peak = 0;

    const inFlight = Array.from({ length: 6 }, () =>
      limiter.run(async () => {
        peak = Math.max(peak, limiter.getActiveCount());
        await gate.promise;
        return true;
      })
    );

    await new Promise((r) => {
      setTimeout(r, 20);
    });
    expect(limiter.getActiveCount()).toBe(2);

    gate.resolve();
    await Promise.all(inFlight);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("should hand a freed slot to a queued caller", async () => {
    const limiter = createConcurrencyLimiter({ limit: 1, maxWaitMs: 5000, maxQueueDepth: 64 });
    const first = deferred();
    const order: string[] = [];

    const a = limiter.run(async () => {
      await first.promise;
      order.push("a");
    });
    const b = limiter.run(async () => {
      order.push("b");
    });

    first.resolve();
    await Promise.all([a, b]);

    expect(order).toEqual(["a", "b"]);
    expect(limiter.getActiveCount()).toBe(0);
    expect(limiter.getQueueDepth()).toBe(0);
  });

  it("should return null rather than queueing forever when saturated", async () => {
    const limiter = createConcurrencyLimiter({ limit: 1, maxWaitMs: 30, maxQueueDepth: 64 });
    const gate = deferred();

    const holder = limiter.run(async () => {
      await gate.promise;
    });

    await expect(limiter.run(async () => "never")).resolves.toBeNull();

    gate.resolve();
    await holder;
    expect(limiter.getQueueDepth()).toBe(0);
  });

  it("should release the slot when the work throws", async () => {
    const limiter = createConcurrencyLimiter({ limit: 1, maxWaitMs: 1000, maxQueueDepth: 64 });

    await expect(
      limiter.run(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(limiter.getActiveCount()).toBe(0);
    await expect(limiter.run(async () => "recovered")).resolves.toBe("recovered");
  });

  it("should reject immediately once the queue is full rather than admitting every caller to a wait", async () => {
    const limiter = createConcurrencyLimiter({ limit: 1, maxWaitMs: 5000, maxQueueDepth: 1 });
    const gate = deferred();

    const holder = limiter.run(async () => {
      await gate.promise;
    });
    const queued = limiter.run(async () => "queued");

    await expect(limiter.run(async () => "rejected")).resolves.toBeNull();

    gate.resolve();
    await Promise.all([holder, queued]);
  });
});

describe("createKeyedConcurrencyLimiter", () => {
  it("should stop one key from consuming the whole global budget", async () => {
    const limiter = createKeyedConcurrencyLimiter({
      globalLimit: 8,
      perKeyLimit: 2,
      maxWaitMs: 5000,
      maxQueueDepth: 64,
      maxTrackedKeys: 8,
      maxTotalInFlight: 512
    });
    const gate = deferred();
    let noisyPeak = 0;
    let noisyActive = 0;

    const noisy = Array.from({ length: 6 }, () =>
      limiter.run("noisy", async () => {
        noisyActive += 1;
        noisyPeak = Math.max(noisyPeak, noisyActive);
        await gate.promise;
        noisyActive -= 1;
      })
    );

    await new Promise((r) => {
      setTimeout(r, 20);
    });

    // a quiet key still gets served while the noisy one is saturated
    const quiet = await limiter.run("quiet", async () => "served");

    gate.resolve();
    await Promise.all(noisy);

    expect(noisyPeak).toBeLessThanOrEqual(2);
    expect(quiet).toBe("served");
  });

  it("should bound the total wait by maxWaitMs across the key and global queues", async () => {
    vi.useFakeTimers();
    try {
      const limiter = createKeyedConcurrencyLimiter({
        globalLimit: 1,
        perKeyLimit: 1,
        maxWaitMs: 200,
        maxQueueDepth: 64,
        maxTrackedKeys: 8,
        maxTotalInFlight: 512
      });
      const gate = deferred();
      const holder = limiter.run("other", () => gate.promise);
      const first = limiter.run("key", async () => "first");
      let secondSettledAt: number | undefined;
      const second = limiter
        .run("key", async () => "second")
        .then((result) => {
          secondSettledAt = Date.now();
          return result;
        });
      const start = Date.now();

      await vi.advanceTimersByTimeAsync(201);

      await expect(first).resolves.toBeNull();
      await expect(second).resolves.toBeNull();
      expect((secondSettledAt ?? Infinity) - start).toBeLessThanOrEqual(201);

      gate.resolve();
      await holder;
    } finally {
      vi.useRealTimers();
    }
  });

  it("should prune idle per-key limiters rather than growing without bound", async () => {
    const limiter = createKeyedConcurrencyLimiter({
      globalLimit: 8,
      perKeyLimit: 2,
      maxWaitMs: 1000,
      maxQueueDepth: 64,
      maxTrackedKeys: 3,
      maxTotalInFlight: 512
    });

    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- pruning only reclaims idle limiters, so these must not overlap
      await limiter.run(`key-${i}`, () => Promise.resolve(i));
    }

    expect(limiter.getTrackedKeyCount()).toBeLessThanOrEqual(4);
  });
});

describe("aggregate admission across keys", () => {
  it("should shed once total in-flight reaches the cap, however many keys the traffic is spread over", async () => {
    const limiter = createKeyedConcurrencyLimiter({
      globalLimit: 8,
      perKeyLimit: 4,
      maxWaitMs: 60_000,
      maxQueueDepth: 64,
      maxTrackedKeys: 256,
      maxTotalInFlight: 32
    });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const inFlight: Promise<unknown>[] = [];
    for (let key = 0; key < 64; key += 1) {
      for (let i = 0; i < 10; i += 1) {
        inFlight.push(
          limiter.run(`key-${key}`, async () => {
            await gate;
          })
        );
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(limiter.getTotalInFlight()).toBe(32);
    expect(limiter.getTrackedKeyCount()).toBeLessThanOrEqual(32);

    release();
    const results = await Promise.all(inFlight);

    expect(results.filter((result) => result === null).length).toBeGreaterThan(0);
    expect(limiter.getTotalInFlight()).toBe(0);
  });
});
