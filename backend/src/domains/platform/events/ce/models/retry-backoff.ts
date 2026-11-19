export const OUTBOX_BACKOFF_BASE_MS = 30_000;

// Same attempt, same delay, so a batch settles in one statement per outcome.
export class RetryBackoff {
  private readonly delays = new Map<number, number>();

  private constructor() {}

  static forBatch(): RetryBackoff {
    return new RetryBackoff();
  }

  // Exponential with jitter. `attempts` includes the one that just failed.
  static delayMs(attempts: number): number {
    const exponent = Math.min(attempts - 1, 10);
    const base = OUTBOX_BACKOFF_BASE_MS * 2 ** exponent;
    const jitter = Math.floor(Math.random() * Math.min(base / 2, 30_000));
    return base + jitter;
  }

  delayAfter(attempts: number): number {
    let delay = this.delays.get(attempts);
    if (delay === undefined) {
      delay = RetryBackoff.delayMs(attempts);
      this.delays.set(attempts, delay);
    }
    return delay;
  }
}
