// weird commonjs-related error in the CI requires us to do the import like this
import knex from "knex";
import { v4 as uuidv4 } from "uuid";

import { TDbClient } from "@app/db";
import { TableName, TAuditLogs, TAuditLogsInsert } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { DatabaseError, GatewayTimeoutError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";
import { ormify, selectAllTableCols, TOrmify } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";

import { ACTOR_TYPE_TO_METADATA_ID_KEY, EventType, filterableSecretEvents } from "./audit-log-types";

type TAggregateQuery = {
  orgId: string;
  projectId: string;
  eventTypes: EventType[];
  startDate: string;
  endDate: string;
};

export type TSecretReadActivityQuery = {
  orgId: string;
  projectId: string;
  environment: string;
  secretPath: string;
  secretId: string;
  // Only used to attribute rows written before the secret id was recorded; see applySecretReadFilters.
  secretKey: string;
  startDate: string;
  endDate: string;
};

export type TSecretReadActivityRow = {
  actor: string;
  actorId: string | null;
  label: string | null;
  authMethod: string | null;
  clients: (string | null)[] | null;
  // A single-secret read names the key it returned; a bulk read only names the folder, so the two
  // counts cannot be added together and are kept apart all the way to the UI.
  exactReadCount: number;
  folderReadCount: number;
  lastReadAt: Date;
  // The auth details of whatever was behind a machine identity, one entry per distinct caller. Only AWS,
  // Kubernetes and OIDC auth record these; token auth has nothing to record.
  awsCallers: unknown[] | null;
  kubernetesCallers: unknown[] | null;
  oidcCallers: unknown[] | null;
};

export interface TAuditLogDALFactory extends Omit<TOrmify<TableName.AuditLog>, "find"> {
  pruneAuditLog: () => Promise<void>;
  getApproximateRowCount: () => Promise<number>;
  batchCreate: (logs: TAuditLogsInsert[]) => Promise<void>;
  find: (
    arg: Omit<TFindQuery, "actor" | "eventType"> & {
      actorId?: string | undefined;
      actorType?: ActorType | undefined;
      secretPath?: string | undefined;
      secretKey?: string | undefined;
      eventType?: EventType[] | undefined;
      eventMetadata?: Record<string, string> | undefined;
      pamScope?: TPamAuditLogScope | undefined;
    },
    tx?: knex.Knex
  ) => Promise<TAuditLogs[]>;
  countByDateAndActor: (
    arg: TAggregateQuery,
    tx?: knex.Knex
  ) => Promise<{ date: string; actor: string; actorMetadata: unknown; count: number }[]>;
  countByIpAddress: (arg: TAggregateQuery, tx?: knex.Knex) => Promise<{ ipAddress: string; count: number }[]>;
  aggregateSecretReadActivity: (arg: TSecretReadActivityQuery, tx?: knex.Knex) => Promise<TSecretReadActivityRow[]>;
  findLastSecretReadBefore: (
    arg: Omit<TSecretReadActivityQuery, "startDate"> & { floorDate: string },
    tx?: knex.Knex
  ) => Promise<{ actor: string; actorId: string | null; lastReadAt: Date }[]>;
  countByAuthMethod: (
    arg: TAggregateQuery,
    tx?: knex.Knex
  ) => Promise<{ actor: string; actorMetadata: unknown; count: number }[]>;
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

export type TPamAuditLogScope = {
  accountIds: string[];
  folderIds: string[];
  includeProductLevel: boolean;
};

const QUERY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const AUDIT_LOG_PRUNE_BATCH_SIZE = 10000;
const MAX_RETRY_ON_FAILURE = 3;
const AUDIT_LOG_BATCH_INSERT_CHUNK_SIZE = 1000;

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
      eventMetadata,
      pamScope
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

      // PAM resource scoping: account logs by accountId, folder logs by folderId, and resource-less
      // (product-level) logs only for product admins
      if (pamScope) {
        const metaColumn = `"${TableName.AuditLog}"."eventMetadata"`;
        const placeholders = (values: string[]) => values.map(() => "?").join(", ");
        void sqlQuery.where((scope) => {
          let matched = false;
          if (pamScope.accountIds.length) {
            matched = true;
            void scope.orWhereRaw(
              `${metaColumn}->>'accountId' IN (${placeholders(pamScope.accountIds)})`,
              pamScope.accountIds
            );
          }
          if (pamScope.folderIds.length) {
            matched = true;
            void scope.orWhere((folderScope) => {
              void folderScope
                .whereRaw(`jsonb_exists(${metaColumn}, 'folderId')`)
                .whereRaw(`NOT jsonb_exists(${metaColumn}, 'accountId')`)
                .whereRaw(`${metaColumn}->>'folderId' IN (${placeholders(pamScope.folderIds)})`, pamScope.folderIds);
            });
          }
          if (pamScope.includeProductLevel) {
            matched = true;
            void scope.orWhere((productScope) => {
              void productScope
                .whereRaw(`NOT jsonb_exists(${metaColumn}, 'accountId')`)
                .whereRaw(`NOT jsonb_exists(${metaColumn}, 'folderId')`);
            });
          }
          if (!matched) {
            void scope.whereRaw("1 = 0");
          }
        });
      }

      // Select statements
      void sqlQuery
        .select(selectAllTableCols(TableName.AuditLog))
        .limit(limit)
        .offset(offset)
        .orderBy(`${TableName.AuditLog}.createdAt`, "desc");

      // Special case: Filter by actor ID
      if (actorId) {
        const metadataKey = actorType
          ? ACTOR_TYPE_TO_METADATA_ID_KEY[actorType]
          : ACTOR_TYPE_TO_METADATA_ID_KEY[ActorType.USER];
        if (metadataKey) {
          void sqlQuery.whereRaw(`"actorMetadata" @> jsonb_build_object(?::text, ?::text)`, [metadataKey, actorId]);
        }
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

    logger.info(`daily-resource-cleanup: audit log started`);
    do {
      try {
        // eslint-disable-next-line no-await-in-loop
        deletedAuditLogIds = await db.transaction(async (trx) => {
          await trx.raw(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`);

          const findExpiredLogSubQuery = trx(TableName.AuditLog)
            .where("expiresAt", "<", today)
            .where("createdAt", "<", today) // to use audit log partition
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
    logger.info(`daily-resource-cleanup: audit log completed`);
  };

  const getApproximateRowCount: TAuditLogDALFactory["getApproximateRowCount"] = async () => {
    try {
      // Sum across parent + all partitions via pg_inherits
      const result = await db.raw<{ rows: Array<{ count: string | number }> }>(
        `SELECT COALESCE(SUM(s.n_live_tup), 0)::bigint AS count
         FROM pg_stat_user_tables s
         JOIN pg_class c ON s.relname = c.relname
         WHERE c.oid = ?::regclass
            OR c.oid IN (SELECT inhrelid FROM pg_inherits WHERE inhparent = ?::regclass)`,
        [TableName.AuditLog, TableName.AuditLog]
      );

      const count = Number(result.rows?.[0]?.count ?? 0);
      if (count > 0) return count;

      // Fallback: reltuples (handles never-analyzed tables returning -1)
      const fallback = await db.raw<{ rows: Array<{ count: string | number }> }>(
        `SELECT COALESCE(SUM(GREATEST(c.reltuples, 0)), 0)::bigint AS count
         FROM pg_class c
         WHERE c.oid = ?::regclass
            OR c.oid IN (SELECT inhrelid FROM pg_inherits WHERE inhparent = ?::regclass)`,
        [TableName.AuditLog, TableName.AuditLog]
      );
      return Number(fallback.rows?.[0]?.count ?? 0);
    } catch (error) {
      logger.error(error, "Failed to get approximate audit log row count");
      return 0;
    }
  };

  const create: TAuditLogDALFactory["create"] = async (tx) => {
    const config = getConfig();

    if (config.DISABLE_POSTGRES_AUDIT_LOG_STORAGE) {
      return {
        ...tx,
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    return auditLogOrm.create(tx);
  };

  const batchCreate: TAuditLogDALFactory["batchCreate"] = async (logs) => {
    if (logs.length === 0) return;
    if (getConfig().DISABLE_POSTGRES_AUDIT_LOG_STORAGE) return;

    try {
      await db.transaction(async (tx) => {
        for (const chunk of chunkArray(logs, AUDIT_LOG_BATCH_INSERT_CHUNK_SIZE)) {
          // eslint-disable-next-line no-await-in-loop
          await tx(TableName.AuditLog).insert(chunk).onConflict().ignore();
        }
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "auditLogBulkInsert" });
    }
  };

  const countByDateAndActor = async (
    {
      orgId,
      projectId,
      eventTypes,
      startDate,
      endDate
    }: {
      orgId: string;
      projectId: string;
      eventTypes: EventType[];
      startDate: string;
      endDate: string;
    },
    tx?: knex.Knex
  ) => {
    const rows = await (tx || db.replicaNode())(TableName.AuditLog)
      .where(`${TableName.AuditLog}.orgId`, orgId)
      .where(`${TableName.AuditLog}.projectId`, projectId)
      .whereIn(`${TableName.AuditLog}.eventType`, eventTypes)
      .whereRaw(`"${TableName.AuditLog}"."createdAt" >= ?::timestamptz`, [startDate])
      .whereRaw(`"${TableName.AuditLog}"."createdAt" < ?::timestamptz`, [endDate])
      .select(
        db.raw(`DATE("${TableName.AuditLog}"."createdAt") as date`),
        `${TableName.AuditLog}.actor`,
        `${TableName.AuditLog}.actorMetadata`
      )
      .groupByRaw(
        `DATE("${TableName.AuditLog}"."createdAt"), "${TableName.AuditLog}"."actor", "${TableName.AuditLog}"."actorMetadata"`
      )
      .select(db.raw("COUNT(*)::int as count"))
      .timeout(1000 * 120);

    return rows as { date: string; actor: string; actorMetadata: unknown; count: number }[];
  };

  const countByIpAddress = async (
    {
      orgId,
      projectId,
      eventTypes,
      startDate,
      endDate
    }: {
      orgId: string;
      projectId: string;
      eventTypes: EventType[];
      startDate: string;
      endDate: string;
    },
    tx?: knex.Knex
  ) => {
    const rows = await (tx || db.replicaNode())(TableName.AuditLog)
      .where(`${TableName.AuditLog}.orgId`, orgId)
      .where(`${TableName.AuditLog}.projectId`, projectId)
      .whereIn(`${TableName.AuditLog}.eventType`, eventTypes)
      .whereRaw(`"${TableName.AuditLog}"."createdAt" >= ?::timestamptz`, [startDate])
      .whereRaw(`"${TableName.AuditLog}"."createdAt" < ?::timestamptz`, [endDate])
      .whereNotNull(`${TableName.AuditLog}.ipAddress`)
      .select(`${TableName.AuditLog}.ipAddress`)
      .groupBy(`${TableName.AuditLog}.ipAddress`)
      .select(db.raw("COUNT(*)::int as count"))
      .timeout(1000 * 120);

    return rows as { ipAddress: string; count: number }[];
  };

  // Every actor that read one secret path in a window, with how it read (single-key versus bulk),
  // what client it used, and when it last did. This is the observed half of blast radius; the
  // entitlement half comes from the permission service.
  const ACTOR_ID_SQL = `COALESCE(
    "${TableName.AuditLog}"."actorMetadata"->>'userId',
    "${TableName.AuditLog}"."actorMetadata"->>'identityId',
    "${TableName.AuditLog}"."actorMetadata"->>'serviceId'
  )`;

  // Every way the value of one secret can leave the API. Only the bulk read is folder-precision; the
  // rest name the secret they returned, including the two dashboard events, which are how a person
  // reading a value in the web UI shows up at all.
  const SECRET_READ_EVENT_TYPES = [
    EventType.GET_SECRETS,
    EventType.GET_SECRET,
    EventType.DASHBOARD_GET_SECRET_VALUE,
    EventType.DASHBOARD_GET_SECRET_VERSION_VALUE
  ];

  // Precision is a property of the row, not of the event type: a bulk read that recorded `secretIds`
  // names this secret exactly, while one written before that field existed can only prove it covered the
  // folder. So only the second kind is folder precision, and everything else is exact.
  const FOLDER_PRECISION_SQL = `("${TableName.AuditLog}"."eventType" = ?
    AND "${TableName.AuditLog}"."eventMetadata"->'secretIds' IS NULL)`;

  const applySecretReadFilters = (
    qb: knex.Knex.QueryBuilder,
    {
      orgId,
      projectId,
      environment,
      secretPath,
      secretId,
      secretKey
    }: Omit<TSecretReadActivityQuery, "startDate" | "endDate">
  ) =>
    qb
      .where(`${TableName.AuditLog}.orgId`, orgId)
      .where(`${TableName.AuditLog}.projectId`, projectId)
      .whereIn(`${TableName.AuditLog}.eventType`, SECRET_READ_EVENT_TYPES)
      // Four branches, in order of what the row can prove about itself:
      //   1. A single read that names the secret by id. Matching on the id rather than the key survives
      //      a rename, and a version-value read carries no path to match on anyway.
      //   2. A bulk read that recorded which secrets it returned, so it names this one exactly.
      //   3. A bulk read from before `secretIds` was recorded: it only proves it covered the folder, so
      //      it matches on the path and is counted as folder precision.
      //   4. A single read from before `secretId` was recorded, falling back to path + key so that
      //      history is attributed rather than silently dropped. A fallback rather than an extra match:
      //      keys get reused, so a row that can identify itself by id must not also be matched by a key
      //      it no longer has.
      .whereRaw(
        `(
           "${TableName.AuditLog}"."eventMetadata"->>'secretId' = ?
           OR "${TableName.AuditLog}"."eventMetadata"->'secretIds' @> ?::jsonb
           OR (${FOLDER_PRECISION_SQL}
             AND "${TableName.AuditLog}"."eventMetadata"->>'environment' = ?
             AND "${TableName.AuditLog}"."eventMetadata"->>'secretPath' = ?)
           OR ("${TableName.AuditLog}"."eventMetadata"->>'secretId' IS NULL
             AND "${TableName.AuditLog}"."eventMetadata"->>'secretKey' = ?
             AND "${TableName.AuditLog}"."eventMetadata"->>'environment' = ?
             AND "${TableName.AuditLog}"."eventMetadata"->>'secretPath' = ?)
         )`,
        [
          secretId,
          JSON.stringify([secretId]),
          EventType.GET_SECRETS,
          environment,
          secretPath,
          secretKey,
          environment,
          secretPath
        ]
      );

  const aggregateSecretReadActivity: TAuditLogDALFactory["aggregateSecretReadActivity"] = async (
    { startDate, endDate, ...filters },
    tx
  ) => {
    const rows = (await applySecretReadFilters((tx || db.replicaNode())(TableName.AuditLog), filters)
      .whereRaw(`"${TableName.AuditLog}"."createdAt" >= ?::timestamptz`, [startDate])
      .whereRaw(`"${TableName.AuditLog}"."createdAt" < ?::timestamptz`, [endDate])
      .select(
        `${TableName.AuditLog}.actor`,
        db.raw(`${ACTOR_ID_SQL} as "actorId"`),
        db.raw(`COUNT(*) FILTER (WHERE NOT ${FOLDER_PRECISION_SQL})::int as "exactReadCount"`, [
          EventType.GET_SECRETS
        ]),
        db.raw(`COUNT(*) FILTER (WHERE ${FOLDER_PRECISION_SQL})::int as "folderReadCount"`, [EventType.GET_SECRETS]),
        db.raw(`MAX("${TableName.AuditLog}"."createdAt") as "lastReadAt"`),
        db.raw(`ARRAY_REMOVE(ARRAY_AGG(DISTINCT "${TableName.AuditLog}"."userAgentType"), NULL) as "clients"`),
        // The newest metadata blob wins: a renamed user or a re-authenticated identity should read
        // as its current label rather than whatever it was called on the first request in the window.
        db.raw(
          `(ARRAY_AGG(COALESCE(
             "${TableName.AuditLog}"."actorMetadata"->>'email',
             "${TableName.AuditLog}"."actorMetadata"->>'username',
             "${TableName.AuditLog}"."actorMetadata"->>'name'
           ) ORDER BY "${TableName.AuditLog}"."createdAt" DESC))[1] as "label"`
        ),
        db.raw(
          `(ARRAY_AGG("${TableName.AuditLog}"."actorMetadata"->>'authMethod' ORDER BY "${TableName.AuditLog}"."createdAt" DESC))[1] as "authMethod"`
        ),
        // Distinct rather than newest: one identity is often shared by several callers (two workflows, two
        // pods), and collapsing them to the last one would hide exactly the fan-out worth seeing.
        db.raw(
          `ARRAY_REMOVE(ARRAY_AGG(DISTINCT "${TableName.AuditLog}"."actorMetadata"->'aws'), NULL) as "awsCallers"`
        ),
        db.raw(
          `ARRAY_REMOVE(ARRAY_AGG(DISTINCT "${TableName.AuditLog}"."actorMetadata"->'kubernetes'), NULL) as "kubernetesCallers"`
        ),
        db.raw(
          `ARRAY_REMOVE(ARRAY_AGG(DISTINCT "${TableName.AuditLog}"."actorMetadata"->'oidc'), NULL) as "oidcCallers"`
        )
      )
      .groupByRaw(`"${TableName.AuditLog}"."actor", ${ACTOR_ID_SQL}`)
      .timeout(1000 * 30)) as unknown as TSecretReadActivityRow[];

    return rows;
  };

  // "No reads in 30d" and "last read 46 days ago" are different findings, and only the second one
  // tells you a consumer is holding a stale value. This reaches back past the window to tell them
  // apart, bounded by the caller's retention floor so it cannot turn into a full-table scan.
  const findLastSecretReadBefore: TAuditLogDALFactory["findLastSecretReadBefore"] = async (
    { endDate, floorDate, ...filters },
    tx
  ) => {
    const rows = (await applySecretReadFilters((tx || db.replicaNode())(TableName.AuditLog), filters)
      .whereRaw(`"${TableName.AuditLog}"."createdAt" >= ?::timestamptz`, [floorDate])
      .whereRaw(`"${TableName.AuditLog}"."createdAt" < ?::timestamptz`, [endDate])
      .select(`${TableName.AuditLog}.actor`, db.raw(`${ACTOR_ID_SQL} as "actorId"`))
      .select(db.raw(`MAX("${TableName.AuditLog}"."createdAt") as "lastReadAt"`))
      .groupByRaw(`"${TableName.AuditLog}"."actor", ${ACTOR_ID_SQL}`)
      .timeout(1000 * 30)) as unknown as { actor: string; actorId: string | null; lastReadAt: Date }[];

    return rows;
  };

  const countByAuthMethod = async (
    {
      orgId,
      projectId,
      eventTypes,
      startDate,
      endDate
    }: {
      orgId: string;
      projectId: string;
      eventTypes: EventType[];
      startDate: string;
      endDate: string;
    },
    tx?: knex.Knex
  ) => {
    const rows = await (tx || db.replicaNode())(TableName.AuditLog)
      .where(`${TableName.AuditLog}.orgId`, orgId)
      .where(`${TableName.AuditLog}.projectId`, projectId)
      .whereIn(`${TableName.AuditLog}.eventType`, eventTypes)
      .whereRaw(`"${TableName.AuditLog}"."createdAt" >= ?::timestamptz`, [startDate])
      .whereRaw(`"${TableName.AuditLog}"."createdAt" < ?::timestamptz`, [endDate])
      .select(`${TableName.AuditLog}.actor`, `${TableName.AuditLog}.actorMetadata`)
      .groupBy(`${TableName.AuditLog}.actor`, `${TableName.AuditLog}.actorMetadata`)
      .select(db.raw("COUNT(*)::int as count"))
      .timeout(1000 * 120);

    return rows as { actor: string; actorMetadata: unknown; count: number }[];
  };

  return {
    ...auditLogOrm,
    create,
    batchCreate,
    pruneAuditLog,
    getApproximateRowCount,
    find,
    countByDateAndActor,
    countByIpAddress,
    countByAuthMethod,
    aggregateSecretReadActivity,
    findLastSecretReadBefore
  };
};
