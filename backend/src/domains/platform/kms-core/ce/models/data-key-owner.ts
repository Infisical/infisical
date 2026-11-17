import { RuleViolationError } from "@app/domains/lib/errors";

import { EncryptedDataKey } from "./encrypted-data-key";

export type TDataKeyOwnerKind = "organization" | "project";

// The KMS key and the data key it wraps. Each is set once, on first use, and only KMS Core writes these columns.
export abstract class DataKeyOwner {
  protected constructor(
    readonly kind: TDataKeyOwnerKind,
    private readonly ownerId: string,
    readonly orgId: string,
    protected kmsKeyId: string | null,
    protected dataKey: Buffer | null
  ) {}

  hasDataKey(): boolean {
    return this.dataKey !== null;
  }

  // For the caller that reads the KMS key and has no data key yet; once both exist, `material()` carries the id.
  get currentKmsKeyId(): string | null {
    return this.kmsKeyId;
  }

  assignKmsKey(kmsKeyId: string): void {
    if (this.kmsKeyId) throw new RuleViolationError({ message: `${this.describe()} already has a KMS key` });
    this.kmsKeyId = kmsKeyId;
  }

  assignDataKey(encryptedDataKey: Buffer): void {
    if (!this.kmsKeyId) {
      throw new RuleViolationError({ message: `${this.describe()} has no KMS key to encrypt a data key` });
    }
    if (this.dataKey) throw new RuleViolationError({ message: `${this.describe()} already has a data key` });
    this.dataKey = encryptedDataKey;
  }

  material(): EncryptedDataKey {
    if (!this.kmsKeyId || !this.dataKey) throw new RuleViolationError({ message: `Invalid ${this.kind} KMS` });
    return EncryptedDataKey.restore({ kmsKeyId: this.kmsKeyId, encryptedDataKey: this.dataKey, orgId: this.orgId });
  }

  private describe(): string {
    return `${this.kind === "organization" ? "Organization" : "Project"} '${this.ownerId}'`;
  }
}
