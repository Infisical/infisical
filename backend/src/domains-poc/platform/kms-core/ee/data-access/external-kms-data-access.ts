import { TDbClient } from "@app/db";
import { TableName, TExternalKmsInsert } from "@app/db/schemas";

import { ExternalKms } from "../model/external-kms";

export interface TExternalKmsDataAccess {
  findByKmsKeyId(kmsKeyId: string): Promise<ExternalKms | undefined>;
  create(externalKms: ExternalKms): Promise<void>;
}

export class ExternalKmsDataAccess implements TExternalKmsDataAccess {
  constructor(private readonly db: TDbClient) {}

  async findByKmsKeyId(kmsKeyId: string) {
    const row = await this.db(TableName.ExternalKms).where("kmsKeyId", kmsKeyId).first();
    return row ? ExternalKms.restore({ id: row.id, kmsKeyId: row.kmsKeyId, provider: row.provider }) : undefined;
  }

  async create(externalKms: ExternalKms) {
    const props = externalKms.toProps();
    const row: TExternalKmsInsert & { id: string } = {
      id: props.id,
      kmsKeyId: props.kmsKeyId,
      provider: props.provider,
      encryptedProviderInputs: Buffer.alloc(0)
    };
    await this.db(TableName.ExternalKms).insert(row);
  }
}
