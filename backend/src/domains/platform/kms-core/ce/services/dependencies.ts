import { ProjectType } from "@app/db/schemas";
import { TReadOptions } from "@app/domains/lib/data-access";
import { OrderByDirection } from "@app/lib/types";

import { TCipherPair } from "../models/data-key";
import { EncryptedDataKey } from "../models/encrypted-data-key";
import { TExternalKeyRef } from "../models/external-key-config";
import { KekHistoryEntry } from "../models/kek-history-entry";
import { KmsKey, TKmsKeyColumns } from "../models/kms-key";
import { KmsKeyVersion } from "../models/kms-key-version";
import { LegacyEncryptionKey } from "../models/legacy-encryption-key";
import { OrganizationKey } from "../models/organization-key";
import { ProjectKey } from "../models/project-key";
import { RootKeyConfig } from "../models/root-key-config";

// Frozen advisory locks, held until the transaction ends. Lock order: root key, org, project; key before data key.
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
  findById(id: string, options?: TReadOptions): Promise<KmsKey | null>;
  // A filter applies whenever its field is set, even to an empty string.
  find(filter: TKmsKeyFilter, options?: TReadOptions): Promise<KmsKey[]>;
  // Locks kms_keys then internal_kms, in that order. save() writes both, so a rename racing a rotation would otherwise
  // write back the replaced material. Reads the primary, takes no options.
  findForUpdate(id: string): Promise<KmsKey | null>;
  // Published, and its project isn't pending deletion.
  findPublishedById(id: string, options?: TReadOptions): Promise<KmsKey | null>;
  // Customer keys of a project (not reserved, with internal material): one page plus the total.
  listProjectKeys(query: TKmsKeyPageQuery, options?: TReadOptions): Promise<{ keys: KmsKey[]; totalCount: number }>;
  countProjectKeysInOrg(orgId: string, projectType: ProjectType, options?: TReadOptions): Promise<number>;
  insert(key: KmsKey): Promise<void>;
  // Writes kms_keys attributes, internal_kms material and version, and external_kms inputs.
  save(key: KmsKey): Promise<void>;
  // Material, versions and external config cascade with it (foreign keys inside this domain).
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<number>;
};

export type TKmsKeyVersionStore = {
  insert(version: KmsKeyVersion): Promise<void>;
  listByInternalKmsId(internalKmsId: string, options?: TReadOptions): Promise<KmsKeyVersion[]>;
};

// Owns kms_root_config: at most an active, a staged and a retained row.
export type TRootKeyConfigStore = {
  findById(id: string, options?: TReadOptions): Promise<RootKeyConfig | null>;
  findAll(options?: TReadOptions): Promise<RootKeyConfig[]>;
  insert(config: RootKeyConfig): Promise<void>;
  save(config: RootKeyConfig): Promise<void>;
  // False when the row was already gone.
  delete(id: string): Promise<boolean>;
  // An abandoned staged row is a live working key that would promote itself if it reached a deployment.
  deleteAllStaged(): Promise<void>;
};

// Owns kms_kek_history. Never read it unbounded: it's never pruned.
export type TKekHistoryStore = {
  // Newest first.
  findPage(page: { offset: number; limit: number }, options?: TReadOptions): Promise<KekHistoryEntry[]>;
  count(options?: TReadOptions): Promise<number>;
  findActiveByLabel(kekLabel: string, options?: TReadOptions): Promise<KekHistoryEntry | null>;
  findCurrent(options?: TReadOptions): Promise<KekHistoryEntry | null>;
  insert(entry: KekHistoryEntry): Promise<void>;
  save(entry: KekHistoryEntry): Promise<void>;
};

export type TLegacyEncryptionKeyStore = {
  find(options?: TReadOptions): Promise<LegacyEncryptionKey | null>;
  // A concurrent insert of the same fixed id is ignored, not an error.
  insert(key: LegacyEncryptionKey): Promise<void>;
};

// Key columns on organizations, which no domain owns yet. A claim writes only while the column is empty and reports
// whether it did, so a second writer (a pod of the previous release) never overwrites the first.
export type TOrganizationKeyStore = {
  find(orgId: string, options?: TReadOptions): Promise<OrganizationKey | null>;
  claimKmsKey(key: OrganizationKey): Promise<boolean>;
  claimDataKey(key: OrganizationKey): Promise<boolean>;
  referencesKey(kmsKeyId: string, options?: TReadOptions): Promise<boolean>;
  isOrganization(id: string, options?: TReadOptions): Promise<boolean>;
};

