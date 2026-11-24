import type { TDomainQueue } from "@app/domains/lib/jobs";
import type { QueueJobs, QueueName } from "@app/queue";

// Names are frozen: old pods share this queue during a rolling deploy. Cast instead of imported because the
// queue module is in an import cycle with crypto.
export const EventsQueues = {
  flush: "event-outbox-flush" as QueueName.EventOutboxFlush,
  flushJob: "event-outbox-flush-job" as QueueJobs.EventOutboxFlush
};

export class FlushQueue {
  constructor(private readonly queueService: Pick<TDomainQueue, "queue">) {}

  // The job id is the consumer, so one flush runs per consumer and a repeat enqueue is deduped. Retry state
  // lives on the row, so BullMQ gets a single attempt.
  async enqueue(consumer: string): Promise<void> {
    await this.queueService.queue(
      EventsQueues.flush,
      EventsQueues.flushJob,
      { consumer },
      {
        jobId: `outbox-flush-${consumer}`,
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 1
      }
    );
  }
}
