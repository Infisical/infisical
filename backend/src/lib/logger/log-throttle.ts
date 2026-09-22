type TWindow = {
  startedAt: number;
  emitted: number;
  suppressed: number;
};

export type TLogThrottleDecision = {
  shouldLog: boolean;
  suppressed: number;
};

export const createLogThrottle = ({
  windowMs,
  maxPerWindow,
  maxTrackedKeys
}: {
  windowMs: number;
  maxPerWindow: number;
  maxTrackedKeys: number;
}) => {
  const windows = new Map<string, TWindow>();

  const take = (key: string): TLogThrottleDecision => {
    const now = Date.now();
    const current = windows.get(key);

    if (!current || now - current.startedAt >= windowMs) {
      if (!current && windows.size >= maxTrackedKeys) {
        const oldest = windows.keys().next().value as string | undefined;
        if (oldest) windows.delete(oldest);
      }

      windows.set(key, { startedAt: now, emitted: 1, suppressed: 0 });
      return { shouldLog: true, suppressed: current?.suppressed ?? 0 };
    }

    if (current.emitted < maxPerWindow) {
      current.emitted += 1;
      const { suppressed } = current;
      current.suppressed = 0;
      return { shouldLog: true, suppressed };
    }

    current.suppressed += 1;
    return { shouldLog: false, suppressed: current.suppressed };
  };

  return { take, getTrackedKeyCount: () => windows.size };
};

export type TLogThrottle = ReturnType<typeof createLogThrottle>;

export const formatSuppressed = (suppressed: number) =>
  suppressed > 0 ? ` [suppressedSinceLastLog=${suppressed}]` : "";
