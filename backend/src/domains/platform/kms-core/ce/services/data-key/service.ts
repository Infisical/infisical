import { findOnReplicaThenPrimary, ReadFrom, TReadOptions } from "@app/domains/lib/data-access";
import { EntityNotFoundError, StateConflictError } from "@app/domains/lib/errors";
import { TTransaction, TTransactionRunner } from "@app/domains/lib/transactions";
import { logger } from "@app/lib/logger";

import { DataKey, TCipherPair } from "../../models/data-key";
import { DataKeyOwner } from "../../models/data-key-owner";
import { EncryptedDataKey } from "../../models/encrypted-data-key";
import { KmsKey, TKmsKeyDetails } from "../../models/kms-key";
import { OrganizationKey } from "../../models/organization-key";
import { ProjectKey } from "../../models/project-key";
import { ProjectKeyBackup } from "../../models/project-key-backup";
import { RootKey } from "../../models/root-key";
import { WrappedKeyPayload } from "../../models/wrapped-key";
import { TKmsCoreStores, TProjectDataKeyCache } from "../dependencies";
import { KeyCipher, requireKey } from "../helpers/key-cipher";

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

export type TKmsDataKeyService = {
  createCipherPairWithDataKey(context: TEncryptWithKmsDataKeyDTO, options?: TReadOptions): Promise<TCipherPair>;
  getProjectSecretManagerKmsKeyId(projectId: string): Promise<string>;
  getProjectCertificateKmsKeyId(projectId: string): Promise<string>;
  wrapKey(input: { projectId: string; label: string; key: Buffer }): Promise<Buffer<ArrayBuffer>>;
  unwrapKey(input: { projectId: string; label: string; wrappedKey: Buffer; keyBytes: number }): Promise<Buffer | null>;
  updateProjectSecretManagerKmsKey(input: TUpdateProjectSecretManagerKmsKeyDTO): Promise<TKmsKeyDetails>;
  getProjectKeyBackup(projectId: string): Promise<{ secretManager: string }>;
  loadProjectKeyBackup(projectId: string, backup: string): Promise<{ secretManagerKmsKey: TKmsKeyDetails }>;
  deleteProjectKeys(input: { orgId: string; kmsKeyIds: string[] }): Promise<void>;
  within(tx: TTransaction): TKmsDataKeyTransaction;
};

// Calls inside the caller's transaction, seeing its uncommitted rows. First use takes the frozen org and project locks
// until the caller commits, and calls an external key's provider inside it. Any error leaves the transaction unusable:
// roll it back.
export type TKmsDataKeyTransaction = {
  createCipherPairWithDataKey(context: TEncryptWithKmsDataKeyDTO): Promise<TCipherPair>;
  getProjectSecretManagerKmsKeyId(projectId: string): Promise<string>;
  getProjectCertificateKmsKeyId(projectId: string): Promise<string>;
  deleteProjectKeys(input: { orgId: string; kmsKeyIds: string[] }): Promise<void>;
};

type TOwnerAccess<K extends DataKeyOwner> = {
  find(stores: TKmsCoreStores, options?: TReadOptions): Promise<K>;
  lockKmsKey(stores: TKmsCoreStores): Promise<void>;
  lockDataKey(stores: TKmsCoreStores): Promise<void>;
  claimKmsKey(stores: TKmsCoreStores, owner: K): Promise<boolean>;
  claimDataKey(stores: TKmsCoreStores, owner: K): Promise<boolean>;
};

const orgAccess = (orgId: string): TOwnerAccess<OrganizationKey> => ({
  find: (stores, options) =>
    findOnReplicaThenPrimary(
      (readOptions) => stores.organizationKeyStore.find(orgId, readOptions),
      () => new EntityNotFoundError({ message: `Organization with ID '${orgId}' not found` }),
      options
    ),
  lockKmsKey: (stores) => stores.locks.orgKey(orgId),
  lockDataKey: (stores) => stores.locks.orgDataKey(orgId),
  claimKmsKey: (stores, owner) => stores.organizationKeyStore.claimKmsKey(owner),
  claimDataKey: (stores, owner) => stores.organizationKeyStore.claimDataKey(owner)
});

const projectAccess = (projectId: string): TOwnerAccess<ProjectKey> => ({
  find: (stores, options) =>
    findOnReplicaThenPrimary(
      (readOptions) => stores.projectKeyStore.find(projectId, readOptions),
      () => new EntityNotFoundError({ message: `Project with ID '${projectId}' not found` }),
      options
    ),
  lockKmsKey: (stores) => stores.locks.projectKey(projectId),
  lockDataKey: (stores) => stores.locks.projectDataKey(projectId),
  claimKmsKey: (stores, owner) => stores.projectKeyStore.claimKmsKey(owner),
  claimDataKey: (stores, owner) => stores.projectKeyStore.claimDataKey(owner)
});

