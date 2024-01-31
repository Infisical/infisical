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
    listen: (name, event) => {
      events[name] = event;
    },
    clearQueue: async () => {},
    stopJobById: async () => {},
    stopRepeatableJobByJobId: async () => true
  };
};
