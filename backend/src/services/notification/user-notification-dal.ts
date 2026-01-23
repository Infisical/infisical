import knex from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError, GatewayTimeoutError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { QueueName } from "@app/queue";

export type TUserNotificationDALFactory = ReturnType<typeof userNotificationDALFactory>;

const QUERY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const PRUNE_BATCH_SIZE = 10000;
const MAX_RETRY_ON_FAILURE = 3;

export const userNotificationDALFactory = (db: TDbClient) => {
  const notificationOrm = ormify(db, TableName.UserNotifications);

  const find = async (
    {
      userId,
      orgId,
      startDate,
      endDate,
      limit = 1000,
      offset = 0
    }: {
      userId: string;
      orgId: string;
      startDate: string;
      endDate: string;
      limit?: number;
      offset?: number;
    },
    tx?: knex.Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.UserNotifications)
        .where(`${TableName.UserNotifications}.userId`, userId)
        .andWhere((qb) => {
          void qb
            .where(`${TableName.UserNotifications}.orgId`, orgId)
            .orWhereNull(`${TableName.UserNotifications}.orgId`);
        })
        .whereRaw(`"${TableName.UserNotifications}"."createdAt" >= ?::timestamptz`, [startDate])
        .andWhereRaw(`"${TableName.UserNotifications}"."createdAt" < ?::timestamptz`, [endDate])
        .select(selectAllTableCols(TableName.UserNotifications))
        .limit(limit)
        .offset(offset)
        .orderBy(`${TableName.UserNotifications}.createdAt`, "desc")
        .timeout(1000 * 120); // 2 minutes timeout

      return docs;
    } catch (error) {
      if (error instanceof knex.KnexTimeoutError) {
        throw new GatewayTimeoutError({
          error,
          message: "Failed to fetch notifications due to timeout."
        });
      }

      throw new DatabaseError({ error });
    }
  };

  // delete all notifications older than 3 months
  const pruneNotifications = async () => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    let deletedNotificationIds: { id: string }[] = [];
    let numberOfRetryOnFailure = 0;

    logger.info(`${QueueName.DailyResourceCleanUp}: prune notifications started`);
    do {
      try {
        // eslint-disable-next-line no-await-in-loop
        deletedNotificationIds = await db.transaction(async (trx) => {
          await trx.raw(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`);

          const findExpiredNotificationSubQuery = trx(TableName.UserNotifications)
            .where("createdAt", "<", threeMonthsAgo)
            .orderBy(`${TableName.UserNotifications}.createdAt`, "desc")
            .select("id")
            .limit(PRUNE_BATCH_SIZE);

          // eslint-disable-next-line no-await-in-loop
          const results = await trx(TableName.UserNotifications)
            .whereIn("id", findExpiredNotificationSubQuery)
            .del()
            .returning("id");

          return results;
        });

        numberOfRetryOnFailure = 0;
      } catch (error) {
        numberOfRetryOnFailure += 1;
        deletedNotificationIds = [];
        logger.error(error, "Failed to delete notification on pruning. Retrying...");
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
      }
    } while (
      deletedNotificationIds.length > 0 ||
      (numberOfRetryOnFailure > 0 && numberOfRetryOnFailure < MAX_RETRY_ON_FAILURE)
    );

    if (numberOfRetryOnFailure >= MAX_RETRY_ON_FAILURE) {
      logger.error(
        `${QueueName.DailyResourceCleanUp}: prune notifications completed with persistent errors after ${MAX_RETRY_ON_FAILURE} retries. Some notifications might not have been pruned.`
      );
    } else {
      logger.info(`${QueueName.DailyResourceCleanUp}: prune notifications completed`);
    }
  };

  const markAllNotificationsAsRead = async (userId: string, orgId: string) => {
    await db(TableName.UserNotifications)
      .where({ userId })
      .andWhere((qb) => {
        void qb.where({ orgId }).orWhereNull("orgId");
      })
      .update({ isRead: true });
  };

  return { ...notificationOrm, pruneNotifications, find, markAllNotificationsAsRead };
};
