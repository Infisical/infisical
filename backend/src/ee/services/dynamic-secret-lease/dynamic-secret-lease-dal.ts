import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { DynamicSecretLeasesSchema, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TDynamicSecretLeaseDALFactory = ReturnType<typeof dynamicSecretLeaseDALFactory>;

export const dynamicSecretLeaseDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.DynamicSecretLease);

  const countLeasesForDynamicSecret = async (dynamicSecretId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db)(TableName.DynamicSecretLease).count("*").where({ dynamicSecretId }).first();
      return parseInt(doc || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "DynamicSecretCountLeases" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await (tx || db)(TableName.DynamicSecretLease)
        .where({ [`${TableName.DynamicSecretLease}.id` as "id"]: id })
        .first()
        .join(
          TableName.DynamicSecret,
          `${TableName.DynamicSecretLease}.dynamicSecretId`,
          `${TableName.DynamicSecret}.id`
        )
        .select(selectAllTableCols(TableName.DynamicSecretLease))
        .select(
          db.ref("id").withSchema(TableName.DynamicSecret).as("dynId"),
          db.ref("name").withSchema(TableName.DynamicSecret).as("dynName"),
          db.ref("version").withSchema(TableName.DynamicSecret).as("dynVersion"),
          db.ref("type").withSchema(TableName.DynamicSecret).as("dynType"),
          db.ref("defaultTTL").withSchema(TableName.DynamicSecret).as("dynDefaultTTL"),
          db.ref("maxTTL").withSchema(TableName.DynamicSecret).as("dynMaxTTL"),
          db.ref("inputIV").withSchema(TableName.DynamicSecret).as("dynInputIV"),
          db.ref("inputTag").withSchema(TableName.DynamicSecret).as("dynInputTag"),
          db.ref("inputCiphertext").withSchema(TableName.DynamicSecret).as("dynInputCiphertext"),
          db.ref("algorithm").withSchema(TableName.DynamicSecret).as("dynAlgorithm"),
          db.ref("keyEncoding").withSchema(TableName.DynamicSecret).as("dynKeyEncoding"),
          db.ref("folderId").withSchema(TableName.DynamicSecret).as("dynFolderId"),
          db.ref("status").withSchema(TableName.DynamicSecret).as("dynStatus"),
          db.ref("statusDetails").withSchema(TableName.DynamicSecret).as("dynStatusDetails"),
          db.ref("createdAt").withSchema(TableName.DynamicSecret).as("dynCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.DynamicSecret).as("dynUpdatedAt")
        );
      if (!doc) return;

      return {
        ...DynamicSecretLeasesSchema.parse(doc),
        dynamicSecret: {
          id: doc.dynId,
          name: doc.dynName,
          version: doc.dynVersion,
          type: doc.dynType,
          defaultTTL: doc.dynDefaultTTL,
          maxTTL: doc.dynMaxTTL,
          inputIV: doc.dynInputIV,
          inputTag: doc.dynInputTag,
          inputCiphertext: doc.dynInputCiphertext,
          algorithm: doc.dynAlgorithm,
          keyEncoding: doc.dynKeyEncoding,
          folderId: doc.dynFolderId,
          status: doc.dynStatus,
          statusDetails: doc.dynStatusDetails,
          createdAt: doc.dynCreatedAt,
          updatedAt: doc.dynUpdatedAt
        }
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "DynamicSecretLeaseFindById" });
    }
  };

  return { ...orm, findById, countLeasesForDynamicSecret };
};
