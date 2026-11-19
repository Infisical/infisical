type TWaiter = {
  admit: () => void;
  timer: NodeJS.Timeout;
};

type TConcurrencyLimiterOptions = {
  limit: number;
  maxWaitMs: number;
  maxQueueDepth: number;
};

export const createConcurrencyLimiter = ({ limit, maxWaitMs, maxQueueDepth }: TConcurrencyLimiterOptions) => {
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

export type TConcurrencyLimiter = ReturnType<typeof createConcurrencyLimiter>;

type TKeyedConcurrencyLimiterOptions = {
  globalLimit: number;
  perKeyLimit: number;
  maxWaitMs: number;
  maxQueueDepth: number;
  maxTrackedKeys: number;
  maxTotalInFlight: number;
};

export const createKeyedConcurrencyLimiter = ({
  globalLimit,
  perKeyLimit,
  maxWaitMs,
  maxQueueDepth,
  maxTrackedKeys,
  maxTotalInFlight
}: TKeyedConcurrencyLimiterOptions) => {
  const globalLimiter = createConcurrencyLimiter({ limit: globalLimit, maxWaitMs, maxQueueDepth });
  const perKeyLimiters = new Map<string, TConcurrencyLimiter>();
  let totalInFlight = 0;

  const pruneIdle = () => {
    if (perKeyLimiters.size <= maxTrackedKeys) return;
    for (const [key, limiter] of perKeyLimiters) {
      if (limiter.isIdle()) perKeyLimiters.delete(key);
      if (perKeyLimiters.size <= maxTrackedKeys) return;
    }
  };

  const run = async <T>(key: string, fn: () => Promise<T>): Promise<T | null> => {
    if (totalInFlight >= maxTotalInFlight) return null;

    totalInFlight += 1;
    try {
      let keyLimiter = perKeyLimiters.get(key);
      if (!keyLimiter) {
        pruneIdle();
        keyLimiter = createConcurrencyLimiter({ limit: perKeyLimit, maxWaitMs, maxQueueDepth });
        perKeyLimiters.set(key, keyLimiter);
      }

      return await keyLimiter.run(() => globalLimiter.run(fn));
    } finally {
      totalInFlight -= 1;
    }
  };

  return {
    run,
    getGlobalActiveCount: () => globalLimiter.getActiveCount(),
    getGlobalQueueDepth: () => globalLimiter.getQueueDepth(),
    getKeyQueueDepth: (key: string) => perKeyLimiters.get(key)?.getQueueDepth() ?? 0,
    getTrackedKeyCount: () => perKeyLimiters.size,
    getTotalInFlight: () => totalInFlight
  };
};

export type TKeyedConcurrencyLimiter = ReturnType<typeof createKeyedConcurrencyLimiter>;

export const createKeyedInFlightCounter = () => {
  const counts = new Map<string, number>();

  const add = (key: string, count = 1) => {
    counts.set(key, (counts.get(key) ?? 0) + count);
  };

  const remove = (key: string, count = 1) => {
    const remaining = (counts.get(key) ?? 0) - count;
    if (remaining > 0) counts.set(key, remaining);
    else counts.delete(key);
  };

  return {
    add,
    remove,
    get: (key: string) => counts.get(key) ?? 0,
    getTrackedKeyCount: () => counts.size
  };
};

export type TKeyedInFlightCounter = ReturnType<typeof createKeyedInFlightCounter>;
