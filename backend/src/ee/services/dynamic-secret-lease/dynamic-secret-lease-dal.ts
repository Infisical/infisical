import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { DynamicSecretLeasesSchema } from "@app/db/schemas/dynamic-secret-leases";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, TOrmify } from "@app/lib/knex";

export interface TDynamicSecretLeaseDALFactory extends Omit<TOrmify<TableName.DynamicSecretLease>, "findById"> {
  countLeasesForDynamicSecret: (dynamicSecretId: string, tx?: Knex) => Promise<number>;
  findById: (
    id: string,
    tx?: Knex
  ) => Promise<
    | {
        dynamicSecret: {
          id: string;
          name: string;
          version: number;
          type: string;
          defaultTTL: string;
          maxTTL: string | null | undefined;
          encryptedInput: Buffer;
          folderId: string;
          status: string | null | undefined;
          statusDetails: string | null | undefined;
          createdAt: Date;
          updatedAt: Date;
        };
        version: number;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        externalEntityId: string;
        expireAt: Date;
        dynamicSecretId: string;
        status?: string | null | undefined;
        config?: unknown;
        statusDetails?: string | null | undefined;
      }
    | undefined
  >;
}

export const dynamicSecretLeaseDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.DynamicSecretLease);

  const countLeasesForDynamicSecret = async (dynamicSecretId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.DynamicSecretLease)
        .count("*")
        .where({ dynamicSecretId })
        .first();
      return parseInt(doc || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "DynamicSecretCountLeases" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.DynamicSecretLease)
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
          db.ref("encryptedInput").withSchema(TableName.DynamicSecret).as("dynEncryptedInput"),
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
          encryptedInput: doc.dynEncryptedInput,
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
