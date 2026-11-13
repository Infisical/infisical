import { InstanceEncryptionKey } from "../models/instance-encryption-key";
import { RootKey } from "../models/root-key";
import { RootKeyConfig, RootKeyEncryptionStrategy } from "../models/root-key-config";
import { KmsCoreModule } from "../module";
import { TDataKeyService } from "../services/data-key/service";
import { TKmsCoreHooks } from "../services/dependencies";
import { TKmsKeyService } from "../services/kms-key/service";
import { TRootKeyService } from "../services/root-key/service";
import { InMemoryKmsCoreStores } from "./in-memory-kms-core-stores";
import { rootKeyTestEnv } from "./root-key-fixture";

type TAsync<T> = { [K in keyof T]: T[K] extends (...args: never[]) => Promise<unknown> ? K : never }[keyof T];

// Calls the real service once the in-memory module has loaded the root key.
const delegate = <T extends object>(service: Promise<T>, methods: TAsync<T>[]): T =>
  Object.fromEntries(
    methods.map((method) => [
      method,
      async (...args: unknown[]) => {
        const resolved = await service;
        return (resolved[method] as (...input: unknown[]) => unknown).apply(resolved, args);
      }
    ])
  ) as T;

/**
 * For consumers of KMS Core: the real services over in-memory stores, with real AES-GCM. Orgs and projects are
 * created the first time a test names them, so a test only passes ids. `memory` exposes the stores. `within` ignores
 * the transaction: a consumer's test hands it a fake one, and there is only one in-memory state to join.
 */
export class FakeKmsCore {
  readonly memory = new InMemoryKmsCoreStores();

  readonly dataKeyService: TDataKeyService;

  readonly kmsKeyService: TKmsKeyService;

  readonly rootKeyService: TRootKeyService;

  private readonly rootKey = RootKey.generate();

  constructor({ hooks = {} }: { hooks?: TKmsCoreHooks } = {}) {
    const env = rootKeyTestEnv();
    this.memory.platformRows.autoCreate = true;
    const config = RootKeyConfig.bootstrap({
      encryptedRootKey: InstanceEncryptionKey.fromEnv(env).wrapRootKey(this.rootKey),
      strategy: RootKeyEncryptionStrategy.Software,
      withRotationState: false
    });
    const module = this.memory.rootKeyConfigStore.insert(config).then(() =>
      KmsCoreModule.create({
        transactionRunner: this.memory.transactionRunner,
        stores: this.memory.stores,
        env,
        hooks,
        isFipsEnabled: () => false,
        skipRotationState: true
      })
    );

    const dataKeys = delegate<TDataKeyService>(
      module.then((m) => m.dataKeyService),
      [
        "createCipherPairWithDataKey",
        "getProjectSecretManagerKmsKeyId",
        "getProjectCertificateKmsKeyId",
        "wrapKey",
        "unwrapKey",
        "updateProjectSecretManagerKmsKey",
        "getProjectKeyBackup",
        "loadProjectKeyBackup",
        "deleteProjectKeys"
      ]
    );
    this.dataKeyService = { ...dataKeys, within: () => dataKeys };

    const kmsKeys = delegate<TKmsKeyService>(
      module.then((m) => m.kmsKeyService),
      [
        "generateKmsKey",
        "importKeyMaterial",
        "rotateKmsKey",
        "getKmsById",
        "findKeyById",
        "findPublishedKeyById",
        "findKeys",
        "listProjectKeys",
        "updateKeyAttributes",
        "deleteKey",
        "deleteKeys",
        "countProjectKeysInOrg",
        "getKeyMaterial",
        "getBulkKeyMaterial",
        "encryptWithKmsKey",
        "decryptWithKmsKey",
        "getPublicKey",
        "signWithKmsKey",
        "verifyWithKmsKey",
        "generateMac",
        "verifyMac",
        "createExternalKms",
        "updateExternalKms",
        "deleteExternalKms",
        "getExternalKms",
        "getExternalKmsByName",
        "listExternalKms",
        "fetchGcpKeys"
      ]
    );
    this.kmsKeyService = { ...kmsKeys, within: () => kmsKeys };

    this.rootKeyService = {
      ...delegate<TRootKeyService>(
        module.then((m) => m.rootKeyService),
        [
          "listEncryptionStrategies",
          "updateEncryptionStrategy",
          "getRootKey",
          "listRotations",
          "createRotation",
          "deleteStagedKey",
          "deleteExpiringKey",
          "removeInactiveKeys"
        ]
      ),
      encryptWithRootKey: () => (plainText: Buffer) => this.rootKey.encrypt(plainText),
      decryptWithRootKey: () => (cipherText: Buffer) => this.rootKey.decrypt(cipherText),
      getCookieSigningKey: () => this.rootKey.cookieSigningKey()
    };
  }
}
