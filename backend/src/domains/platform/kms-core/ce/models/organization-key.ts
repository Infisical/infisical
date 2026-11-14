import { RuleViolationError } from "@app/domains/lib/errors";

import { EncryptedDataKey } from "./encrypted-data-key";

export type TOrganizationKeyRecord = {
  orgId: string;
  // organizations.kmsDefaultKeyId: the KMS key that encrypts the data key.
  kmsKeyId: string | null;
  // organizations.kmsEncryptedDataKey.
  encryptedDataKey: Buffer | null;
};

// The key columns an organization carries. KMS Core is the only writer of these columns.
export class OrganizationKey {
  private constructor(
    readonly orgId: string,
    private kmsKeyId: string | null,
    private dataKey: Buffer | null
  ) {}

  static restore(record: TOrganizationKeyRecord): OrganizationKey {
    return new OrganizationKey(record.orgId, record.kmsKeyId, record.encryptedDataKey);
  }

  hasKmsKey(): boolean {
    return this.kmsKeyId !== null;
  }

  hasDataKey(): boolean {
    return this.dataKey !== null;
  }

  // For the caller that reads the KMS key and has no data key yet; once both exist, `material()` carries the id.
  get currentKmsKeyId(): string | null {
    return this.kmsKeyId;
  }

  assignKmsKey(kmsKeyId: string): void {
    if (this.kmsKeyId) {
      throw new RuleViolationError({ message: `Organization '${this.orgId}' already has a KMS key` });
    }
    this.kmsKeyId = kmsKeyId;
  }

  assignDataKey(encryptedDataKey: Buffer): void {
    if (!this.kmsKeyId) {
      throw new RuleViolationError({ message: `Organization '${this.orgId}' has no KMS key to encrypt a data key` });
    }
    if (this.dataKey) {
      throw new RuleViolationError({ message: `Organization '${this.orgId}' already has a data key` });
    }
    this.dataKey = encryptedDataKey;
  }

  material(): EncryptedDataKey {
    if (!this.kmsKeyId || !this.dataKey) throw new RuleViolationError({ message: "Invalid organization KMS" });
    return EncryptedDataKey.restore({ kmsKeyId: this.kmsKeyId, encryptedDataKey: this.dataKey, orgId: this.orgId });
  }

  toJSON(): TOrganizationKeyRecord {
    return { orgId: this.orgId, kmsKeyId: this.kmsKeyId, encryptedDataKey: this.dataKey };
  }
}
