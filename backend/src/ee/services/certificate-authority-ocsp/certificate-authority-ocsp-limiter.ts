type TWaiter = {
  admit: () => void;
  timer: NodeJS.Timeout;
};

export const createOcspSigningLimiter = (limit: number, maxWaitMs: number, maxQueueDepth: number) => {
  let active = 0;
  const queue: TWaiter[] = [];

  const releaseSlot = () => {
    const waiter = queue.shift();
    if (!waiter) {
      active -= 1;
      return;
    }
    clearTimeout(waiter.timer);
    waiter.admit();
  };

  const run = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    if (active < limit) {
      active += 1;
    } else {
      if (queue.length >= maxQueueDepth) return null;

      const admitted = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          const index = queue.findIndex((waiter) => waiter.timer === timer);
          if (index >= 0) queue.splice(index, 1);
          resolve(false);
        }, maxWaitMs);

        queue.push({ admit: () => resolve(true), timer });
      });

      if (!admitted) return null;
    }

    try {
      return await fn();
    } finally {
      releaseSlot();
    }
  };

  const isIdle = () => active === 0 && queue.length === 0;

  return { run, isIdle, getActiveCount: () => active, getQueueDepth: () => queue.length };
};

export type TOcspSigningLimiter = ReturnType<typeof createOcspSigningLimiter>;

export const createOcspSigningLimiterRegistry = ({
  globalLimit,
  perCaLimit,
  maxWaitMs,
  maxQueueDepth,
  maxTrackedCas
}: {
  globalLimit: number;
  perCaLimit: number;
  maxWaitMs: number;
  maxQueueDepth: number;
  maxTrackedCas: number;
}) => {
  const globalLimiter = createOcspSigningLimiter(globalLimit, maxWaitMs, maxQueueDepth);
  const perCaLimiters = new Map<string, TOcspSigningLimiter>();

  const pruneIdle = () => {
    if (perCaLimiters.size <= maxTrackedCas) return;
    for (const [caId, limiter] of perCaLimiters) {
      if (limiter.isIdle()) perCaLimiters.delete(caId);
      if (perCaLimiters.size <= maxTrackedCas) return;
    }
  };

  const runForCa = async <T>(caId: string, fn: () => Promise<T>): Promise<T | null> => {
    let caLimiter = perCaLimiters.get(caId);
    if (!caLimiter) {
      pruneIdle();
      caLimiter = createOcspSigningLimiter(perCaLimit, maxWaitMs, maxQueueDepth);
      perCaLimiters.set(caId, caLimiter);
    }

    return caLimiter.run(() => globalLimiter.run(fn));
  };

  return {
    runForCa,
    getGlobalActiveCount: () => globalLimiter.getActiveCount(),
    getGlobalQueueDepth: () => globalLimiter.getQueueDepth(),
    getCaQueueDepth: (caId: string) => perCaLimiters.get(caId)?.getQueueDepth() ?? 0,
    getTrackedCaCount: () => perCaLimiters.size
  };
};

export type TOcspSigningLimiterRegistry = ReturnType<typeof createOcspSigningLimiterRegistry>;
