import { findOnReplicaThenPrimary, TReadOptions } from "@app/domains/lib/data-access";
import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";

import { DataKey, TCipherPair } from "../../models/data-key";
import { KmsKey } from "../../models/kms-key";
import { RootKey } from "../../models/root-key";
import { TExternalKmsHook, TKmsCoreStores, TKmsKeyStore } from "../dependencies";

export type TAsyncEncryptor = (input: { plainText: Buffer }) => Promise<{ cipherTextBlob: Buffer<ArrayBuffer> }>;
export type TAsyncDecryptor = (input: { cipherTextBlob: Buffer }) => Promise<Buffer<ArrayBuffer>>;

type TKeyCipherStores = Pick<
  TKmsCoreStores,
  "kmsKeyStore" | "kmsKeyVersionStore" | "organizationKeyStore" | "projectKeyStore"
>;

export const notFoundKey = (kmsId: string) => new EntityNotFoundError({ message: `KMS with ID '${kmsId}' not found` });

export const requireKey = (kmsKeyStore: TKmsKeyStore, kmsId: string, options?: TReadOptions): Promise<KmsKey> =>
  findOnReplicaThenPrimary(
    (readOptions) => kmsKeyStore.findById(kmsId, readOptions),
    () => notFoundKey(kmsId),
    options
  );

const requireExternalKms = (externalKms: TExternalKmsHook | undefined): TExternalKmsHook => {
  if (!externalKms) {
    throw new RuleViolationError({ message: "External KMS keys require the Infisical enterprise edition." });
  }
  return externalKms;
};

// Encrypts and decrypts with a KMS key, internal or external, reading what it needs through one set of stores.
export class KeyCipher {
  constructor(
    private readonly stores: TKeyCipherStores,
    private readonly rootKey: RootKey,
    private readonly externalKms: TExternalKmsHook | undefined,
    // Set for stores bound to a caller's transaction: a decryptor called after it ends cannot use them, so archived
    // versions load when the decryptor is made instead of on the first ciphertext the current material can't open.
    private readonly loadArchivedNow = false
  ) {}

  joined(stores: TKeyCipherStores): KeyCipher {
    return new KeyCipher(stores, this.rootKey, this.externalKms, true);
  }

  // The provider call runs when the encryptor is called, after every database read here has returned.
  async encryptor(key: KmsKey, options?: TReadOptions): Promise<TAsyncEncryptor> {
    const ref = key.externalRef();
    if (!ref) {
      const encrypt = key.encryptor(this.rootKey);
      return ({ plainText }) => Promise.resolve(encrypt({ plainText }));
    }
    const provider = requireExternalKms(this.externalKms);
    const orgCipher = await this.existingOrgCipher(key.orgId, options);
    await provider.assertInputsAllowed(ref, orgCipher, this.stores);
    return async ({ plainText }) => ({ cipherTextBlob: await provider.encrypt(ref, orgCipher, plainText) });
  }

  async decryptor(key: KmsKey): Promise<TAsyncDecryptor> {
    if (!key.externalRef() && this.loadArchivedNow) {
      const archived = await this.listArchived(key);
      return key.decryptor(this.rootKey, () => Promise.resolve(archived));
    }
    return this.decryptorNow(key);
  }

  async openDataKey(key: KmsKey, encryptedDataKey: Buffer): Promise<DataKey> {
    const decrypt = await this.decryptorNow(key);
    return DataKey.fromBytes(await decrypt({ cipherTextBlob: encryptedDataKey }));
  }

  async sealDataKey(key: KmsKey, dataKey: DataKey): Promise<Buffer> {
    const encrypt = await this.encryptor(key);
    const { cipherTextBlob } = await encrypt({ plainText: dataKey.exportForWrapping() });
    return cipherTextBlob;
  }

  // For a decryptor used before this call returns, so archived versions can load lazily even on joined stores.
  private async decryptorNow(key: KmsKey, options?: TReadOptions): Promise<TAsyncDecryptor> {
    const ref = key.externalRef();
    if (!ref) return key.decryptor(this.rootKey, () => this.listArchived(key, options));
    const provider = requireExternalKms(this.externalKms);
    const orgCipher = await this.existingOrgCipher(key.orgId, options);
    await provider.assertInputsAllowed(ref, orgCipher, this.stores);
    return ({ cipherTextBlob }) => provider.decrypt(ref, orgCipher, cipherTextBlob);
  }

  private async listArchived(key: KmsKey, options?: TReadOptions) {
    const { materialId } = key;
    return materialId ? this.stores.kmsKeyVersionStore.listByInternalKmsId(materialId, options) : [];
  }

  // The org's data key must already exist: an external key's inputs were encrypted with it when stored. A replica can
  // still show the org row without it, so a row with no data key counts as a miss and is read again from the primary.
  private async existingOrgCipher(orgId: string, options?: TReadOptions): Promise<TCipherPair> {
    const orgKey = await findOnReplicaThenPrimary(
      async (readOptions) => {
        const found = await this.stores.organizationKeyStore.find(orgId, readOptions);
        return found?.hasDataKey() ? found : null;
      },
      () => new RuleViolationError({ message: "Invalid organization KMS" }),
      options
    );
    const material = orgKey.material();
    const kmsKey = await requireKey(this.stores.kmsKeyStore, material.kmsKeyId, options);
    const decrypt = await this.decryptorNow(kmsKey, options);
    return DataKey.fromBytes(await decrypt({ cipherTextBlob: material.encryptedDataKey })).toCipherPair();
  }
}
