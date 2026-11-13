import { RuleViolationError } from "@app/domains/lib/errors";

import { EncryptedDataKey } from "./encrypted-data-key";
import { ProjectKeyBackup } from "./project-key-backup";

export type TProjectKeyRecord = {
  projectId: string;
  orgId: string;
  // projects.kmsSecretManagerKeyId: the KMS key that encrypts the data key.
  kmsKeyId: string | null;
  // projects.kmsSecretManagerEncryptedDataKey.
  encryptedDataKey: Buffer | null;
  // projects.kmsCertificateKeyId.
  certificateKmsKeyId: string | null;
};

const BACKUP_FOREIGN = "Backup does not belong to project";

// The key columns a project carries. KMS Core is the only writer of these columns.
export class ProjectKey {
  private constructor(
    readonly projectId: string,
    readonly orgId: string,
    private kmsKeyId: string | null,
    private dataKey: Buffer | null,
    private certificateKeyId: string | null
  ) {}

  static restore(record: TProjectKeyRecord): ProjectKey {
    return new ProjectKey(
      record.projectId,
      record.orgId,
      record.kmsKeyId,
      record.encryptedDataKey,
      record.certificateKmsKeyId
    );
  }

  hasKmsKey(): boolean {
    return this.kmsKeyId !== null;
  }

  hasDataKey(): boolean {
    return this.dataKey !== null;
  }

  hasCertificateKey(): boolean {
    return this.certificateKeyId !== null;
  }

  // For the caller that reads the KMS key and has no data key yet; once both exist, `material()` carries the id.
  get currentKmsKeyId(): string | null {
    return this.kmsKeyId;
  }

  get certificateKmsKeyId(): string | null {
    return this.certificateKeyId;
  }

  assignKmsKey(kmsKeyId: string): void {
    if (this.kmsKeyId) throw new RuleViolationError({ message: `Project '${this.projectId}' already has a KMS key` });
    this.kmsKeyId = kmsKeyId;
  }

  assignDataKey(encryptedDataKey: Buffer): void {
    if (!this.kmsKeyId) {
      throw new RuleViolationError({ message: `Project '${this.projectId}' has no KMS key to encrypt a data key` });
    }
    if (this.dataKey) throw new RuleViolationError({ message: `Project '${this.projectId}' already has a data key` });
    this.dataKey = encryptedDataKey;
  }

  assignCertificateKey(kmsKeyId: string): void {
    if (this.certificateKeyId) {
      throw new RuleViolationError({ message: `Project '${this.projectId}' already has a certificate key` });
    }
    this.certificateKeyId = kmsKeyId;
  }

  // Points the project at another KMS key and the data key ciphertext it produced. Returns the key id it used, which
  // the store compares against so a concurrent switch is never overwritten.
  switchTo(kmsKeyId: string, encryptedDataKey: Buffer): string {
    if (!this.kmsKeyId || !this.dataKey) {
      throw new RuleViolationError({ message: `Project '${this.projectId}' has no data key to switch` });
    }
    const previousKmsKeyId = this.kmsKeyId;
    this.kmsKeyId = kmsKeyId;
    this.dataKey = encryptedDataKey;
    return previousKmsKeyId;
  }

  // `wrapped` is this project's data key encrypted under the org's KMS key.
  backup(wrapped: EncryptedDataKey): ProjectKeyBackup {
    if (wrapped.orgId !== this.orgId) throw new RuleViolationError({ message: BACKUP_FOREIGN });
    return ProjectKeyBackup.create({
      projectId: this.projectId,
      kmsKeyId: wrapped.kmsKeyId,
      encryptedDataKey: wrapped.encryptedDataKey
    });
  }

  // Run before decrypting the backup, so a backup of another project or org is refused before any key is opened.
  assertRestorable(backup: ProjectKeyBackup, backupKeyOrgId: string): void {
    if (backup.projectId !== this.projectId || backupKeyOrgId !== this.orgId) {
      throw new RuleViolationError({ message: BACKUP_FOREIGN });
    }
  }

  // `restored` is the backup's data key encrypted under the project's new KMS key.
  restoreFrom(backup: ProjectKeyBackup, backupKeyOrgId: string, restored: EncryptedDataKey): void {
    this.assertRestorable(backup, backupKeyOrgId);
    if (restored.orgId !== this.orgId) throw new RuleViolationError({ message: BACKUP_FOREIGN });
    this.kmsKeyId = restored.kmsKeyId;
    this.dataKey = restored.encryptedDataKey;
  }

  material(): EncryptedDataKey {
    if (!this.kmsKeyId || !this.dataKey) throw new RuleViolationError({ message: "Invalid project KMS" });
    return EncryptedDataKey.restore({ kmsKeyId: this.kmsKeyId, encryptedDataKey: this.dataKey, orgId: this.orgId });
  }

  toJSON(): TProjectKeyRecord {
    return {
      projectId: this.projectId,
      orgId: this.orgId,
      kmsKeyId: this.kmsKeyId,
      encryptedDataKey: this.dataKey,
      certificateKmsKeyId: this.certificateKeyId
    };
  }
}
