import { EntityNotFoundError, StateConflictError } from "@app/domains/lib/errors";
import { TTransaction, TTransactionRunner } from "@app/domains/lib/transactions";
import { logger } from "@app/lib/logger";

import { DataKey, TCipherPair } from "../../models/data-key";
import { EncryptedDataKey } from "../../models/encrypted-data-key";
import { KmsKey, TKmsKeyDetails } from "../../models/kms-key";
import { OrganizationKey } from "../../models/organization-key";
import { ProjectKey } from "../../models/project-key";
import { ProjectKeyBackup } from "../../models/project-key-backup";
import { RootKey } from "../../models/root-key";
import { WrappedKeyPayload } from "../../models/wrapped-key";
import { TExternalKmsHook, TKmsCoreStores, TProjectDataKeyCache } from "../dependencies";
import { keyEncryptor, openDataKey, requireKey, sealDataKey } from "../helpers/key-cipher";
import { ReadFrom, TReadOptions } from "../helpers/read-options";

export enum KmsDataKey {
  Organization,
  SecretManager
}

export enum KmsType {
  External = "external",
  Internal = "internal"
}

export type TEncryptWithKmsDataKeyDTO =
  | { type: KmsDataKey.Organization; orgId: string }
  | { type: KmsDataKey.SecretManager; projectId: string };

export type TUpdateProjectSecretManagerKmsKeyDTO = {
  projectId: string;
  kms: { type: KmsType.Internal } | { type: KmsType.External; kmsId: string };
};

export type TDataKeyService = {
  createCipherPairWithDataKey(context: TEncryptWithKmsDataKeyDTO, options?: TReadOptions): Promise<TCipherPair>;
  getProjectSecretManagerKmsKeyId(projectId: string, options?: TReadOptions): Promise<string>;
  getProjectCertificateKmsKeyId(projectId: string, options?: TReadOptions): Promise<string>;
  wrapKey(input: { projectId: string; label: string; key: Buffer }): Promise<Buffer<ArrayBuffer>>;
  unwrapKey(input: { projectId: string; label: string; wrappedKey: Buffer; keyBytes: number }): Promise<Buffer | null>;
  updateProjectSecretManagerKmsKey(input: TUpdateProjectSecretManagerKmsKeyDTO): Promise<TKmsKeyDetails>;
  getProjectKeyBackup(projectId: string): Promise<{ secretManager: string }>;
  loadProjectKeyBackup(projectId: string, backup: string): Promise<{ secretManagerKmsKey: TKmsKeyDetails }>;
  deleteProjectKeys(input: { orgId: string; kmsKeyIds: string[] }): Promise<void>;
  within(tx: TTransaction): TDataKeyTransaction;
};

/**
 * The calls a caller can make inside its own transaction, which see its uncommitted rows. First use takes the frozen
 * org and project locks, held until the caller commits, and an external key's provider is called inside it. Any
 * error leaves the caller's transaction unusable: roll it back.
 */
export type TDataKeyTransaction = {
  createCipherPairWithDataKey(context: TEncryptWithKmsDataKeyDTO): Promise<TCipherPair>;
  getProjectSecretManagerKmsKeyId(projectId: string): Promise<string>;
  getProjectCertificateKmsKeyId(projectId: string): Promise<string>;
  deleteProjectKeys(input: { orgId: string; kmsKeyIds: string[] }): Promise<void>;
};

const PRIMARY: TReadOptions = { readFrom: ReadFrom.Primary };

const orgNotFound = (orgId: string) =>
  new EntityNotFoundError({ message: `Organization with ID '${orgId}' not found` });
const projectNotFound = (projectId: string) =>
  new EntityNotFoundError({ message: `Project with ID '${projectId}' not found` });

const findOrgKey = async (stores: TKmsCoreStores, orgId: string): Promise<OrganizationKey> => {
  const orgKey = await stores.organizationKeyStore.find(orgId);
  if (!orgKey) throw orgNotFound(orgId);
  return orgKey;
};

const findProjectKeyIn = async (stores: TKmsCoreStores, projectId: string): Promise<ProjectKey> => {
  const projectKey = await stores.projectKeyStore.find(projectId);
  if (!projectKey) throw projectNotFound(projectId);
  return projectKey;
};

