import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TIdentityAccessTokens } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { QueueName } from "@app/queue";

export type TIdentityAccessTokenDALFactory = ReturnType<typeof identityAccessTokenDALFactory>;

export const identityAccessTokenDALFactory = (db: TDbClient) => {
  const identityAccessTokenOrm = ormify(db, TableName.IdentityAccessToken);

  const findOne = async (filter: Partial<TIdentityAccessTokens>, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.IdentityAccessToken)
        .where(filter)
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.IdentityAccessToken}.identityId`)
        .select(selectAllTableCols(TableName.IdentityAccessToken))
        .select(db.ref("orgId").withSchema(TableName.Identity).as("identityOrgId"))
        .select(db.ref("subOrganizationId").withSchema(TableName.IdentityAccessToken).as("subOrganizationId"))
        .select(db.ref("name").withSchema(TableName.Identity).as("identityName"))
        .first();

      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "IdAccessTokenFindOne" });
    }
  };

  const removeExpiredTokens = async (tx?: Knex) => {
    logger.info(`${QueueName.FrequentResourceCleanUp}: remove expired access token started`);

    const BATCH_SIZE = 5000;
    const MAX_RETRY_ON_FAILURE = 3;
    const QUERY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    const MAX_TTL = 315_360_000; // Maximum TTL value in seconds (10 years)

    // Get the current timestamp from the database at the start of the operation
    // This ensures all queries use the same "now" value for consistency
    // Otherwise we may trap in the loop forever as there will always be new expired tokens to delete.
    const dbConnection = tx || db;
    const nowResult = await dbConnection.raw<{ rows: Array<{ now: Date }> }>(`SELECT NOW() AT TIME ZONE 'UTC' as now`);
    const { now } = nowResult.rows[0];

    let deletedTokenIds: { id: string }[] = [];
    let numberOfRetryOnFailure = 0;
    let isRetrying = false;
    let totalDeletedCount = 0;

    // Query for revoked and exceeded usage tokens (these use indexes correctly)
    const getRevokedAndExceededQuery = (dbClient: Knex | Knex.Transaction) => {
      const revokedTokensQuery = dbClient(TableName.IdentityAccessToken)
        .where({
          isAccessTokenRevoked: true
        })
        .select("id");

      const exceededUsageLimitQuery = dbClient(TableName.IdentityAccessToken)
        .where("accessTokenNumUsesLimit", ">", 0)
        .andWhere(
          "accessTokenNumUses",
          ">=",
          db.ref("accessTokenNumUsesLimit").withSchema(TableName.IdentityAccessToken)
        )
        .select("id");

      return dbClient
        .select("id")
        .from(revokedTokensQuery.unionAll(exceededUsageLimitQuery).as("revoked_and_exceeded"))
        .distinct();
    };

    // Query for TTL-expired tokens - run separately with ORDER BY + LIMIT to force index usage.
    // WHY ORDER BY: PostgreSQL's planner cannot accurately estimate selectivity for
    // "(expression) < NOW()" because NOW() is volatile and there's no histogram for computed expressions.
    // Adding ORDER BY on the indexed expression forces an Index Scan because the index is already sorted.
    // The ORDER BY must be at the same level as LIMIT to work.
    const getExpiredTTLQuery = (dbClient: Knex | Knex.Transaction, nowTimestamp: Date) => {
      return dbClient(TableName.IdentityAccessToken)
        .where("accessTokenTTL", ">", 0)
        .andWhereRaw(
          `
            (COALESCE(
              "${TableName.IdentityAccessToken}"."accessTokenLastRenewedAt",
              "${TableName.IdentityAccessToken}"."createdAt"
            ) AT TIME ZONE 'UTC')
            + make_interval(
                secs => LEAST(
                  "${TableName.IdentityAccessToken}"."accessTokenTTL",
                  ?
                )
              )
            < ?::timestamptz AT TIME ZONE 'UTC'
            `,
          [MAX_TTL, nowTimestamp]
        )
        .orderByRaw(
          `(COALESCE(
              "${TableName.IdentityAccessToken}"."accessTokenLastRenewedAt",
              "${TableName.IdentityAccessToken}"."createdAt"
            ) AT TIME ZONE 'UTC')
            + make_interval(
                secs => LEAST(
                  "${TableName.IdentityAccessToken}"."accessTokenTTL",
                  ${MAX_TTL}
                )
              )`
        )
        .select("id");
    };

    // Delete revoked and exceeded usage tokens first (these use indexes correctly)
    do {
      try {
        const deleteBatch = async (dbClient: Knex | Knex.Transaction) => {
          const idsToDeleteQuery = getRevokedAndExceededQuery(dbClient).limit(BATCH_SIZE);
          return dbClient(TableName.IdentityAccessToken).whereIn("id", idsToDeleteQuery).del().returning("id");
        };

        if (tx) {
          // eslint-disable-next-line no-await-in-loop
          deletedTokenIds = await deleteBatch(tx);
        } else {
          // eslint-disable-next-line no-await-in-loop
          deletedTokenIds = await db.transaction(async (trx) => {
            await trx.raw(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`);
            return deleteBatch(trx);
          });
        }

        numberOfRetryOnFailure = 0;
        totalDeletedCount += deletedTokenIds.length;
      } catch (error) {
        numberOfRetryOnFailure += 1;
        logger.error(error, "Failed to delete revoked/exceeded tokens on pruning");
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 500);
        });
      }
      isRetrying = numberOfRetryOnFailure > 0;
    } while (deletedTokenIds.length > 0 || (isRetrying && numberOfRetryOnFailure < MAX_RETRY_ON_FAILURE));

    // Reset for TTL deletion
    numberOfRetryOnFailure = 0;
    isRetrying = false;

    // Delete TTL-expired tokens separately with ORDER BY + LIMIT to force index usage
    do {
      try {
        const deleteBatch = async (dbClient: Knex | Knex.Transaction) => {
          // ORDER BY + LIMIT at the same level forces PostgreSQL to use the index
          const idsToDeleteQuery = getExpiredTTLQuery(dbClient, now).limit(BATCH_SIZE);
          return dbClient(TableName.IdentityAccessToken).whereIn("id", idsToDeleteQuery).del().returning("id");
        };

        if (tx) {
          // eslint-disable-next-line no-await-in-loop
          deletedTokenIds = await deleteBatch(tx);
        } else {
          // eslint-disable-next-line no-await-in-loop
          deletedTokenIds = await db.transaction(async (trx) => {
            await trx.raw(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`);
            return deleteBatch(trx);
          });
        }

        numberOfRetryOnFailure = 0;
        totalDeletedCount += deletedTokenIds.length;
      } catch (error) {
        numberOfRetryOnFailure += 1;
        logger.error(error, "Failed to delete TTL-expired tokens on pruning");
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 500);
        });
      }
      isRetrying = numberOfRetryOnFailure > 0;
    } while (deletedTokenIds.length > 0 || (isRetrying && numberOfRetryOnFailure < MAX_RETRY_ON_FAILURE));

    if (numberOfRetryOnFailure >= MAX_RETRY_ON_FAILURE) {
      logger.error(
        `IdentityAccessTokenPrune: Pruning failed and stopped after ${MAX_RETRY_ON_FAILURE} consecutive retries.`
      );
    }

    logger.info(
      `${QueueName.FrequentResourceCleanUp}: remove expired access token completed. Deleted ${totalDeletedCount} tokens.`
    );
  };

  return { ...identityAccessTokenOrm, findOne, removeExpiredTokens };
};
