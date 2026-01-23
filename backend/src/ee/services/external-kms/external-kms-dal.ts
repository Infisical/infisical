import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TKmsKeys } from "@app/db/schemas/kms-keys";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TExternalKmsDALFactory = ReturnType<typeof externalKmsDALFactory>;

export const externalKmsDALFactory = (db: TDbClient) => {
  const externalKmsOrm = ormify(db, TableName.ExternalKms);

  const find = async (filter: Partial<TKmsKeys>, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.ExternalKms)
        .join(TableName.KmsKey, `${TableName.KmsKey}.id`, `${TableName.ExternalKms}.kmsKeyId`)
        .where(filter)
        .select(selectAllTableCols(TableName.KmsKey))
        .select(
          db.ref("id").withSchema(TableName.ExternalKms).as("externalKmsId"),
          db.ref("provider").withSchema(TableName.ExternalKms).as("externalKmsProvider"),
          db.ref("encryptedProviderInputs").withSchema(TableName.ExternalKms).as("externalKmsEncryptedProviderInput"),
          db.ref("status").withSchema(TableName.ExternalKms).as("externalKmsStatus"),
          db.ref("statusDetails").withSchema(TableName.ExternalKms).as("externalKmsStatusDetails")
        );

      return result.map((el) => ({
        id: el.id,
        description: el.description,
        isDisabled: el.isDisabled,
        isReserved: el.isReserved,
        orgId: el.orgId,
        name: el.name,
        createdAt: el.createdAt,
        updatedAt: el.updatedAt,
        externalKms: {
          id: el.externalKmsId,
          provider: el.externalKmsProvider,
          status: el.externalKmsStatus,
          statusDetails: el.externalKmsStatusDetails
        }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find" });
    }
  };

  return { ...externalKmsOrm, find };
};
