import { LegacyEncryptionKey, TLegacyEncryptionKeyRecord } from "../models/legacy-encryption-key";
import { TLegacyEncryptionKeyStore } from "../services/dependencies";

export class InMemoryLegacyEncryptionKeyStore implements TLegacyEncryptionKeyStore {
  private row: TLegacyEncryptionKeyRecord | null = null;

  async find() {
    return this.row ? LegacyEncryptionKey.restore(this.row) : null;
  }

  async insert(key: LegacyEncryptionKey) {
    if (!this.row) this.row = key.toJSON();
  }

  snapshot(): unknown {
    return this.row;
  }

  restore(snapshot: unknown) {
    this.row = snapshot as TLegacyEncryptionKeyRecord | null;
  }
}
