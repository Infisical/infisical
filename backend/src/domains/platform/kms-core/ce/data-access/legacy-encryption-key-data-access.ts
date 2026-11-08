import { TableName } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";

import { KMS_LEGACY_ENCRYPTION_KEY_UUID, LegacyEncryptionKey } from "../model/legacy-encryption-key";

export type TLegacyEncryptionKeyDataAccess = {
  find(options?: TReadOptions): Promise<LegacyEncryptionKey | undefined>;
  create(key: LegacyEncryptionKey): Promise<void>;
};

export class LegacyEncryptionKeyDataAccess implements TLegacyEncryptionKeyDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  async find(options?: TReadOptions): Promise<LegacyEncryptionKey | undefined> {
    try {
      const row = await this.db
        .reader(options)(TableName.KmsLegacyEncryptionKey)
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
      await this.db
        .writer()(TableName.KmsLegacyEncryptionKey)
        .insert(key.toJSON() as never);
    } catch (error) {
      throw new DatabaseError({ error, name: "Create legacy encryption key" });
    }
  }
}
