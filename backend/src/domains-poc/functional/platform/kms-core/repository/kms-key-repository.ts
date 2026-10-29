import { TDbClient } from "@app/db";
import { TableName, TKmsKeysInsert } from "@app/db/schemas";
import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";

import { TKmsKey } from "../model/kms-key";

export type TKmsKeyRepository = {
  findByOrgAndName: (orgId: string, name: string) => Promise<TKmsKey | undefined>;
  create: (kmsKey: TKmsKey) => Promise<void>;
  lockOrgKeyCreation: (orgId: string) => Promise<void>;
};

export const createKmsKeyRepository = (db: TDbClient): TKmsKeyRepository => {
  const findByOrgAndName = async (orgId: string, name: string) => {
    const row = await db(TableName.KmsKey)
      .join(TableName.InternalKms, `${TableName.InternalKms}.kmsKeyId`, `${TableName.KmsKey}.id`)
      .where(`${TableName.KmsKey}.orgId`, orgId)
      .where(`${TableName.KmsKey}.name`, name)
      .whereNull(`${TableName.KmsKey}.projectId`)
      .select(
        db.ref("id").withSchema(TableName.KmsKey),
        db.ref("orgId").withSchema(TableName.KmsKey),
        db.ref("name").withSchema(TableName.KmsKey),
        db.ref("isDisabled").withSchema(TableName.KmsKey),
        db.ref("encryptedKey").withSchema(TableName.InternalKms),
        db.ref("encryptionAlgorithm").withSchema(TableName.InternalKms),
        db.ref("version").withSchema(TableName.InternalKms)
      )
      .first();

    if (!row) return undefined;

    return {
      id: row.id,
      orgId: row.orgId,
      name: row.name,
      isDisabled: Boolean(row.isDisabled),
      encryptedKeyMaterial: row.encryptedKey,
      encryptionAlgorithm: row.encryptionAlgorithm as SymmetricKeyAlgorithm,
      version: row.version
    };
  };

  const create = async (kmsKey: TKmsKey) => {
    const kmsKeyRow: TKmsKeysInsert & { id: string } = {
      id: kmsKey.id,
      orgId: kmsKey.orgId,
      name: kmsKey.name,
      isDisabled: kmsKey.isDisabled,
      isReserved: true
    };

    await db.transaction(async (trx) => {
      await trx(TableName.KmsKey).insert(kmsKeyRow);
      await trx(TableName.InternalKms).insert({
        kmsKeyId: kmsKey.id,
        encryptedKey: kmsKey.encryptedKeyMaterial,
        encryptionAlgorithm: kmsKey.encryptionAlgorithm,
        version: kmsKey.version
      });
    });
  };

  const lockOrgKeyCreation = async (orgId: string) => {
    await db.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`kms-core:org-key:${orgId}`]);
  };

  return { findByOrgAndName, create, lockOrgKeyCreation };
};
