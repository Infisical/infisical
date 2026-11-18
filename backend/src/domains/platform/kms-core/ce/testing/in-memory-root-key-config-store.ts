import { DatabaseError } from "@app/lib/errors";

import { KMS_ROOT_CONFIG_UUID, RootKeyConfig, TRootKeyConfigRecord } from "../models/root-key-config";
import { TRootKeyConfigStore } from "../services/dependencies";

export class InMemoryRootKeyConfigStore implements TRootKeyConfigStore {
  private rows = new Map<string, TRootKeyConfigRecord>();

  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? RootKeyConfig.restore(row) : null;
  }

  async findAll() {
    return [...this.rows.values()].map((row) => RootKeyConfig.restore(row));
  }

  async insert(config: RootKeyConfig) {
    const record = config.toJSON();
    if (this.rows.has(record.id)) {
      throw new DatabaseError({
        error: new Error("duplicate key value violates unique constraint"),
        name: "Insert root key config"
      });
    }
    this.rows.set(record.id, record);
  }

  async save(config: RootKeyConfig) {
    const record = config.toJSON();
    const row = this.rows.get(record.id);
    if (row) this.rows.set(record.id, { ...row, ...record, createdAt: row.createdAt, updatedAt: new Date() });
  }

  async delete(id: string) {
    return this.rows.delete(id);
  }

  async deleteAllStaged() {
    [...this.rows.values()]
      .filter((row) => row.id !== KMS_ROOT_CONFIG_UUID && !row.activatedAt)
      .forEach((row) => this.rows.delete(row.id));
  }

  snapshot(): unknown {
    return new Map(this.rows);
  }

  restore(snapshot: unknown) {
    this.rows = new Map(snapshot as Map<string, TRootKeyConfigRecord>);
  }
}
