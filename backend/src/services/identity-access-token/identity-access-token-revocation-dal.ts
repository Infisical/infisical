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
      return (
        (await db
          .replicaNode()(TableName.IdentityAccessTokenRevocation)
          .select("id", "identityId", "revokedAt", "createdAt", "scope")
          .where("expiresAt", ">", db.fn.now())
          .where("identityId", identityId)
          // Both halves of the OR must be equality predicates so the planner can
          // serve `id IN (...)` from the PK and the `scope IN (...)` filter stays
          // selective. `scope IS NOT NULL` would force a non-sargable scan.
          .andWhere((qb) => {
            void qb.whereIn("id", [tokenId, identityId]);
            if (scopes.length > 0) {
              void qb.orWhereIn("scope", scopes);
            }
          })) as TRevocationRow[]
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "IdentityAccessTokenRevocationFindActiveForToken" });
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
    findActiveRevocationsForToken,
    removeExpiredRevocations
  };
};
