import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AuditLogsSchema, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, stripUndefinedInWhere } from "@app/lib/knex";
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
  const auditLogOrm = ormify(db, TableName.AuditLog);

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
    tx?: Knex
  ) => {
    try {
      const sqlQuery = (tx || db.replicaNode())(TableName.AuditLog)
        .where(
          stripUndefinedInWhere({
            projectId,
            [`${TableName.AuditLog}.orgId`]: orgId,
            userAgentType
          })
        )

        .leftJoin(TableName.Project, `${TableName.AuditLog}.projectId`, `${TableName.Project}.id`)

        .select(selectAllTableCols(TableName.AuditLog))

        .select(
          db.ref("name").withSchema(TableName.Project).as("projectName"),
          db.ref("slug").withSchema(TableName.Project).as("projectSlug")
        )

        .limit(limit)
        .offset(offset)
        .orderBy(`${TableName.AuditLog}.createdAt`, "desc");

      if (actorId) {
        void sqlQuery.whereRaw(`"actorMetadata"->>'userId' = ?`, [actorId]);
      }

      if (eventMetadata && Object.keys(eventMetadata).length) {
        Object.entries(eventMetadata).forEach(([key, value]) => {
          void sqlQuery.whereRaw(`"eventMetadata"->>'${key}' = ?`, [value]);
        });
      }

      if (actorType) {
        void sqlQuery.where("actor", actorType);
      }

      if (eventType?.length) {
        void sqlQuery.whereIn("eventType", eventType);
      }

      if (startDate) {
        void sqlQuery.where(`${TableName.AuditLog}.createdAt`, ">=", startDate);
      }
      if (endDate) {
        void sqlQuery.where(`${TableName.AuditLog}.createdAt`, "<=", endDate);
      }
      const docs = await sqlQuery;

      return docs.map((doc) => ({
        ...AuditLogsSchema.parse(doc),
        project: {
          name: doc.projectName,
          slug: doc.projectSlug
        }
      }));
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
