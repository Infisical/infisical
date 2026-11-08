import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { KMS_LEGACY_ENCRYPTION_KEY_UUID, LegacyEncryptionKey } from "../model/legacy-encryption-key";

export type TLegacyEncryptionKeyDataAccess = {
  find(): Promise<LegacyEncryptionKey | undefined>;
  create(key: LegacyEncryptionKey): Promise<void>;
};

export class LegacyEncryptionKeyDataAccess implements TLegacyEncryptionKeyDataAccess {
  constructor(private readonly db: Knex) {}

  async find(): Promise<LegacyEncryptionKey | undefined> {
    try {
      const row = await this.db(TableName.KmsLegacyEncryptionKey)
        .where({ id: KMS_LEGACY_ENCRYPTION_KEY_UUID })
        .first("*");
      return row
        ? LegacyEncryptionKey.restore({ id: row.id, encryptedKeySnapshot: row.encryptedKeySnapshot })
        : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find legacy encryption key" });
    }
  }

  async create(key: LegacyEncryptionKey): Promise<void> {
    try {
      await this.db(TableName.KmsLegacyEncryptionKey).insert(key.toJSON() as never);
    } catch (error) {
      throw new DatabaseError({ error, name: "Create legacy encryption key" });
    }
  }
}
