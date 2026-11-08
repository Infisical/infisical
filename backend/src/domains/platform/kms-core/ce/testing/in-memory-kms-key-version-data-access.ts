import { TKmsKeyVersionDataAccess } from "../data-access/kms-key-version-data-access";
import { KmsKeyVersion } from "../model/kms-key-version";
import { InMemoryKmsCoreState } from "./in-memory-kms-core-state";

export class InMemoryKmsKeyVersionDataAccess implements TKmsKeyVersionDataAccess {
  constructor(private readonly state: InMemoryKmsCoreState) {}

  async create(version: KmsKeyVersion) {
    this.state.tables.kmsKeyVersions = [...this.state.tables.kmsKeyVersions, version.toJSON()];
  }

  async listByInternalKmsId(internalKmsId: string) {
    return this.state.tables.kmsKeyVersions
      .filter((row) => row.internalKmsId === internalKmsId)
      .map((row) => KmsKeyVersion.restore(row));
  }
}
