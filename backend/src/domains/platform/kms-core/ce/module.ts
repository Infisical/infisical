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
import { KmsDataKeyService, TKmsDataKeyService } from "./services/data-key/service";
import { TKmsCoreHooks, TKmsCoreStores } from "./services/dependencies";
import { KeyCipher } from "./services/helpers/key-cipher";
import { KmsKeyService, TKmsKeyService } from "./services/kms-key/service";
import { RootKeyLoader } from "./services/root-key/root-key-loader";
import { RootKeyWrappings } from "./services/root-key/root-key-wrappings";
import { KmsRootKeyService, TKmsCoreEnv, TKmsRootKeyService } from "./services/root-key/service";

export type { TCipherPair } from "./models/data-key";
export { KmsCiphertextUndecryptableError } from "./models/kms-ciphertext-undecryptable-error";
export { KmsKeyUsage } from "./models/kms-key";
export type { TKmsKeyDetails } from "./models/kms-key";
export { RootKeyEncryptionStrategy } from "./models/root-key-config";
export { WrappedKeyPayload } from "./models/wrapped-key";
export { KmsDataKey, KmsType } from "./services/data-key/service";
export type {
  TKmsDataKeyService,
  TKmsDataKeyTransaction,
  TEncryptWithKmsDataKeyDTO
} from "./services/data-key/service";
export type { TExternalKmsDetails, TExternalKmsService } from "./services/dependencies";
export { ReadFrom } from "@app/domains/lib/data-access";
export type { TReadOptions } from "@app/domains/lib/data-access";
export { KmsKeyOrderBy } from "./services/kms-key/service";
export type { TKmsKeyService } from "./services/kms-key/service";
export type { TKmsRootKeyService } from "./services/root-key/service";

type TKmsCoreStoreAccess = {
  transactionRunner: TTransactionRunner<TKmsCoreStores>;
  // Used outside a transaction (reads the replica on the server).
  stores: TKmsCoreStores;
};

type TKmsCoreDeps = (
  | {
      db: TDbClient;
      // Reads outside a transaction: the replica on the server, the same connection in a migration (a migration must
      // never read through the global replica).
      readKnex: () => Knex;
    }
  // Tests pass in-memory stores instead.
  | TKmsCoreStoreAccess
) & {
  env: TKmsCoreEnv;
  originalEnv?: TLegacyKeySnapshot;
  hooks: TKmsCoreHooks;
  // Redis for the project data-key cache. Omitted where there's no Redis (migrations, most tests).
  keyStore?: TDomainKeyStore;
  isFipsEnabled?: () => boolean;
  // For migrations: load only the root key. Historical migrations predate promotion, labels and the legacy snapshot.
  skipRotationState?: boolean;
};

// Owns kms_keys, internal_kms, internal_kms_key_version, external_kms, kms_root_config, kms_kek_history,
// kms_legacy_encryption_keys, and the key columns on organizations and projects.
export class KmsCoreModule {
  readonly name = "kms-core";

  private constructor(
    readonly kmsRootKeyService: TKmsRootKeyService,
    readonly kmsKeyService: TKmsKeyService,
    readonly kmsDataKeyService: TKmsDataKeyService
  ) {}

  // Loads (or bootstraps) the root key before any service exists, so none can run without it. Build after
  // KmsCoreEeModule: it may need the HSM to unwrap it.
  static async create(deps: TKmsCoreDeps): Promise<KmsCoreModule> {
    const { transactionRunner, stores } = "db" in deps ? buildKmsCoreStoreAccess(deps.db, deps.readKnex) : deps;
    const isFipsEnabled = deps.isFipsEnabled ?? (() => crypto.isFipsModeEnabled());
    const { rootKeyWrapper, externalKms } = deps.hooks;
    const rootKeyWrappings = new RootKeyWrappings(deps.env, isFipsEnabled, rootKeyWrapper);

    const rootKey: RootKey = await new RootKeyLoader(
      transactionRunner,
      stores,
      deps.env,
      rootKeyWrappings,
      deps.originalEnv,
      deps.skipRotationState
    ).load();

    const kmsRootKeyService = new KmsRootKeyService(
      transactionRunner,
      stores,
      rootKey,
      deps.env,
      isFipsEnabled,
      rootKeyWrappings
    );
    const cache = deps.keyStore ? new ProjectDataKeyCache(deps.keyStore) : undefined;
    const keyCipher = new KeyCipher(stores, rootKey, externalKms);
    const kmsDataKeyService = new KmsDataKeyService(transactionRunner, stores, rootKey, keyCipher, cache);
    const kmsKeyService = new KmsKeyService(transactionRunner, stores, rootKey, keyCipher);
    return new KmsCoreModule(kmsRootKeyService, kmsKeyService, kmsDataKeyService);
  }

  start(cronJob: Pick<TCronJobFactory, "register">) {
    cronJob.register({
      name: CronJobName.KmsRootKeyCleanup,
      pattern: "0 3 * * 0",
      runHashTtlS: 60 * 60,
      handler: () => this.kmsRootKeyService.removeInactiveKeys()
    });
  }
}
