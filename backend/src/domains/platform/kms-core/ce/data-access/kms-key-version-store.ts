import { TableName } from "@app/db/schemas";
import { TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";

import { KmsKeyVersion } from "../models/kms-key-version";
import { TKmsKeyVersionStore } from "../services/dependencies";

// Owns internal_kms_key_version: the material a rotation replaced.
export class KmsKeyVersionStore implements TKmsKeyVersionStore {
  constructor(private readonly connection: TStoreConnection) {}

  async insert(version: KmsKeyVersion): Promise<void> {
    try {
      const record = version.toJSON();
      await this.connection
        .writer()(TableName.InternalKmsKeyVersion)
        .insert({
          id: record.id,
          internalKmsId: record.internalKmsId,
          encryptedKey: record.encryptedKey,
          version: record.version
        } as never);
    } catch (error) {
      throw new DatabaseError({ error, name: "Insert KMS key version" });
    }
  }

  async listByInternalKmsId(internalKmsId: string, options?: TReadOptions): Promise<KmsKeyVersion[]> {
    try {
      const rows = await this.connection
        .reader(options)(TableName.InternalKmsKeyVersion)
        .where({ internalKmsId })
        .select("*");
      return rows.map((row) =>
        KmsKeyVersion.restore({
          id: row.id,
          internalKmsId: row.internalKmsId,
          encryptedKey: row.encryptedKey,
          version: row.version
        })
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "List KMS key versions" });
    }
  }
}
