import { TDbClient } from "@app/db";
import { TableName, TKmsKeysInsert } from "@app/db/schemas";
import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";

import { KmsKey } from "../model/kms-key";

export interface TKmsKeyRepository {
  findByOrgAndName(orgId: string, name: string): Promise<KmsKey | undefined>;
  create(key: KmsKey): Promise<void>;
  lockOrgKeyCreation(orgId: string): Promise<void>;
}

export class KmsKeyRepository implements TKmsKeyRepository {
  constructor(private readonly db: TDbClient) {}

  async findByOrgAndName(orgId: string, name: string) {
    const row = await this.db(TableName.KmsKey)
      .join(TableName.InternalKms, `${TableName.InternalKms}.kmsKeyId`, `${TableName.KmsKey}.id`)
      .where(`${TableName.KmsKey}.orgId`, orgId)
      .where(`${TableName.KmsKey}.name`, name)
      .whereNull(`${TableName.KmsKey}.projectId`)
      .select(
        this.db.ref("id").withSchema(TableName.KmsKey),
        this.db.ref("orgId").withSchema(TableName.KmsKey),
        this.db.ref("name").withSchema(TableName.KmsKey),
        this.db.ref("isDisabled").withSchema(TableName.KmsKey),
        this.db.ref("encryptedKey").withSchema(TableName.InternalKms),
        this.db.ref("encryptionAlgorithm").withSchema(TableName.InternalKms),
        this.db.ref("version").withSchema(TableName.InternalKms)
      )
      .first();

    if (!row) return undefined;

    return KmsKey.restore({
      id: row.id,
      orgId: row.orgId,
      name: row.name,
      isDisabled: Boolean(row.isDisabled),
      encryptedKeyMaterial: row.encryptedKey,
      encryptionAlgorithm: row.encryptionAlgorithm as SymmetricKeyAlgorithm,
      version: row.version
    });
  }

  async create(key: KmsKey) {
    const props = key.toProps();
    const kmsKeyRow: TKmsKeysInsert & { id: string } = {
      id: props.id,
      orgId: props.orgId,
      name: props.name,
      isDisabled: props.isDisabled,
      isReserved: true
    };

    await this.db.transaction(async (trx) => {
      await trx(TableName.KmsKey).insert(kmsKeyRow);
      await trx(TableName.InternalKms).insert({
        kmsKeyId: props.id,
        encryptedKey: props.encryptedKeyMaterial,
        encryptionAlgorithm: props.encryptionAlgorithm,
        version: props.version
      });
    });
  }

  async lockOrgKeyCreation(orgId: string) {
    await this.db.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`kms-core:org-key:${orgId}`]);
  }
}
