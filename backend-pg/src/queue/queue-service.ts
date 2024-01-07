import { Job, JobsOptions, Queue, Worker, WorkerListener } from "bullmq";
import Redis from "ioredis";

export enum QueueName {
  SecretRotation = "secret-rotation"
}

export enum QueueJobs {
  SecretRotation = "secret-rotation-job"
}

export type TQueueJobTypes = {
  [QueueName.SecretRotation]: {
    payload: { rotationId: string };
    name: QueueJobs.SecretRotation;
  };
};

export type TQueueServiceFactory = ReturnType<typeof queueServiceFactory>;
export const queueServiceFactory = (redisUrl: string) => {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queueContainer: Record<
    QueueName,
    Queue<TQueueJobTypes[QueueName]["payload"], void, TQueueJobTypes[QueueName]["name"]>
  > = {} as any;
  const workerContainer: Record<
    QueueName,
    Worker<TQueueJobTypes[QueueName]["payload"], void, TQueueJobTypes[QueueName]["name"]>
  > = {} as any;

  const start = <T extends QueueName>(
    name: T,
    jobFn: (
      job: Job<TQueueJobTypes[T]["payload"], void, TQueueJobTypes[T]["name"]>
    ) => Promise<void>
  ) => {
    if (queueContainer[name]) {
      throw new Error(`${name} queue is already initialized`);
    }

    queueContainer[name] = new Queue<TQueueJobTypes[T]["payload"], void, TQueueJobTypes[T]["name"]>(
      name as string,
      { connection }
    );
    workerContainer[name] = new Worker<
      TQueueJobTypes[T]["payload"],
      void,
      TQueueJobTypes[T]["name"]
    >(name, jobFn, { connection });
  };

  const listen = async <
    T extends QueueName,
    U extends keyof WorkerListener<TQueueJobTypes[T]["payload"], void, TQueueJobTypes[T]["name"]>
  >(
    name: T,
    event: U,
    listener: WorkerListener<TQueueJobTypes[T]["payload"], void, TQueueJobTypes[T]["name"]>[U]
  ) => {
    const worker = workerContainer[name];
    worker.on(event, listener);
  };

  const queue = async <T extends QueueName>(
    name: T,
    job: TQueueJobTypes[T]["name"],
    data: TQueueJobTypes[T]["payload"],
    opts: JobsOptions & { jobId: string }
  ) => {
    const q = queueContainer[name];
    await q.add(job, data, opts);
  };

  const stopRepeatableJob = async <T extends QueueName>(name: T, jobId: string) => {
    const q = queueContainer[name];
    const job = await q.getJob(jobId);
    if (!job) return true;
    if (!job.repeatJobKey) return true;
    return q.removeRepeatableByKey(job.repeatJobKey);
  };

  const shutdown = async () => {
    await Promise.all(Object.values(workerContainer).map((worker) => worker.close()));
  };

  return { start, listen, queue, shutdown, stopRepeatableJob };
};
