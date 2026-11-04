import { TExternalKmsDataAccess } from "../data-access/external-kms-data-access";
import { ExternalKms, TExternalKmsProps } from "../model/external-kms";

export class InMemoryExternalKmsDataAccess implements TExternalKmsDataAccess {
  readonly rows = new Map<string, TExternalKmsProps>();

  async findByKmsKeyId(kmsKeyId: string) {
    const props = [...this.rows.values()].find((row) => row.kmsKeyId === kmsKeyId);
    return props ? ExternalKms.restore({ ...props }) : undefined;
  }

  async create(externalKms: ExternalKms) {
    this.rows.set(externalKms.id, externalKms.toProps());
  }
}
