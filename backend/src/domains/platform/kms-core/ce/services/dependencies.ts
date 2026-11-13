import { ProjectType } from "@app/db/schemas";
import { OrderByDirection } from "@app/lib/types";

import { TCipherPair } from "../models/data-key";
import { EncryptedDataKey } from "../models/encrypted-data-key";
import { TExternalKeyRef } from "../models/external-key-config";
import { KekHistoryEntry } from "../models/kek-history-entry";
import { KmsKey, TKmsKeyRecord } from "../models/kms-key";
import { KmsKeyVersion } from "../models/kms-key-version";
import { LegacyEncryptionKey } from "../models/legacy-encryption-key";
import { OrganizationKey } from "../models/organization-key";
import { ProjectKey } from "../models/project-key";
import { RootKeyConfig } from "../models/root-key-config";

// The frozen advisory locks, held until the transaction that took them ends. Take them in this order: root key, org,
// project; key before data key.
export type TKmsCoreLocks = {
  rootKey(): Promise<void>;
  orgKey(orgId: string): Promise<void>;
  orgDataKey(orgId: string): Promise<void>;
  projectKey(projectId: string): Promise<void>;
  projectDataKey(projectId: string): Promise<void>;
};

export type TKmsKeyFilter = {
  id?: string;
  ids?: string[];
  orgId?: string;
  // null matches org-level keys only.
  projectId?: string | null;
  name?: string;
  isReserved?: boolean;
  keyUsage?: string;
  isExternal?: boolean;
};

export type TKmsKeyPageQuery = {
  projectId: string;
  offset: number;
  limit?: number;
  orderBy: "name";
  orderDirection: OrderByDirection;
  search?: string;
};

// Owns kms_keys, internal_kms and external_kms: one KmsKey is stored across them.
export type TKmsKeyStore = {
  findById(id: string): Promise<KmsKey | null>;
  // A filter applies whenever its field is set, including to an empty string.
  find(filter: TKmsKeyFilter): Promise<KmsKey[]>;
  // Both take the kms_keys row lock and then the internal_kms one, in that order: save() writes both tables, so a
  // rename racing a rotation would otherwise write back the material the rotation replaced.
  findForUpdate(id: string): Promise<KmsKey | null>;
  findForRotation(id: string): Promise<KmsKey | null>;
  // A published key whose project is not pending deletion.
  findPublishedById(id: string): Promise<KmsKey | null>;
  // Customer keys of a project (not reserved, with internal material), one page and the total.
  listProjectKeys(query: TKmsKeyPageQuery): Promise<{ keys: KmsKey[]; totalCount: number }>;
  countProjectKeysInOrg(orgId: string, projectType: ProjectType): Promise<number>;
  insert(key: KmsKey): Promise<void>;
  // Writes the key's current state: kms_keys attributes, internal_kms material and version, external_kms inputs.
  save(key: KmsKey): Promise<void>;
  // Its material, versions and external config go with it (foreign keys cascade inside this domain).
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<number>;
};

export type TKmsKeyVersionStore = {
  insert(version: KmsKeyVersion): Promise<void>;
  listByInternalKmsId(internalKmsId: string): Promise<KmsKeyVersion[]>;
};

// Owns kms_root_config: at most the active, a staged and a retained row.
export type TRootKeyConfigStore = {
  findById(id: string): Promise<RootKeyConfig | null>;
  findAll(): Promise<RootKeyConfig[]>;
  insert(config: RootKeyConfig): Promise<void>;
  save(config: RootKeyConfig): Promise<void>;
  // False when the row was already gone.
  delete(id: string): Promise<boolean>;
  // Every staged row: an abandoned one is a live working key that would promote itself if it reached a deployment.
  deleteAllStaged(): Promise<void>;
};

// Owns kms_kek_history. Never read unbounded: the history is never pruned.
export type TKekHistoryStore = {
  // Newest first.
  findPage(page: { offset: number; limit: number }): Promise<KekHistoryEntry[]>;
  count(): Promise<number>;
  findActiveByLabel(kekLabel: string): Promise<KekHistoryEntry | null>;
  findCurrent(): Promise<KekHistoryEntry | null>;
  insert(entry: KekHistoryEntry): Promise<void>;
  save(entry: KekHistoryEntry): Promise<void>;
};

export type TLegacyEncryptionKeyStore = {
  find(): Promise<LegacyEncryptionKey | null>;
  // A concurrent insert of the same fixed id is ignored, not an error.
  insert(key: LegacyEncryptionKey): Promise<void>;
};

// The key columns on organizations, which no domain owns yet. Each claim writes only while the column is empty and
// reports whether it did, so a second writer (a pod of the previous release) never overwrites the first.
export type TOrganizationKeyStore = {
  find(orgId: string): Promise<OrganizationKey | null>;
  claimKmsKey(key: OrganizationKey): Promise<boolean>;
  claimDataKey(key: OrganizationKey): Promise<boolean>;
  referencesKey(kmsKeyId: string): Promise<boolean>;
};

