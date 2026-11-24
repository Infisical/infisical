import { TableName } from "@app/db/schemas";
import { TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";

import { KMS_LEGACY_ENCRYPTION_KEY_UUID, LegacyEncryptionKey } from "../models/legacy-encryption-key";
import { TLegacyEncryptionKeyStore } from "../services/dependencies";

export class LegacyEncryptionKeyStore implements TLegacyEncryptionKeyStore {
  constructor(private readonly connection: TStoreConnection) {}

  async find(options?: TReadOptions): Promise<LegacyEncryptionKey | null> {
    try {
      const row = await this.connection
        .reader(options)(TableName.KmsLegacyEncryptionKey)
        .where({ id: KMS_LEGACY_ENCRYPTION_KEY_UUID })
        .first("*");
      return row ? LegacyEncryptionKey.restore({ id: row.id, encryptedKeySnapshot: row.encryptedKeySnapshot }) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find legacy encryption key" });
    }
  }

  async insert(key: LegacyEncryptionKey): Promise<void> {
    try {
      await this.connection
        .writer()(TableName.KmsLegacyEncryptionKey)
        .insert(key.toJSON() as never)
        .onConflict("id")
        .ignore();
    } catch (error) {
      throw new DatabaseError({ error, name: "Insert legacy encryption key" });
    }
  }
}
