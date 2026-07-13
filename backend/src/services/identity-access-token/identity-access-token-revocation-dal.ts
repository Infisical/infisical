import { TDbClient } from "@app/db";
import { TableName, TIdentityAccessTokenRevocations } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

type TRevocationRow = Pick<TIdentityAccessTokenRevocations, "id" | "identityId" | "revokedAt" | "createdAt" | "scope">;

export type TIdentityAccessTokenRevocationDALFactory = ReturnType<typeof identityAccessTokenRevocationDALFactory>;

// `id` is set explicitly: JWT jti for per-token revocations, identityId for
// revoke-all sentinels, random UUID for scoped markers. `revokedAt` is populated
// for every marker except per-token revocations so runtime validation can compare
// the JWT iat against the exact revocation time. `scope` is null for legacy
// (per-token / identity-wide) markers and holds the scope key (clientSecretId or
// IdentityAuthMethod string) for scoped markers.
type TInsertRevocationInput = {
  id: string;
  identityId: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  scope?: string | null;
};

const QUERY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const REVOCATION_PRUNE_BATCH_SIZE = 10000;
const MAX_RETRY_ON_FAILURE = 3;

export const identityAccessTokenRevocationDALFactory = (db: TDbClient) => {
  const insertRevocation = async (row: TInsertRevocationInput) => {
    try {
      await db(TableName.IdentityAccessTokenRevocation)
        .insert(row)
        .onConflict(["id"])
        .merge({
          identityId: row.identityId,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt ?? null,
          scope: row.scope ?? null,
          updatedAt: db.fn.now()
        });
    } catch (error) {
      throw new DatabaseError({ error, name: "IdentityAccessTokenRevocationInsert" });
    }
  };

  const findActiveRevocationsForToken = async ({
    tokenId,
    identityId,
    scopes
  }: {
    tokenId: string;
    identityId: string;
    scopes: string[];
  }): Promise<TRevocationRow[]> => {
    try {
      // Equality-only UNION ALL arms so each serves from its own index (id arm
      // from the PK, scope arm from the partial (identityId, scope) index)
      // instead of scanning (identityId, expiresAt) across a high-volume
      // identity's markers. Arms are disjoint and the caller tolerates duplicates, so no
      // dedup is needed. Reads the primary because this runs on a cache miss or
      // Redis fail-open, where a lagging replica could return a stale result.
      let query = db(TableName.IdentityAccessTokenRevocation)
        .select("id", "identityId", "revokedAt", "createdAt", "scope")
        .where("identityId", identityId)
        .where("expiresAt", ">", db.fn.now())
        .whereIn("id", [tokenId, identityId]);

      if (scopes.length > 0) {
        const scopeArm = db(TableName.IdentityAccessTokenRevocation)
          .select("id", "identityId", "revokedAt", "createdAt", "scope")
          .where("identityId", identityId)
          .where("expiresAt", ">", db.fn.now())
          .whereIn("scope", scopes);

        query = query.unionAll([scopeArm]);
      }

      return (await query) as TRevocationRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "IdentityAccessTokenRevocationFindActiveForToken" });
    }
  };

  // Batched: an unbounded DELETE on this high-volume table holds long locks and bursts WAL.
  const removeExpiredRevocations = async () => {
    let deletedRevocationIds: { id: string }[] = [];
    let numberOfRetryOnFailure = 0;
    let isRetrying = false;
    let totalDeletedCount = 0;

    logger.info(`resource-cleanup: remove expired identity access token revocations started`);
    do {
      try {
        // eslint-disable-next-line no-await-in-loop
        deletedRevocationIds = await db.transaction(async (trx) => {
          await trx.raw(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`);

          const findExpiredRevocationsSubQuery = trx(TableName.IdentityAccessTokenRevocation)
            .where("expiresAt", "<", db.fn.now())
            .select("id")
            .limit(REVOCATION_PRUNE_BATCH_SIZE);

          // eslint-disable-next-line no-await-in-loop
          const results = await trx(TableName.IdentityAccessTokenRevocation)
            .whereIn("id", findExpiredRevocationsSubQuery)
            .del()
            .returning("id");

          // table isn't in the knex table-type map, so the query resolves to any[]
          return results as { id: string }[];
        });

        numberOfRetryOnFailure = 0;
        totalDeletedCount += deletedRevocationIds.length;
      } catch (error) {
        numberOfRetryOnFailure += 1;
        deletedRevocationIds = [];
        logger.error(error, "Failed to delete a batch of expired identity access token revocations on pruning");
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 10); // time to breathe for db
        });
      }
      isRetrying = numberOfRetryOnFailure > 0;
    } while (deletedRevocationIds.length > 0 || (isRetrying && numberOfRetryOnFailure < MAX_RETRY_ON_FAILURE));

    if (numberOfRetryOnFailure >= MAX_RETRY_ON_FAILURE) {
      logger.error(
        `resource-cleanup: remove expired identity access token revocations completed with persistent errors after ${MAX_RETRY_ON_FAILURE} retries. Deleted ${totalDeletedCount} revocations; some might not have been pruned.`
      );
      return totalDeletedCount;
    }

    logger.info(
      `resource-cleanup: remove expired identity access token revocations completed. Deleted ${totalDeletedCount} revocations.`
    );
    return totalDeletedCount;
  };

  return {
    insertRevocation,
    findActiveRevocationsForToken,
    removeExpiredRevocations
  };
};
