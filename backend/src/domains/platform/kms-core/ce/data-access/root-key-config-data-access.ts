import { Knex } from "knex";

import { TableName, TKmsRootConfig } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { KMS_ROOT_CONFIG_UUID, RootKeyConfig } from "../model/root-key-config";

export type TRootKeyConfigPatch = {
  encryptedRootKey?: Buffer;
  encryptionStrategy?: string;
  kekLabel?: string | null;
  activatedAt?: Date | null;
  supersededAt?: Date | null;
  lastResolvedAt?: Date | null;
};

export type TRootKeyConfigDataAccess = {
  findById(id: string): Promise<RootKeyConfig | undefined>;
  findAll(): Promise<RootKeyConfig[]>;
  findStaged(): Promise<RootKeyConfig[]>;
  // Newest first.
  findRetained(): Promise<RootKeyConfig[]>;
  create(config: RootKeyConfig): Promise<RootKeyConfig>;
  update(id: string, patch: TRootKeyConfigPatch): Promise<void>;
  deleteById(id: string): Promise<boolean>;
  // Every staged row: an abandoned one is a live working key that would promote itself if it reached a deployment.
  deleteAllStaged(): Promise<void>;
};

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

// Reads the primary: a stale read means failing to find the key this pod holds, or promoting against a
// superseded view.
export class RootKeyConfigDataAccess implements TRootKeyConfigDataAccess {
  constructor(private readonly db: Knex) {}

  async findById(id: string): Promise<RootKeyConfig | undefined> {
    try {
      const row = (await this.db(TableName.KmsServerRootConfig).where({ id }).first("*")) as TKmsRootConfig | undefined;
      return row ? toModel(row) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find root key config" });
    }
  }

  async findAll(): Promise<RootKeyConfig[]> {
    try {
      return ((await this.db(TableName.KmsServerRootConfig).select("*")) as TKmsRootConfig[]).map(toModel);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find root key configs" });
    }
  }

  async findStaged(): Promise<RootKeyConfig[]> {
    try {
      const rows = (await this.db(TableName.KmsServerRootConfig)
        .whereNull("activatedAt")
        .whereNot("id", KMS_ROOT_CONFIG_UUID)
        .select("*")) as TKmsRootConfig[];
      return rows.map(toModel);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find staged root key configs" });
    }
  }

  async findRetained(): Promise<RootKeyConfig[]> {
    try {
      const rows = (await this.db(TableName.KmsServerRootConfig)
        .whereNotNull("supersededAt")
        .whereNot("id", KMS_ROOT_CONFIG_UUID)
        .select("*")
        .orderBy("supersededAt", "desc")) as TKmsRootConfig[];
      return rows.map(toModel);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find retained root key configs" });
    }
  }

  async create(config: RootKeyConfig): Promise<RootKeyConfig> {
    const props = config.toJSON();
    try {
      const [row] = (await this.db(TableName.KmsServerRootConfig)
        .insert({
          id: props.id,
          encryptedRootKey: props.encryptedRootKey,
          encryptionStrategy: props.encryptionStrategy,
          ...(props.kekLabel !== undefined ? { kekLabel: props.kekLabel } : {}),
          ...(props.activatedAt !== undefined ? { activatedAt: props.activatedAt } : {}),
          ...(props.supersededAt !== undefined ? { supersededAt: props.supersededAt } : {})
        } as never)
        .returning("*")) as TKmsRootConfig[];
      return toModel(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Create root key config" });
    }
  }

  async update(id: string, patch: TRootKeyConfigPatch): Promise<void> {
    try {
      await this.db(TableName.KmsServerRootConfig)
        .where({ id })
        .update(patch as never);
    } catch (error) {
      throw new DatabaseError({ error, name: "Update root key config" });
    }
  }

  async deleteById(id: string): Promise<boolean> {
    try {
      return (await this.db(TableName.KmsServerRootConfig).where({ id }).delete()) > 0;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete root key config" });
    }
  }

  async deleteAllStaged(): Promise<void> {
    try {
      await this.db(TableName.KmsServerRootConfig)
        .whereNull("activatedAt")
        .whereNot("id", KMS_ROOT_CONFIG_UUID)
        .delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete staged root key configs" });
    }
  }
}
