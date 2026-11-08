import { TableName } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";

import { ScopeKey, ScopeKind } from "../model/scope-key";

export type TScopeKeyDataAccess = {
  findOrg(orgId: string, options?: TReadOptions): Promise<ScopeKey | undefined>;
  // A project scheduled for deletion is not found.
  findProject(projectId: string, options?: TReadOptions): Promise<ScopeKey | undefined>;
  // Each set* writes only when the column is still empty and reports whether it did, so a second writer
  // (a pod of the previous release, which takes no lock for the certificate key) never overwrites the first.
  setOrgKmsKeyId(orgId: string, kmsKeyId: string): Promise<boolean>;
  setOrgDataKey(orgId: string, encryptedDataKey: Buffer): Promise<boolean>;
  setProjectKmsKeyId(projectId: string, kmsKeyId: string): Promise<boolean>;
  setProjectDataKey(projectId: string, encryptedDataKey: Buffer): Promise<boolean>;
  setProjectCertificateKmsKeyId(projectId: string, kmsKeyId: string): Promise<boolean>;
  // Points the project at another key and data key ciphertext, only if it still uses expectedKmsKeyId.
  switchProjectKey(
    projectId: string,
    change: { expectedKmsKeyId: string; kmsKeyId: string; encryptedDataKey: Buffer }
  ): Promise<boolean>;
  // A restore from backup: unconditional, the caller has already checked the backup belongs to the project.
  setProjectKey(projectId: string, change: { kmsKeyId: string; encryptedDataKey: Buffer }): Promise<void>;
  // Whether any org or project, including one scheduled for deletion, still uses the key.
  isKeyReferenced(kmsKeyId: string, options?: TReadOptions): Promise<boolean>;
};

// The key columns on organizations and projects. Those tables belong to no domain yet; KMS Core writes only these
// columns.
export class ScopeKeyDataAccess implements TScopeKeyDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  async findOrg(orgId: string, options?: TReadOptions): Promise<ScopeKey | undefined> {
    try {
      const row = await this.db
        .reader(options)(TableName.Organization)
        .where({ id: orgId })
        .first("id", "kmsDefaultKeyId", "kmsEncryptedDataKey");
      if (!row) return undefined;
      return ScopeKey.restore({
        kind: ScopeKind.Organization,
        scopeId: row.id,
        orgId: row.id,
        kmsKeyId: row.kmsDefaultKeyId ?? null,
        encryptedDataKey: row.kmsEncryptedDataKey ?? null,
        certificateKmsKeyId: null
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org keys" });
    }
  }

  async findProject(projectId: string, options?: TReadOptions): Promise<ScopeKey | undefined> {
    try {
      const row = await this.db
        .reader(options)(TableName.Project)
        .where({ id: projectId })
        .whereNull("deleteAfter")
        .first("id", "orgId", "kmsSecretManagerKeyId", "kmsSecretManagerEncryptedDataKey", "kmsCertificateKeyId");
      if (!row) return undefined;
      return ScopeKey.restore({
        kind: ScopeKind.Project,
        scopeId: row.id,
        orgId: row.orgId,
        kmsKeyId: row.kmsSecretManagerKeyId ?? null,
        encryptedDataKey: row.kmsSecretManagerEncryptedDataKey ?? null,
        certificateKmsKeyId: row.kmsCertificateKeyId ?? null
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project keys" });
    }
  }

  setOrgKmsKeyId(orgId: string, kmsKeyId: string) {
    return this.setIfEmpty(TableName.Organization, orgId, "kmsDefaultKeyId", kmsKeyId);
  }

  setOrgDataKey(orgId: string, encryptedDataKey: Buffer) {
    return this.setIfEmpty(TableName.Organization, orgId, "kmsEncryptedDataKey", encryptedDataKey);
  }

  setProjectKmsKeyId(projectId: string, kmsKeyId: string) {
    return this.setIfEmpty(TableName.Project, projectId, "kmsSecretManagerKeyId", kmsKeyId);
  }

  setProjectDataKey(projectId: string, encryptedDataKey: Buffer) {
    return this.setIfEmpty(TableName.Project, projectId, "kmsSecretManagerEncryptedDataKey", encryptedDataKey);
  }

  setProjectCertificateKmsKeyId(projectId: string, kmsKeyId: string) {
    return this.setIfEmpty(TableName.Project, projectId, "kmsCertificateKeyId", kmsKeyId);
  }

  async switchProjectKey(
    projectId: string,
    {
      expectedKmsKeyId,
      kmsKeyId,
      encryptedDataKey
    }: { expectedKmsKeyId: string; kmsKeyId: string; encryptedDataKey: Buffer }
  ): Promise<boolean> {
    try {
      const updated = await this.db
        .writer()(TableName.Project)
        .where({ id: projectId, kmsSecretManagerKeyId: expectedKmsKeyId })
        .update({ kmsSecretManagerKeyId: kmsKeyId, kmsSecretManagerEncryptedDataKey: encryptedDataKey });
      return updated > 0;
    } catch (error) {
      throw new DatabaseError({ error, name: "Switch project key" });
    }
  }

  async setProjectKey(
    projectId: string,
    { kmsKeyId, encryptedDataKey }: { kmsKeyId: string; encryptedDataKey: Buffer }
  ) {
    try {
      await this.db
        .writer()(TableName.Project)
        .where({ id: projectId })
        .update({ kmsSecretManagerKeyId: kmsKeyId, kmsSecretManagerEncryptedDataKey: encryptedDataKey });
    } catch (error) {
      throw new DatabaseError({ error, name: "Set project key" });
    }
  }

  async isKeyReferenced(kmsKeyId: string, options?: TReadOptions): Promise<boolean> {
    try {
      const project = await this.db
        .reader(options)(TableName.Project)
        .where({ kmsSecretManagerKeyId: kmsKeyId })
        .orWhere({ kmsCertificateKeyId: kmsKeyId })
        .first("id");
      if (project) return true;
      const org = await this.db
        .reader(options)(TableName.Organization)
        .where({ kmsDefaultKeyId: kmsKeyId })
        .first("id");
      return Boolean(org);
    } catch (error) {
      throw new DatabaseError({ error, name: "Check KMS key references" });
    }
  }

  private async setIfEmpty(
    table: TableName.Organization | TableName.Project,
    id: string,
    column: string,
    value: string | Buffer
  ): Promise<boolean> {
    try {
      const updated = await this.db
        .writer()(table)
        .where({ id })
        .whereNull(column)
        .update({ [column]: value } as never);
      return updated > 0;
    } catch (error) {
      throw new DatabaseError({ error, name: `Set ${column}` });
    }
  }
}
