import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { ProjectKey } from "../models/project-key";
import { TProjectKeyStore } from "../services/dependencies";

// The key columns on projects, which no domain owns yet; KMS Core writes only these columns.
export class ProjectKeyStore implements TProjectKeyStore {
  // Data migrations older than 20260602100100_add-soft-delete-to-projects run KMS Core before the column exists. Once
  // it has been seen it stays, so the schema is asked only until then.
  private static deleteAfterColumnSeen = false;

  constructor(private readonly knex: () => Knex) {}

  static resetColumnProbe(): void {
    ProjectKeyStore.deleteAfterColumnSeen = false;
  }

  async find(projectId: string): Promise<ProjectKey | null> {
    try {
      const knex = this.knex();
      const query = knex(TableName.Project).where({ id: projectId });
      if (await ProjectKeyStore.hasDeleteAfterColumn(knex)) void query.whereNull("deleteAfter");
      const row = await query.first(
        "id",
        "orgId",
        "kmsSecretManagerKeyId",
        "kmsSecretManagerEncryptedDataKey",
        "kmsCertificateKeyId"
      );
      if (!row) return null;
      return ProjectKey.restore({
        projectId: row.id,
        orgId: row.orgId,
        kmsKeyId: row.kmsSecretManagerKeyId ?? null,
        encryptedDataKey: row.kmsSecretManagerEncryptedDataKey ?? null,
        certificateKmsKeyId: row.kmsCertificateKeyId ?? null
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project keys" });
    }
  }

  claimKmsKey(key: ProjectKey): Promise<boolean> {
    const { projectId, kmsKeyId } = key.toJSON();
    return this.claim(projectId, "kmsSecretManagerKeyId", kmsKeyId);
  }

  claimDataKey(key: ProjectKey): Promise<boolean> {
    const { projectId, encryptedDataKey } = key.toJSON();
    return this.claim(projectId, "kmsSecretManagerEncryptedDataKey", encryptedDataKey);
  }

  claimCertificateKey(key: ProjectKey): Promise<boolean> {
    const { projectId, certificateKmsKeyId } = key.toJSON();
    return this.claim(projectId, "kmsCertificateKeyId", certificateKmsKeyId);
  }

  async switchKey(key: ProjectKey, expectedKmsKeyId: string): Promise<boolean> {
    try {
      const { projectId, kmsKeyId, encryptedDataKey } = key.toJSON();
      const updated = await this.knex()(TableName.Project)
        .where({ id: projectId, kmsSecretManagerKeyId: expectedKmsKeyId })
        .update({ kmsSecretManagerKeyId: kmsKeyId, kmsSecretManagerEncryptedDataKey: encryptedDataKey });
      return updated > 0;
    } catch (error) {
      throw new DatabaseError({ error, name: "Switch project key" });
    }
  }

  async save(key: ProjectKey): Promise<void> {
    try {
      const { projectId, kmsKeyId, encryptedDataKey } = key.toJSON();
      await this.knex()(TableName.Project)
        .where({ id: projectId })
        .update({ kmsSecretManagerKeyId: kmsKeyId, kmsSecretManagerEncryptedDataKey: encryptedDataKey });
    } catch (error) {
      throw new DatabaseError({ error, name: "Save project key" });
    }
  }

  async referencesKey(kmsKeyId: string): Promise<boolean> {
    try {
      const project = await this.knex()(TableName.Project)
        .where((qb) => {
          void qb.where({ kmsSecretManagerKeyId: kmsKeyId }).orWhere({ kmsCertificateKeyId: kmsKeyId });
        })
        .first("id");
      return Boolean(project);
    } catch (error) {
      throw new DatabaseError({ error, name: "Check project KMS key references" });
    }
  }

  private static async hasDeleteAfterColumn(knex: Knex): Promise<boolean> {
    if (ProjectKeyStore.deleteAfterColumnSeen) return true;
    const exists = await knex.schema.hasColumn(TableName.Project, "deleteAfter");
    if (exists) ProjectKeyStore.deleteAfterColumnSeen = true;
    return exists;
  }

  private async claim(
    projectId: string,
    column: "kmsSecretManagerKeyId" | "kmsSecretManagerEncryptedDataKey" | "kmsCertificateKeyId",
    value: string | Buffer | null
  ): Promise<boolean> {
    try {
      if (value === null) throw new Error(`The project key has no ${column} to claim`);
      const updated = await this.knex()(TableName.Project)
        .where({ id: projectId })
        .whereNull(column)
        .update({ [column]: value } as never);
      return updated > 0;
    } catch (error) {
      throw new DatabaseError({ error, name: `Claim ${column}` });
    }
  }
}
