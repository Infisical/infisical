import { randomBytes } from "node:crypto";

import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { deriveCookieSigningKey } from "@app/lib/crypto/cookie-signing-key";

import { InstanceEncryptionKey } from "../model/instance-encryption-key";
import { KMS_ROOT_CONFIG_UUID, RootKeyEncryptionStrategy } from "../model/root-key-config";
import { KmsCoreModule, TKmsCoreDomain } from "../module";
import { TKmsCoreHooks } from "../service/kms-core-hooks";
import { testKmsCoreEnv } from "./build-kms-core";
import { InMemoryKmsCoreStore } from "./in-memory-kms-core-store";

type TAsyncMethods = {
  [K in keyof TKmsCoreDomain]: ReturnType<TKmsCoreDomain[K]> extends Promise<unknown> ? K : never;
}[keyof TKmsCoreDomain];

/**
 * For consumers of KMS Core: the real domain over an in-memory store, with real AES-GCM. Orgs and projects are
 * created the first time a test names them, so a test only passes ids. `store` exposes the tables.
 */
export class FakeKmsCoreDomain implements TKmsCoreDomain {
  readonly store = new InMemoryKmsCoreStore();

  private readonly rootKey = randomBytes(32);

  private readonly module: KmsCoreModule;

  private readonly started: Promise<void>;

  constructor({ hooks = {} }: { hooks?: TKmsCoreHooks } = {}) {
    const env = testKmsCoreEnv();
    this.store.state.autoCreateScopes = true;
    const now = new Date();
    this.store.state.tables.rootKeyConfigs.set(KMS_ROOT_CONFIG_UUID, {
      id: KMS_ROOT_CONFIG_UUID,
      encryptedRootKey: symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256).encrypt(
        this.rootKey,
        InstanceEncryptionKey.fromEnv(env).buffer
      ),
      encryptionStrategy: RootKeyEncryptionStrategy.Software,
      activatedAt: now,
      createdAt: now,
      updatedAt: now
    });
    this.module = new KmsCoreModule({
      db: undefined as never,
      storage: this.store.storage,
      env,
      hooks,
      isFipsEnabled: () => false
    });
    this.started = this.module.start({ skipRotationState: true });
  }

  encryptWithRootKey = () => {
    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    return (plainText: Buffer) => cipher.encrypt(plainText, this.rootKey);
  };

  decryptWithRootKey = () => {
    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    return (cipherText: Buffer) => cipher.decrypt(cipherText, this.rootKey);
  };

  getCookieSigningKey = () => deriveCookieSigningKey(this.rootKey);

  listEncryptionStrategies = this.delegate("listEncryptionStrategies");

  updateEncryptionStrategy = this.delegate("updateEncryptionStrategy");

  getRootKey = this.delegate("getRootKey");

  listRotations = this.delegate("listRotations");

  createRotation = this.delegate("createRotation");

  deleteStagedKey = this.delegate("deleteStagedKey");

  deleteExpiringKey = this.delegate("deleteExpiringKey");

  generateKmsKey = this.delegate("generateKmsKey");

  importKeyMaterial = this.delegate("importKeyMaterial");

  rotateKmsKey = this.delegate("rotateKmsKey");

  deleteInternalKms = this.delegate("deleteInternalKms");

  getKmsById = this.delegate("getKmsById");

  findKeyById = this.delegate("findKeyById");

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

  encryptWithInputKey = this.delegate("encryptWithInputKey");

  decryptWithInputKey = this.delegate("decryptWithInputKey");

  getPublicKey = this.delegate("getPublicKey");

  signWithKmsKey = this.delegate("signWithKmsKey");

  verifyWithKmsKey = this.delegate("verifyWithKmsKey");

  generateMac = this.delegate("generateMac");

  verifyMac = this.delegate("verifyMac");

  createCipherPairWithDataKey = this.delegate("createCipherPairWithDataKey");

  getOrgKmsKeyId = this.delegate("getOrgKmsKeyId");

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
      await this.started;
      return (this.module.service[method] as (...input: unknown[]) => unknown)(...args);
    }) as unknown as TKmsCoreDomain[K];
  }
}
