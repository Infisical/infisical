import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify, TOrmify } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { QueueName } from "@app/queue";

export interface TKeyValueStoreDALFactory extends TOrmify<TableName.KeyValueStore> {
  incrementBy: (key: string, dto: { incr?: number; tx?: Knex; expiresAt?: Date }) => Promise<number>;
  findOneInt: (key: string, tx?: Knex) => Promise<number | undefined>;
  pruneExpiredKeys: () => Promise<void>;
}

const QUERY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_KEY_PRUNE_BATCH_SIZE = 10000;
const MAX_RETRY_ON_FAILURE = 3;

export const keyValueStoreDALFactory = (db: TDbClient): TKeyValueStoreDALFactory => {
  const keyValueStoreOrm = ormify(db, TableName.KeyValueStore);

  const incrementBy: TKeyValueStoreDALFactory["incrementBy"] = async (key, { incr = 1, tx, expiresAt }) => {
    return (tx || db)(TableName.KeyValueStore)
      .insert({ key, integerValue: 1, expiresAt })
      .onConflict("key")
      .merge({
        integerValue: db.raw(`"${TableName.KeyValueStore}"."integerValue" + ?`, [incr]),
        expiresAt
      })
      .returning("integerValue")
      .then((result) => Number(result[0]?.integerValue || 0));
  };

  const findOneInt: TKeyValueStoreDALFactory["findOneInt"] = async (key, tx) => {
    const doc = await (tx || db.replicaNode())(TableName.KeyValueStore)
      .where({ key })
      .andWhere(
        (builder) =>
          void builder
            .whereNull("expiresAt") // no expiry
            .orWhere("expiresAt", ">", db.fn.now()) // or not expired
      )
      .first()
      .select("integerValue");
    return Number(doc?.integerValue || 0);
  };

  const pruneExpiredKeys: TKeyValueStoreDALFactory["pruneExpiredKeys"] = async () => {
    let deletedIds: { key: string }[] = [];
    let numberOfRetryOnFailure = 0;
    let isRetrying = false;

    logger.info(`${QueueName.DailyResourceCleanUp}: db key value store clean up started`);
    do {
      try {
        // eslint-disable-next-line no-await-in-loop
        deletedIds = await db.transaction(async (trx) => {
          await trx.raw(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`);

          const findExpiredKeysSubQuery = trx(TableName.KeyValueStore)
            .where("expiresAt", "<", db.fn.now())
            .select("key")
            .limit(CACHE_KEY_PRUNE_BATCH_SIZE);

          // eslint-disable-next-line no-await-in-loop
          const results = await trx(TableName.KeyValueStore)
            .whereIn("key", findExpiredKeysSubQuery)
            .del()
            .returning("key");

          return results;
        });

        numberOfRetryOnFailure = 0; // reset
      } catch (error) {
        numberOfRetryOnFailure += 1;
        deletedIds = [];
        logger.error(error, "Failed to clean up db key value");
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 10); // time to breathe for db
        });
      }
      isRetrying = numberOfRetryOnFailure > 0;
    } while (deletedIds.length > 0 || (isRetrying && numberOfRetryOnFailure < MAX_RETRY_ON_FAILURE));
    logger.info(`${QueueName.DailyResourceCleanUp}: db key value store clean up completed`);
  };

  return { ...keyValueStoreOrm, incrementBy, findOneInt, pruneExpiredKeys };
};
