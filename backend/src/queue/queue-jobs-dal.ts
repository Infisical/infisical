import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TQueueJobsDALFactory = ReturnType<typeof queueJobsDALFactory>;

export const queueJobsDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.QueueJobs);
  return orm;
};
