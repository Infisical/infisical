// weird commonjs-related error in the CI requires us to do the import like this
import knex from "knex";
import { v4 as uuidv4 } from "uuid";

import { TDbClient } from "@app/db";
import { TAuditLogs } from "@app/db/schemas/audit-logs";
import { TableName } from "@app/db/schemas/models";
import { getConfig } from "@app/lib/config/env";
import { DatabaseError, GatewayTimeoutError } from "@app/lib/errors";
import { ormify, selectAllTableCols, TOrmify } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { QueueName } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";

import { EventType, filterableSecretEvents } from "./audit-log-types";

export interface TAuditLogDALFactory extends Omit<TOrmify<TableName.AuditLog>, "find"> {
  pruneAuditLog: () => Promise<void>;
  find: (
    arg: Omit<TFindQuery, "actor" | "eventType"> & {
      actorId?: string | undefined;
      actorType?: ActorType | undefined;
      secretPath?: string | undefined;
      secretKey?: string | undefined;
      eventType?: EventType[] | undefined;
      eventMetadata?: Record<string, string> | undefined;
    },
    tx?: knex.Knex
  ) => Promise<TAuditLogs[]>;
}

type TFindQuery = {
  actor?: string;
  projectId?: string;
  environment?: string;
  orgId: string;
  eventType?: string;
  startDate: string;
  endDate: string;
  userAgentType?: string;
  limit?: number;
  offset?: number;
};

const QUERY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const AUDIT_LOG_PRUNE_BATCH_SIZE = 10000;
const MAX_RETRY_ON_FAILURE = 3;

export const auditLogDALFactory = (db: TDbClient) => {
  const auditLogOrm = ormify(db, TableName.AuditLog);

  const find: TAuditLogDALFactory["find"] = async (
    {
      orgId,
      projectId,
      environment,
      userAgentType,
      startDate,
      endDate,
      limit = 20,
      offset = 0,
      actorId,
      actorType,
      secretPath,
      secretKey,
      eventType,
      eventMetadata
    },
    tx
  ) => {
    try {
      // Find statements
      const sqlQuery = (tx || db.replicaNode())(TableName.AuditLog)
        .where(`${TableName.AuditLog}.orgId`, orgId)
        .whereRaw(`"${TableName.AuditLog}"."createdAt" >= ?::timestamptz`, [startDate])
        .andWhereRaw(`"${TableName.AuditLog}"."createdAt" < ?::timestamptz`, [endDate])
        // eslint-disable-next-line func-names
        .where(function () {
          if (projectId) {
            void this.where(`${TableName.AuditLog}.projectId`, projectId);
          }
        });

      if (userAgentType) {
        void sqlQuery.where("userAgentType", userAgentType);
      }

      // Select statements
      void sqlQuery
        .select(selectAllTableCols(TableName.AuditLog))
        .limit(limit)
        .offset(offset)
        .orderBy(`${TableName.AuditLog}.createdAt`, "desc");

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

      const eventIsSecretType = !eventType?.length || eventType.some((event) => filterableSecretEvents.includes(event));
      // We only want to filter for environment/secretPath/secretKey if the user is either checking for all event types

      // ? Note(daniel): use the `eventMetadata" @> ?::jsonb` approach to properly use our GIN index
      if (projectId && eventIsSecretType) {
        if (environment || secretPath) {
          // Handle both environment and secret path together to only use the GIN index once
          void sqlQuery.whereRaw(`"eventMetadata" @> ?::jsonb`, [
            JSON.stringify({
              ...(environment && { environment }),
              ...(secretPath && { secretPath })
            })
          ]);
        }

        // Handle secret key separately to include the OR condition
        if (secretKey) {
          void sqlQuery.whereRaw(
            `("eventMetadata" @> ?::jsonb
            OR "eventMetadata"->'secrets' @> ?::jsonb)`,
            [JSON.stringify({ secretKey }), JSON.stringify([{ secretKey }])]
          );
        }
      }

      // Filter by actor type
      if (actorType) {
        void sqlQuery.where("actor", actorType);
      }

      // Filter by event types
      if (eventType?.length) {
        void sqlQuery.whereIn("eventType", eventType);
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
  const pruneAuditLog: TAuditLogDALFactory["pruneAuditLog"] = async () => {
    const today = new Date();
    let deletedAuditLogIds: { id: string }[] = [];
    let numberOfRetryOnFailure = 0;
    let isRetrying = false;

    logger.info(`${QueueName.DailyResourceCleanUp}: audit log started`);
    do {
      try {
        // eslint-disable-next-line no-await-in-loop
        deletedAuditLogIds = await db.transaction(async (trx) => {
          await trx.raw(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`);

          const findExpiredLogSubQuery = trx(TableName.AuditLog)
            .where("expiresAt", "<", today)
            .where("createdAt", "<", today) // to use audit log partition
            .orderBy(`${TableName.AuditLog}.createdAt`, "desc")
            .select("id")
            .limit(AUDIT_LOG_PRUNE_BATCH_SIZE);

          // eslint-disable-next-line no-await-in-loop
          const results = await trx(TableName.AuditLog).whereIn("id", findExpiredLogSubQuery).del().returning("id");

          return results;
        });

        numberOfRetryOnFailure = 0; // reset
      } catch (error) {
        numberOfRetryOnFailure += 1;
        deletedAuditLogIds = [];
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

  const create: TAuditLogDALFactory["create"] = async (tx) => {
    const config = getConfig();

    if (config.DISABLE_AUDIT_LOG_STORAGE) {
      return {
        ...tx,
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    return auditLogOrm.create(tx);
  };

  return { ...auditLogOrm, create, pruneAuditLog, find };
};
