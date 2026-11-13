const DEFAULT_TIMEOUT_MS = 20_000;
const POLL_MS = 100;

export const pollUntil = async <T>(dto: {
  describe: string;
  read: () => Promise<T> | T;
  done: (value: T) => boolean;
  timeoutMs?: number;
}) => {
  const timeoutMs = dto.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const value = await dto.read();
    if (dto.done(value)) return value;

    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${dto.describe}`);
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_MS);
    });
  }
};

// Resolves once some query is waiting on a lock the backend `pid` holds, so a spec can prove a statement
// blocked before it lets the holder commit.
export const waitUntilBlockedBy = (pid: number) =>
  pollUntil({
    describe: `a query blocked by backend ${pid}`,
    read: async () => {
      const { rows } = await testDb.raw(
        "select count(*)::int as waiting from pg_stat_activity where ? = any(pg_blocking_pids(pid))",
        [pid]
      );
      return rows[0].waiting as number;
    },
    done: (waiting) => waiting > 0,
    timeoutMs: 5_000
  });
