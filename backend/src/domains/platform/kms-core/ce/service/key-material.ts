import { TReadOptions } from "@app/domains/lib/data-access-db";
import { createSecretValueBlindIndexer } from "@app/lib/crypto/blind-index";
import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { HmacAlgorithm, hmacService } from "@app/lib/crypto/hmac";
import { detectPqcVariantFromDer } from "@app/lib/crypto/pqc/pqc-crypto";
import { AsymmetricKeyAlgorithm, isPqcKeyAlgorithm, KMS_TO_OPENSSL_NAME, signingService } from "@app/lib/crypto/sign";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TKmsCoreDataAccess } from "../data-access/kms-core-data-access";
import { KmsCiphertext } from "../model/kms-ciphertext";
import { KmsKey, KmsKeyUsage, TKmsKeyAlgorithmName } from "../model/kms-key";
import { TExternalKeyRef, TKmsCoreHooks } from "./kms-core-hooks";
import {
  KmsCiphertextUndecryptableError,
  TAsyncDecryptor,
  TAsyncEncryptor,
  TCipherPair,
  TEncryptor
} from "./kms-core-types";
import { RootKeyHolder } from "./root-key-holder";

export const MIN_HMAC_IMPORT_KEY_BYTE_LENGTH = 16;
export const MAX_HMAC_IMPORT_KEY_BYTE_LENGTH = 1024;

// What every service shares: the root key in memory and the enterprise hooks.
export type TKmsCoreState = {
  rootKey: RootKeyHolder;
  hooks: TKmsCoreHooks;
};

const OPENSSL_TO_KMS: Record<string, string> = Object.fromEntries(
  Object.entries(KMS_TO_OPENSSL_NAME).map(([kms, openssl]) => [openssl, kms])
);

const rootCipher = () => symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

export const wrapWithRootKey = (state: TKmsCoreState, material: Buffer) =>
  rootCipher().encrypt(material, state.rootKey.get());

export const unwrapWithRootKey = (state: TKmsCoreState, wrapped: Buffer) =>
  rootCipher().decrypt(wrapped, state.rootKey.get());

export const notFoundKey = (kmsId: string) => new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });

export const requireKey = async (dataAccess: TKmsCoreDataAccess, kmsId: string, options?: TReadOptions) => {
  const key = await dataAccess.kmsKeys.findById(kmsId, options);
  if (!key) throw notFoundKey(kmsId);
  return key;
};

// Fresh material for a new internal key.
export const generateKeyMaterial = async (keyUsage: KmsKeyUsage, algorithm: TKmsKeyAlgorithmName): Promise<Buffer> => {
  KmsKey.assertAlgorithmFits(keyUsage, algorithm);

  if (keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT) {
    return crypto.randomBytes(KmsKey.symmetricKeyLength(algorithm as SymmetricKeyAlgorithm));
  }
  if (keyUsage === KmsKeyUsage.SIGN_VERIFY) {
    const { generateAsymmetricPrivateKey, getPublicKeyFromPrivateKey } = signingService(
      algorithm as AsymmetricKeyAlgorithm
    );
    const material = await generateAsymmetricPrivateKey();
    // A key whose public half cannot be derived is refused before it is stored.
    await getPublicKeyFromPrivateKey(material);
    return material;
  }
  if (keyUsage === KmsKeyUsage.GENERATE_VERIFY_MAC) {
    return hmacService(algorithm as HmacAlgorithm).generateKeyMaterial();
  }

  throw new BadRequestError({
    message: `Invalid KMS key type. No key material was created for key usage '${keyUsage as string}' using algorithm '${algorithm as string}'`
  });
};

type TClassicalKeyShape = { keyType: string; modulusLength?: number; namedCurve?: string; label: string };

const CLASSICAL_KEY_SHAPES: Partial<Record<AsymmetricKeyAlgorithm, TClassicalKeyShape>> = {
  [AsymmetricKeyAlgorithm.RSA_4096]: { keyType: "rsa", modulusLength: 4096, label: "an RSA 4096-bit key" },
  [AsymmetricKeyAlgorithm.ECC_NIST_P256]: { keyType: "ec", namedCurve: "prime256v1", label: "an EC P-256 key" },
  [AsymmetricKeyAlgorithm.ECC_NIST_P384]: { keyType: "ec", namedCurve: "secp384r1", label: "an EC P-384 key" },
  [AsymmetricKeyAlgorithm.ECC_NIST_P521]: { keyType: "ec", namedCurve: "secp521r1", label: "an EC P-521 key" },
  [AsymmetricKeyAlgorithm.ED25519]: { keyType: "ed25519", label: "an Ed25519 key" }
};

