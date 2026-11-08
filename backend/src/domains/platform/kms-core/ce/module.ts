import type { Knex } from "knex";

import type { TDbClient } from "@app/db";
import { ProjectType } from "@app/db/schemas";
import { TransactionRunner, TTransactionRunner } from "@app/domains/lib/transaction-runner";
import type { TCronJobFactory } from "@app/lib/cron/cron-job";
import { crypto } from "@app/lib/crypto/cryptography";
import type { HmacAlgorithm } from "@app/lib/crypto/hmac";
import type { TLegacyKeySnapshot } from "@app/lib/crypto/legacy-key";
import { NotFoundError } from "@app/lib/errors";

import { buildKmsCoreReadStore, buildKmsCoreStore, TKmsCoreStore } from "./data-access/kms-core-store";
import { TKmsKeyFilter } from "./data-access/kms-key-data-access";
import { TKmsKeyAttributes, TKmsKeyRecord } from "./model/kms-key";
import { RootKeyEncryptionStrategy } from "./model/root-key-config";
import { TKmsCoreState } from "./service/key-material";
import {
  TCreateExternalKmsInput,
  TExternalKmsDetails,
  TExternalKmsHook,
  TExternalKmsSummary,
  TKmsCoreHooks,
  TUpdateExternalKmsInput
} from "./service/kms-core-hooks";
import {
  KmsDataKey,
  TAsyncDecryptor,
  TAsyncEncryptor,
  TCipherPair,
  TEncryptWithKmsDataKeyDTO,
  TGenerateKMSDTO,
  TImportKeyMaterialDTO,
  TKmsReadOptions,
  TListKmsKeysDTO,
  TSignWithKmsDTO,
  TUpdateProjectSecretManagerKmsKeyDTO,
  TVerifyWithKmsDTO
} from "./service/kms-core-types";
import { KmsCryptoService } from "./service/kms-crypto-service";
import { KmsKeyService, TKmsKeyDetails } from "./service/kms-key-service";
import { RootKeyHolder } from "./service/root-key-holder";
import {
  RootKeyRotationService,
  TCreatedRotation,
  TRootKeyStatus,
  TRotationHistoryEntry
} from "./service/root-key-rotation-service";
import {
  RootKeyService,
  TEncryptionStrategyOption,
  TKmsCoreEnv,
  TRootKeyStartOptions
} from "./service/root-key-service";
import { ScopeKeyService } from "./service/scope-key-service";

export { KmsKeyUsage } from "./model/kms-key";
export type { TKmsKeyAttributes, TKmsKeyRecord } from "./model/kms-key";
export { RootKeyEncryptionStrategy } from "./model/root-key-config";
export { WrappedKeyPayload } from "./model/wrapped-key";
export type {
  TCreateExternalKmsInput,
  TExternalKeyRef,
  TExternalKmsConfig,
  TExternalKmsDetails,
  TExternalKmsHook,
  TExternalKmsSummary,
  TKmsCoreHooks,
  TRootKeyWrapper,
  TUpdateExternalKmsInput
} from "./service/kms-core-hooks";
export * from "./service/kms-core-types";
export type { TKmsKeyDetails } from "./service/kms-key-service";
export type { TCreatedRotation, TRootKeyStatus, TRotationHistoryEntry } from "./service/root-key-rotation-service";
export type { TEncryptionStrategyOption, TKmsCoreEnv } from "./service/root-key-service";

