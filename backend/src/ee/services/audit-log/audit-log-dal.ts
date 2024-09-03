import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, stripUndefinedInWhere } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { QueueName } from "@app/queue";

export type TAuditLogDALFactory = ReturnType<typeof auditLogDALFactory>;

type TFindQuery = {
  actor?: string;
  projectId?: string;
  orgId?: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  userAgentType?: string;
  limit?: number;
  offset?: number;
};

export const auditLogDALFactory = (db: TDbClient) => {
  const auditLogOrm = ormify(db, TableName.AuditLog);

  const find = async (
    { orgId, projectId, userAgentType, startDate, endDate, limit = 20, offset = 0, actor, eventType }: TFindQuery,
    tx?: Knex
  ) => {
    try {
      const sqlQuery = (tx || db.replicaNode())(TableName.AuditLog)
        .where(
          stripUndefinedInWhere({
            projectId,
            orgId,
            eventType,
            actor,
            userAgentType
          })
        )
        .limit(limit)
        .offset(offset)
        .orderBy("createdAt", "desc");
      if (startDate) {
        void sqlQuery.where("createdAt", ">=", startDate);
      }
      if (endDate) {
        void sqlQuery.where("createdAt", "<=", endDate);
      }
      const docs = await sqlQuery;
      return docs;
    } catch (error) {
      throw new DatabaseError({ error });
    }
  };

  // delete all audit log that have expired
  const pruneAuditLog = async (tx?: Knex) => {
    const AUDIT_LOG_PRUNE_BATCH_SIZE = 10000;
    const MAX_RETRY_ON_FAILURE = 3;

    const today = new Date();
    let deletedAuditLogIds: { id: string }[] = [];
    let numberOfRetryOnFailure = 0;
    let isRetrying = false;

    logger.info(`${QueueName.DailyResourceCleanUp}: audit log started`);
    do {
      try {
        const findExpiredLogSubQuery = (tx || db)(TableName.AuditLog)
          .where("expiresAt", "<", today)
          .select("id")
          .limit(AUDIT_LOG_PRUNE_BATCH_SIZE);
        // eslint-disable-next-line no-await-in-loop
        deletedAuditLogIds = await (tx || db)(TableName.AuditLog)
          .whereIn("id", findExpiredLogSubQuery)
          .del()
          .returning("id");
        numberOfRetryOnFailure = 0; // reset
      } catch (error) {
        numberOfRetryOnFailure += 1;
        logger.error(error, "Failed to delete audit log on pruning");
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 10); // time to breathe for db
        });
      }
      isRetrying = numberOfRetryOnFailure > 0;
    } while (deletedAuditLogIds.length > 0 || (isRetrying && numberOfRetryOnFailure < MAX_RETRY_ON_FAILURE));
    logger.info(`${QueueName.DailyResourceCleanUp}: audit log completed`);
  };

  return { ...auditLogOrm, pruneAuditLog, find };
};
