import { TQueueServiceFactory } from "@app/queue";

export const mockQueue = (): TQueueServiceFactory => {
  const queues: Record<string, unknown> = {};
  const workers: Record<string, unknown> = {};
  const job: Record<string, unknown> = {};
  const events: Record<string, unknown> = {};

  return {
    queue: async (name, jobData) => {
      job[name] = jobData;
    },
    shutdown: async () => undefined,
    stopRepeatableJob: async () => true,
    start: (name, jobFn) => {
      queues[name] = jobFn;
      workers[name] = jobFn;
    },
    listen: async (name, event) => {
      events[name] = event;
    },
    stopRepeatableJobByJobId: async () => true
  };
};