// Only a writer that takes no lock (a pod of the previous release) can make a claim fail under the frozen locks.
const assertClaimed = (claimed: boolean, what: string) => {
  if (!claimed) {
    throw new StateConflictError({
      message: `The ${what} was set by another request while this one was running. Retry the request.`
    });
  }
};

/**
 * The KMS key and data key an org or project gets on first use, the project certificate key, the switch between
 * internal and external keys, and backups. Every first-use creation runs under the frozen locks and writes a column
 * only while it is empty.
 */
export class DataKeyService implements TDataKeyService {
  // `cache` is left out for a service bound to a caller's transaction, and for migrations.
  constructor(
    private readonly transactionRunner: TTransactionRunner<TKmsCoreStores>,
    private readonly stores: TKmsCoreStores,
    private readonly rootKey: RootKey,
    private readonly externalKms: TExternalKmsHook | undefined,
    private readonly cache?: TProjectDataKeyCache
  ) {}

  // Every read and write goes through the caller's transaction, through a service built on its stores and without
  // the cache.
  within(tx: TTransaction): TDataKeyTransaction {
    const runner = this.transactionRunner.within(tx);
    const joined = <T>(work: (service: DataKeyService) => Promise<T>) =>
      runner.run(({ stores }) => work(new DataKeyService(runner, stores, this.rootKey, this.externalKms)));
    return {
      createCipherPairWithDataKey: (context) => joined((service) => service.createCipherPairWithDataKey(context)),
      getProjectSecretManagerKmsKeyId: (projectId) =>
        joined((service) => service.getProjectSecretManagerKmsKeyId(projectId)),
      getProjectCertificateKmsKeyId: (projectId) =>
        joined((service) => service.getProjectCertificateKmsKeyId(projectId)),
      deleteProjectKeys: (input) => joined((service) => service.deleteProjectKeys(input))
    };
  }

  // A caller that has just committed the org or project passes ReadFrom.Primary: a replica may not have it yet.
  async createCipherPairWithDataKey(context: TEncryptWithKmsDataKeyDTO, options?: TReadOptions): Promise<TCipherPair> {
    const dataKey =
      context.type === KmsDataKey.SecretManager
        ? await this.projectDataKey(context.projectId, options)
        : await this.orgDataKey(context.orgId, options);
    return dataKey.toCipherPair();
  }

  async getProjectSecretManagerKmsKeyId(projectId: string, options?: TReadOptions): Promise<string> {
    const projectKey = await this.findProjectKey(projectId, options);
    if (projectKey.currentKmsKeyId) return projectKey.currentKmsKeyId;
    const { kmsKey } = await this.ensureProjectKmsKey(projectKey, options);
    return kmsKey.id;
  }

