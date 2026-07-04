import { TDbClient } from "@app/db";
import { TableName, TIdentityAccessTokenRevocations } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

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

  // Returns every active revocation marker for an identity, regardless of token/scope.
  // Callers filter the returned set in-app; keeping the query keyed only on identityId
  // lets the result be cached and invalidated per-identity.
  //
  // Reads the PRIMARY (not replicaNode): this fills a Redis cache that a revoke just
  // invalidated, so a replica read lagging behind the revoke insert would cache a stale
  // "no revocation" set for the full TTL and silently un-revoke the token. The cache
  // absorbs the per-request load, so this runs at most ~once per identity per TTL.
  const findActiveRevocationsForIdentity = async (identityId: string): Promise<TRevocationRow[]> => {
    try {
      return (await db(TableName.IdentityAccessTokenRevocation)
        .select("id", "identityId", "revokedAt", "createdAt", "scope")
        .where("expiresAt", ">", db.fn.now())
        .where("identityId", identityId)) as TRevocationRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "IdentityAccessTokenRevocationFindActiveForIdentity" });
    }
  };

  const removeExpiredRevocations = async () => {
    try {
      await db(TableName.IdentityAccessTokenRevocation).where("expiresAt", "<", db.fn.now()).delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "IdentityAccessTokenRevocationRemoveExpired" });
    }
  };

  return {
    insertRevocation,
    findActiveRevocationsForIdentity,
    removeExpiredRevocations
  };
};