// A claim loses when someone else set the column first: a call joined to the same transaction (a session doesn't wait
// on its own advisory lock) or a writer that takes no lock. Either way the winner is visible here, so first use adopts
// it instead of failing.
const claimConflict = (what: string) =>
  new StateConflictError({
    message: `The ${what} was set by another request while this one was running. Retry the request.`
  });

const claimedKeyId = (keyId: string | null, what: string): string => {
  if (!keyId) throw claimConflict(what);
  return keyId;
};

// Every first-use creation runs under the frozen locks and writes a column only while it's empty.
export class KmsDataKeyService implements TKmsDataKeyService {
  // No `cache` for a service bound to a caller's transaction, or for migrations.
  constructor(
    private readonly transactionRunner: TTransactionRunner<TKmsCoreStores>,
    private readonly stores: TKmsCoreStores,
    private readonly rootKey: RootKey,
    private readonly keyCipher: KeyCipher,
    private readonly cache?: TProjectDataKeyCache
  ) {}

  // Runs everything in the caller's transaction, on its stores and without the cache.
  within(tx: TTransaction): TKmsDataKeyTransaction {
    const runner = this.transactionRunner.within(tx);
    const joined = <T>(work: (service: KmsDataKeyService) => Promise<T>) =>
      runner.run(({ stores }) =>
        work(new KmsDataKeyService(runner, stores, this.rootKey, this.keyCipher.joined(stores)))
      );
    return {
      createCipherPairWithDataKey: (context) => joined((service) => service.createCipherPairWithDataKey(context)),
      getProjectSecretManagerKmsKeyId: (projectId) =>
        joined((service) => service.getProjectSecretManagerKmsKeyId(projectId)),
      getProjectCertificateKmsKeyId: (projectId) =>
        joined((service) => service.getProjectCertificateKmsKeyId(projectId)),
      deleteProjectKeys: (input) => joined((service) => service.deleteProjectKeys(input))
    };
  }

  // Pass ReadFrom.Primary right after committing the org or project: a replica may not have it yet.
  async createCipherPairWithDataKey(context: TEncryptWithKmsDataKeyDTO, options?: TReadOptions): Promise<TCipherPair> {
    const dataKey =
      context.type === KmsDataKey.SecretManager
        ? await this.projectDataKey(context.projectId, options)
        : await this.orgDataKey(context.orgId, options);
    return dataKey.toCipherPair();
  }

  async getProjectSecretManagerKmsKeyId(projectId: string): Promise<string> {
    const projectKey = await this.findProjectKey(projectId);
    if (projectKey.currentKmsKeyId) return projectKey.currentKmsKeyId;
    const { kmsKey } = await this.ensureKmsKey(projectAccess(projectId), projectKey);
    return kmsKey.id;
  }

