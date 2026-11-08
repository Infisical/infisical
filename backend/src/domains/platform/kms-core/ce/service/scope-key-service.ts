import slugify from "@sindresorhus/slugify";

import { ReadFrom, TReadOptions } from "@app/domains/lib/data-access-db";
import { TTransactionRunner } from "@app/domains/lib/transaction-runner";
import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ConflictError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TKmsCoreDataAccess } from "../data-access/kms-core-data-access";
import { KmsKey, KmsKeyUsage } from "../model/kms-key";
import { ProjectKeyBackup } from "../model/project-key-backup";
import { WrappedKeyPayload } from "../model/wrapped-key";
import { CertificateKeyTaken } from "./certificate-key-taken";
import {
  dataKeyCipherPair,
  keyDecryptor,
  keyEncryptor,
  newDataKey,
  requireKey,
  TKmsCoreState,
  wrapWithRootKey
} from "./key-material";
import {
  KmsDataKey,
  KmsType,
  TCipherPair,
  TEncryptWithKmsDataKeyDTO,
  TUpdateProjectSecretManagerKmsKeyDTO
} from "./kms-core-types";
import { toKeyDetails, TKmsKeyDetails } from "./kms-key-service";

export type TScopeKeyServiceDeps = {
  transactionRunner: TTransactionRunner<TKmsCoreDataAccess>;
  dataAccess: TKmsCoreDataAccess;
  state: TKmsCoreState;
};

// For a read that must see a key or column written moments ago, which a replica may not have yet.
const PRIMARY: TReadOptions = { readFrom: ReadFrom.Primary };

const orgNotFound = (orgId: string) => new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
const projectNotFound = (projectId: string) =>
  new NotFoundError({ message: `Project with ID '${projectId}' not found` });

/**
 * The keys of an org and a project: the KMS key and data key each one gets on first use, the project certificate
 * key, the switch between internal and external keys, and backups. Every first-use creation runs in its own short
 * transaction under the frozen lock ids and writes the column only if it is still empty; callers never hold a
 * transaction while they call here.
 */
export class ScopeKeyService {
  constructor(private readonly deps: TScopeKeyServiceDeps) {}

  async createCipherPairWithDataKey(context: TEncryptWithKmsDataKeyDTO): Promise<TCipherPair> {
    const dataKey =
      context.type === KmsDataKey.SecretManager
        ? await this.projectDataKey(context.projectId)
        : await this.orgDataKey(context.orgId);
    return dataKeyCipherPair(dataKey);
  }

  async getProjectSecretManagerKmsKeyId(projectId: string): Promise<string> {
    return (await this.ensureProjectKmsKeyId(projectId)).kmsKeyId;
  }

  // Created on first use with a compare-and-swap, so concurrent first callers (including pods of the previous
  // release, which take no lock here) all get the one key the project keeps.
  async getProjectCertificateKmsKeyId(projectId: string): Promise<string> {
    const project = await this.deps.dataAccess.scopeKeys.findProject(projectId);
    if (!project) throw projectNotFound(projectId);
    if (project.certificateKmsKeyId) return project.certificateKmsKeyId;

    const key = this.newReservedKey(project.orgId);
    try {
      return await this.deps.transactionRunner.run(async ({ dataAccess }) => {
        await dataAccess.kmsKeys.create(key);
        if (!(await dataAccess.scopeKeys.setProjectCertificateKmsKeyId(projectId, key.id)))
          throw new CertificateKeyTaken();
        return key.id;
      });
    } catch (error) {
      if (!(error instanceof CertificateKeyTaken)) throw error;
    }

    const winner = await this.deps.dataAccess.scopeKeys.findProject(projectId, PRIMARY);
    if (!winner?.certificateKmsKeyId) throw projectNotFound(projectId);
    return winner.certificateKmsKeyId;
  }

  async wrapKey({
    projectId,
    label,
    key
  }: {
    projectId: string;
    label: string;
    key: Buffer;
  }): Promise<Buffer<ArrayBuffer>> {
    const { encryptor } = await this.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
    return encryptor({ plainText: WrappedKeyPayload.build(label, key).payload }).cipherTextBlob;
  }

