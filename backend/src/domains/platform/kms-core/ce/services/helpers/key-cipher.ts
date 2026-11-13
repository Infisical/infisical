import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";

import { DataKey, TCipherPair } from "../../models/data-key";
import { KmsKey } from "../../models/kms-key";
import { RootKey } from "../../models/root-key";
import { TExternalKmsHook, TKmsCoreStores, TKmsKeyStore } from "../dependencies";

export type TAsyncEncryptor = (input: { plainText: Buffer }) => Promise<{ cipherTextBlob: Buffer<ArrayBuffer> }>;
export type TAsyncDecryptor = (input: { cipherTextBlob: Buffer }) => Promise<Buffer<ArrayBuffer>>;

type TKeyCipherStores = Pick<TKmsCoreStores, "kmsKeyStore" | "kmsKeyVersionStore" | "organizationKeyStore">;

export const notFoundKey = (kmsId: string) => new EntityNotFoundError({ message: `KMS with ID '${kmsId}' not found` });

export const requireKey = async (kmsKeyStore: TKmsKeyStore, kmsId: string): Promise<KmsKey> => {
  const key = await kmsKeyStore.findById(kmsId);
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
const internalDecryptor = (stores: TKeyCipherStores, rootKey: RootKey, key: KmsKey): TAsyncDecryptor => {
  const internalKmsId = key.toJSON().internal?.id;
  return key.decryptor(rootKey, () =>
    internalKmsId ? stores.kmsKeyVersionStore.listByInternalKmsId(internalKmsId) : Promise.resolve([])
  );
};

// The org's data key, which must already exist: an external key's inputs were encrypted with it when it was stored.
export const existingOrgCipher = async (
  stores: TKeyCipherStores,
  rootKey: RootKey,
  orgId: string
): Promise<TCipherPair> => {
  const orgKey = await stores.organizationKeyStore.find(orgId);
  if (!orgKey) throw new RuleViolationError({ message: "Invalid organization KMS" });
  const material = orgKey.material();
  const kmsKey = await requireKey(stores.kmsKeyStore, material.kmsKeyId);
  const dataKey = await internalDecryptor(stores, rootKey, kmsKey)({ cipherTextBlob: material.encryptedDataKey });
  return DataKey.fromBytes(dataKey).toCipherPair();
};

// The provider call runs when the encryptor is called, after every database read here has returned.
export const keyEncryptor = async (
  stores: TKeyCipherStores,
  rootKey: RootKey,
  externalKms: TExternalKmsHook | undefined,
  key: KmsKey
): Promise<TAsyncEncryptor> => {
  const ref = key.externalRef();
  if (!ref) {
    const encrypt = key.encryptor(rootKey);
    return ({ plainText }) => Promise.resolve(encrypt({ plainText }));
  }
  const provider = requireExternalKms(externalKms);
  const orgCipher = await existingOrgCipher(stores, rootKey, key.orgId);
  return async ({ plainText }) => ({ cipherTextBlob: await provider.encrypt(ref, orgCipher, plainText) });
};

// `loadArchivedNow` is for stores bound to a caller's transaction, which a decryptor called later cannot use.
export const keyDecryptor = async (
  stores: TKeyCipherStores,
  rootKey: RootKey,
  externalKms: TExternalKmsHook | undefined,
  key: KmsKey,
  { loadArchivedNow = false }: { loadArchivedNow?: boolean } = {}
): Promise<TAsyncDecryptor> => {
  const ref = key.externalRef();
  if (!ref && loadArchivedNow) {
    const internalKmsId = key.toJSON().internal?.id;
    const archived = internalKmsId ? await stores.kmsKeyVersionStore.listByInternalKmsId(internalKmsId) : [];
    return key.decryptor(rootKey, () => Promise.resolve(archived));
  }
  if (!ref) return internalDecryptor(stores, rootKey, key);
  const provider = requireExternalKms(externalKms);
  const orgCipher = await existingOrgCipher(stores, rootKey, key.orgId);
  return ({ cipherTextBlob }) => provider.decrypt(ref, orgCipher, cipherTextBlob);
};

// Opens a data key with the key that wrapped it, internal or external.
export const openDataKey = async (
  stores: TKeyCipherStores,
  rootKey: RootKey,
  externalKms: TExternalKmsHook | undefined,
  key: KmsKey,
  encryptedDataKey: Buffer
): Promise<DataKey> => {
  const decrypt = await keyDecryptor(stores, rootKey, externalKms, key);
  const bytes = await decrypt({ cipherTextBlob: encryptedDataKey });
  return DataKey.fromBytes(bytes);
};

export const sealDataKey = async (
  stores: TKeyCipherStores,
  rootKey: RootKey,
  externalKms: TExternalKmsHook | undefined,
  key: KmsKey,
  dataKey: DataKey
): Promise<Buffer> => {
  const encrypt = await keyEncryptor(stores, rootKey, externalKms, key);
  const { cipherTextBlob } = await encrypt({ plainText: dataKey.exportForWrapping() });
  return cipherTextBlob;
};
