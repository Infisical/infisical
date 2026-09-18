import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TInternalKmsDALFactory = ReturnType<typeof internalKmsDALFactory>;

export const internalKmsDALFactory = (db: TDbClient) => {
  const internalKmsOrm = ormify(db, TableName.InternalKms);

  const findByKmsKeyIdForUpdate = async (kmsKeyId: string, tx: Knex) => {
    try {
      const doc = await tx(TableName.InternalKms).where({ kmsKeyId }).forUpdate().first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by kms key id for update" });
    }
  };

  return { ...internalKmsOrm, findByKmsKeyIdForUpdate };
};
