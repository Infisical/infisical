import { TDbClient } from "@app/db";
import { TableName, TQueueJobs } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { QueueName } from "@app/queue";

import { PersistanceQueueStatus } from "./queue-types";

const QUEUE_JOBS_PRUNE_BATCH_SIZE = 10000;
const MAX_RETRY_ON_FAILURE = 3;

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
      .where("status", PersistanceQueueStatus.Processing)
      .where("queueName", queueName)
      .whereRaw(`(NOW() - COALESCE("lastHeartBeat", "updatedAt")) > INTERVAL '1 millisecond' * ?`, [thresholdMs]);

    return result as TQueueJobs[];
  };

  const updateJobFailure = async (queueName: string, jobId: string, error: string) => {
    const job = await db(TableName.QueueJobs)
      .where("jobId", jobId)
      .where("queueName", queueName)
      .update({
        attempts: db.raw("attempts + 1") as unknown as number,
        errorMessage: error.slice(0, 1000),
        status: db.raw(
          `
        CASE 
          WHEN "attempts" + 1 >= "maxAttempts" THEN ?
          ELSE ?
        END
      `,
          [PersistanceQueueStatus.Dead, PersistanceQueueStatus.Failed]
        ) as unknown as string
      });
    return job;
  };

  // delete all queue jobs that are dead or completed
  const pruneQueueJobs = async () => {
    let deletedJobIds: { id: string }[] = [];
    let numberOfRetryOnFailure = 0;
    let isRetrying = false;

    logger.info(`${QueueName.DailyResourceCleanUp}: queue jobs cleanup started`);
    do {
      try {
        const findCompletedOrDeadJobsSubQuery = db(TableName.QueueJobs)
          .whereIn("status", [PersistanceQueueStatus.Completed, PersistanceQueueStatus.Dead])
          .select("id")
          .limit(QUEUE_JOBS_PRUNE_BATCH_SIZE);

        // eslint-disable-next-line no-await-in-loop
        deletedJobIds = await db(TableName.QueueJobs)
          .whereIn("id", findCompletedOrDeadJobsSubQuery)
          .del()
          .returning("id");

        numberOfRetryOnFailure = 0; // reset
      } catch (error) {
        numberOfRetryOnFailure += 1;
        deletedJobIds = [];
        logger.error(error, "Failed to delete queue jobs on pruning");
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 10); // time to breathe for db
        });
      }
      isRetrying = numberOfRetryOnFailure > 0;
    } while (deletedJobIds.length > 0 || (isRetrying && numberOfRetryOnFailure < MAX_RETRY_ON_FAILURE));
    logger.info(`${QueueName.DailyResourceCleanUp}: queue jobs cleanup completed`);
  };

  return { ...orm, findStuckJobsByQueue, updateJobFailure, pruneQueueJobs };
};