export const validateClassicalKeyMaterial = (key: Buffer, algorithm: AsymmetricKeyAlgorithm) => {
  const expected = CLASSICAL_KEY_SHAPES[algorithm];
  if (!expected) return;

  const keyObj = crypto.nativeCrypto.createPrivateKey({ key, format: "pem", type: "pkcs8" });
  const details = keyObj.asymmetricKeyDetails;
  const matches =
    keyObj.asymmetricKeyType === expected.keyType &&
    (expected.modulusLength === undefined || details?.modulusLength === expected.modulusLength) &&
    (expected.namedCurve === undefined || details?.namedCurve === expected.namedCurve);

  if (!matches) {
    throw new BadRequestError({
      message: `Key material does not match the declared algorithm. Expected ${expected.label}.`
    });
  }
};

// Refuses imported material that does not fit the declared usage and algorithm.
export const validateImportedMaterial = async (key: Buffer, keyUsage: KmsKeyUsage, algorithm: TKmsKeyAlgorithmName) => {
  KmsKey.assertAlgorithmFits(keyUsage, algorithm);

  if (keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT) {
    const expectedLength = KmsKey.symmetricKeyLength(algorithm as SymmetricKeyAlgorithm);
    if (key.length !== expectedLength) {
      throw new BadRequestError({
        message: `Invalid key material length for ${algorithm as string}. Expected ${expectedLength} bytes, got ${key.length}.`
      });
    }
  }

  if (keyUsage === KmsKeyUsage.SIGN_VERIFY) {
    const { getPublicKeyFromPrivateKey } = signingService(algorithm as AsymmetricKeyAlgorithm);
    try {
      await getPublicKeyFromPrivateKey(key);
    } catch {
      const expectedFormat = isPqcKeyAlgorithm(algorithm as string) ? "PKCS8 DER-encoded" : "PKCS8 PEM-encoded";
      throw new BadRequestError({ message: `Invalid private key material. Expected a ${expectedFormat} private key.` });
    }

    if (isPqcKeyAlgorithm(algorithm as string)) {
      const detectedVariant = detectPqcVariantFromDer(key);
      const expectedVariant = KMS_TO_OPENSSL_NAME[algorithm as AsymmetricKeyAlgorithm];
      if (detectedVariant && expectedVariant && detectedVariant !== expectedVariant) {
        throw new BadRequestError({
          message: `Key material does not match the declared algorithm. Expected ${algorithm as string} but the key is ${OPENSSL_TO_KMS[detectedVariant] || detectedVariant}.`
        });
      }
    } else {
      validateClassicalKeyMaterial(key, algorithm as AsymmetricKeyAlgorithm);
    }
  }

  if (keyUsage === KmsKeyUsage.GENERATE_VERIFY_MAC) {
    if (key.length < MIN_HMAC_IMPORT_KEY_BYTE_LENGTH || key.length > MAX_HMAC_IMPORT_KEY_BYTE_LENGTH) {
      throw new BadRequestError({
        message: `Invalid HMAC key material length. Expected between ${MIN_HMAC_IMPORT_KEY_BYTE_LENGTH} and ${MAX_HMAC_IMPORT_KEY_BYTE_LENGTH} bytes, got ${key.length}.`
      });
    }
  }
};

// The encryptor, decryptor and blind indexer for a data key. The data key stays inside these closures.
export const dataKeyCipherPair = (dataKey: Buffer): TCipherPair => {
  const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
  return {
    encryptor: ({ plainText }) => ({ cipherTextBlob: KmsCiphertext.encodeV01(cipher.encrypt(plainText, dataKey)) }),
    decryptor: ({ cipherTextBlob }) => cipher.decrypt(KmsCiphertext.stripV01(cipherTextBlob), dataKey),
    generateSecretBlindIndex: createSecretValueBlindIndexer(dataKey)
  };
};

export const inputKeyEncryptor = (key: Buffer): TEncryptor => {
  const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
  return ({ plainText }) => ({ cipherTextBlob: KmsCiphertext.encodeV01(cipher.encrypt(plainText, key)) });
};

export const inputKeyDecryptor = (key: Buffer) => {
  const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
  return ({ cipherTextBlob }: { cipherTextBlob: Buffer }) =>
    cipher.decrypt(KmsCiphertext.stripV01(cipherTextBlob), key);
};

const internalEncryptor = (state: TKmsCoreState, key: KmsKey): TAsyncEncryptor => {
  const internal = key.materialFor(KmsKeyUsage.ENCRYPT_DECRYPT);
  const dataCipher = symmetricCipherService(internal.encryptionAlgorithm as SymmetricKeyAlgorithm);
  const material = unwrapWithRootKey(state, internal.encryptedKey);
  return ({ plainText }) =>
    Promise.resolve({
      cipherTextBlob: KmsCiphertext.encodeForKey(dataCipher.encrypt(plainText, material), internal.version)
    });
};

