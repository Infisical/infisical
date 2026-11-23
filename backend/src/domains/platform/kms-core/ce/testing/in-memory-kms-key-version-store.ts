import { KmsKeyVersion, TKmsKeyVersionRecord } from "../models/kms-key-version";
import { TKmsKeyVersionStore } from "../services/dependencies";

export class InMemoryKmsKeyVersionStore implements TKmsKeyVersionStore {
  private versions = new Map<string, TKmsKeyVersionRecord>();

  async insert(version: KmsKeyVersion): Promise<void> {
    const record = version.toJSON();
    const duplicate = [...this.versions.values()].some(
      (row) => row.internalKmsId === record.internalKmsId && row.version === record.version
    );
    if (this.versions.has(record.id) || duplicate) {
      throw new Error("duplicate key value violates unique constraint on internal_kms_key_version");
    }
    this.versions.set(record.id, record);
  }

  async listByInternalKmsId(internalKmsId: string): Promise<KmsKeyVersion[]> {
    return [...this.versions.values()]
      .filter((row) => row.internalKmsId === internalKmsId)
      .map((row) => KmsKeyVersion.restore(row));
  }

  // Versions go with their key, as the foreign key cascades in Postgres.
  deleteByInternalKmsId(internalKmsId: string) {
    this.versions = new Map([...this.versions].filter(([, row]) => row.internalKmsId !== internalKmsId));
  }

  snapshot(): unknown {
    return new Map(this.versions);
  }

  restore(snapshot: unknown) {
    this.versions = snapshot as Map<string, TKmsKeyVersionRecord>;
  }
}
