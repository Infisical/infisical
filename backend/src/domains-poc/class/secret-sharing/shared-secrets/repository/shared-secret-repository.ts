import { TDbClient } from "@app/db";
import { TableName, TSecretSharing, TSecretSharingInsert } from "@app/db/schemas";

import { SharedSecret } from "../model/shared-secret";

const SHARE_TYPE = "share";

const toSharedSecret = (row: TSecretSharing) =>
  SharedSecret.restore({
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

export interface TSharedSecretRepository {
  findById(sharedSecretId: string): Promise<SharedSecret | undefined>;
  findByIdForUpdate(sharedSecretId: string): Promise<SharedSecret | undefined>;
  create(sharedSecret: SharedSecret): Promise<void>;
  update(sharedSecret: SharedSecret): Promise<void>;
  delete(sharedSecretId: string): Promise<void>;
}

export class SharedSecretRepository implements TSharedSecretRepository {
  constructor(private readonly db: TDbClient) {}

  private shareQuery() {
    return this.db(TableName.SecretSharing)
      .where("type", SHARE_TYPE)
      .whereNotNull("orgId")
      .whereNotNull("encryptedSecret");
  }

  async findById(sharedSecretId: string) {
    const row = await this.shareQuery().where("id", sharedSecretId).first();
    return row ? toSharedSecret(row) : undefined;
  }

  async findByIdForUpdate(sharedSecretId: string) {
    const row = await this.shareQuery().where("id", sharedSecretId).forUpdate().first();
    return row ? toSharedSecret(row) : undefined;
  }

  async create(sharedSecret: SharedSecret) {
    const props = sharedSecret.toProps();
    const row: TSecretSharingInsert & { id: string } = {
      id: props.id,
      orgId: props.orgId,
      userId: props.createdByUserId,
      identityId: props.createdByIdentityId,
      name: props.name,
      encryptedSecret: props.encryptedValue,
      expiresAt: props.expiresAt,
      expiresAfterViews: props.remainingViews,
      lastViewedAt: props.lastViewedAt,
      type: SHARE_TYPE
    };
    await this.db(TableName.SecretSharing).insert(row);
  }

  async update(sharedSecret: SharedSecret) {
    const props = sharedSecret.toProps();
    await this.db(TableName.SecretSharing).where("id", props.id).update({
      expiresAfterViews: props.remainingViews,
      lastViewedAt: props.lastViewedAt
    });
  }

  async delete(sharedSecretId: string) {
    await this.db(TableName.SecretSharing).where("id", sharedSecretId).delete();
  }
}
