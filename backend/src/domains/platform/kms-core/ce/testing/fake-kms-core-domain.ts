import { InstanceEncryptionKey } from "../models/instance-encryption-key";
import { RootKey } from "../models/root-key";
import { RootKeyConfig, RootKeyEncryptionStrategy } from "../models/root-key-config";
import { KmsCoreModule, TKmsCoreDomain } from "../module";
import { TKmsCoreHooks } from "../services/dependencies";
import { InMemoryKmsCoreStores } from "./in-memory-kms-core-stores";
import { rootKeyTestEnv } from "./root-key-fixture";

type TAsyncMethods = {
  [K in keyof TKmsCoreDomain]: ReturnType<TKmsCoreDomain[K]> extends Promise<unknown> ? K : never;
}[keyof TKmsCoreDomain];

/**
 * For consumers of KMS Core: the real domain over in-memory stores, with real AES-GCM. Orgs and projects are created
 * the first time a test names them, so a test only passes ids. `memory` exposes the stores.
 */
export class FakeKmsCoreDomain implements TKmsCoreDomain {
  readonly memory = new InMemoryKmsCoreStores();

  private readonly rootKey = RootKey.generate();

  private readonly module: Promise<KmsCoreModule>;

  constructor({ hooks = {} }: { hooks?: TKmsCoreHooks } = {}) {
    const env = rootKeyTestEnv();
    this.memory.platformRows.autoCreate = true;
    const config = RootKeyConfig.bootstrap({
      encryptedRootKey: InstanceEncryptionKey.fromEnv(env).wrapRootKey(this.rootKey),
      strategy: RootKeyEncryptionStrategy.Software,
      withRotationState: false
    });
    this.module = this.memory.rootKeyConfigStore.insert(config).then(() =>
      KmsCoreModule.create({
        transactionRunner: this.memory.transactionRunner,
        stores: this.memory.stores,
        env,
        hooks,
        isFipsEnabled: () => false,
        skipRotationState: true
      })
    );
  }

  encryptWithRootKey = () => (plainText: Buffer) => this.rootKey.encrypt(plainText);

  decryptWithRootKey = () => (cipherText: Buffer) => this.rootKey.decrypt(cipherText);

  getCookieSigningKey = () => this.rootKey.cookieSigningKey();

  listEncryptionStrategies = this.delegate("listEncryptionStrategies");

  updateEncryptionStrategy = this.delegate("updateEncryptionStrategy");

  getRootKey = this.delegate("getRootKey");

  listRotations = this.delegate("listRotations");

  createRotation = this.delegate("createRotation");

  deleteStagedKey = this.delegate("deleteStagedKey");

  deleteExpiringKey = this.delegate("deleteExpiringKey");

  removeInactiveKeys = this.delegate("removeInactiveKeys");

  generateKmsKey = this.delegate("generateKmsKey");

  importKeyMaterial = this.delegate("importKeyMaterial");

  rotateKmsKey = this.delegate("rotateKmsKey");

  getKmsById = this.delegate("getKmsById");

  findKeyById = this.delegate("findKeyById");

  findPublishedKeyById = this.delegate("findPublishedKeyById");

  findKeys = this.delegate("findKeys");

  listProjectKeys = this.delegate("listProjectKeys");

  updateKeyAttributes = this.delegate("updateKeyAttributes");

  deleteKey = this.delegate("deleteKey");

  deleteKeys = this.delegate("deleteKeys");

  countProjectKeysInOrg = this.delegate("countProjectKeysInOrg");

  getKeyMaterial = this.delegate("getKeyMaterial");

  getBulkKeyMaterial = this.delegate("getBulkKeyMaterial");

  encryptWithKmsKey = this.delegate("encryptWithKmsKey");

  decryptWithKmsKey = this.delegate("decryptWithKmsKey");

  getPublicKey = this.delegate("getPublicKey");

  signWithKmsKey = this.delegate("signWithKmsKey");

  verifyWithKmsKey = this.delegate("verifyWithKmsKey");

  generateMac = this.delegate("generateMac");

  verifyMac = this.delegate("verifyMac");

  createCipherPairWithDataKey = this.delegate("createCipherPairWithDataKey");

  getProjectSecretManagerKmsKeyId = this.delegate("getProjectSecretManagerKmsKeyId");

  getProjectCertificateKmsKeyId = this.delegate("getProjectCertificateKmsKeyId");

  wrapKey = this.delegate("wrapKey");

  unwrapKey = this.delegate("unwrapKey");

  updateProjectSecretManagerKmsKey = this.delegate("updateProjectSecretManagerKmsKey");

  getProjectKeyBackup = this.delegate("getProjectKeyBackup");

  loadProjectKeyBackup = this.delegate("loadProjectKeyBackup");

  deleteProjectKeys = this.delegate("deleteProjectKeys");

  createExternalKms = this.delegate("createExternalKms");

  updateExternalKms = this.delegate("updateExternalKms");

  deleteExternalKms = this.delegate("deleteExternalKms");

  getExternalKms = this.delegate("getExternalKms");

  getExternalKmsByName = this.delegate("getExternalKmsByName");

  listExternalKms = this.delegate("listExternalKms");

  fetchGcpKeys = this.delegate("fetchGcpKeys");

  // Waits for the in-memory module to load the root key, then calls it.
  private delegate<K extends TAsyncMethods>(method: K): TKmsCoreDomain[K] {
    return (async (...args: unknown[]) => {
      const module = await this.module;
      return (module.service[method] as (...input: unknown[]) => unknown)(...args);
    }) as unknown as TKmsCoreDomain[K];
  }
}