  // Null when the key was not wrapped for this label. Throws when the ciphertext does not decrypt.
  async unwrapKey({
    projectId,
    label,
    wrappedKey,
    keyBytes
  }: {
    projectId: string;
    label: string;
    wrappedKey: Buffer;
    keyBytes: number;
  }): Promise<Buffer | null> {
    const { decryptor } = await this.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
    return WrappedKeyPayload.restore(decryptor({ cipherTextBlob: wrappedKey })).open(label, keyBytes);
  }

  // Re-wraps the project's data key under another key. The data key itself does not change, so existing
  // ciphertext stays readable. The provider call for an external key runs before the transaction.
  async updateProjectSecretManagerKmsKey({ projectId, kms }: TUpdateProjectSecretManagerKmsKeyDTO) {
    const { state } = this.deps;
    const { kmsKeyId: currentKmsKeyId, orgId } = await this.ensureProjectKmsKeyId(projectId);
    const currentKey = await requireKey(this.deps.dataAccess, currentKmsKeyId, PRIMARY);

    if (kms.type === KmsType.Internal && currentKey.isReserved) {
      return { ...currentKey.toRecord(), isExternal: false };
    }

    let target: KmsKey;
    let newKey: KmsKey | undefined;
    if (kms.type === KmsType.External) {
      target = await requireKey(this.deps.dataAccess, kms.kmsId, PRIMARY);
      if (target.orgId !== orgId)
        throw new ForbiddenRequestError({ message: "KMS ID does not belong in the organization." });
    } else {
      newKey = this.newReservedKey(orgId);
      target = newKey;
    }

    const dataKey = await this.projectDataKey(projectId);
    const { cipherTextBlob } = await (
      await keyEncryptor(state, this.deps.dataAccess, target, PRIMARY)
    )({ plainText: dataKey });

    return this.deps.transactionRunner.run(async ({ dataAccess }) => {
      if (newKey) await dataAccess.kmsKeys.create(newKey);
      const switched = await dataAccess.scopeKeys.switchProjectKey(projectId, {
        expectedKmsKeyId: currentKmsKeyId,
        kmsKeyId: target.id,
        encryptedDataKey: cipherTextBlob
      });
      if (!switched) {
        throw new ConflictError({
          message:
            "The project's KMS key changed while this request was in flight, so it was left unchanged. Retry the change."
        });
      }
      if (currentKey.isReserved) await dataAccess.kmsKeys.deleteById(currentKey.id);
      const switchedTo = (await dataAccess.kmsKeys.findById(target.id)) as KmsKey;
      return { ...switchedTo.toRecord(), isExternal: !currentKey.isReserved };
    });
  }

  async getProjectKeyBackup(projectId: string): Promise<{ secretManager: string }> {
    const project = await this.deps.dataAccess.scopeKeys.findProject(projectId);
    if (!project) throw projectNotFound(projectId);

    const dataKey = await this.projectDataKey(projectId);
    const { kmsKeyId } = await this.ensureOrgKmsKeyId(project.orgId);
    const orgKey = await requireKey(this.deps.dataAccess, kmsKeyId, PRIMARY);
    const { cipherTextBlob } = await (
      await keyEncryptor(this.deps.state, this.deps.dataAccess, orgKey, PRIMARY)
    )({ plainText: dataKey });

    return {
      secretManager: ProjectKeyBackup.create({ projectId, kmsKeyId, encryptedDataKey: cipherTextBlob }).toString()
    };
  }

