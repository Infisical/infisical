import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { KmsKeyVersion } from "../models/kms-key-version";
import { TKmsKeyVersionStore } from "../services/dependencies";

// Owns internal_kms_key_version: the material a rotation replaced.
export class KmsKeyVersionStore implements TKmsKeyVersionStore {
  constructor(private readonly knex: () => Knex) {}

  async insert(version: KmsKeyVersion): Promise<void> {
    try {
      const record = version.toJSON();
      await this.knex()(TableName.InternalKmsKeyVersion).insert({
        id: record.id,
        internalKmsId: record.internalKmsId,
        encryptedKey: record.encryptedKey,
        version: record.version
      } as never);
    } catch (error) {
      throw new DatabaseError({ error, name: "Insert KMS key version" });
    }
  }

  async listByInternalKmsId(internalKmsId: string): Promise<KmsKeyVersion[]> {
    try {
      const rows = await this.knex()(TableName.InternalKmsKeyVersion).where({ internalKmsId }).select("*");
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
