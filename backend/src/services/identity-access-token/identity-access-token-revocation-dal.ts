import { TDbClient } from "@app/db";
import { TableName, TIdentityAccessTokenRevocations } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

type TRevocationRow = Pick<TIdentityAccessTokenRevocations, "id" | "identityId" | "revokedAt" | "createdAt">;

export type TIdentityAccessTokenRevocationDALFactory = ReturnType<typeof identityAccessTokenRevocationDALFactory>;

// `id` is set explicitly: JWT jti for per-token revocations, identityId for
// revoke-all sentinels. `revokedAt` is populated only for sentinels so runtime
// validation can compare the JWT iat against the exact revocation time.
type TInsertRevocationInput = {
  id: string;
  identityId: string;
  expiresAt: Date;
  revokedAt?: Date | null;
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
          updatedAt: db.fn.now()
        });
    } catch (error) {
      throw new DatabaseError({ error, name: "IdentityAccessTokenRevocationInsert" });
    }
  };

  const findActiveRevocationsForToken = async ({
    tokenId,
    identityId
  }: {
    tokenId: string;
    identityId: string;
  }): Promise<TRevocationRow[]> => {
    try {
      return (
        (await db
          .replicaNode()(TableName.IdentityAccessTokenRevocation)
          .select("id", "identityId", "revokedAt", "createdAt")
          .where("expiresAt", ">", db.fn.now())
          .where("identityId", identityId)
          // Revoke-all uses identityId as id
          .whereIn("id", [tokenId, identityId])) as TRevocationRow[]
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