export type TKmsCoreDomain = {
  // Root key. The key itself never leaves the domain; these encrypt and decrypt with it.
  encryptWithRootKey: () => (plainText: Buffer) => Buffer<ArrayBuffer>;
  decryptWithRootKey: () => (cipherText: Buffer) => Buffer<ArrayBuffer>;
  // Derived from the root key (HKDF), so it is stable across restarts and replicas.
  getCookieSigningKey: () => string;
  listEncryptionStrategies: () => Promise<{ strategies: TEncryptionStrategyOption[] }>;
  // Refused while a rotation is staged or retained, and for HSM when the instance is not entitled to it.
  updateEncryptionStrategy: (strategy: RootKeyEncryptionStrategy) => Promise<void>;

  // Root key rotation (the admin console).
  getRootKey: () => Promise<TRootKeyStatus>;
  listRotations: (page: {
    offset: number;
    limit: number;
  }) => Promise<{ rotations: TRotationHistoryEntry[]; totalCount: number }>;
  createRotation: (input: { replaceStaged?: boolean }) => Promise<TCreatedRotation>;
  deleteStagedKey: (input: { label: string }) => Promise<void>;
  deleteExpiringKey: (input: { label: string; force?: boolean }) => Promise<void>;

  // KMS keys.
  generateKmsKey: (input: TGenerateKMSDTO) => Promise<TKmsKeyRecord>;
  importKeyMaterial: (input: TImportKeyMaterialDTO) => Promise<TKmsKeyRecord>;
  rotateKmsKey: (kmsId: string) => Promise<{ id: string; version: number }>;
  getKmsById: (kmsId: string) => Promise<{ id: string; name: string; orgId: string; isExternal: boolean }>;
  findKeyById: (kmsId: string) => Promise<TKmsKeyDetails | undefined>;
  findKeys: (filter: TKmsKeyFilter, options?: TKmsReadOptions) => Promise<TKmsKeyDetails[]>;
  listProjectKeys: (input: TListKmsKeysDTO) => Promise<{ keys: TKmsKeyDetails[]; totalCount: number }>;
  updateKeyAttributes: (kmsId: string, attributes: TKmsKeyAttributes) => Promise<TKmsKeyDetails>;
  // Null when the key has delete protection.
  deleteKey: (kmsId: string) => Promise<TKmsKeyDetails | null>;
  deleteKeys: (kmsIds: string[]) => Promise<number>;
  countProjectKeysInOrg: (orgId: string, projectType: ProjectType) => Promise<number>;
  getKeyMaterial: (input: { kmsId: string }) => Promise<Buffer<ArrayBuffer>>;
  getBulkKeyMaterial: (input: {
    kmsIds: string[];
  }) => Promise<{ kmsId: string; name: string; keyMaterial: Buffer<ArrayBuffer> }[]>;

  // Cryptography with a KMS key.
  encryptWithKmsKey: (input: { kmsId: string }) => Promise<TAsyncEncryptor>;
  decryptWithKmsKey: (input: { kmsId: string }) => Promise<TAsyncDecryptor>;
  getPublicKey: (input: { kmsId: string }, options?: TKmsReadOptions) => Promise<Buffer>;
  signWithKmsKey: (
    input: Pick<TSignWithKmsDTO, "kmsId">,
    options?: TKmsReadOptions
  ) => Promise<
    (input: Pick<TSignWithKmsDTO, "data" | "signingAlgorithm" | "isDigest">) => Promise<{
      signature: Buffer;
      algorithm: TSignWithKmsDTO["signingAlgorithm"];
    }>
  >;
  verifyWithKmsKey: (input: Pick<TVerifyWithKmsDTO, "kmsId" | "signingAlgorithm">) => Promise<
    (input: Pick<TVerifyWithKmsDTO, "data" | "signature" | "isDigest">) => Promise<{
      signatureValid: boolean;
      algorithm: TVerifyWithKmsDTO["signingAlgorithm"];
    }>
  >;
  generateMac: (input: {
    kmsId: string;
  }) => Promise<(input: { data: Buffer }) => { mac: Buffer; algorithm: HmacAlgorithm }>;
  verifyMac: (input: {
    kmsId: string;
  }) => Promise<(input: { data: Buffer; mac: Buffer }) => { macValid: boolean; algorithm: HmacAlgorithm }>;

  // Org and project keys. Each is created on first use in KMS Core's own short transaction: never call these
  // inside a caller's transaction (see kms-core/AGENTS.md).
  createCipherPairWithDataKey: (context: TEncryptWithKmsDataKeyDTO) => Promise<TCipherPair>;
  getProjectSecretManagerKmsKeyId: (projectId: string) => Promise<string>;
  getProjectCertificateKmsKeyId: (projectId: string) => Promise<string>;
  wrapKey: (input: { projectId: string; label: string; key: Buffer }) => Promise<Buffer<ArrayBuffer>>;
  unwrapKey: (input: {
    projectId: string;
    label: string;
    wrappedKey: Buffer;
    keyBytes: number;
  }) => Promise<Buffer | null>;
  updateProjectSecretManagerKmsKey: (
    input: TUpdateProjectSecretManagerKmsKeyDTO
  ) => Promise<TKmsKeyRecord & { isExternal: boolean }>;
  getProjectKeyBackup: (projectId: string) => Promise<{ secretManager: string }>;
  loadProjectKeyBackup: (projectId: string, backup: string) => Promise<{ secretManagerKmsKey: TKmsKeyDetails }>;
  // After a project is deleted: removes the reserved keys it owned that nothing references any more.
  deleteProjectKeys: (input: { orgId: string; kmsKeyIds: string[] }) => Promise<void>;

  // External KMS keys. Paid: the enterprise edition implements them, and the caller checks the plan.
  createExternalKms: (input: TCreateExternalKmsInput) => Promise<TExternalKmsDetails>;
  updateExternalKms: (input: TUpdateExternalKmsInput) => Promise<TExternalKmsDetails>;
  deleteExternalKms: (kmsId: string) => Promise<TExternalKmsDetails>;
  getExternalKms: (kmsId: string) => Promise<TExternalKmsDetails>;
  getExternalKmsByName: (orgId: string, name: string) => Promise<TExternalKmsDetails>;
  listExternalKms: (orgId: string) => Promise<TExternalKmsSummary[]>;
  fetchGcpKeys: (input: { credential: unknown; gcpRegion: string }) => Promise<{ keys: string[] }>;
};

