import { TDbClient } from "@app/db";
import { TableName, TSecretSharing, TSecretSharingInsert } from "@app/db/schemas";

import { TSharedSecret } from "../model/shared-secret";

const SHARE_TYPE = "share";

const toSharedSecret = (row: TSecretSharing): TSharedSecret => ({
  id: row.id,
  orgId: row.orgId as string,
  createdByUserId: row.userId ?? null,
  createdByIdentityId: row.identityId ?? null,
  name: row.name ?? null,
  encryptedValue: row.encryptedSecret as Buffer,
  expiresAt: row.expiresAt,
  remainingViews: row.expiresAfterViews ?? null,
  lastViewedAt: row.lastViewedAt ?? null
});

export type TSharedSecretRepository = {
  findById: (sharedSecretId: string) => Promise<TSharedSecret | undefined>;
  findByIdForUpdate: (sharedSecretId: string) => Promise<TSharedSecret | undefined>;
  create: (sharedSecret: TSharedSecret) => Promise<void>;
  update: (sharedSecret: TSharedSecret) => Promise<void>;
  delete: (sharedSecretId: string) => Promise<void>;
};

export const createSharedSecretRepository = (db: TDbClient): TSharedSecretRepository => {
  const shareQuery = () =>
    db(TableName.SecretSharing).where("type", SHARE_TYPE).whereNotNull("orgId").whereNotNull("encryptedSecret");

  const findById = async (sharedSecretId: string) => {
    const row = await shareQuery().where("id", sharedSecretId).first();
    return row ? toSharedSecret(row) : undefined;
  };

  const findByIdForUpdate = async (sharedSecretId: string) => {
    const row = await shareQuery().where("id", sharedSecretId).forUpdate().first();
    return row ? toSharedSecret(row) : undefined;
  };

  const create = async (sharedSecret: TSharedSecret) => {
    const row: TSecretSharingInsert & { id: string } = {
      id: sharedSecret.id,
      orgId: sharedSecret.orgId,
      userId: sharedSecret.createdByUserId,
      identityId: sharedSecret.createdByIdentityId,
      name: sharedSecret.name,
      encryptedSecret: sharedSecret.encryptedValue,
      expiresAt: sharedSecret.expiresAt,
      expiresAfterViews: sharedSecret.remainingViews,
      lastViewedAt: sharedSecret.lastViewedAt,
      type: SHARE_TYPE
    };
    await db(TableName.SecretSharing).insert(row);
  };

  const update = async (sharedSecret: TSharedSecret) => {
    await db(TableName.SecretSharing).where("id", sharedSecret.id).update({
      expiresAfterViews: sharedSecret.remainingViews,
      lastViewedAt: sharedSecret.lastViewedAt
    });
  };

  const deleteById = async (sharedSecretId: string) => {
    await db(TableName.SecretSharing).where("id", sharedSecretId).delete();
  };

  return { findById, findByIdForUpdate, create, update, delete: deleteById };
};
