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
        .select(db.ref("orgId").withSchema(TableName.Identity).as("identityScopeOrgId"))
        .first();

      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "IdAccessTokenFindOne" });
    }
  };

  const removeExpiredTokens = async (tx?: Knex) => {
    logger.info(`${QueueName.DailyResourceCleanUp}: remove expired access token started`);

    const BATCH_SIZE = 10000;
    const MAX_RETRY_ON_FAILURE = 3;
    const QUERY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    const MAX_TTL = 315_360_000; // Maximum TTL value in seconds (10 years)

    let deletedTokenIds: { id: string }[] = [];
    let numberOfRetryOnFailure = 0;
    let isRetrying = false;

    const getExpiredTokensQuery = (dbClient: Knex | Knex.Transaction) =>
      dbClient(TableName.IdentityAccessToken)
        .where({
          isAccessTokenRevoked: true
        })
        .orWhere((qb) => {
          void qb
            .where("accessTokenNumUsesLimit", ">", 0)
            .andWhere(
              "accessTokenNumUses",
              ">=",
              db.ref("accessTokenNumUsesLimit").withSchema(TableName.IdentityAccessToken)
            );
        })
        .orWhere((qb) => {
          void qb.where("accessTokenTTL", ">", 0).andWhereRaw(
            `
              -- Check if the token's effective expiration time has passed.
              -- The expiration time is calculated by adding its TTL to its last renewal/creation time.
              COALESCE(
                "${TableName.IdentityAccessToken}"."accessTokenLastRenewedAt", -- Use last renewal time if available
                "${TableName.IdentityAccessToken}"."createdAt"                 -- Otherwise, use creation time
              )
              + make_interval(
                  secs => LEAST(
                    "${TableName.IdentityAccessToken}"."accessTokenTTL",      -- Token's specified TTL
                    ?                                                         -- Capped by MAX_TTL (parameterized value)
                  )
                )
              < NOW()                                                         -- Check if the calculated time is before now
              `,
            [MAX_TTL]
          );
        });

    do {
      try {
        const deleteBatch = async (dbClient: Knex | Knex.Transaction) => {
          const idsToDeleteQuery = getExpiredTokensQuery(dbClient).select("id").limit(BATCH_SIZE);
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
      } catch (error) {
        numberOfRetryOnFailure += 1;
        logger.error(error, "Failed to delete a batch of expired identity access tokens on pruning");
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 10); // time to breathe for db
        });
      }
      isRetrying = numberOfRetryOnFailure > 0;
    } while (deletedTokenIds.length > 0 || (isRetrying && numberOfRetryOnFailure < MAX_RETRY_ON_FAILURE));

    if (numberOfRetryOnFailure >= MAX_RETRY_ON_FAILURE) {
      logger.error(
        `IdentityAccessTokenPrune: Pruning failed and stopped after ${MAX_RETRY_ON_FAILURE} consecutive retries.`
      );
    }

    logger.info(`${QueueName.DailyResourceCleanUp}: remove expired access token completed`);
  };

  return { ...identityAccessTokenOrm, findOne, removeExpiredTokens };
};