  async getProjectCertificateKmsKeyId(projectId: string): Promise<string> {
    const projectKey = await this.findProjectKey(projectId);
    if (projectKey.certificateKmsKeyId) return projectKey.certificateKmsKeyId;

    // The losing key is deleted, not rolled back: inside a caller's transaction there's nothing to roll back.
    const key = KmsKey.createReserved({ orgId: projectKey.orgId, rootKey: this.rootKey });
    const claimed = await this.transactionRunner.run(async ({ stores }) => {
      await stores.kmsKeyStore.insert(key);
      projectKey.assignCertificateKey(key.id);
      if (await stores.projectKeyStore.claimCertificateKey(projectKey)) return true;
      await stores.kmsKeyStore.delete(key.id);
      return false;
    });
    if (claimed) return key.id;

    const winner = await this.findProjectKey(projectId, { readFrom: ReadFrom.Primary });
    return claimedKeyId(winner.certificateKmsKeyId, "project's certificate key");
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

  // Null when the key wasn't wrapped for this label. Throws when the ciphertext doesn't decrypt.
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

  // The data key itself doesn't change, so existing ciphertext stays readable.
  async updateProjectSecretManagerKmsKey({
    projectId,
    kms
  }: TUpdateProjectSecretManagerKmsKeyDTO): Promise<TKmsKeyDetails> {
    const found = await this.findProjectKey(projectId, { readFrom: ReadFrom.Primary });
    const access = projectAccess(projectId);
    const { owner: keyed, kmsKey: currentKey } = await this.ensureKmsKey(access, found, { readFrom: ReadFrom.Primary });

    if (kms.type === KmsType.Internal && currentKey.isReserved) {
      return { ...currentKey.details(), isExternal: false };
    }

    let target: KmsKey;
    let isNewKey = false;
    if (kms.type === KmsType.External) {
      target = await this.readKey(kms.kmsId, { readFrom: ReadFrom.Primary });
      target.assertInOrg(keyed.orgId);
    } else {
      target = KmsKey.createReserved({ orgId: keyed.orgId, rootKey: this.rootKey });
      isNewKey = true;
    }

    const { owner: projectKey, dataKey } = await this.ensureDataKey(access, keyed, currentKey);
    // An external target is sealed with the org data key, which may not be on a replica yet. Only the reads hit the
    // primary: the provider call happens after they return.
    const encrypt = await this.keyCipher.encryptor(target, { readFrom: ReadFrom.Primary });
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
    const { kmsKey: orgKmsKey } = await this.orgKmsKey(projectKey.orgId);
    const cipherTextBlob = await this.keyCipher.sealDataKey(orgKmsKey, dataKey);
    const wrapped = EncryptedDataKey.restore({
      kmsKeyId: orgKmsKey.id,
      encryptedDataKey: cipherTextBlob,
      orgId: orgKmsKey.orgId
    });
    return { secretManager: projectKey.backup(wrapped).toString() };
  }

  // Points the project at a new internal key holding the backed-up data key.
  async loadProjectKeyBackup(projectId: string, backup: string): Promise<{ secretManagerKmsKey: TKmsKeyDetails }> {
    const projectKey = await this.findProjectKey(projectId, { readFrom: ReadFrom.Primary });
    const parsed = ProjectKeyBackup.parse(backup, projectId);
    const backupKey = await this.readKey(parsed.kmsKeyId, { readFrom: ReadFrom.Primary });
    projectKey.assertRestorable(parsed, backupKey.orgId);

    const dataKey = await this.keyCipher.openDataKey(backupKey, parsed.encryptedDataKey);
    const newKey = KmsKey.createReserved({ orgId: projectKey.orgId, rootKey: this.rootKey });
    const sealed = await this.keyCipher.sealDataKey(newKey, dataKey);
    projectKey.restoreFrom(
      parsed,
      backupKey.orgId,
      EncryptedDataKey.restore({ kmsKeyId: newKey.id, encryptedDataKey: sealed, orgId: newKey.orgId })
    );

    // A cached entry would keep serving the old data key, so refuse the restore if it can't be evicted first.
    if (this.cache) await this.cache.evict(projectId);
    await this.transactionRunner.run(async ({ stores, tx }) => {
      this.evictAfterCommit(tx, projectId);
      await stores.kmsKeyStore.insert(newKey);
      await stores.projectKeyStore.save(projectKey);
    });
    return { secretManagerKmsKey: newKey.details() };
  }

  // Call after the project is gone. Deletes only reserved keys nothing references anymore.
  async deleteProjectKeys({ orgId, kmsKeyIds }: { orgId: string; kmsKeyIds: string[] }): Promise<void> {
    for (const kmsKeyId of kmsKeyIds) {
      // eslint-disable-next-line no-await-in-loop -- at most two keys per project
      await this.transactionRunner.run(async ({ stores }) => {
        const key = await stores.kmsKeyStore.findById(kmsKeyId);
        if (!key?.isInfisicalManaged) return;
        key.assertInOrg(orgId, "KMS doesn't belong to organization");
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

  // The cache holds the encrypted data key as read from the primary. An entry that no longer opens (a switch whose
  // eviction failed, a key deleted since) gets replaced from the primary, once.
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

    const { projectKey, dataKey } = await this.resolveProjectKey(projectId, { readFrom: ReadFrom.Primary });
    const material = projectKey.material();
    await cache.set(projectId, material);
    // A key switch can commit and evict between the read above and this write. Re-read after writing and drop the
    // entry if it no longer matches, so this refill can't undo that eviction.
    const current = await this.findProjectKey(projectId, { readFrom: ReadFrom.Primary });
    if (!current.hasDataKey() || !current.material().equals(material)) {
      await cache.evict(projectId).catch((err: unknown) => {
        logger.warn({ err, projectId }, `KMS: failed to drop a stale project data key entry [projectId=${projectId}]`);
      });
    }
    return dataKey;
  }

  private readKey(kmsKeyId: string, options?: TReadOptions): Promise<KmsKey> {
    return requireKey(this.stores.kmsKeyStore, kmsKeyId, options);
  }

  private findProjectKey(projectId: string, options?: TReadOptions): Promise<ProjectKey> {
    return projectAccess(projectId).find(this.stores, options);
  }

  private async orgKmsKey(orgId: string, options?: TReadOptions) {
    const access = orgAccess(orgId);
    return this.ensureKmsKey(access, await access.find(this.stores, options), options);
  }

  private async orgDataKey(orgId: string, options?: TReadOptions): Promise<DataKey> {
    const { owner, kmsKey } = await this.orgKmsKey(orgId, options);
    const { dataKey } = await this.ensureDataKey(orgAccess(orgId), owner, kmsKey);
    return dataKey;
  }

  // A key switch can commit (and delete the old reserved key) between reading the project and its key, so re-read
  // both from the primary, once.
  private async resolveProjectKey(
    projectId: string,
    options?: TReadOptions
  ): Promise<{ projectKey: ProjectKey; dataKey: DataKey }> {
    const found = await this.findProjectKey(projectId, options);
    try {
      return await this.openProject(found, options);
    } catch (error) {
      if (!(error instanceof EntityNotFoundError)) throw error;
      const current = await this.findProjectKey(projectId, { readFrom: ReadFrom.Primary });
      if (current.currentKmsKeyId === found.currentKmsKeyId) throw error;
      return this.openProject(current, { readFrom: ReadFrom.Primary });
    }
  }

  private async openProject(projectKey: ProjectKey, options?: TReadOptions) {
    const access = projectAccess(projectKey.projectId);
    const { owner, kmsKey } = await this.ensureKmsKey(access, projectKey, options);
    const { owner: withDataKey, dataKey } = await this.ensureDataKey(access, owner, kmsKey);
    return { projectKey: withDataKey, dataKey };
  }

  // Reads the row and the key it names together.
  private async ensureKmsKey<K extends DataKeyOwner>(
    access: TOwnerAccess<K>,
    owner: K,
    options?: TReadOptions
  ): Promise<{ owner: K; kmsKey: KmsKey }> {
    const existingId = owner.currentKmsKeyId;
    if (existingId) return { owner, kmsKey: await this.readKey(existingId, options) };

    return this.transactionRunner.run(async ({ stores }) => {
      await access.lockKmsKey(stores);
      const fresh = await access.find(stores);
      const freshId = fresh.currentKmsKeyId;
      if (freshId) return { owner: fresh, kmsKey: await requireKey(stores.kmsKeyStore, freshId) };

      const kmsKey = KmsKey.createReserved({ orgId: owner.orgId, rootKey: this.rootKey });
      await stores.kmsKeyStore.insert(kmsKey);
      fresh.assignKmsKey(kmsKey.id);
      if (await access.claimKmsKey(stores, fresh)) return { owner: fresh, kmsKey };

      await stores.kmsKeyStore.delete(kmsKey.id);
      const winner = await access.find(stores);
      const winnerKeyId = claimedKeyId(winner.currentKmsKeyId, `${owner.kind}'s KMS key`);
      return { owner: winner, kmsKey: await requireKey(stores.kmsKeyStore, winnerKeyId) };
    });
  }

  // The returned owner always holds the data key, so a project switch can re-wrap it. A winner's data key may be
  // wrapped by another KMS key than `kmsKey` (a switch committed meanwhile), so open it with the key the row names.
  private async ensureDataKey<K extends DataKeyOwner>(
    access: TOwnerAccess<K>,
    owner: K,
    kmsKey: KmsKey
  ): Promise<{ owner: K; dataKey: DataKey }> {
    if (owner.hasDataKey()) {
      return { owner, dataKey: await this.open(kmsKey, owner.material().encryptedDataKey) };
    }

    const dataKey = DataKey.generate();
    const sealed = await this.keyCipher.sealDataKey(kmsKey, dataKey);
    const outcome = await this.transactionRunner.run(async ({ stores }) => {
      await access.lockDataKey(stores);
      const adopt = async (current: K) => {
        const { kmsKeyId } = current.material();
        const wrappedBy = kmsKeyId === kmsKey.id ? kmsKey : await requireKey(stores.kmsKeyStore, kmsKeyId);
        return { owner: current, wrappedBy, adopted: true };
      };
      const fresh = await access.find(stores);
      if (fresh.hasDataKey()) return adopt(fresh);
      fresh.assignDataKey(sealed);
      if (await access.claimDataKey(stores, fresh)) return { owner: fresh, wrappedBy: kmsKey, adopted: false };

      const winner = await access.find(stores);
      if (!winner.hasDataKey()) throw claimConflict(`${owner.kind}'s data key`);
      return adopt(winner);
    });
    if (!outcome.adopted) return { owner: outcome.owner, dataKey };
    return {
      owner: outcome.owner,
      dataKey: await this.open(outcome.wrappedBy, outcome.owner.material().encryptedDataKey)
    };
  }

  private open(kmsKey: KmsKey, encryptedDataKey: Buffer): Promise<DataKey> {
    return this.keyCipher.openDataKey(kmsKey, encryptedDataKey);
  }
}
