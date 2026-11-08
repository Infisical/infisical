import { TLegacyEncryptionKeyDataAccess } from "../data-access/legacy-encryption-key-data-access";
import { LegacyEncryptionKey } from "../model/legacy-encryption-key";
import { InMemoryKmsCoreState } from "./in-memory-kms-core-state";

export class InMemoryLegacyEncryptionKeyDataAccess implements TLegacyEncryptionKeyDataAccess {
  constructor(private readonly state: InMemoryKmsCoreState) {}

  async find() {
    const row = this.state.tables.legacyEncryptionKey;
    return row ? LegacyEncryptionKey.restore(row) : undefined;
  }

  async create(key: LegacyEncryptionKey) {
    if (this.state.tables.legacyEncryptionKey) throw new Error("duplicate key value violates unique constraint");
    this.state.tables.legacyEncryptionKey = key.toJSON();
  }
}
