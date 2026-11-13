import { ProjectType } from "@app/db/schemas";
import { OrderByDirection } from "@app/lib/types";

import { KekHistoryEntry } from "../models/kek-history-entry";
import { KmsKey } from "../models/kms-key";
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
