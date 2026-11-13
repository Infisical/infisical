import { Knex } from "knex";

import { TableName, TKmsRootConfig } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { KMS_ROOT_CONFIG_UUID, RootKeyConfig } from "../models/root-key-config";
import { TRootKeyConfigStore } from "../services/dependencies";

const toModel = (row: TKmsRootConfig) =>
  RootKeyConfig.restore({
    id: row.id,
    encryptedRootKey: row.encryptedRootKey,
    encryptionStrategy: row.encryptionStrategy,
    kekLabel: row.kekLabel,
    activatedAt: row.activatedAt,
    supersededAt: row.supersededAt,
    lastResolvedAt: row.lastResolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });

export class RootKeyConfigStore implements TRootKeyConfigStore {
  constructor(private readonly knex: () => Knex) {}

  async findById(id: string): Promise<RootKeyConfig | null> {
    try {
      const row = (await this.knex()(TableName.KmsServerRootConfig).where({ id }).first("*")) as
        | TKmsRootConfig
        | undefined;
      return row ? toModel(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find root key config" });
    }
  }

  async findAll(): Promise<RootKeyConfig[]> {
    try {
      const rows = (await this.knex()(TableName.KmsServerRootConfig).select("*")) as TKmsRootConfig[];
      return rows.map(toModel);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find root key configs" });
    }
  }

  async insert(config: RootKeyConfig): Promise<void> {
    const record = config.toJSON();
    try {
      await this.knex()(TableName.KmsServerRootConfig).insert({
        id: record.id,
        encryptedRootKey: record.encryptedRootKey,
        encryptionStrategy: record.encryptionStrategy,
        ...(record.kekLabel !== undefined ? { kekLabel: record.kekLabel } : {}),
        ...(record.activatedAt !== undefined ? { activatedAt: record.activatedAt } : {}),
        ...(record.supersededAt !== undefined ? { supersededAt: record.supersededAt } : {})
      } as never);
    } catch (error) {
      throw new DatabaseError({ error, name: "Insert root key config" });
    }
  }

  async save(config: RootKeyConfig): Promise<void> {
    const record = config.toJSON();
    try {
      await this.knex()(TableName.KmsServerRootConfig)
        .where({ id: record.id })
        .update({
          encryptedRootKey: record.encryptedRootKey,
          encryptionStrategy: record.encryptionStrategy,
          kekLabel: record.kekLabel,
          activatedAt: record.activatedAt,
          supersededAt: record.supersededAt,
          lastResolvedAt: record.lastResolvedAt
        } as never);
    } catch (error) {
      throw new DatabaseError({ error, name: "Save root key config" });
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      return (await this.knex()(TableName.KmsServerRootConfig).where({ id }).delete()) > 0;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete root key config" });
    }
  }

  async deleteAllStaged(): Promise<void> {
    try {
      await this.knex()(TableName.KmsServerRootConfig)
        .whereNull("activatedAt")
        .whereNot("id", KMS_ROOT_CONFIG_UUID)
        .delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete staged root key configs" });
    }
  }
}
