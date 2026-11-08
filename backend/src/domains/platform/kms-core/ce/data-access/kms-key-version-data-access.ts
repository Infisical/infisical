import { TableName } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";

import { KmsKeyVersion } from "../model/kms-key-version";

export type TKmsKeyVersionDataAccess = {
  create(version: KmsKeyVersion): Promise<void>;
  listByInternalKmsId(internalKmsId: string, options?: TReadOptions): Promise<KmsKeyVersion[]>;
};

export class KmsKeyVersionDataAccess implements TKmsKeyVersionDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  async create(version: KmsKeyVersion): Promise<void> {
    try {
      const props = version.toJSON();
      await this.db
        .writer()(TableName.InternalKmsKeyVersion)
        .insert({
          id: props.id,
          internalKmsId: props.internalKmsId,
          encryptedKey: props.encryptedKey,
          version: props.version
        } as never);
    } catch (error) {
      throw new DatabaseError({ error, name: "Create KMS key version" });
    }
  }

  async listByInternalKmsId(internalKmsId: string, options?: TReadOptions): Promise<KmsKeyVersion[]> {
    try {
      const rows = await this.db.reader(options)(TableName.InternalKmsKeyVersion).where({ internalKmsId }).select("*");
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
