import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TInternalKmsKeyVersion } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TInternalKmsDALFactory = ReturnType<typeof internalKmsDALFactory>;

export const internalKmsDALFactory = (db: TDbClient) => {
  const internalKmsOrm = ormify(db, TableName.InternalKms);
  const internalKmsKeyVersionOrm = ormify(db, TableName.InternalKmsKeyVersion);

  const findByKmsKeyId = async (kmsKeyId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.InternalKms)
        .where({ kmsKeyId })
        .first()
        .select(selectAllTableCols(TableName.InternalKms));
      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByKmsKeyId" });
    }
  };

  const createKeyVersion = async (
    data: {
      encryptedKey: Buffer;
      version: number;
      internalKmsId: string;
    },
    tx?: Knex
  ) => {
    try {
      const [result] = await (tx || db)(TableName.InternalKmsKeyVersion).insert(data).returning("*");
      return result as TInternalKmsKeyVersion;
    } catch (error) {
      throw new DatabaseError({ error, name: "CreateKeyVersion" });
    }
  };

  const findKeyVersion = async (internalKmsId: string, version: number, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.InternalKmsKeyVersion)
        .where({ internalKmsId, version })
        .first()
        .select(selectAllTableCols(TableName.InternalKmsKeyVersion));
      return result as TInternalKmsKeyVersion | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindKeyVersion" });
    }
  };

  const findAllKeyVersions = async (internalKmsId: string, tx?: Knex) => {
    try {
      const results = await (tx || db.replicaNode())(TableName.InternalKmsKeyVersion)
        .where({ internalKmsId })
        .orderBy("version", "desc")
        .select(selectAllTableCols(TableName.InternalKmsKeyVersion));
      return results as TInternalKmsKeyVersion[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindAllKeyVersions" });
    }
  };

  const findMaxVersionNumber = async (internalKmsId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.InternalKmsKeyVersion)
        .where({ internalKmsId })
        .max("version as maxVersion")
        .first<{ maxVersion: number | null }>();
      return result?.maxVersion ?? 0;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindMaxVersionNumber" });
    }
  };

  const updateVersionAndRotatedAt = async (
    internalKmsId: string,
    data: {
      encryptedKey: Buffer;
      version: number;
      rotatedAt: Date;
      nextRotationAt?: Date | null;
    },
    tx?: Knex
  ) => {
    try {
      const updateData: Record<string, unknown> = {
        encryptedKey: data.encryptedKey,
        version: data.version,
        rotatedAt: data.rotatedAt
      };
      if (data.nextRotationAt !== undefined) {
        updateData.nextRotationAt = data.nextRotationAt;
      }
      const [result] = await (tx || db)(TableName.InternalKms)
        .where({ id: internalKmsId })
        .update(updateData)
        .returning("*");
      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "UpdateVersionAndRotatedAt" });
    }
  };

  const updateScheduledRotation = async (
    internalKmsId: string,
    data: {
      rotationInterval: number | null;
      nextRotationAt: Date | null;
      isAutoRotationEnabled: boolean;
    },
    tx?: Knex
  ) => {
    try {
      const [result] = await (tx || db)(TableName.InternalKms)
        .where({ id: internalKmsId })
        .update({
          rotationInterval: data.rotationInterval,
          nextRotationAt: data.nextRotationAt,
          isAutoRotationEnabled: data.isAutoRotationEnabled
        })
        .returning("*");
      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "UpdateScheduledRotation" });
    }
  };

  const findKeysToRotate = async (rotateBy: Date, tx?: Knex) => {
    try {
      const results = await (tx || db.replicaNode())(TableName.InternalKms)
        .where(`${TableName.InternalKms}.isAutoRotationEnabled`, true)
        .whereNotNull(`${TableName.InternalKms}.nextRotationAt`)
        .where(`${TableName.InternalKms}.nextRotationAt`, "<=", rotateBy)
        .join(TableName.KmsKey, `${TableName.InternalKms}.kmsKeyId`, `${TableName.KmsKey}.id`)
        .where(`${TableName.KmsKey}.isDisabled`, false)
        .where(`${TableName.KmsKey}.isReserved`, false)
        .where(`${TableName.KmsKey}.keyUsage`, "encrypt-decrypt")
        .select(
          selectAllTableCols(TableName.InternalKms),
          db.ref("name").withSchema(TableName.KmsKey).as("keyName"),
          db.ref("projectId").withSchema(TableName.KmsKey).as("projectId"),
          db.ref("orgId").withSchema(TableName.KmsKey).as("orgId")
        );
      return results;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindKeysToRotate" });
    }
  };

  return {
    ...internalKmsOrm,
    internalKmsKeyVersionOrm,
    findByKmsKeyId,
    createKeyVersion,
    findKeyVersion,
    findAllKeyVersions,
    findMaxVersionNumber,
    updateVersionAndRotatedAt,
    updateScheduledRotation,
    findKeysToRotate
  };
};
