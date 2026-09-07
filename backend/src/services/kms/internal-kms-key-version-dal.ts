import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TInternalKmsKeyVersionDALFactory = ReturnType<typeof internalKmsKeyVersionDALFactory>;

export const internalKmsKeyVersionDALFactory = (db: TDbClient) => {
  const internalKmsKeyVersionOrm = ormify(db, TableName.InternalKmsKeyVersion);

  const findBeforeVersion = async (internalKmsId: string, version: number, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.InternalKmsKeyVersion)
        .where({ internalKmsId })
        .where("version", "<", version)
        .orderBy("version", "desc");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find KMS key versions before version" });
    }
  };

  const findLatestByInternalKmsId = async (internalKmsId: string, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.InternalKmsKeyVersion)
        .where({ internalKmsId })
        .orderBy("version", "desc")
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find latest KMS key version" });
    }
  };

  return {
    ...internalKmsKeyVersionOrm,
    findBeforeVersion,
    findLatestByInternalKmsId
  };
};
