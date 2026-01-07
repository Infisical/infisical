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

    const getExpiredTokensQuery = (dbClient: Knex | Knex.Transaction, nowTimestamp: Date) => {
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

      const expiredTTLQuery = dbClient(TableName.IdentityAccessToken)
        .where("accessTokenTTL", ">", 0)
        .andWhereRaw(
          `
            -- Check if the token's effective expiration time has passed.
            -- The expiration time is calculated by adding its TTL to its last renewal/creation time.
            (COALESCE(
              "${TableName.IdentityAccessToken}"."accessTokenLastRenewedAt", -- Use last renewal time if available
              "${TableName.IdentityAccessToken}"."createdAt"                 -- Otherwise, use creation time
            ) AT TIME ZONE 'UTC')                                            -- Convert to UTC so that it can be an immutable function for our expression index
            + make_interval(
                secs => LEAST(
                  "${TableName.IdentityAccessToken}"."accessTokenTTL",      -- Token's specified TTL
                  ?                                                         -- Capped by MAX_TTL (parameterized value)
                )
              )
            < ?::timestamptz AT TIME ZONE 'UTC'                             -- Check if the calculated time is before now (cast to UTC timestamp for comparison)
            `,
          [MAX_TTL, nowTimestamp]
        )
        .select("id");

      // Notice: we broken down the query into multiple queries and union them to avoid index usage issues.
      //         each query got their own index for better performance, therefore, if you want to change
      //         the query, you need to update the indexes accordingly to avoid performance regressions.
      return revokedTokensQuery.unionAll(exceededUsageLimitQuery).unionAll(expiredTTLQuery).distinct();
    };

    do {
      try {
        const deleteBatch = async (dbClient: Knex | Knex.Transaction) => {
          const idsToDeleteQuery = getExpiredTokensQuery(dbClient, now).limit(BATCH_SIZE);
          return dbClient(TableName.IdentityAccessToken).whereIn("id", idsToDeleteQuery).del().returning("id");
        };

        if (tx) {
          // eslint-disable-next-line no-await-in-loop
          deletedTokenIds = await deleteBatch(tx);
        } else {
          // eslint-disable-next-line no-await-in-loop
          deletedTokenIds = await db.transaction(async (trx) => {
            await trx.raw(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`);
            return deleteBatch(trx);
          });
        }

        numberOfRetryOnFailure = 0; // reset
        totalDeletedCount += deletedTokenIds.length;
      } catch (error) {
        numberOfRetryOnFailure += 1;
        logger.error(error, "Failed to delete a batch of expired identity access tokens on pruning");
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 500); // time to breathe for db
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
