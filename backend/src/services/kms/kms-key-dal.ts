import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { KmsKeysSchema, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TKmsKeyDALFactory = ReturnType<typeof kmskeyDALFactory>;

export const kmskeyDALFactory = (db: TDbClient) => {
  const kmsOrm = ormify(db, TableName.KmsKey);

  const findByIdWithAssociatedKms = async (id: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.KmsKey)
        .where({ [`${TableName.KmsKey}.id` as "id"]: id })
        .leftJoin(TableName.InternalKms, `${TableName.KmsKey}.id`, `${TableName.InternalKms}.kmsKeyId`)
        .leftJoin(TableName.ExternalKms, `${TableName.KmsKey}.id`, `${TableName.ExternalKms}.kmsKeyId`)
        .first()
        .select(selectAllTableCols(TableName.KmsKey))
        .select(
          db.ref("id").withSchema(TableName.InternalKms).as("internalKmsId"),
          db.ref("encryptedKey").withSchema(TableName.InternalKms).as("internalKmsEncryptedKey"),
          db.ref("encryptionAlgorithm").withSchema(TableName.InternalKms).as("internalKmsEncryptionAlgorithm"),
          db.ref("version").withSchema(TableName.InternalKms).as("internalKmsVersion"),
          db.ref("id").withSchema(TableName.InternalKms).as("internalKmsId")
        )
        .select(
          db.ref("id").withSchema(TableName.ExternalKms).as("externalKmsId"),
          db.ref("provider").withSchema(TableName.ExternalKms).as("externalKmsProvider"),
          db.ref("encryptedProviderInputs").withSchema(TableName.ExternalKms).as("externalKmsEncryptedProviderInput"),
          db.ref("status").withSchema(TableName.ExternalKms).as("externalKmsStatus"),
          db.ref("statusDetails").withSchema(TableName.ExternalKms).as("externalKmsStatusDetails")
        );

      const data = {
        ...KmsKeysSchema.parse(result),
        isExternal: Boolean(result?.externalKmsId),
        externalKms: result?.externalKmsId
          ? {
              id: result.externalKmsId,
              provider: result.externalKmsProvider,
              encryptedProviderInput: result.externalKmsEncryptedProviderInput,
              status: result.externalKmsStatus,
              statusDetails: result.externalKmsStatusDetails
            }
          : undefined,
        internalKms: result?.internalKmsId
          ? {
              id: result.internalKmsId,
              encryptedKey: result.internalKmsEncryptedKey,
              encryptionAlgorithm: result.internalKmsEncryptionAlgorithm,
              version: result.internalKmsVersion
            }
          : undefined
      };
      return data;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  };

  return { ...kmsOrm, findByIdWithAssociatedKms };
};
