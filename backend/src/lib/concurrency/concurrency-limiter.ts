type TWaiter = {
  admit: () => void;
  timer: NodeJS.Timeout;
};

type TConcurrencyLimiterOptions = {
  limit: number;
  maxWaitMs: number;
  maxQueueDepth: number;
};

export type TConcurrencySlot = <T>(work: () => Promise<T>) => Promise<T>;

type TAdmission<T, TRefusal> = { admitted: true; value: T } | ({ admitted: false } & TRefusal);

type TQueueRefusal = { reason: "queue-full" | "wait-timeout" };

export type TKeyedRefusal = {
  scope: "key" | "instance";
  reason: TQueueRefusal["reason"] | "total-in-flight";
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

  const tryRun = async <T>(fn: () => Promise<T>, waitMs = maxWaitMs): Promise<TAdmission<T, TQueueRefusal>> => {
    if (active < limit) {
      active += 1;
    } else {
      if (queue.length >= maxQueueDepth) return { admitted: false, reason: "queue-full" };

      const admitted = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          const index = queue.findIndex((waiter) => waiter.timer === timer);
          if (index >= 0) queue.splice(index, 1);
          resolve(false);
        }, waitMs);

        queue.push({ admit: () => resolve(true), timer });
      });

      if (!admitted) return { admitted: false, reason: "wait-timeout" };
    }

    try {
      return { admitted: true, value: await fn() };
    } finally {
      releaseSlot();
    }
  };

  const run = async <T>(fn: () => Promise<T>, waitMs = maxWaitMs): Promise<T | null> => {
    const admission = await tryRun(fn, waitMs);
    return admission.admitted ? admission.value : null;
  };

  const isIdle = () => active === 0 && queue.length === 0;

  return { run, tryRun, isIdle, getActiveCount: () => active, getQueueDepth: () => queue.length };
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

  const tryRun = async <T>(key: string, fn: () => Promise<T>): Promise<TAdmission<T, TKeyedRefusal>> => {
    if (totalInFlight >= maxTotalInFlight) return { admitted: false, scope: "instance", reason: "total-in-flight" };

    totalInFlight += 1;
    try {
      let keyLimiter = perKeyLimiters.get(key);
      if (!keyLimiter) {
        pruneIdle();
        keyLimiter = createConcurrencyLimiter({ limit: perKeyLimit, maxWaitMs, maxQueueDepth });
        perKeyLimiters.set(key, keyLimiter);
      }

      // One deadline across both queues, so a request waits at most maxWaitMs in total rather than that long for
      // its key and again for a global slot.
      const deadline = Date.now() + maxWaitMs;
      const keyAdmission = await keyLimiter.tryRun(() => globalLimiter.tryRun(fn, Math.max(0, deadline - Date.now())));
      if (!keyAdmission.admitted) return { admitted: false, scope: "key", reason: keyAdmission.reason };
      const instanceAdmission = keyAdmission.value;
      if (!instanceAdmission.admitted) {
        return { admitted: false, scope: "instance", reason: instanceAdmission.reason };
      }
      return instanceAdmission;
    } finally {
      totalInFlight -= 1;
    }
  };

  const run = async <T>(key: string, fn: () => Promise<T>): Promise<T | null> => {
    const admission = await tryRun(key, fn);
    return admission.admitted ? admission.value : null;
  };

  return {
    run,
    tryRun,
    getGlobalActiveCount: () => globalLimiter.getActiveCount(),
    getGlobalQueueDepth: () => globalLimiter.getQueueDepth(),
    getKeyQueueDepth: (key: string) => perKeyLimiters.get(key)?.getQueueDepth() ?? 0,
    getTrackedKeyCount: () => perKeyLimiters.size,
    getTotalInFlight: () => totalInFlight
  };
};

export type TKeyedConcurrencyLimiter = ReturnType<typeof createKeyedConcurrencyLimiter>;