// The key columns on projects, which no domain owns yet. A project scheduled for deletion is not found.
export type TProjectKeyStore = {
  find(projectId: string): Promise<ProjectKey | null>;
  claimKmsKey(key: ProjectKey): Promise<boolean>;
  claimDataKey(key: ProjectKey): Promise<boolean>;
  claimCertificateKey(key: ProjectKey): Promise<boolean>;
  // Compare and swap: writes the key and data key only if the project still uses expectedKmsKeyId.
  switchKey(key: ProjectKey, expectedKmsKeyId: string): Promise<boolean>;
  // Unconditional write of the key and data key, for a restore from backup.
  save(key: ProjectKey): Promise<void>;
  // Includes projects scheduled for deletion.
  referencesKey(kmsKeyId: string): Promise<boolean>;
};

// A project's wrapped data key in Redis, so the hot path skips the project row. Holds only what the database holds
// (the data key encrypted by its KMS key), never plaintext. Never consulted inside a transaction: an entry written
// from a transaction that rolls back would name a key that does not exist.
export type TProjectDataKeyCache = {
  // Null on a miss, on a partial entry (a pod of the previous release caches a project before its first use), and when
  // Redis fails.
  get(projectId: string): Promise<EncryptedDataKey | null>;
  // Best effort: a failed write only costs the next reader a database read.
  set(projectId: string, key: EncryptedDataKey): Promise<void>;
  // Retries, then throws: the entry may still be there.
  evict(projectId: string): Promise<void>;
};

// What run hands a service as `stores`: every store bound to one transaction, plus the frozen locks.
export type TKmsCoreStores = {
  kmsKeyStore: TKmsKeyStore;
  kmsKeyVersionStore: TKmsKeyVersionStore;
  rootKeyConfigStore: TRootKeyConfigStore;
  kekHistoryStore: TKekHistoryStore;
  legacyEncryptionKeyStore: TLegacyEncryptionKeyStore;
  organizationKeyStore: TOrganizationKeyStore;
  projectKeyStore: TProjectKeyStore;
  locks: TKmsCoreLocks;
};

// Wraps the root key with an HSM. The enterprise edition implements it.
export type TRootKeyWrapper = {
  // Whether an HSM is configured and passes its self-test.
  isConfigured(): Promise<boolean>;
  // Refuses with the license message when the instance is not entitled to HSM.
  assertEntitled(): void;
  randomBytes(length: number): Promise<Buffer>;
  wrap(rootKey: Buffer): Promise<Buffer>;
  unwrap(wrapped: Buffer): Promise<Buffer>;
};

// A key's kms_keys columns, without its material.
export type TKmsKeyColumns = Omit<TKmsKeyRecord, "internal" | "external">;

export type TExternalKmsConfig = {
  id: string;
  kmsKeyId: string;
  provider: string;
  status?: string | null;
  statusDetails?: string | null;
  // Decrypted provider inputs. Holds credentials: callers return only the sanitized form.
  providerInput: Record<string, unknown>;
};

export type TExternalKmsDetails = TKmsKeyColumns & { external: TExternalKmsConfig };

export type TExternalKmsSummary = TKmsKeyColumns & {
  externalKms: { id: string; provider: string; status?: string | null; statusDetails?: string | null };
};

export type TCreateExternalKmsInput = {
  orgId: string;
  name?: string;
  description?: string;
  // { type, inputs }: validated by the enterprise edition, which knows the providers.
  provider: { type: string; inputs: unknown };
};

export type TUpdateExternalKmsInput = {
  kmsId: string;
  name?: string;
  description?: string;
  provider?: { type: string; inputs: unknown };
};

// External KMS keys (AWS, GCP). The enterprise edition implements it. Every call that opens or writes provider
// inputs is handed the org data-key cipher, so the enterprise edition never holds the community module.
export type TExternalKmsHook = {
  encrypt(key: TExternalKeyRef, orgCipher: TCipherPair, plainText: Buffer): Promise<Buffer<ArrayBuffer>>;
  decrypt(key: TExternalKeyRef, orgCipher: TCipherPair, cipherTextBlob: Buffer): Promise<Buffer<ArrayBuffer>>;
  create(input: TCreateExternalKmsInput, orgCipher: TCipherPair): Promise<TExternalKmsDetails>;
  update(input: TUpdateExternalKmsInput, orgCipher: TCipherPair): Promise<TExternalKmsDetails>;
  delete(kmsId: string, orgCipher: TCipherPair): Promise<TExternalKmsDetails>;
  get(kmsId: string, orgCipher: TCipherPair): Promise<TExternalKmsDetails>;
  list(orgId: string): Promise<TExternalKmsSummary[]>;
  fetchGcpKeys(input: { credential: unknown; gcpRegion: string }): Promise<{ keys: string[] }>;
};

// What the enterprise edition plugs in. Without it, an HSM root config and external keys fail with a readable error.
export type TKmsCoreHooks = {
  rootKeyWrapper?: TRootKeyWrapper;
  externalKms?: TExternalKmsHook;
};
