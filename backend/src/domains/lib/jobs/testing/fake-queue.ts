import { QueueName } from "@app/queue";

type TQueued = { queue: QueueName; data: unknown; opts: Record<string, unknown> | undefined };

// Jobs wait until the test runs them. Same dedup id replaces the waiting job, like BullMQ's replace option.
export class FakeQueue {
  jobs: TQueued[] = [];

  handlers = new Map<QueueName, (job: { data: unknown }) => Promise<unknown>>();

  queue = async (queue: QueueName, _job: unknown, data: unknown, opts?: Record<string, unknown>) => {
    const dedupId = (opts?.deduplication as { id?: string } | undefined)?.id;
    if (dedupId) {
      this.jobs = this.jobs.filter((j) => (j.opts?.deduplication as { id?: string } | undefined)?.id !== dedupId);
    }
    this.jobs.push({ queue, data, opts });
  };

  start = (queue: QueueName, handler: (job: { data: unknown }) => Promise<unknown>) => {
    this.handlers.set(queue, handler);
  };

  schedulers = new Map<string, { queue: QueueName; every?: number; pattern?: string }>();

  upsertJobScheduler = async (queue: QueueName, schedulerId: string, repeat: { every?: number; pattern?: string }) => {
    this.schedulers.set(schedulerId, { queue, ...repeat });
  };

  // Runs a started queue's handler once, the way a scheduler tick would.
  async tick(queue: QueueName) {
    await this.handlers.get(queue)?.({ data: undefined });
  }

  // Waits for fire-and-forget enqueues, then runs every queued job once.
  async drain() {
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    const { jobs } = this;
    this.jobs = [];
    for (const job of jobs) {
      const handler = this.handlers.get(job.queue);
      // eslint-disable-next-line no-await-in-loop
      if (handler) await handler({ data: job.data });
    }
  }
}