// Key columns on projects, which no domain owns yet. A project scheduled for deletion isn't found.
export type TProjectKeyStore = {
  find(projectId: string, options?: TReadOptions): Promise<ProjectKey | null>;
  claimKmsKey(key: ProjectKey): Promise<boolean>;
  claimDataKey(key: ProjectKey): Promise<boolean>;
  claimCertificateKey(key: ProjectKey): Promise<boolean>;
  // Compare and swap: writes the key and data key only if the project still uses expectedKmsKeyId.
  switchKey(key: ProjectKey, expectedKmsKeyId: string): Promise<boolean>;
  // Unconditional write of key and data key, for a backup restore.
  save(key: ProjectKey): Promise<void>;
  // Includes projects scheduled for deletion.
  referencesKey(kmsKeyId: string, options?: TReadOptions): Promise<boolean>;
  findOrgIdIncludingPendingDeletion(projectId: string, options?: TReadOptions): Promise<string | null>;
};

// A project's wrapped data key in Redis, so the hot path skips the project row. Holds only what the database holds
// (the data key encrypted by its KMS key), never plaintext. Never use it inside a transaction: an entry written from a
// transaction that rolls back would name a key that doesn't exist.
export type TProjectDataKeyCache = {
  // Null on a miss, on a partial entry (a pod of the previous release caches a project before first use), and when
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

// HSM root key wrapping, implemented by the enterprise edition.
export type TRootKeyWrapper = {
  // True when an HSM is configured and passes its self-test.
  isConfigured(): Promise<boolean>;
  // Refuses with the license message when the instance is not entitled to HSM.
  assertEntitled(): void;
  randomBytes(length: number): Promise<Buffer>;
  wrap(rootKey: Buffer): Promise<Buffer>;
  unwrap(wrapped: Buffer): Promise<Buffer>;
};

export type TExternalKmsConfig = {
  id: string;
  kmsKeyId: string;
  provider: string;
  status?: string | null;
  statusDetails?: string | null;
  // Decrypted provider inputs. Holds credentials: callers return only the sanitized form.
  providerInput: Record<string, unknown>;
  hasLegacyExternalId: boolean;
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
  name?: string;
  description?: string;
  provider?: { type: string; inputs: unknown };
};

// The reads the enterprise edition needs to check that a key's provider inputs do not name another organization.
// Pass the stores of the current call, so inside a caller's transaction the check reads that transaction instead of
// taking a second connection.
export type TInfisicalIdLookup = {
  organizationKeyStore: Pick<TOrganizationKeyStore, "isOrganization">;
  projectKeyStore: Pick<TProjectKeyStore, "findOrgIdIncludingPendingDeletion">;
};

// Implemented by the enterprise edition and built before KMS Core, so every call gets the org data-key cipher that
// opens the key's provider inputs.
export type TExternalKmsHook = {
  assertInputsAllowed(key: TExternalKeyRef, orgCipher: TCipherPair, idLookup: TInfisicalIdLookup): Promise<void>;
  encrypt(key: TExternalKeyRef, orgCipher: TCipherPair, plainText: Buffer): Promise<Buffer<ArrayBuffer>>;
  decrypt(key: TExternalKeyRef, orgCipher: TCipherPair, cipherTextBlob: Buffer): Promise<Buffer<ArrayBuffer>>;
};

// Implemented by the enterprise edition, built after KMS Core from kmsDataKeyService. KMS Core never calls it: it's
// declared here so legacy callers can type it.
export type TExternalKmsService = {
  create(input: TCreateExternalKmsInput): Promise<TExternalKmsDetails>;
  update(kmsId: string, input: TUpdateExternalKmsInput): Promise<TExternalKmsDetails>;
  delete(kmsId: string): Promise<TExternalKmsDetails>;
  getById(kmsId: string): Promise<TExternalKmsDetails>;
  getByName(orgId: string, name: string): Promise<TExternalKmsDetails>;
  list(orgId: string): Promise<TExternalKmsSummary[]>;
  fetchGcpKeys(input: { credential: unknown; gcpRegion: string }): Promise<{ keys: string[] }>;
};

// What the enterprise edition plugs in. Without it, an HSM root config and external keys fail with a readable error.
export type TKmsCoreHooks = {
  rootKeyWrapper?: TRootKeyWrapper;
  externalKms?: TExternalKmsHook;
};
