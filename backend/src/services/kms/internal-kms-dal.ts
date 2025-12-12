import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TInternalKmsKeyVersion } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { KmsKeyUsage, MS_PER_DAY } from "./kms-types";

export type TInternalKmsDALFactory = ReturnType<typeof internalKmsDALFactory>;

export const internalKmsDALFactory = (db: TDbClient) => {
  const internalKmsOrm = ormify(db, TableName.InternalKms);
  const internalKmsKeyVersionOrm = ormify(db, TableName.InternalKmsKeyVersion);

  // Use primary node by default - this is used in rotation/rollback transactions
  // where strong consistency is required
  const findByKmsKeyId = async (kmsKeyId: string, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.InternalKms)
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

  // Use primary node for key version reads - this is critical for decryption
  // and must have strong consistency to avoid decryption failures
  const findKeyVersion = async (internalKmsId: string, version: number, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.InternalKmsKeyVersion)
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

  // Use primary node for version number reads during rotation to ensure consistency
  const findMaxVersionNumber = async (internalKmsId: string, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.InternalKmsKeyVersion)
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
      rotatedAt?: Date;
      nextRotationAt?: Date | null;
    },
    tx?: Knex
  ) => {
    try {
      const [result] = await (tx || db)(TableName.InternalKms)
        .where({ id: internalKmsId })
        .update({
          encryptedKey: data.encryptedKey,
          version: data.version,
          ...(data.rotatedAt !== undefined && { rotatedAt: data.rotatedAt }),
          ...(data.nextRotationAt !== undefined && { nextRotationAt: data.nextRotationAt })
        })
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

  // Sentinel date used to mark keys as "queued" - prevents re-queuing
  const QUEUED_SENTINEL_DATE = new Date("9999-12-31T23:59:59.999Z");

  const findKeysToRotate = async (rotateBy: Date, tx?: Knex) => {
    try {
      const results = await (tx || db.replicaNode())(TableName.InternalKms)
        .where(`${TableName.InternalKms}.isAutoRotationEnabled`, true)
        .whereNotNull(`${TableName.InternalKms}.nextRotationAt`)
        .where(`${TableName.InternalKms}.nextRotationAt`, "<=", rotateBy)
        // Exclude keys that are already queued (sentinel date)
        .where(`${TableName.InternalKms}.nextRotationAt`, "<", QUEUED_SENTINEL_DATE)
        .join(TableName.KmsKey, `${TableName.InternalKms}.kmsKeyId`, `${TableName.KmsKey}.id`)
        .where(`${TableName.KmsKey}.isDisabled`, false)
        .where(`${TableName.KmsKey}.isReserved`, false)
        .whereNotNull(`${TableName.KmsKey}.projectId`)
        .where(`${TableName.KmsKey}.keyUsage`, KmsKeyUsage.ENCRYPT_DECRYPT)
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

  // Mark keys as queued by setting a sentinel date far in the future
  // This prevents re-queuing while preserving the ability to calculate restore date
  // Returns the original nextRotationAt values for potential restoration
  const markKeysAsQueued = async (internalKmsIds: string[], useTransaction: boolean = false) => {
    if (internalKmsIds.length === 0) {
      return { updatedCount: 0, originalValues: [] as { id: string; nextRotationAt: Date | null }[] };
    }

    const doUpdate = async (trx: Knex) => {
      // First, fetch the original nextRotationAt values for potential restoration
      const originalValues = await trx(TableName.InternalKms)
        .whereIn("id", internalKmsIds)
        .select("id", "nextRotationAt");

      // Set nextRotationAt to a sentinel date far in the future (year 9999)
      // This prevents the key from being picked up again while indicating it's queued
      const updatedCount = await trx(TableName.InternalKms)
        .whereIn("id", internalKmsIds)
        .update({ nextRotationAt: QUEUED_SENTINEL_DATE });

      return { updatedCount, originalValues };
    };

    try {
      if (useTransaction) {
        return await db.transaction(async (trx) => doUpdate(trx));
      }
      return await doUpdate(db);
    } catch (error) {
      throw new DatabaseError({ error, name: "MarkKeysAsQueued" });
    }
  };

  const restoreNextRotationAt = async (internalKmsId: string, rotationIntervalDays: number) => {
    try {
      const nextRotationAt = new Date(Date.now() + rotationIntervalDays * MS_PER_DAY);

      const [result] = await db(TableName.InternalKms)
        .where({ id: internalKmsId })
        .update({ nextRotationAt })
        .returning("*");

      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "RestoreNextRotationAt" });
    }
  };

  // Use primary node for all operations - this is a write operation that needs consistency
  const deleteOldKeyVersions = async (internalKmsId: string, retainCount: number, tx?: Knex) => {
    try {
      const dbConn = tx || db;

      const versionsToKeep = await dbConn(TableName.InternalKmsKeyVersion)
        .where({ internalKmsId })
        .orderBy("version", "desc")
        .limit(retainCount)
        .select("id");

      const keepIds = versionsToKeep.map((v) => v.id);

      if (keepIds.length === 0) {
        return { deletedCount: 0, deletedVersions: [] as number[] };
      }

      const versionsToDelete = await dbConn(TableName.InternalKmsKeyVersion)
        .where({ internalKmsId })
        .whereNotIn("id", keepIds)
        .select("version");

      const deletedVersionNumbers = versionsToDelete.map((v) => v.version);

      const deletedCount = await dbConn(TableName.InternalKmsKeyVersion)
        .where({ internalKmsId })
        .whereNotIn("id", keepIds)
        .delete();

      return { deletedCount, deletedVersions: deletedVersionNumbers };
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteOldKeyVersions" });
    }
  };

  const updateRotationStatus = async (
    internalKmsId: string,
    data: {
      lastRotationStatus: string;
      lastRotationAttemptedAt: Date;
      lastRotationJobId?: string | null;
      encryptedLastRotationMessage?: Buffer | null;
      isLastRotationManual: boolean;
    },
    tx?: Knex
  ) => {
    try {
      const [result] = await (tx || db)(TableName.InternalKms)
        .where({ id: internalKmsId })
        .update({
          lastRotationStatus: data.lastRotationStatus,
          lastRotationAttemptedAt: data.lastRotationAttemptedAt,
          lastRotationJobId: data.lastRotationJobId ?? null,
          encryptedLastRotationMessage: data.encryptedLastRotationMessage ?? null,
          isLastRotationManual: data.isLastRotationManual
        })
        .returning("*");
      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "UpdateRotationStatus" });
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
    findKeysToRotate,
    deleteOldKeyVersions,
    markKeysAsQueued,
    restoreNextRotationAt,
    updateRotationStatus
  };
};