  async getProjectCertificateKmsKeyId(projectId: string, options?: TReadOptions): Promise<string> {
    const projectKey = await this.findProjectKey(projectId, options);
    if (projectKey.certificateKmsKeyId) return projectKey.certificateKmsKeyId;

    // The losing key is deleted rather than rolled back: inside a caller's transaction there is nothing to roll back.
    const key = KmsKey.createReserved({ orgId: projectKey.orgId, rootKey: this.rootKey });
    const claimed = await this.transactionRunner.run(async ({ stores }) => {
      await stores.kmsKeyStore.insert(key);
      projectKey.assignCertificateKey(key.id);
      if (await stores.projectKeyStore.claimCertificateKey(projectKey)) return true;
      await stores.kmsKeyStore.delete(key.id);
      return false;
    });
    if (claimed) return key.id;

    const winner = await this.findProjectKey(projectId, PRIMARY);
    if (!winner.certificateKmsKeyId) throw projectNotFound(projectId);
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
  // ciphertext stays readable.
  async updateProjectSecretManagerKmsKey({
    projectId,
    kms
  }: TUpdateProjectSecretManagerKmsKeyDTO): Promise<TKmsKeyDetails> {
    const found = await this.findProjectKey(projectId, PRIMARY);
    const { projectKey: keyed, kmsKey: currentKey } = await this.ensureProjectKmsKey(found, PRIMARY);

    if (kms.type === KmsType.Internal && currentKey.isReserved) {
      return { ...currentKey.details(), isExternal: false };
    }

    let target: KmsKey;
    let isNewKey = false;
    if (kms.type === KmsType.External) {
      target = await this.readKey(kms.kmsId, PRIMARY);
      target.assertInOrg(keyed.orgId);
    } else {
      target = KmsKey.createReserved({ orgId: keyed.orgId, rootKey: this.rootKey });
      isNewKey = true;
    }

    const { projectKey, dataKey } = await this.openProjectDataKey(keyed, currentKey);
    // An external target is sealed with the org data key, which a replica may not have yet for a new org key. Only
    // the reads run on the primary: the provider call happens after the short run returns.
    const encrypt = await this.read(PRIMARY, (stores) => keyEncryptor(stores, this.rootKey, this.externalKms, target));
    const { cipherTextBlob: sealed } = await encrypt({ plainText: dataKey.exportForWrapping() });

    return this.transactionRunner.run(async ({ stores, tx }) => {
      this.evictAfterCommit(tx, projectId);
      if (isNewKey) await stores.kmsKeyStore.insert(target);
      const expectedKmsKeyId = projectKey.switchTo(target.id, sealed);
      if (!(await stores.projectKeyStore.switchKey(projectKey, expectedKmsKeyId))) {
        throw new StateConflictError({
          message:
            "The project's KMS key changed while this request was in flight, so it was left unchanged. Retry the change."
        });
      }
      if (currentKey.isReserved) await stores.kmsKeyStore.delete(currentKey.id);
      return { ...target.details(), isExternal: !currentKey.isReserved };
    });
  }

  async getProjectKeyBackup(projectId: string): Promise<{ secretManager: string }> {
    const { projectKey, dataKey } = await this.resolveProjectKey(projectId);
    const { kmsKey: orgKmsKey } = await this.ensureOrgKmsKey(projectKey.orgId);
    const cipherTextBlob = await sealDataKey(this.stores, this.rootKey, this.externalKms, orgKmsKey, dataKey);
    const wrapped = EncryptedDataKey.restore({
      kmsKeyId: orgKmsKey.id,
      encryptedDataKey: cipherTextBlob,
      orgId: orgKmsKey.orgId
    });
    return { secretManager: projectKey.backup(wrapped).toString() };
  }

  // Points the project at a new internal key holding the backed-up data key.
  async loadProjectKeyBackup(projectId: string, backup: string): Promise<{ secretManagerKmsKey: TKmsKeyDetails }> {
    const projectKey = await this.findProjectKey(projectId, PRIMARY);
    const parsed = ProjectKeyBackup.parse(backup, projectId);
    const backupKey = await this.readKey(parsed.kmsKeyId, PRIMARY);
    projectKey.assertRestorable(parsed, backupKey.orgId);

    const dataKey = await openDataKey(this.stores, this.rootKey, this.externalKms, backupKey, parsed.encryptedDataKey);
    const newKey = KmsKey.createReserved({ orgId: projectKey.orgId, rootKey: this.rootKey });
    const sealed = await sealDataKey(this.stores, this.rootKey, this.externalKms, newKey, dataKey);
    projectKey.restoreFrom(
      parsed,
      backupKey.orgId,
      EncryptedDataKey.restore({ kmsKeyId: newKey.id, encryptedDataKey: sealed, orgId: newKey.orgId })
    );

    // A cached entry would keep serving the replaced data key: refuse the restore if it cannot be cleared first.
    if (this.cache) await this.cache.evict(projectId);
    await this.transactionRunner.run(async ({ stores, tx }) => {
      this.evictAfterCommit(tx, projectId);
      await stores.kmsKeyStore.insert(newKey);
      await stores.projectKeyStore.save(projectKey);
    });
    return { secretManagerKmsKey: newKey.details() };
  }

  // Deletes the reserved keys a project owned, once nothing references them. Call after the project is gone.
  async deleteProjectKeys({ orgId, kmsKeyIds }: { orgId: string; kmsKeyIds: string[] }): Promise<void> {
    for (const kmsKeyId of kmsKeyIds) {
      // eslint-disable-next-line no-await-in-loop -- at most two keys per project
      await this.transactionRunner.run(async ({ stores }) => {
        const key = await stores.kmsKeyStore.findById(kmsKeyId);
        if (!key?.isInfisicalManaged) return;
        if (key.orgId !== orgId) {
          throw new EntityNotFoundError({ message: "KMS doesn't belong to organization" });
        }
        const referenced =
          (await stores.projectKeyStore.referencesKey(kmsKeyId)) ||
          (await stores.organizationKeyStore.referencesKey(kmsKeyId));
        if (!referenced) await stores.kmsKeyStore.delete(kmsKeyId);
      });
    }
  }

  private evictAfterCommit(tx: TTransaction, projectId: string) {
    const { cache } = this;
    if (cache) tx.afterCommit(() => cache.evict(projectId));
  }

  // The cache holds the encrypted data key read from the primary. An entry that no longer opens (a switch whose
  // eviction failed, a key deleted since) is replaced from the primary, once.
  private async projectDataKey(projectId: string, options?: TReadOptions): Promise<DataKey> {
    const { cache } = this;
    if (!cache || options?.readFrom === ReadFrom.Primary) {
      const resolved = await this.resolveProjectKey(projectId, options);
      return resolved.dataKey;
    }

    const cached = await cache.get(projectId);
    if (cached) {
      try {
        const kmsKey = await this.readKey(cached.kmsKeyId);
        return await this.open(kmsKey, cached.encryptedDataKey);
      } catch (err) {
        logger.warn(
          { err, projectId },
          `KMS: cached project data key did not open, reading it again [projectId=${projectId}]`
        );
      }
    }

    const { projectKey, dataKey } = await this.resolveProjectKey(projectId, PRIMARY);
    const material = projectKey.material();
    await cache.set(projectId, material);
    // A key switch can commit and evict between the read above and the write: read the row again after writing, and
    // drop the entry if it no longer matches, so this refill cannot undo that eviction.
    const current = await this.findProjectKey(projectId, PRIMARY);
    if (!current.hasDataKey() || !current.material().equals(material)) {
      await cache.evict(projectId).catch((err: unknown) => {
        logger.warn({ err, projectId }, `KMS: failed to drop a stale project data key entry [projectId=${projectId}]`);
      });
    }
    return dataKey;
  }

  // Reads on the primary go through a short run, so the connection is back before any provider call.
  private read<T>(options: TReadOptions | undefined, work: (stores: TKmsCoreStores) => Promise<T>): Promise<T> {
    if (options?.readFrom === ReadFrom.Primary) return this.transactionRunner.run(({ stores }) => work(stores));
    return work(this.stores);
  }

  private readKey(kmsKeyId: string, options?: TReadOptions): Promise<KmsKey> {
    return this.read(options, (stores) => requireKey(stores.kmsKeyStore, kmsKeyId));
  }

  private findProjectKey(projectId: string, options?: TReadOptions): Promise<ProjectKey> {
    return this.read(options, (stores) => findProjectKeyIn(stores, projectId));
  }

  // The org's KMS key, created on first use. The row and the key it names are read together.
  private async ensureOrgKmsKey(
    orgId: string,
    options?: TReadOptions
  ): Promise<{ orgKey: OrganizationKey; kmsKey: KmsKey }> {
    const found = await this.read(options, async (stores) => {
      const orgKey = await findOrgKey(stores, orgId);
      const kmsKeyId = orgKey.currentKmsKeyId;
      return { orgKey, kmsKey: kmsKeyId ? await requireKey(stores.kmsKeyStore, kmsKeyId) : null };
    });
    if (found.kmsKey) return { orgKey: found.orgKey, kmsKey: found.kmsKey };

    return this.transactionRunner.run(async ({ stores }) => {
      await stores.locks.orgKey(orgId);
      const orgKey = await findOrgKey(stores, orgId);
      const existingId = orgKey.currentKmsKeyId;
      if (existingId) return { orgKey, kmsKey: await requireKey(stores.kmsKeyStore, existingId) };

      const kmsKey = KmsKey.createReserved({ orgId, rootKey: this.rootKey });
      await stores.kmsKeyStore.insert(kmsKey);
      orgKey.assignKmsKey(kmsKey.id);
      assertClaimed(await stores.organizationKeyStore.claimKmsKey(orgKey), "organization's KMS key");
      return { orgKey, kmsKey };
    });
  }

  private async orgDataKey(orgId: string, options?: TReadOptions): Promise<DataKey> {
    const { orgKey, kmsKey } = await this.ensureOrgKmsKey(orgId, options);
    if (orgKey.hasDataKey()) return this.open(kmsKey, orgKey.material().encryptedDataKey);

    const dataKey = DataKey.generate();
    const sealed = await sealDataKey(this.stores, this.rootKey, this.externalKms, kmsKey, dataKey);
    const existing = await this.transactionRunner.run(async ({ stores }) => {
      await stores.locks.orgDataKey(orgId);
      const fresh = await findOrgKey(stores, orgId);
      if (fresh.hasDataKey()) return fresh.material().encryptedDataKey;
      fresh.assignDataKey(sealed);
      assertClaimed(await stores.organizationKeyStore.claimDataKey(fresh), "organization's data key");
      return null;
    });
    return existing ? this.open(kmsKey, existing) : dataKey;
  }

  // A key switch can commit, and delete the old reserved key, between reading the project and reading its key. Read
  // both again from the primary, once.
  private async resolveProjectKey(
    projectId: string,
    options?: TReadOptions
  ): Promise<{ projectKey: ProjectKey; dataKey: DataKey }> {
    const found = await this.findProjectKey(projectId, options);
    try {
      return await this.openProject(found, options);
    } catch (error) {
      if (!(error instanceof EntityNotFoundError)) throw error;
      const current = await this.findProjectKey(projectId, PRIMARY);
      if (current.currentKmsKeyId === found.currentKmsKeyId) throw error;
      return this.openProject(current, PRIMARY);
    }
  }

  private async openProject(projectKey: ProjectKey, options?: TReadOptions) {
    const ensured = await this.ensureProjectKmsKey(projectKey, options);
    return this.openProjectDataKey(ensured.projectKey, ensured.kmsKey);
  }

  private async ensureProjectKmsKey(
    projectKey: ProjectKey,
    options?: TReadOptions
  ): Promise<{ projectKey: ProjectKey; kmsKey: KmsKey }> {
    const existingId = projectKey.currentKmsKeyId;
    if (existingId) return { projectKey, kmsKey: await this.readKey(existingId, options) };

    const { projectId, orgId } = projectKey;
    return this.transactionRunner.run(async ({ stores }) => {
      await stores.locks.projectKey(projectId);
      const fresh = await findProjectKeyIn(stores, projectId);
      const freshId = fresh.currentKmsKeyId;
      if (freshId) return { projectKey: fresh, kmsKey: await requireKey(stores.kmsKeyStore, freshId) };

      const kmsKey = KmsKey.createReserved({ orgId, rootKey: this.rootKey });
      await stores.kmsKeyStore.insert(kmsKey);
      fresh.assignKmsKey(kmsKey.id);
      assertClaimed(await stores.projectKeyStore.claimKmsKey(fresh), "project's KMS key");
      return { projectKey: fresh, kmsKey };
    });
  }

  // The returned project key always holds the data key, so a switch can re-wrap it.
  private async openProjectDataKey(
    projectKey: ProjectKey,
    kmsKey: KmsKey
  ): Promise<{ projectKey: ProjectKey; dataKey: DataKey }> {
    if (projectKey.hasDataKey()) {
      return { projectKey, dataKey: await this.open(kmsKey, projectKey.material().encryptedDataKey) };
    }

    const { projectId } = projectKey;
    const dataKey = DataKey.generate();
    const sealed = await sealDataKey(this.stores, this.rootKey, this.externalKms, kmsKey, dataKey);
    const outcome = await this.transactionRunner.run(async ({ stores }) => {
      await stores.locks.projectDataKey(projectId);
      const fresh = await findProjectKeyIn(stores, projectId);
      if (fresh.hasDataKey()) {
        const { kmsKeyId } = fresh.material();
        const wrappedBy = kmsKeyId === kmsKey.id ? kmsKey : await requireKey(stores.kmsKeyStore, kmsKeyId);
        return { projectKey: fresh, wrappedBy, adopted: true };
      }
      fresh.assignDataKey(sealed);
      assertClaimed(await stores.projectKeyStore.claimDataKey(fresh), "project's data key");
      return { projectKey: fresh, wrappedBy: kmsKey, adopted: false };
    });
    if (!outcome.adopted) return { projectKey: outcome.projectKey, dataKey };
    return {
      projectKey: outcome.projectKey,
      dataKey: await this.open(outcome.wrappedBy, outcome.projectKey.material().encryptedDataKey)
    };
  }

  private open(kmsKey: KmsKey, encryptedDataKey: Buffer): Promise<DataKey> {
    return openDataKey(this.stores, this.rootKey, this.externalKms, kmsKey, encryptedDataKey);
  }
}
