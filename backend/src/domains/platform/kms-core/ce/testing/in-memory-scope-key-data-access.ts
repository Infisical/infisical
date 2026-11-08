import { TScopeKeyDataAccess } from "../data-access/scope-key-data-access";
import { ScopeKey, ScopeKind } from "../model/scope-key";
import { InMemoryKmsCoreState, TInMemoryOrg, TInMemoryProject } from "./in-memory-kms-core-state";

export class InMemoryScopeKeyDataAccess implements TScopeKeyDataAccess {
  constructor(private readonly state: InMemoryKmsCoreState) {}

  async findOrg(orgId: string) {
    if (this.state.autoCreateScopes && !this.state.tables.orgs.has(orgId)) this.state.addOrg(orgId);
    const org = this.state.tables.orgs.get(orgId);
    if (!org) return undefined;
    return ScopeKey.restore({
      kind: ScopeKind.Organization,
      scopeId: org.id,
      orgId: org.id,
      kmsKeyId: org.kmsDefaultKeyId,
      encryptedDataKey: org.kmsEncryptedDataKey,
      certificateKmsKeyId: null
    });
  }

  async findProject(projectId: string) {
    if (this.state.autoCreateScopes && !this.state.tables.projects.has(projectId)) {
      this.state.addProject(projectId, `org-of-${projectId}`);
    }
    const project = this.state.tables.projects.get(projectId);
    if (!project || project.deleteAfter) return undefined;
    return ScopeKey.restore({
      kind: ScopeKind.Project,
      scopeId: project.id,
      orgId: project.orgId,
      kmsKeyId: project.kmsSecretManagerKeyId,
      encryptedDataKey: project.kmsSecretManagerEncryptedDataKey,
      certificateKmsKeyId: project.kmsCertificateKeyId
    });
  }

  async setOrgKmsKeyId(orgId: string, kmsKeyId: string) {
    return this.setOrg(orgId, "kmsDefaultKeyId", kmsKeyId);
  }

  async setOrgDataKey(orgId: string, encryptedDataKey: Buffer) {
    return this.setOrg(orgId, "kmsEncryptedDataKey", encryptedDataKey);
  }

  async setProjectKmsKeyId(projectId: string, kmsKeyId: string) {
    return this.setProject(projectId, "kmsSecretManagerKeyId", kmsKeyId);
  }

  async setProjectDataKey(projectId: string, encryptedDataKey: Buffer) {
    return this.setProject(projectId, "kmsSecretManagerEncryptedDataKey", encryptedDataKey);
  }

  async setProjectCertificateKmsKeyId(projectId: string, kmsKeyId: string) {
    return this.setProject(projectId, "kmsCertificateKeyId", kmsKeyId);
  }

  async switchProjectKey(
    projectId: string,
    {
      expectedKmsKeyId,
      kmsKeyId,
      encryptedDataKey
    }: { expectedKmsKeyId: string; kmsKeyId: string; encryptedDataKey: Buffer }
  ) {
    const project = this.state.tables.projects.get(projectId);
    if (!project || project.kmsSecretManagerKeyId !== expectedKmsKeyId) return false;
    this.state.tables.projects.set(projectId, {
      ...project,
      kmsSecretManagerKeyId: kmsKeyId,
      kmsSecretManagerEncryptedDataKey: encryptedDataKey
    });
    return true;
  }

  async setProjectKey(
    projectId: string,
    { kmsKeyId, encryptedDataKey }: { kmsKeyId: string; encryptedDataKey: Buffer }
  ) {
    const project = this.state.tables.projects.get(projectId);
    if (project) {
      this.state.tables.projects.set(projectId, {
        ...project,
        kmsSecretManagerKeyId: kmsKeyId,
        kmsSecretManagerEncryptedDataKey: encryptedDataKey
      });
    }
  }

  async isKeyReferenced(kmsKeyId: string) {
    return (
      [...this.state.tables.projects.values()].some(
        (project) => project.kmsSecretManagerKeyId === kmsKeyId || project.kmsCertificateKeyId === kmsKeyId
      ) || [...this.state.tables.orgs.values()].some((org) => org.kmsDefaultKeyId === kmsKeyId)
    );
  }

  private setOrg<K extends keyof TInMemoryOrg>(orgId: string, column: K, value: TInMemoryOrg[K]) {
    const org = this.state.tables.orgs.get(orgId);
    if (!org || org[column] !== null) return false;
    this.state.tables.orgs.set(orgId, { ...org, [column]: value });
    return true;
  }

  private setProject<K extends keyof TInMemoryProject>(projectId: string, column: K, value: TInMemoryProject[K]) {
    const project = this.state.tables.projects.get(projectId);
    if (!project || project[column] !== null) return false;
    this.state.tables.projects.set(projectId, { ...project, [column]: value });
    return true;
  }
}
