import { TReadOptions } from "@app/domains/lib/data-access";
import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";

import { DataKey, TCipherPair } from "../../models/data-key";
import { KmsKey } from "../../models/kms-key";
import { RootKey } from "../../models/root-key";
import { TExternalKmsHook, TKmsCoreStores, TKmsKeyStore } from "../dependencies";

export type TAsyncEncryptor = (input: { plainText: Buffer }) => Promise<{ cipherTextBlob: Buffer<ArrayBuffer> }>;
export type TAsyncDecryptor = (input: { cipherTextBlob: Buffer }) => Promise<Buffer<ArrayBuffer>>;

type TKeyCipherStores = Pick<TKmsCoreStores, "kmsKeyStore" | "kmsKeyVersionStore" | "organizationKeyStore">;

export const notFoundKey = (kmsId: string) => new EntityNotFoundError({ message: `KMS with ID '${kmsId}' not found` });

export const requireKey = async (kmsKeyStore: TKmsKeyStore, kmsId: string, options?: TReadOptions): Promise<KmsKey> => {
  const key = await kmsKeyStore.findById(kmsId, options);
  if (!key) throw notFoundKey(kmsId);
  return key;
};

export const requireExternalKms = (externalKms: TExternalKmsHook | undefined): TExternalKmsHook => {
  if (!externalKms) {
    throw new RuleViolationError({ message: "External KMS keys require the Infisical enterprise edition." });
  }
  return externalKms;
};

// Archived versions load only on the first ciphertext the current material cannot open.
const internalDecryptor = (
  stores: TKeyCipherStores,
  rootKey: RootKey,
  key: KmsKey,
  options?: TReadOptions
): TAsyncDecryptor => {
  const internalKmsId = key.toJSON().internal?.id;
  return key.decryptor(rootKey, () =>
    internalKmsId ? stores.kmsKeyVersionStore.listByInternalKmsId(internalKmsId, options) : Promise.resolve([])
  );
};

// The org's data key, which must already exist: an external key's inputs were encrypted with it when it was stored.
export const existingOrgCipher = async (
  stores: TKeyCipherStores,
  rootKey: RootKey,
  orgId: string,
  options?: TReadOptions
): Promise<TCipherPair> => {
  const orgKey = await stores.organizationKeyStore.find(orgId, options);
  if (!orgKey) throw new RuleViolationError({ message: "Invalid organization KMS" });
  const material = orgKey.material();
  const kmsKey = await requireKey(stores.kmsKeyStore, material.kmsKeyId, options);
  const dataKey = await internalDecryptor(
    stores,
    rootKey,
    kmsKey,
    options
  )({ cipherTextBlob: material.encryptedDataKey });
  return DataKey.fromBytes(dataKey).toCipherPair();
};

// The provider call runs when the encryptor is called, after every database read here has returned.
export const keyEncryptor = async (
  stores: TKeyCipherStores,
  rootKey: RootKey,
  externalKms: TExternalKmsHook | undefined,
  key: KmsKey,
  options?: TReadOptions
): Promise<TAsyncEncryptor> => {
  const ref = key.externalRef();
  if (!ref) {
    const encrypt = key.encryptor(rootKey);
    return ({ plainText }) => Promise.resolve(encrypt({ plainText }));
  }
  const provider = requireExternalKms(externalKms);
  const orgCipher = await existingOrgCipher(stores, rootKey, key.orgId, options);
  return async ({ plainText }) => ({ cipherTextBlob: await provider.encrypt(ref, orgCipher, plainText) });
};

// `loadArchivedNow` is for stores bound to a caller's transaction, which a decryptor called later cannot use.
export const keyDecryptor = async (
  stores: TKeyCipherStores,
  rootKey: RootKey,
  externalKms: TExternalKmsHook | undefined,
  key: KmsKey,
  { loadArchivedNow = false }: { loadArchivedNow?: boolean } = {},
  options?: TReadOptions
): Promise<TAsyncDecryptor> => {
  const ref = key.externalRef();
  if (!ref && loadArchivedNow) {
    const internalKmsId = key.toJSON().internal?.id;
    const archived = internalKmsId ? await stores.kmsKeyVersionStore.listByInternalKmsId(internalKmsId, options) : [];
    return key.decryptor(rootKey, () => Promise.resolve(archived));
  }
  if (!ref) return internalDecryptor(stores, rootKey, key, options);
  const provider = requireExternalKms(externalKms);
  const orgCipher = await existingOrgCipher(stores, rootKey, key.orgId, options);
  return ({ cipherTextBlob }) => provider.decrypt(ref, orgCipher, cipherTextBlob);
};

// Opens a data key with the key that wrapped it, internal or external.
export const openDataKey = async (
  stores: TKeyCipherStores,
  rootKey: RootKey,
  externalKms: TExternalKmsHook | undefined,
  key: KmsKey,
  encryptedDataKey: Buffer,
  options?: TReadOptions
): Promise<DataKey> => {
  const decrypt = await keyDecryptor(stores, rootKey, externalKms, key, {}, options);
  const bytes = await decrypt({ cipherTextBlob: encryptedDataKey });
  return DataKey.fromBytes(bytes);
};

export const sealDataKey = async (
  stores: TKeyCipherStores,
  rootKey: RootKey,
  externalKms: TExternalKmsHook | undefined,
  key: KmsKey,
  dataKey: DataKey,
  options?: TReadOptions
): Promise<Buffer> => {
  const encrypt = await keyEncryptor(stores, rootKey, externalKms, key, options);
  const { cipherTextBlob } = await encrypt({ plainText: dataKey.exportForWrapping() });
  return cipherTextBlob;
};
