import { KmsKey, TKmsKeyProps } from "../model/kms-key";
import { TKmsKeyRepository } from "../repository/kms-key-repository";

export class InMemoryKmsKeyRepository implements TKmsKeyRepository {
  readonly rows = new Map<string, TKmsKeyProps>();

  readonly lockedOrgIds: string[] = [];

  async findByOrgAndName(orgId: string, name: string) {
    const props = [...this.rows.values()].find((row) => row.orgId === orgId && row.name === name);
    return props ? KmsKey.restore(props) : undefined;
  }

  async create(key: KmsKey) {
    const props = key.toProps();
    this.rows.set(props.id, props);
  }

  async lockOrgKeyCreation(orgId: string) {
    this.lockedOrgIds.push(orgId);
  }
}
