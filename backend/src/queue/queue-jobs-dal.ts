import { TDbClient } from "@app/db";
import { TableName, TQueueJobs } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TQueueJobsDALFactory = ReturnType<typeof queueJobsDALFactory>;

export const queueJobsDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.QueueJobs);

  /**
   * Find stuck processing jobs for a specific queue using COALESCE(lastHeartBeat, updatedAt)
   * A job is considered stuck if the time since last heartbeat (or update) exceeds the threshold
   */
  const findStuckJobsByQueue = async (queueName: string, thresholdMs: number): Promise<TQueueJobs[]> => {
    const result = await db<TQueueJobs>(TableName.QueueJobs)
      .select("*")
      .where("status", "processing")
      .where("queueName", queueName)
      .whereRaw(`(NOW() - COALESCE("lastHeartBeat", "updatedAt")) > INTERVAL '1 millisecond' * ?`, [thresholdMs]);

    return result as TQueueJobs[];
  };

  return { ...orm, findStuckJobsByQueue };
};
