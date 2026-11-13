import slugify from "@sindresorhus/slugify";

import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { ConflictError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TKmsCoreDataAccess } from "../data-access/kms-core-data-access";
import { ReadFrom, TReadOptions } from "../lib/data-access-db";
import { TTransactionRunner } from "../lib/transaction-runner";
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

// One read of an org's or project's key columns. The data key and the id of the key that encrypts it always come from
// the same row, so a key switch committing in between can never pair one key with the other's ciphertext.
type TScopeKeySnapshot = {
  kmsKeyId: string;
  orgId: string;
  encryptedDataKey: Buffer | null;
  // How to read the KMS key itself: the primary when it was just created or the caller asked for the primary.
  keyReadOptions?: TReadOptions;
};

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

  // A caller that has just committed the org or project passes ReadFrom.Primary: a replica may not have it yet.
  async createCipherPairWithDataKey(context: TEncryptWithKmsDataKeyDTO, options?: TReadOptions): Promise<TCipherPair> {
    const dataKey =
      context.type === KmsDataKey.SecretManager
        ? await this.projectDataKey(context.projectId, options)
        : await this.orgDataKey(context.orgId, options);
    return dataKeyCipherPair(dataKey);
  }

  async getProjectSecretManagerKmsKeyId(projectId: string, options?: TReadOptions): Promise<string> {
    const project = await this.ensureProjectKmsKeyId(projectId, options);
    return project.kmsKeyId;
  }

  // Created on first use with a compare-and-swap, so concurrent first callers (including pods of the previous
  // release, which take no lock here) all get the one key the project keeps.
  async getProjectCertificateKmsKeyId(projectId: string, options?: TReadOptions): Promise<string> {
    const project = await this.deps.dataAccess.scopeKeys.findProject(projectId, options);
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
    const project = await this.ensureProjectKmsKeyId(projectId, PRIMARY);
    const { kmsKeyId: currentKmsKeyId, orgId } = project;
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

    const dataKey = await this.decryptProjectDataKey(projectId, project);
    const encryptor = await keyEncryptor(state, this.deps.dataAccess, target, PRIMARY);
    const { cipherTextBlob } = await encryptor({ plainText: dataKey });

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
    const encryptor = await keyEncryptor(this.deps.state, this.deps.dataAccess, orgKey, PRIMARY);
    const { cipherTextBlob } = await encryptor({ plainText: dataKey });

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

    const decryptor = await keyDecryptor(state, this.deps.dataAccess, backupKey, PRIMARY);
    const dataKey = await decryptor({ cipherTextBlob: parsed.encryptedDataKey });
    const newKey = this.newReservedKey(project.orgId);
    const encryptor = await keyEncryptor(state, this.deps.dataAccess, newKey, PRIMARY);
    const { cipherTextBlob } = await encryptor({ plainText: dataKey });

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

  private async ensureOrgKmsKeyId(orgId: string, options?: TReadOptions): Promise<TScopeKeySnapshot> {
    const org = await this.deps.dataAccess.scopeKeys.findOrg(orgId, options);
    if (!org) throw orgNotFound(orgId);
    if (org.kmsKeyId) {
      return { kmsKeyId: org.kmsKeyId, orgId, encryptedDataKey: org.encryptedDataKey, keyReadOptions: options };
    }

    const key = this.newReservedKey(orgId);
    return this.deps.transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.locks.orgKey(orgId);
      const fresh = await dataAccess.scopeKeys.findOrg(orgId);
      if (!fresh) throw orgNotFound(orgId);
      if (fresh.kmsKeyId) {
        return { kmsKeyId: fresh.kmsKeyId, orgId, encryptedDataKey: fresh.encryptedDataKey, keyReadOptions: PRIMARY };
      }
      await dataAccess.kmsKeys.create(key);
      await dataAccess.scopeKeys.setOrgKmsKeyId(orgId, key.id);
      return { kmsKeyId: key.id, orgId, encryptedDataKey: fresh.encryptedDataKey, keyReadOptions: PRIMARY };
    });
  }

  private async ensureProjectKmsKeyId(projectId: string, options?: TReadOptions): Promise<TScopeKeySnapshot> {
    const project = await this.deps.dataAccess.scopeKeys.findProject(projectId, options);
    if (!project) throw projectNotFound(projectId);
    if (project.kmsKeyId) {
      return {
        kmsKeyId: project.kmsKeyId,
        orgId: project.orgId,
        encryptedDataKey: project.encryptedDataKey,
        keyReadOptions: options
      };
    }

    const key = this.newReservedKey(project.orgId);
    return this.deps.transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.locks.projectKey(projectId);
      const fresh = await dataAccess.scopeKeys.findProject(projectId);
      if (!fresh) throw projectNotFound(projectId);
      if (fresh.kmsKeyId) {
        return {
          kmsKeyId: fresh.kmsKeyId,
          orgId: fresh.orgId,
          encryptedDataKey: fresh.encryptedDataKey,
          keyReadOptions: PRIMARY
        };
      }
      await dataAccess.kmsKeys.create(key);
      await dataAccess.scopeKeys.setProjectKmsKeyId(projectId, key.id);
      return {
        kmsKeyId: key.id,
        orgId: fresh.orgId,
        encryptedDataKey: fresh.encryptedDataKey,
        keyReadOptions: PRIMARY
      };
    });
  }

  private async orgDataKey(orgId: string, options?: TReadOptions): Promise<Buffer> {
    const org = await this.ensureOrgKmsKeyId(orgId, options);
    if (org.encryptedDataKey) return this.decryptDataKey(org.kmsKeyId, org.encryptedDataKey, org.keyReadOptions);

    // The data key is encrypted before the lock: for an external key that is a provider call.
    const dataKey = newDataKey();
    const kmsKey = await requireKey(this.deps.dataAccess, org.kmsKeyId, PRIMARY);
    const encryptor = await keyEncryptor(this.deps.state, this.deps.dataAccess, kmsKey, PRIMARY);
    const { cipherTextBlob } = await encryptor({ plainText: dataKey });
    const existing = await this.deps.transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.locks.orgDataKey(orgId);
      const fresh = await dataAccess.scopeKeys.findOrg(orgId);
      if (fresh?.encryptedDataKey) return fresh.encryptedDataKey;
      await dataAccess.scopeKeys.setOrgDataKey(orgId, cipherTextBlob);
      return null;
    });
    if (!existing) return dataKey;
    return this.decryptDataKey(org.kmsKeyId, existing, PRIMARY);
  }

  private async projectDataKey(projectId: string, options?: TReadOptions): Promise<Buffer> {
    const project = await this.ensureProjectKmsKeyId(projectId, options);
    try {
      return await this.decryptProjectDataKey(projectId, project);
    } catch (error) {
      // A key switch can commit, and delete the old reserved key, between reading the project and reading its key.
      // Read both columns again from the primary, once.
      if (!(error instanceof NotFoundError)) throw error;
      const current = await this.ensureProjectKmsKeyId(projectId, PRIMARY);
      if (current.kmsKeyId === project.kmsKeyId) throw error;
      return this.decryptProjectDataKey(projectId, current);
    }
  }

  private async decryptProjectDataKey(projectId: string, project: TScopeKeySnapshot): Promise<Buffer> {
    if (project.encryptedDataKey) {
      return this.decryptDataKey(project.kmsKeyId, project.encryptedDataKey, project.keyReadOptions);
    }

    // The data key is encrypted before the lock: for an external key that is a provider call.
    const dataKey = newDataKey();
    const kmsKey = await requireKey(this.deps.dataAccess, project.kmsKeyId, PRIMARY);
    const encryptor = await keyEncryptor(this.deps.state, this.deps.dataAccess, kmsKey, PRIMARY);
    const { cipherTextBlob } = await encryptor({ plainText: dataKey });
    const existing = await this.deps.transactionRunner.run(async ({ dataAccess }) => {
      await dataAccess.locks.projectDataKey(projectId);
      const fresh = await dataAccess.scopeKeys.findProject(projectId);
      if (!fresh) throw projectNotFound(projectId);
      if (fresh.encryptedDataKey) return fresh.encryptedDataKey;
      await dataAccess.scopeKeys.setProjectDataKey(projectId, cipherTextBlob);
      return null;
    });
    if (!existing) return dataKey;
    return this.decryptDataKey(project.kmsKeyId, existing, PRIMARY);
  }

  private async decryptDataKey(kmsKeyId: string, encryptedDataKey: Buffer, options?: TReadOptions): Promise<Buffer> {
    const kmsKey = await requireKey(this.deps.dataAccess, kmsKeyId, options);
    const decryptor = await keyDecryptor(this.deps.state, this.deps.dataAccess, kmsKey, options);
    return decryptor({ cipherTextBlob: encryptedDataKey });
  }
}
