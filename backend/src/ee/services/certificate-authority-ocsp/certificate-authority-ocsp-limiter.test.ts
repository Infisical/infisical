import { describe, expect, it } from "vitest";

import { createOcspSigningLimiter, createOcspSigningLimiterRegistry } from "./certificate-authority-ocsp-limiter";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe("createOcspSigningLimiter", () => {
  it("should run work immediately while under the limit", async () => {
    const limiter = createOcspSigningLimiter(2, 1000, 64);

    await expect(limiter.run(async () => "done")).resolves.toBe("done");
    expect(limiter.getActiveCount()).toBe(0);
  });

  it("should never exceed the concurrency limit", async () => {
    const limiter = createOcspSigningLimiter(2, 5000, 64);
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
    const limiter = createOcspSigningLimiter(1, 5000, 64);
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
    const limiter = createOcspSigningLimiter(1, 30, 64);
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
    const limiter = createOcspSigningLimiter(1, 1000, 64);

    await expect(
      limiter.run(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(limiter.getActiveCount()).toBe(0);
    await expect(limiter.run(async () => "recovered")).resolves.toBe("recovered");
  });
});

describe("createOcspSigningLimiterRegistry", () => {
  it("should reject immediately once the queue is full rather than admitting every caller to a wait", async () => {
    const limiter = createOcspSigningLimiter(1, 5000, 1);
    const gate = deferred();

    const holder = limiter.run(async () => {
      await gate.promise;
    });
    const queued = limiter.run(async () => "queued");

    await expect(limiter.run(async () => "rejected")).resolves.toBeNull();

    gate.resolve();
    await Promise.all([holder, queued]);
  });

  it("should stop one CA from consuming the whole global budget", async () => {
    const registry = createOcspSigningLimiterRegistry({
      globalLimit: 8,
      perCaLimit: 2,
      maxWaitMs: 5000,
      maxQueueDepth: 64,
      maxTrackedCas: 8,
      maxTotalInFlight: 512
    });
    const gate = deferred();
    let noisyPeak = 0;
    let noisyActive = 0;

    const noisy = Array.from({ length: 6 }, () =>
      registry.runForCa("noisy-ca", async () => {
        noisyActive += 1;
        noisyPeak = Math.max(noisyPeak, noisyActive);
        await gate.promise;
        noisyActive -= 1;
      })
    );

    await new Promise((r) => {
      setTimeout(r, 20);
    });

    // the quiet CA still gets served while the noisy one is saturated
    const quiet = await registry.runForCa("quiet-ca", async () => "served");

    gate.resolve();
    await Promise.all(noisy);

    expect(noisyPeak).toBeLessThanOrEqual(2);
    expect(quiet).toBe("served");
  });

  it("should prune idle per-CA limiters rather than growing without bound", async () => {
    const registry = createOcspSigningLimiterRegistry({
      globalLimit: 8,
      perCaLimit: 2,
      maxWaitMs: 1000,
      maxQueueDepth: 64,
      maxTrackedCas: 3,
      maxTotalInFlight: 512
    });

    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- pruning only reclaims idle limiters, so these must not overlap
      await registry.runForCa(`ca-${i}`, () => Promise.resolve(i));
    }

    expect(registry.getTrackedCaCount()).toBeLessThanOrEqual(4);
  });
});

describe("aggregate admission across CAs", () => {
  it("should shed once total in-flight reaches the cap, however many CAs the traffic is spread over", async () => {
    const registry = createOcspSigningLimiterRegistry({
      globalLimit: 8,
      perCaLimit: 4,
      maxWaitMs: 60_000,
      maxQueueDepth: 64,
      maxTrackedCas: 256,
      maxTotalInFlight: 32
    });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const inFlight: Promise<unknown>[] = [];
    for (let ca = 0; ca < 64; ca += 1) {
      for (let i = 0; i < 10; i += 1) {
        inFlight.push(
          registry.runForCa(`ca-${ca}`, async () => {
            await gate;
          })
        );
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(registry.getTotalInFlight()).toBe(32);
    expect(registry.getTrackedCaCount()).toBeLessThanOrEqual(32);

    release();
    const results = await Promise.all(inFlight);

    expect(results.filter((result) => result === null).length).toBeGreaterThan(0);
    expect(registry.getTotalInFlight()).toBe(0);
  });
});