export type TKmsCoreStorage = {
  runner: TTransactionRunner<TKmsCoreStore>;
  // Reads that tolerate replication lag.
  replica: TKmsCoreStore;
  // Reads that must see the latest commit, outside a transaction.
  primary: TKmsCoreStore;
};

export type TKmsCoreDeps = {
  // The primary. Migrations pass their own connection, so every read stays on it.
  db: TDbClient | Knex;
  // Defaults to db.replicaNode(); migrations pass their connection.
  replicaDb?: Knex;
  // Replaces db (tests use an in-memory store).
  storage?: TKmsCoreStorage;
  cronJob?: Pick<TCronJobFactory, "register">;
  env: TKmsCoreEnv;
  originalEnv?: TLegacyKeySnapshot;
  hooks: TKmsCoreHooks;
  isFipsEnabled?: () => boolean;
};

// The server's client routes reads to a replica; a plain Knex (a migration's connection) has no replica.
export const replicaOf = (db: TDbClient | Knex): Knex =>
  typeof (db as Partial<TDbClient>).replicaNode === "function" ? (db as TDbClient).replicaNode() : (db as Knex);

const buildStorage = (db: TDbClient | Knex, replicaDb?: Knex): TKmsCoreStorage => ({
  runner: new TransactionRunner(db as TDbClient, (trx) => buildKmsCoreStore(trx)),
  primary: buildKmsCoreReadStore(db as Knex),
  replica: buildKmsCoreReadStore(replicaDb ?? replicaOf(db))
});

const ROOT_KEY_CLEANUP_CRON = "kms-root-key-cleanup";

// The root key, internal KMS keys, org and project keys, HSM and external keys (through hooks), and root key
// rotation. Owns kms_keys, internal_kms, internal_kms_key_version, external_kms, kms_root_config,
// kms_kek_history, kms_legacy_encryption_keys, and the key columns on organizations and projects.
export class KmsCoreModule {
  readonly name = "kms-core";

  readonly service: TKmsCoreDomain;

  private readonly state: TKmsCoreState;

  private readonly rootKeys: RootKeyService;

  private readonly rotation: RootKeyRotationService;

  constructor(private readonly deps: TKmsCoreDeps) {
    const storage = deps.storage ?? buildStorage(deps.db, deps.replicaDb);
    const isFipsEnabled = deps.isFipsEnabled ?? (() => crypto.isFipsModeEnabled());
    this.state = { rootKey: new RootKeyHolder(), hooks: deps.hooks };
    const { state } = this;
    const { runner, replica, primary } = storage;

    this.rootKeys = new RootKeyService({
      runner,
      primary,
      state,
      env: deps.env,
      originalEnv: deps.originalEnv,
      isFipsEnabled
    });
    const { rootKeys } = this;
    this.rotation = new RootKeyRotationService({
      runner,
      primary,
      state,
      retentionDays: deps.env.KMS_ROOT_KEY_RETENTION_DAYS,
      currentKekLabel: () => rootKeys.currentKekLabel(),
      isFipsEnabled
    });
    const kmsKeys = new KmsKeyService({ runner, replica, primary, state });
    const cryptoService = new KmsCryptoService({ replica, primary, state });
    const scopeKeys = new ScopeKeyService({ runner, replica, primary, state });
    this.service = this.build(kmsKeys, cryptoService, scopeKeys);
  }

  // Loads the root key (bootstrapping it on a new instance) and registers the rotation cron. Called once at boot,
  // after the enterprise module started.
  async start(options: TRootKeyStartOptions = {}): Promise<void> {
    await this.rootKeys.start(options);
    if (options.skipRotationState || !this.deps.cronJob) return;
    this.deps.cronJob.register({
      name: ROOT_KEY_CLEANUP_CRON,
      pattern: "0 3 * * 0",
      runHashTtlS: 60 * 60,
      handler: () => this.rotation.removeInactiveKeys()
    });
  }

  private externalKms(): TExternalKmsHook {
    const hook = this.state.hooks.externalKms;
    if (!hook) throw new NotFoundError({ message: "External KMS keys require the Infisical enterprise edition." });
    return hook;
  }

