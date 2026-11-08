import { createHash } from "node:crypto";

import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";

// Frozen format: v1.<projectId>.secretManager.<kmsKeyId>.<base64 encrypted data key>.<sha256 hex of the rest>
export class ProjectKeyBackup {
  private constructor(
    readonly projectId: string,
    // The org key that encrypted the data key.
    readonly kmsKeyId: string,
    readonly encryptedDataKey: Buffer,
    private readonly value: string
  ) {}

  static create(input: { projectId: string; kmsKeyId: string; encryptedDataKey: Buffer }): ProjectKeyBackup {
    const body = `v1.${input.projectId}.secretManager.${input.kmsKeyId}.${input.encryptedDataKey.toString("base64")}`;
    const hash = createHash("sha256").update(body).digest("hex");
    return new ProjectKeyBackup(input.projectId, input.kmsKeyId, input.encryptedDataKey, `${body}.${hash}`);
  }

  // Refuses a backup whose hash does not match, and one written for another project.
  static parse(backup: string, expectedProjectId: string): ProjectKeyBackup {
    const [, projectId, , kmsKeyId, base64EncryptedDataKey, hash] = backup.split(".");
    const computed = createHash("sha256")
      .update(backup.substring(0, backup.lastIndexOf(".")))
      .digest("hex");
    if (computed !== hash) throw new BadRequestError({ message: "Invalid backup" });
    if (projectId !== expectedProjectId) {
      throw new ForbiddenRequestError({ message: "Backup does not belong to project" });
    }
    return new ProjectKeyBackup(projectId, kmsKeyId, Buffer.from(base64EncryptedDataKey, "base64"), backup);
  }

  toString(): string {
    return this.value;
  }
}
