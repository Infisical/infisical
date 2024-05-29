import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TSecretSharingDALFactory = ReturnType<typeof secretSharingDALFactory>;

export const secretSharingDALFactory = (db: TDbClient) => {
  const sharedSecretOrm = ormify(db, TableName.SecretSharing);

  const pruneExpiredSharedSecrets = async (tx?: Knex) => {
    try {
      const today = new Date();
      const docs = await (tx || db)(TableName.SecretSharing).where("expiresAt", "<", today).del();
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "pruneExpiredSharedSecrets" });
    }
  };

  return {
    ...sharedSecretOrm,
    pruneExpiredSharedSecrets
  };
};
