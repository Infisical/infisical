import { RuleViolationError } from "@app/domains/lib/errors";

import { DataKeyOwner } from "./data-key-owner";
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

export class ProjectKey extends DataKeyOwner {
  private constructor(
    readonly projectId: string,
    orgId: string,
    kmsKeyId: string | null,
    dataKey: Buffer | null,
    private certificateKeyId: string | null
  ) {
    super("project", projectId, orgId, kmsKeyId, dataKey);
  }

  static restore(record: TProjectKeyRecord): ProjectKey {
    return new ProjectKey(
      record.projectId,
      record.orgId,
      record.kmsKeyId,
      record.encryptedDataKey,
      record.certificateKmsKeyId
    );
  }

  get certificateKmsKeyId(): string | null {
    return this.certificateKeyId;
  }

  assignCertificateKey(kmsKeyId: string): void {
    if (this.certificateKeyId) {
      throw new RuleViolationError({ message: `Project '${this.projectId}' already has a certificate key` });
    }
    this.certificateKeyId = kmsKeyId;
  }

  // Returns the previous key id so the store can refuse to overwrite a concurrent switch.
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

  // Runs before decrypting, so a backup of another project or org is refused before any key is opened.
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
