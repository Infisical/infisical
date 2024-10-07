// weird commonjs-related error in the CI requires us to do the import like this
import knex from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError, GatewayTimeoutError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { QueueName } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";

import { EventType } from "./audit-log-types";

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
  const auditLogOrm = ormify(db, TableName.PartitionedAuditLog);

  const find = async (
    {
      orgId,
      projectId,
      userAgentType,
      startDate,
      endDate,
      limit = 20,
      offset = 0,
      actorId,
      actorType,
      eventType,
      eventMetadata
    }: Omit<TFindQuery, "actor" | "eventType"> & {
      actorId?: string;
      actorType?: ActorType;
      eventType?: EventType[];
      eventMetadata?: Record<string, string>;
    },
    tx?: knex.Knex
  ) => {
    if (!orgId && !projectId) {
      throw new Error("Either orgId or projectId must be provided");
    }

    try {
      // Find statements
      const sqlQuery = (tx || db.replicaNode())(TableName.PartitionedAuditLog)
        // eslint-disable-next-line func-names
        .where(function () {
          if (orgId) {
            void this.where(`${TableName.PartitionedAuditLog}.orgId`, orgId);
          } else if (projectId) {
            void this.where(`${TableName.PartitionedAuditLog}.projectId`, projectId);
          }
        });

      if (userAgentType) {
        void sqlQuery.where("userAgentType", userAgentType);
      }

      // Select statements
      void sqlQuery
        .select(selectAllTableCols(TableName.PartitionedAuditLog))
        .limit(limit)
        .offset(offset)
        .orderBy(`${TableName.PartitionedAuditLog}.createdAt`, "desc");

      // Special case: Filter by actor ID
      if (actorId) {
        void sqlQuery.whereRaw(`"actorMetadata" @> jsonb_build_object('userId', ?::text)`, [actorId]);
      }

      // Special case: Filter by key/value pairs in eventMetadata field
      if (eventMetadata && Object.keys(eventMetadata).length) {
        Object.entries(eventMetadata).forEach(([key, value]) => {
          void sqlQuery.whereRaw(`"eventMetadata" @> jsonb_build_object(?::text, ?::text)`, [key, value]);
        });
      }

      // Filter by actor type
      if (actorType) {
        void sqlQuery.where("actor", actorType);
      }

      // Filter by event types
      if (eventType?.length) {
        void sqlQuery.whereIn("eventType", eventType);
      }

      // Filter by date range
      if (startDate) {
        void sqlQuery.where(`${TableName.PartitionedAuditLog}.createdAt`, ">=", startDate);
      }
      if (endDate) {
        void sqlQuery.where(`${TableName.PartitionedAuditLog}.createdAt`, "<=", endDate);
      }

      // we timeout long running queries to prevent DB resource issues (2 minutes)
      const docs = await sqlQuery.timeout(1000 * 120);

      return docs;
    } catch (error) {
      if (error instanceof knex.KnexTimeoutError) {
        throw new GatewayTimeoutError({
          error,
          message: "Failed to fetch audit logs due to timeout. Add more search filters."
        });
      }

      throw new DatabaseError({ error });
    }
  };

  // delete all audit log that have expired
  const pruneAuditLog = async (tx?: knex.Knex) => {
    const AUDIT_LOG_PRUNE_BATCH_SIZE = 10000;
    const MAX_RETRY_ON_FAILURE = 3;

    const today = new Date();
    let deletedAuditLogIds: { id: string }[] = [];
    let numberOfRetryOnFailure = 0;
    let isRetrying = false;

    logger.info(`${QueueName.DailyResourceCleanUp}: audit log started`);
    do {
      try {
        const findExpiredLogSubQuery = (tx || db)(TableName.PartitionedAuditLog)
          .where("expiresAt", "<", today)
          .select("id")
          .limit(AUDIT_LOG_PRUNE_BATCH_SIZE);

        // eslint-disable-next-line no-await-in-loop
        deletedAuditLogIds = await (tx || db)(TableName.PartitionedAuditLog)
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