// Tries the version a v02 blob names first, then the current material, then every archived version newest first.
// Archived versions load on the first miss, read the same way the key was.
const internalDecryptor = (
  state: TKmsCoreState,
  dataAccess: TKmsCoreDataAccess,
  key: KmsKey,
  options?: TReadOptions
): TAsyncDecryptor => {
  const internal = key.materialFor(KmsKeyUsage.ENCRYPT_DECRYPT);
  const dataCipher = symmetricCipherService(internal.encryptionAlgorithm as SymmetricKeyAlgorithm);
  const currentVersion = internal.version;
  const current = unwrapWithRootKey(state, internal.encryptedKey);
  const materialByVersion = new Map<number, Buffer>([[currentVersion, current]]);
  let archivedLoaded = false;

  const loadArchived = async () => {
    if (archivedLoaded) return;
    // A database error propagates; it is never treated as a failed decrypt.
    const archived = await dataAccess.kmsKeyVersions.listByInternalKmsId(internal.id, options);
    for (const version of archived) {
      if (!materialByVersion.has(version.version)) {
        materialByVersion.set(version.version, unwrapWithRootKey(state, version.encryptedKey));
      }
    }
    archivedLoaded = true;
  };

  const attempt = (cipherText: Buffer, material?: Buffer) => {
    if (!material) return null;
    try {
      return dataCipher.decrypt(cipherText, material);
    } catch {
      return null;
    }
  };

  const tryEveryVersion = async (cipherText: Buffer, preferredVersion: number) => {
    const preferred = attempt(cipherText, materialByVersion.get(preferredVersion));
    if (preferred) return preferred;
    // Covers rotated material re-imported as version 1.
    if (preferredVersion !== currentVersion) {
      const fromCurrent = attempt(cipherText, current);
      if (fromCurrent) return fromCurrent;
    }
    await loadArchived();
    for (let version = currentVersion - 1; version >= 1; version -= 1) {
      const decrypted = attempt(cipherText, materialByVersion.get(version));
      if (decrypted) return decrypted;
    }
    return null;
  };

  return async ({ cipherTextBlob }) => {
    const decoded = KmsCiphertext.decode(cipherTextBlob);
    const decrypted = await tryEveryVersion(decoded.cipherText, decoded.keyVersion ?? currentVersion);
    if (decrypted) return decrypted;
    // The last resort fails because of the ciphertext, not the stored material, so it gets its own error type.
    try {
      return dataCipher.decrypt(decoded.cipherText, current);
    } catch (error) {
      throw new KmsCiphertextUndecryptableError(error);
    }
  };
};

// The org's data key, which must already exist: an external key's inputs were encrypted with it when it was stored.
export const existingOrgCipher = async (
  state: TKmsCoreState,
  dataAccess: TKmsCoreDataAccess,
  orgId: string,
  options?: TReadOptions
) => {
  const org = await dataAccess.scopeKeys.findOrg(orgId, options);
  if (!org?.kmsKeyId || !org.encryptedDataKey) throw new BadRequestError({ message: "Invalid organization KMS" });
  const orgKey = await requireKey(dataAccess, org.kmsKeyId, options);
  const dataKey = await internalDecryptor(state, dataAccess, orgKey, options)({ cipherTextBlob: org.encryptedDataKey });
  return dataKeyCipherPair(dataKey);
};

const externalRef = (key: KmsKey): TExternalKeyRef => {
  const external = key.external as NonNullable<KmsKey["external"]>;
  return {
    kmsKeyId: key.id,
    orgId: key.orgId,
    provider: external.provider,
    encryptedProviderInputs: external.encryptedProviderInputs
  };
};

const externalHook = (state: TKmsCoreState) => {
  const hook = state.hooks.externalKms;
  if (!hook) {
    throw new BadRequestError({ message: "External KMS keys require the Infisical enterprise edition." });
  }
  return hook;
};

// The provider call runs when the encryptor is called, after every database read here has returned.
export const keyEncryptor = async (
  state: TKmsCoreState,
  dataAccess: TKmsCoreDataAccess,
  key: KmsKey,
  options?: TReadOptions
): Promise<TAsyncEncryptor> => {
  if (!key.isExternal) return internalEncryptor(state, key);
  const hook = externalHook(state);
  const orgCipher = await existingOrgCipher(state, dataAccess, key.orgId, options);
  const ref = externalRef(key);
  return async ({ plainText }) => ({ cipherTextBlob: await hook.encrypt(ref, orgCipher, plainText) });
};

export const keyDecryptor = async (
  state: TKmsCoreState,
  dataAccess: TKmsCoreDataAccess,
  key: KmsKey,
  options?: TReadOptions
): Promise<TAsyncDecryptor> => {
  if (!key.isExternal) return internalDecryptor(state, dataAccess, key, options);
  const hook = externalHook(state);
  const orgCipher = await existingOrgCipher(state, dataAccess, key.orgId, options);
  const ref = externalRef(key);
  return ({ cipherTextBlob }) => hook.decrypt(ref, orgCipher, cipherTextBlob);
};

// A fresh 32-byte data key for an org or project.
export const newDataKey = () => crypto.randomBytes(32);
