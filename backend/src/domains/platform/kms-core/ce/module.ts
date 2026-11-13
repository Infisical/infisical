import type { Knex } from "knex";

import { TDbClient } from "@app/db";
import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TTransactionRunner } from "@app/domains/lib/transactions";
import { CronJobName, type TCronJobFactory } from "@app/lib/cron/cron-job";
import { crypto } from "@app/lib/crypto/cryptography";
import type { TLegacyKeySnapshot } from "@app/lib/crypto/legacy-key";

import { buildKmsCoreStoreAccess } from "./data-access/kms-core-stores";
import { ProjectDataKeyCache } from "./data-access/project-data-key-cache";
import { RootKey } from "./models/root-key";
import { DataKeyService, TDataKeyService } from "./services/data-key/service";
import { TKmsCoreHooks, TKmsCoreStores } from "./services/dependencies";
import { KmsKeyService, TKmsKeyService } from "./services/kms-key/service";
import { loadRootKey } from "./services/root-key/load-root-key";
import { RootKeyService, TKmsCoreEnv, TRootKeyService } from "./services/root-key/service";

export type { TCipherPair, TDecryptor, TEncryptor } from "./models/data-key";
export { KmsCiphertextUndecryptableError } from "./models/kms-ciphertext-undecryptable-error";
export { KmsKeyUsage } from "./models/kms-key";
export type { TKmsKeyDetails, TKmsKeyRecord } from "./models/kms-key";
export { RootKeyEncryptionStrategy } from "./models/root-key-config";
export { WrappedKeyPayload } from "./models/wrapped-key";
export { KmsDataKey, KmsType } from "./services/data-key/service";
export type {
  TDataKeyService,
  TDataKeyTransaction,
  TEncryptWithKmsDataKeyDTO,
  TUpdateProjectSecretManagerKmsKeyDTO
} from "./services/data-key/service";
export type {
  TCreateExternalKmsInput,
  TExternalKmsConfig,
  TExternalKmsDetails,
  TExternalKmsHook,
  TExternalKmsSummary,
  TKmsCoreHooks,
  TKmsKeyFilter,
  TRootKeyWrapper,
  TUpdateExternalKmsInput
} from "./services/dependencies";
export type { TAsyncDecryptor, TAsyncEncryptor } from "./services/helpers/key-cipher";
export { ReadFrom } from "./services/helpers/read-options";
export type { TReadOptions } from "./services/helpers/read-options";
export { KmsKeyOrderBy } from "./services/kms-key/service";
export type {
  TGenerateKMSDTO,
  TImportKeyMaterialDTO,
  TKmsKeyAttributes,
  TKmsKeyService,
  TKmsKeyTransaction,
  TListKmsKeysDTO,
  TSignWithKmsDTO,
  TVerifyWithKmsDTO
} from "./services/kms-key/service";
export type {
  TCreatedRotation,
  TEncryptionStrategyOption,
  TKmsCoreEnv,
  TRootKeyService,
  TRootKeyStatus,
  TRotationHistoryEntry
} from "./services/root-key/service";

// Every KMS Core service in one object, for consumers that still take a single dependency. Joining a transaction
// goes through the service that owns the call (dataKeyService.within, kmsKeyService.within).
export type TKmsCoreDomain = TRootKeyService & Omit<TKmsKeyService, "within"> & Omit<TDataKeyService, "within">;

export type TKmsCoreStoreAccess = {
  transactionRunner: TTransactionRunner<TKmsCoreStores>;
  // Outside a transaction: the replica on the server.
  stores: TKmsCoreStores;
};

export type TKmsCoreDeps = (
  | {
      db: TDbClient;
      // Where reads outside a transaction go: the replica on the server, the same connection in a migration (never
      // the global replica, which a migration must not read through).
      readKnex: () => Knex;
    }
  // Tests pass in-memory stores instead.
  | TKmsCoreStoreAccess
) & {
  env: TKmsCoreEnv;
  originalEnv?: TLegacyKeySnapshot;
  hooks: TKmsCoreHooks;
  // Redis, for the project data-key cache. Left out where there is no Redis (migrations, most tests).
  keyStore?: TDomainKeyStore;
  isFipsEnabled?: () => boolean;
  /**
   * For callers inside a database migration: loads only the root key, with no promotion, labels or legacy snapshot,
   * which historical migrations predate.
   */
  skipRotationState?: boolean;
};

const bindAll = <T extends object>(service: T): Omit<T, "within"> => {
  const bound = {} as Record<string, unknown>;
  let proto = Object.getPrototypeOf(service) as object | null;
  while (proto && proto !== Object.prototype) {
    Object.getOwnPropertyNames(proto).forEach((name) => {
      const member = (service as Record<string, unknown>)[name];
      if (name !== "constructor" && name !== "within" && typeof member === "function" && !(name in bound)) {
        bound[name] = (member as (...args: unknown[]) => unknown).bind(service);
      }
    });
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return bound as Omit<T, "within">;
};

// The root key, internal KMS keys, org and project keys, HSM and external keys (through hooks), and root key
// rotation. Owns kms_keys, internal_kms, internal_kms_key_version, external_kms, kms_root_config,
// kms_kek_history, kms_legacy_encryption_keys, and the key columns on organizations and projects.
export class KmsCoreModule {
  readonly name = "kms-core";

  // Every service in one object, until consumers take the services they call.
  readonly service: TKmsCoreDomain;

  private constructor(
    readonly rootKeyService: RootKeyService,
    readonly kmsKeyService: KmsKeyService,
    readonly dataKeyService: DataKeyService
  ) {
    this.service = {
      ...bindAll<TRootKeyService>(rootKeyService),
      ...bindAll<TKmsKeyService>(kmsKeyService),
      ...bindAll<TDataKeyService>(dataKeyService)
    };
  }

  // Loads the root key (bootstrapping it on a new instance) before any service exists, so none can run without it.
  // Built after KmsCoreEeModule, which may need the HSM to unwrap it.
  static async create(deps: TKmsCoreDeps): Promise<KmsCoreModule> {
    const { transactionRunner, stores } = "db" in deps ? buildKmsCoreStoreAccess(deps.db, deps.readKnex) : deps;
    const isFipsEnabled = deps.isFipsEnabled ?? (() => crypto.isFipsModeEnabled());
    const { rootKeyWrapper, externalKms } = deps.hooks;

    const rootKey: RootKey = await loadRootKey({
      transactionRunner,
      stores,
      env: deps.env,
      originalEnv: deps.originalEnv,
      isFipsEnabled,
      rootKeyWrapper,
      skipRotationState: deps.skipRotationState
    });

    const rootKeyService = new RootKeyService(transactionRunner, rootKey, deps.env, isFipsEnabled, rootKeyWrapper);
    const cache = deps.keyStore ? new ProjectDataKeyCache(deps.keyStore) : undefined;
    const dataKeyService = new DataKeyService(transactionRunner, stores, rootKey, externalKms, cache);
    const kmsKeyService = new KmsKeyService(transactionRunner, stores, rootKey, externalKms, dataKeyService);
    return new KmsCoreModule(rootKeyService, kmsKeyService, dataKeyService);
  }

  // Registers the weekly removal of root keys past their retention.
  start(cronJob: Pick<TCronJobFactory, "register">) {
    cronJob.register({
      name: CronJobName.KmsRootKeyCleanup,
      pattern: "0 3 * * 0",
      runHashTtlS: 60 * 60,
      handler: () => this.rootKeyService.removeInactiveKeys()
    });
  }
}
