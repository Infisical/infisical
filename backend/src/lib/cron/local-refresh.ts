import { logger } from "@app/lib/logger";

export type TLocalRefreshHandle = {
  stop: () => void;
};

type TStartLocalRefreshDTO = {
  name: string;
  intervalMs: number;
  task: () => Promise<void> | void;
  slowRunThresholdMs?: number;
  random?: () => number;
};

const DEFAULT_SLOW_RUN_THRESHOLD_MS = 1000;

// Refreshes state held in this process's memory, so it has to run on every pod; fleet-wide
// scheduled work belongs on the cron manager in ./cron-job instead. The offset is random per
// process on purpose: the point is that pods disagree, so they don't all hit the DB in the same second.
export const startLocalRefresh = ({
  name,
  intervalMs,
  task,
  slowRunThresholdMs = DEFAULT_SLOW_RUN_THRESHOLD_MS,
  random = Math.random
}: TStartLocalRefreshDTO): TLocalRefreshHandle => {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error(`Local refresh interval must be a positive number of milliseconds [name=${name}]`);
  }

  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | undefined;

  const run = async () => {
    if (stopped) return;
    if (running) {
      logger.warn(`Local refresh skipped, previous run still in progress [name=${name}]`);
      return;
    }

    running = true;
    const startedAt = Date.now();
    try {
      await task();
    } catch (error) {
      logger.error(error, `Local refresh failed [name=${name}]`);
    } finally {
      running = false;
      const durationMs = Date.now() - startedAt;
      logger.debug(
        { name, duration_ms: durationMs },
        `Local refresh finished [name=${name}] [durationMs=${durationMs}]`
      );
      if (durationMs > slowRunThresholdMs) {
        logger.warn(
          { name, duration_ms: durationMs },
          `Local refresh exceeded ${slowRunThresholdMs}ms [name=${name}] [durationMs=${durationMs}]`
        );
      }
    }
  };

  const initialDelayMs = Math.max(0, Math.min(intervalMs - 1, Math.floor(random() * intervalMs)));

  timer = setTimeout(() => {
    if (stopped) return;
    timer = setInterval(() => {
      void run();
    }, intervalMs);
    timer.unref();
    void run();
  }, initialDelayMs);
  timer.unref();

  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(timer);
      timer = undefined;
    }
  };
};
