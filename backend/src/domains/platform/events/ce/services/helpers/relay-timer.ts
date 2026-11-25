import { logger } from "@app/lib/logger";

const OUTBOX_RELAY_INTERVAL_MS = 10_000;

const RELAY_START_JITTER_MS = 5_000;

// setInterval instead of a cron because the relay needs a sub-minute cadence. FOR UPDATE SKIP LOCKED plus the
// flush job id already make concurrent pollers safe. A tick that is still running isn't started again.
export class RelayTimer {
  private relayTimer: NodeJS.Timeout | undefined;

  private startTimer: NodeJS.Timeout | undefined;

  private inFlight: Promise<void> | undefined;

  constructor(private readonly tick: () => Promise<void>) {}

  start(): void {
    this.startTimer = setTimeout(
      () => {
        this.run();
        this.relayTimer = setInterval(() => this.run(), OUTBOX_RELAY_INTERVAL_MS);
      },
      Math.floor(Math.random() * RELAY_START_JITTER_MS)
    );
  }

  async stop(): Promise<void> {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.relayTimer) clearInterval(this.relayTimer);
    this.startTimer = undefined;
    this.relayTimer = undefined;
    await this.inFlight;
  }

  private run(): void {
    if (this.inFlight) return;
    this.inFlight = this.tick()
      .catch((error) => {
        logger.error(error, "event-outbox: relay tick failed");
      })
      .finally(() => {
        this.inFlight = undefined;
      });
  }
}
