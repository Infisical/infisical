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
    queuePg: async () => {},
    schedulePg: async () => {},
    initialize: async () => {},
    shutdown: async () => undefined,
    stopRepeatableJob: async () => true,
    start: (name, jobFn) => {
      queues[name] = jobFn;
      workers[name] = jobFn;
    },
    startPg: async () => {},
    listen: (name, event) => {
      events[name] = event;
    },
    getRepeatableJobs: async () => [],
    clearQueue: async () => {},
    stopJobById: async () => {},
    stopJobByIdPg: async () => {},
    stopRepeatableJobByJobId: async () => true,
    stopRepeatableJobByKey: async () => true
  };
};
