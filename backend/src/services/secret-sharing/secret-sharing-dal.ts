import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretSharing } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretSharingDALFactory = ReturnType<typeof secretSharingDALFactory>;

export const secretSharingDALFactory = (db: TDbClient) => {
  const sharedSecretOrm = ormify(db, TableName.SecretSharing);

  const pruneExpiredSharedSecrets = async (tx?: Knex) => {
    try {
      const today = new Date();
      const docs = await (tx || db)(TableName.SecretSharing)
        .where("expiresAt", "<", today)
        .andWhere("encryptedValue", "<>", "")
        .update({
          encryptedValue: "",
          tag: "",
          iv: "",
          hashedHex: ""
        });
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "pruneExpiredSharedSecrets" });
    }
  };

  const findActiveSharedSecrets = async (filters: Partial<TSecretSharing>, tx?: Knex) => {
    try {
      const now = new Date();
      return await (tx || db)(TableName.SecretSharing)
        .where(filters)
        .andWhere("expiresAt", ">", now)
        .andWhere("encryptedValue", "<>", "")
        .select(selectAllTableCols(TableName.SecretSharing))
        .orderBy("expiresAt", "asc");
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Find Active Shared Secrets"
      });
    }
  };

  const softDeleteById = async (id: string) => {
    try {
      await sharedSecretOrm.updateById(id, {
        encryptedValue: "",
        iv: "",
        tag: "",
        hashedHex: ""
      });
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Soft Delete Shared Secret"
      });
    }
  };

  return {
    ...sharedSecretOrm,
    pruneExpiredSharedSecrets,
    softDeleteById,
    findActiveSharedSecrets
  };
};