  private build(kmsKeys: KmsKeyService, cryptoService: KmsCryptoService, scopeKeys: ScopeKeyService): TKmsCoreDomain {
    const { rootKeys, rotation } = this;
    const orgCipher = (orgId: string) =>
      scopeKeys.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId });
    // The org of an existing external key, which owns the data key its provider inputs are encrypted with.
    const keyOrgCipher = async (kmsId: string) => {
      const key = await kmsKeys.findKeyById(kmsId);
      if (!key?.isExternal) throw new NotFoundError({ message: `External KMS with ID '${kmsId}' not found` });
      return orgCipher(key.orgId);
    };

    return {
      encryptWithRootKey: () => rootKeys.encryptWithRootKey(),
      decryptWithRootKey: () => rootKeys.decryptWithRootKey(),
      getCookieSigningKey: () => rootKeys.getCookieSigningKey(),
      listEncryptionStrategies: () => rootKeys.listEncryptionStrategies(),
      updateEncryptionStrategy: (strategy) => rootKeys.updateEncryptionStrategy(strategy),

      getRootKey: () => rotation.getRootKey(),
      listRotations: (page) => rotation.listRotations(page),
      createRotation: (input) => rotation.createRotation(input),
      deleteStagedKey: (input) => rotation.deleteStagedKey(input),
      deleteExpiringKey: (input) => rotation.deleteExpiringKey(input),

      generateKmsKey: (input) => kmsKeys.generateKmsKey(input),
      importKeyMaterial: (input) => kmsKeys.importKeyMaterial(input),
      rotateKmsKey: (kmsId) => kmsKeys.rotateKmsKey(kmsId),
      getKmsById: (kmsId) => kmsKeys.getKmsById(kmsId),
      findKeyById: (kmsId) => kmsKeys.findKeyById(kmsId),
      findKeys: (filter, options) => kmsKeys.findKeys(filter, options),
      listProjectKeys: (input) => kmsKeys.listProjectKeys(input),
      updateKeyAttributes: (kmsId, attributes) => kmsKeys.updateKeyAttributes(kmsId, attributes),
      deleteKey: (kmsId) => kmsKeys.deleteKey(kmsId),
      deleteKeys: (kmsIds) => kmsKeys.deleteKeys(kmsIds),
      countProjectKeysInOrg: (orgId, projectType) => kmsKeys.countProjectKeysInOrg(orgId, projectType),
      getKeyMaterial: (input) => kmsKeys.getKeyMaterial(input),
      getBulkKeyMaterial: (input) => kmsKeys.getBulkKeyMaterial(input),

      encryptWithKmsKey: (input) => cryptoService.encryptWithKmsKey(input),
      decryptWithKmsKey: (input) => cryptoService.decryptWithKmsKey(input),
      getPublicKey: (input, options) => cryptoService.getPublicKey(input, options),
      signWithKmsKey: (input, options) => cryptoService.signWithKmsKey(input, options),
      verifyWithKmsKey: (input) => cryptoService.verifyWithKmsKey(input),
      generateMac: (input) => cryptoService.generateMac(input),
      verifyMac: (input) => cryptoService.verifyMac(input),

      createCipherPairWithDataKey: (context) => scopeKeys.createCipherPairWithDataKey(context),
      getProjectSecretManagerKmsKeyId: (projectId) => scopeKeys.getProjectSecretManagerKmsKeyId(projectId),
      getProjectCertificateKmsKeyId: (projectId) => scopeKeys.getProjectCertificateKmsKeyId(projectId),
      wrapKey: (input) => scopeKeys.wrapKey(input),
      unwrapKey: (input) => scopeKeys.unwrapKey(input),
      updateProjectSecretManagerKmsKey: (input) => scopeKeys.updateProjectSecretManagerKmsKey(input),
      getProjectKeyBackup: (projectId) => scopeKeys.getProjectKeyBackup(projectId),
      loadProjectKeyBackup: (projectId, backup) => scopeKeys.loadProjectKeyBackup(projectId, backup),
      deleteProjectKeys: (input) => scopeKeys.deleteProjectKeys(input),

      createExternalKms: async (input) => {
        const hook = this.externalKms();
        return hook.create(input, await orgCipher(input.orgId));
      },
      updateExternalKms: async (input) => {
        const hook = this.externalKms();
        return hook.update(input, await keyOrgCipher(input.kmsId));
      },
      deleteExternalKms: async (kmsId) => {
        const hook = this.externalKms();
        return hook.delete(kmsId, await keyOrgCipher(kmsId));
      },
      getExternalKms: async (kmsId) => {
        const hook = this.externalKms();
        return hook.get(kmsId, await keyOrgCipher(kmsId));
      },
      getExternalKmsByName: async (orgId, name) => {
        const hook = this.externalKms();
        const [key] = await kmsKeys.findKeys({ orgId, name });
        if (!key?.isExternal) throw new NotFoundError({ message: `External KMS with name '${name}' not found` });
        return hook.get(key.id, await orgCipher(orgId));
      },
      listExternalKms: (orgId) => this.externalKms().list(orgId),
      fetchGcpKeys: (input) => this.externalKms().fetchGcpKeys(input)
    };
  }
}
