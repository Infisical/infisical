import { logger } from "@app/lib/logger";
import { LocalRefreshOutcome, recordLocalRefreshRunMetric } from "@app/lib/telemetry/metrics";

export type TLocalRefreshHandle = {
  stop: () => void;
};

type TStartLocalRefreshDTO = {
  name: string;
  intervalMs: number;
  task: () => Promise<void> | void;
  slowRunThresholdMs?: number;
};

const DEFAULT_SLOW_RUN_THRESHOLD_MS = 1000;

// Node clamps any timer delay above this to 1ms, which would turn a long interval into a hot loop.
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

// Refreshes state held in this process's memory, so it has to run on every pod; fleet-wide
// scheduled work belongs on the cron manager in ./cron-job instead. The offset is random per
// process on purpose: the point is that pods disagree, so they don't all hit the DB in the same second.
export const startLocalRefresh = ({
  name,
  intervalMs,
  task,
  slowRunThresholdMs = DEFAULT_SLOW_RUN_THRESHOLD_MS
}: TStartLocalRefreshDTO): TLocalRefreshHandle => {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0 || intervalMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `Local refresh interval must be a positive number of milliseconds no greater than ${MAX_TIMER_DELAY_MS} [name=${name}]`
    );
  }

  let stopped = false;
  let running = false;
  let consecutiveFailures = 0;
  let timer: NodeJS.Timeout | undefined;

  const run = async () => {
    if (stopped) return;
    if (running) {
      logger.warn(`Local refresh skipped, previous run still in progress [name=${name}]`);
      recordLocalRefreshRunMetric({ name, outcome: LocalRefreshOutcome.SKIPPED });
      return;
    }

    running = true;
    const startedAt = Date.now();
    let outcome = LocalRefreshOutcome.COMPLETED;
    let failure: unknown;
    try {
      await task();
      consecutiveFailures = 0;
    } catch (error) {
      outcome = LocalRefreshOutcome.FAILED;
      failure = error;
      consecutiveFailures += 1;
      logger.error(error, `Local refresh failed [name=${name}] [consecutiveFailures=${consecutiveFailures}]`);
    } finally {
      running = false;
      const durationMs = Date.now() - startedAt;
      recordLocalRefreshRunMetric({ name, outcome, durationMs, error: failure, consecutiveFailures });
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

  const initialDelayMs = Math.floor(Math.random() * intervalMs);

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
