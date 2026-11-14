import { ProjectKey } from "../models/project-key";
import { TProjectKeyStore } from "../services/dependencies";
import { InMemoryPlatformRows, TInMemoryProjectRow } from "./in-memory-platform-rows";

type TClaimColumn = "kmsSecretManagerKeyId" | "kmsSecretManagerEncryptedDataKey" | "kmsCertificateKeyId";

export class InMemoryProjectKeyStore implements TProjectKeyStore {
  constructor(private readonly rows: InMemoryPlatformRows) {}

  async find(projectId: string) {
    if (this.rows.autoCreate && !this.rows.projects.has(projectId)) {
      this.rows.addProject(projectId, `org-of-${projectId}`);
    }
    const project = this.rows.projects.get(projectId);
    if (!project || project.deleteAfter) return null;
    return ProjectKey.restore({
      projectId: project.id,
      orgId: project.orgId,
      kmsKeyId: project.kmsSecretManagerKeyId,
      encryptedDataKey: project.kmsSecretManagerEncryptedDataKey,
      certificateKmsKeyId: project.kmsCertificateKeyId
    });
  }

  async claimKmsKey(key: ProjectKey) {
    const { projectId, kmsKeyId } = key.toJSON();
    return this.claim(projectId, "kmsSecretManagerKeyId", kmsKeyId);
  }

  async claimDataKey(key: ProjectKey) {
    const { projectId, encryptedDataKey } = key.toJSON();
    return this.claim(projectId, "kmsSecretManagerEncryptedDataKey", encryptedDataKey);
  }

  async claimCertificateKey(key: ProjectKey) {
    const { projectId, certificateKmsKeyId } = key.toJSON();
    return this.claim(projectId, "kmsCertificateKeyId", certificateKmsKeyId);
  }

  async switchKey(key: ProjectKey, expectedKmsKeyId: string) {
    const { projectId, kmsKeyId, encryptedDataKey } = key.toJSON();
    const project = this.rows.projects.get(projectId);
    if (!project || project.kmsSecretManagerKeyId !== expectedKmsKeyId) return false;
    this.rows.projects.set(projectId, {
      ...project,
      kmsSecretManagerKeyId: kmsKeyId,
      kmsSecretManagerEncryptedDataKey: encryptedDataKey
    });
    return true;
  }

  async save(key: ProjectKey) {
    const { projectId, kmsKeyId, encryptedDataKey } = key.toJSON();
    const project = this.rows.projects.get(projectId);
    if (!project) return;
    this.rows.projects.set(projectId, {
      ...project,
      kmsSecretManagerKeyId: kmsKeyId,
      kmsSecretManagerEncryptedDataKey: encryptedDataKey
    });
  }

  async referencesKey(kmsKeyId: string) {
    return [...this.rows.projects.values()].some(
      (project) => project.kmsSecretManagerKeyId === kmsKeyId || project.kmsCertificateKeyId === kmsKeyId
    );
  }

  private claim<K extends TClaimColumn>(projectId: string, column: K, value: TInMemoryProjectRow[K]) {
    const project = this.rows.projects.get(projectId);
    if (!project || value === null || project[column] !== null) return false;
    this.rows.projects.set(projectId, { ...project, [column]: value });
    return true;
  }
}
