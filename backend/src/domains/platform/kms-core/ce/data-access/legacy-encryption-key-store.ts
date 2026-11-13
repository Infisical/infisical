import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { KMS_LEGACY_ENCRYPTION_KEY_UUID, LegacyEncryptionKey } from "../models/legacy-encryption-key";
import { TLegacyEncryptionKeyStore } from "../services/dependencies";

export class LegacyEncryptionKeyStore implements TLegacyEncryptionKeyStore {
  constructor(private readonly knex: () => Knex) {}

  async find(): Promise<LegacyEncryptionKey | null> {
    try {
      const row = await this.knex()(TableName.KmsLegacyEncryptionKey)
        .where({ id: KMS_LEGACY_ENCRYPTION_KEY_UUID })
        .first("*");
      return row ? LegacyEncryptionKey.restore({ id: row.id, encryptedKeySnapshot: row.encryptedKeySnapshot }) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find legacy encryption key" });
    }
  }

  async insert(key: LegacyEncryptionKey): Promise<void> {
    try {
      await this.knex()(TableName.KmsLegacyEncryptionKey)
        .insert(key.toJSON() as never)
        .onConflict("id")
        .ignore();
    } catch (error) {
      throw new DatabaseError({ error, name: "Insert legacy encryption key" });
    }
  }
}