  // Points the project at a new internal key holding the backed-up data key.
  async loadProjectKeyBackup(projectId: string, backup: string): Promise<{ secretManagerKmsKey: TKmsKeyDetails }> {
    const { state } = this.deps;
    const project = await this.deps.dataAccess.scopeKeys.findProject(projectId, PRIMARY);
    if (!project) throw projectNotFound(projectId);

    const parsed = ProjectKeyBackup.parse(backup, projectId);
    const backupKey = await requireKey(this.deps.dataAccess, parsed.kmsKeyId, PRIMARY);
    if (backupKey.orgId !== project.orgId)
      throw new ForbiddenRequestError({ message: "Backup does not belong to project" });

    const dataKey = await (
      await keyDecryptor(state, this.deps.dataAccess, backupKey, PRIMARY)
    )({ cipherTextBlob: parsed.encryptedDataKey });
    const newKey = this.newReservedKey(project.orgId);
    const { cipherTextBlob } = await (
      await keyEncryptor(state, this.deps.dataAccess, newKey, PRIMARY)
    )({ plainText: dataKey });

    const restored = await this.deps.transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.kmsKeys.create(newKey);
      await dataAccess.scopeKeys.setProjectKey(projectId, { kmsKeyId: newKey.id, encryptedDataKey: cipherTextBlob });
      return (await dataAccess.kmsKeys.findById(newKey.id)) as KmsKey;
    });
    return { secretManagerKmsKey: toKeyDetails(restored) };
  }

  // Deletes the reserved keys a project owned, once nothing references them. Call after the project is gone.
  async deleteProjectKeys({ orgId, kmsKeyIds }: { orgId: string; kmsKeyIds: string[] }): Promise<void> {
    for (const kmsKeyId of kmsKeyIds) {
      // eslint-disable-next-line no-await-in-loop -- at most two keys per project
      await this.deps.transactionRunner.run(async ({ dataAccess }) => {
        const key = await dataAccess.kmsKeys.findById(kmsKeyId);
        if (!key || key.isExternal || !key.isReserved) return;
        if (key.orgId !== orgId) throw new ForbiddenRequestError({ message: "KMS doesn't belong to organization" });
        if (await dataAccess.scopeKeys.isKeyReferenced(kmsKeyId)) return;
        await dataAccess.kmsKeys.deleteById(kmsKeyId);
      });
    }
  }

  private newReservedKey(orgId: string): KmsKey {
    const material = crypto.randomBytes(KmsKey.symmetricKeyLength(SymmetricKeyAlgorithm.AES_GCM_256));
    return KmsKey.createInternal({
      orgId,
      name: slugify(alphaNumericNanoId(8).toLowerCase()),
      keyUsage: KmsKeyUsage.ENCRYPT_DECRYPT,
      encryptionAlgorithm: SymmetricKeyAlgorithm.AES_GCM_256,
      encryptedKey: wrapWithRootKey(this.deps.state, material),
      isReserved: true,
      isExportable: true,
      hasDeleteProtection: false
    });
  }

  private async ensureOrgKmsKeyId(orgId: string): Promise<{ kmsKeyId: string; created: boolean }> {
    const org = await this.deps.dataAccess.scopeKeys.findOrg(orgId);
    if (!org) throw orgNotFound(orgId);
    if (org.kmsKeyId) return { kmsKeyId: org.kmsKeyId, created: false };

    const key = this.newReservedKey(orgId);
    return this.deps.transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.locks.orgKey(orgId);
      const fresh = await dataAccess.scopeKeys.findOrg(orgId);
      if (!fresh) throw orgNotFound(orgId);
      if (fresh.kmsKeyId) return { kmsKeyId: fresh.kmsKeyId, created: true };
      await dataAccess.kmsKeys.create(key);
      await dataAccess.scopeKeys.setOrgKmsKeyId(orgId, key.id);
      return { kmsKeyId: key.id, created: true };
    });
  }

  private async ensureProjectKmsKeyId(
    projectId: string
  ): Promise<{ kmsKeyId: string; orgId: string; created: boolean }> {
    const project = await this.deps.dataAccess.scopeKeys.findProject(projectId);
    if (!project) throw projectNotFound(projectId);
    if (project.kmsKeyId) return { kmsKeyId: project.kmsKeyId, orgId: project.orgId, created: false };

    const key = this.newReservedKey(project.orgId);
    return this.deps.transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.locks.projectKey(projectId);
      const fresh = await dataAccess.scopeKeys.findProject(projectId);
      if (!fresh) throw projectNotFound(projectId);
      if (fresh.kmsKeyId) return { kmsKeyId: fresh.kmsKeyId, orgId: fresh.orgId, created: true };
      await dataAccess.kmsKeys.create(key);
      await dataAccess.scopeKeys.setProjectKmsKeyId(projectId, key.id);
      return { kmsKeyId: key.id, orgId: fresh.orgId, created: true };
    });
  }

  private async orgDataKey(orgId: string): Promise<Buffer> {
    const { kmsKeyId, created } = await this.ensureOrgKmsKeyId(orgId);
    // Right after a creation, read the primary: a replica may not have the new rows yet.
    let readOptions: TReadOptions | undefined = created ? PRIMARY : undefined;
    const org = await this.deps.dataAccess.scopeKeys.findOrg(orgId, readOptions);
    if (!org) throw orgNotFound(orgId);

    let { encryptedDataKey } = org;
    if (!encryptedDataKey) {
      const dataKey = newDataKey();
      const kmsKey = await requireKey(this.deps.dataAccess, kmsKeyId, PRIMARY);
      const { cipherTextBlob } = await (
        await keyEncryptor(this.deps.state, this.deps.dataAccess, kmsKey, PRIMARY)
      )({ plainText: dataKey });
      const existing = await this.deps.transactionRunner.run(async ({ dataAccess }) => {
        await dataAccess.locks.orgDataKey(orgId);
        const fresh = await dataAccess.scopeKeys.findOrg(orgId);
        if (fresh?.encryptedDataKey) return fresh.encryptedDataKey;
        await dataAccess.scopeKeys.setOrgDataKey(orgId, cipherTextBlob);
        return null;
      });
      if (!existing) return dataKey;
      encryptedDataKey = existing;
      readOptions = PRIMARY;
    }

    const kmsKey = await requireKey(this.deps.dataAccess, kmsKeyId, readOptions);
    return (await keyDecryptor(this.deps.state, this.deps.dataAccess, kmsKey, readOptions))({
      cipherTextBlob: encryptedDataKey
    });
  }

  private async projectDataKey(projectId: string): Promise<Buffer> {
    const { kmsKeyId, created } = await this.ensureProjectKmsKeyId(projectId);
    let readOptions: TReadOptions | undefined = created ? PRIMARY : undefined;
    const project = await this.deps.dataAccess.scopeKeys.findProject(projectId, readOptions);
    if (!project) throw projectNotFound(projectId);

    let { encryptedDataKey } = project;
    if (!encryptedDataKey) {
      // The data key is encrypted before the lock: for an external key that is a provider call.
      const dataKey = newDataKey();
      const kmsKey = await requireKey(this.deps.dataAccess, kmsKeyId, PRIMARY);
      const { cipherTextBlob } = await (
        await keyEncryptor(this.deps.state, this.deps.dataAccess, kmsKey, PRIMARY)
      )({ plainText: dataKey });
      const existing = await this.deps.transactionRunner.run(async ({ dataAccess }) => {
        await dataAccess.locks.projectDataKey(projectId);
        const fresh = await dataAccess.scopeKeys.findProject(projectId);
        if (!fresh) throw projectNotFound(projectId);
        if (fresh.encryptedDataKey) return fresh.encryptedDataKey;
        await dataAccess.scopeKeys.setProjectDataKey(projectId, cipherTextBlob);
        return null;
      });
      if (!existing) return dataKey;
      encryptedDataKey = existing;
      readOptions = PRIMARY;
    }

    if (!encryptedDataKey) throw new BadRequestError({ message: "Missing project data key" });
    const kmsKey = await requireKey(this.deps.dataAccess, kmsKeyId, readOptions);
    return (await keyDecryptor(this.deps.state, this.deps.dataAccess, kmsKey, readOptions))({
      cipherTextBlob: encryptedDataKey
    });
  }
}
