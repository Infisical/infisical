import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";
import { z } from "zod";

import { KmsKeysSchema, TKmsRootConfig } from "@app/db/schemas";
import { AwsKmsProviderFactory } from "@app/ee/services/external-kms/providers/aws-kms";
import { GcpKmsProviderFactory } from "@app/ee/services/external-kms/providers/gcp-kms";
import {
  ExternalKmsAwsSchema,
  ExternalKmsGcpSchema,
  KmsProviders,
  TExternalKmsProviderFns
} from "@app/ee/services/external-kms/providers/model";
import { THsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { THsmStatus } from "@app/ee/services/hsm/hsm-types";
import { PgSqlLock } from "@app/keystore/keystore";
import { TEnvConfig } from "@app/lib/config/env";
import { generateSecretValueBlindIndexFromKmsKey } from "@app/lib/crypto/blind-index";
import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { detectPqcVariantFromDer } from "@app/lib/crypto/pqc/pqc-crypto";
import { AsymmetricKeyAlgorithm, isPqcKeyAlgorithm, KMS_TO_OPENSSL_NAME, signingService } from "@app/lib/crypto/sign";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import {
  getByteLengthForSymmetricEncryptionAlgorithm,
  KMS_ROOT_CONFIG_UUID,
  verifyKeyTypeAndAlgorithm
} from "@app/services/kms/kms-fns";

import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TInternalKmsDALFactory } from "./internal-kms-dal";
import { TInternalKmsKeyVersionDALFactory } from "./internal-kms-key-version-dal";
import { TKmsKeyDALFactory } from "./kms-key-dal";
import { TKmsRootConfigDALFactory } from "./kms-root-config-dal";
import {
  KmsDataKey,
  KmsKeyUsage,
  KmsType,
  RootKeyEncryptionStrategy,
  TDecryptWithKeyDTO,
  TDecryptWithKmsDTO,
  TEncryptionWithKeyDTO,
  TEncryptWithKmsDataKeyDTO,
  TEncryptWithKmsDTO,
  TGenerateKMSDTO,
  TGetBulkKeyMaterialDTO,
  TGetKeyMaterialDTO,
  TGetPublicKeyDTO,
  TImportKeyMaterialDTO,
  TSignWithKmsDTO,
  TUpdateProjectSecretManagerKmsKeyDTO,
  TVerifyWithKmsDTO
} from "./kms-types";

type TKmsServiceFactoryDep = {
  kmsDAL: TKmsKeyDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById" | "updateById" | "transaction">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "updateById" | "transaction">;
  kmsRootConfigDAL: Pick<TKmsRootConfigDALFactory, "findById" | "create" | "updateById" | "transaction">;
  internalKmsDAL: Pick<TInternalKmsDALFactory, "create" | "findByKmsKeyIdForUpdate" | "updateById">;
  internalKmsKeyVersionDAL: Pick<TInternalKmsKeyVersionDALFactory, "create" | "find">;
  hsmService: THsmServiceFactory;
  envConfig: Pick<TEnvConfig, "ENCRYPTION_KEY" | "ROOT_ENCRYPTION_KEY">;
};

export type TKmsServiceFactory = ReturnType<typeof kmsServiceFactory>;

// akhilmhdh: Don't edit this value. This is measured for blob concatination in kms
const KMS_VERSION = "v01";
const KMS_VERSION_BLOB_LENGTH = 3;
// v02 blobs additionally embed the key material version that encrypted them: [ciphertext][4-byte BE version]["v02"]
// Written only for keys with version > 1 so never-rotated keys keep producing byte-identical v01 blobs.
const KMS_VERSION_V2 = "v02";
const KMS_KEY_VERSION_BLOB_LENGTH = 4;
// AES-GCM output is at minimum a 12-byte IV + 16-byte auth tag (empty plaintext). A real v02 blob therefore
// cannot be shorter than this plus its 4-byte version + 3-byte suffix; anything shorter ending in "v02" is
// malformed/attacker input and must fall through to the legacy path rather than reading out of bounds.
const MIN_AES_GCM_BLOB_LENGTH = 12 + 16;
const MIN_V02_BLOB_LENGTH = MIN_AES_GCM_BLOB_LENGTH + KMS_KEY_VERSION_BLOB_LENGTH + KMS_VERSION_BLOB_LENGTH;

// Single source of truth for the cipher-blob trailer so the encode side here and the decode side in
// decryptWithKmsKey can never drift: v1 keys get the legacy 3-byte "v01" suffix (byte-identical to pre-rotation
// output); rotated keys get [4-byte BE keyVersion]["v02"].
const buildKmsCipherTextBlob = (encryptedBlob: Buffer, keyVersion: number) => {
  if (keyVersion > 1) {
    const keyVersionBlob = Buffer.alloc(KMS_KEY_VERSION_BLOB_LENGTH);
    keyVersionBlob.writeUInt32BE(keyVersion, 0);
    return Buffer.concat([encryptedBlob, keyVersionBlob, Buffer.from(KMS_VERSION_V2, "utf8")]);
  }
  return Buffer.concat([encryptedBlob, Buffer.from(KMS_VERSION, "utf8")]);
};
const KmsSanitizedSchema = KmsKeysSchema.extend({ isExternal: z.boolean() });
const OPENSSL_TO_KMS: Record<string, string> = Object.fromEntries(
  Object.entries(KMS_TO_OPENSSL_NAME).map(([k, v]) => [v, k])
);

export const kmsServiceFactory = ({
  envConfig,
  kmsDAL,
  kmsRootConfigDAL,
  internalKmsDAL,
  internalKmsKeyVersionDAL,
  orgDAL,
  projectDAL,
  hsmService
}: TKmsServiceFactoryDep) => {
  let ROOT_ENCRYPTION_KEY: Buffer = Buffer.alloc(0);

  /*
   * Generate KMS Key
   * This function is responsibile for generating the infisical internal KMS for various entities
   * Like for secret manager, cert manager or for organization
   */
  const generateKmsKey = async ({
    orgId,
    isReserved = true,
    isExportable = true,
    tx,
    name,
    projectId,
    encryptionAlgorithm = SymmetricKeyAlgorithm.AES_GCM_256,
    keyUsage = KmsKeyUsage.ENCRYPT_DECRYPT,
    description
  }: TGenerateKMSDTO) => {
    // daniel: ensure that the key type (sign/encrypt) and the encryption algorithm are compatible.
    verifyKeyTypeAndAlgorithm(keyUsage, encryptionAlgorithm);

    let kmsKeyMaterial: Buffer | null = null;
    if (keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT) {
      kmsKeyMaterial = crypto.randomBytes(
        getByteLengthForSymmetricEncryptionAlgorithm(encryptionAlgorithm as SymmetricKeyAlgorithm)
      );
    } else if (keyUsage === KmsKeyUsage.SIGN_VERIFY) {
      const { generateAsymmetricPrivateKey, getPublicKeyFromPrivateKey } = signingService(
        encryptionAlgorithm as AsymmetricKeyAlgorithm
      );
      kmsKeyMaterial = await generateAsymmetricPrivateKey();

      // daniel: safety check to ensure we're able to extract the public key from the private key before we proceed to key creation
      await getPublicKeyFromPrivateKey(kmsKeyMaterial);
    }

    if (!kmsKeyMaterial) {
      throw new BadRequestError({
        message: `Invalid KMS key type. No key material was created for key usage '${keyUsage}' using algorithm '${encryptionAlgorithm}'`
      });
    }

    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const encryptedKeyMaterial = cipher.encrypt(kmsKeyMaterial, ROOT_ENCRYPTION_KEY);
    const sanitizedName = name ? slugify(name) : slugify(alphaNumericNanoId(8).toLowerCase());
    const dbQuery = async (db: Knex) => {
      const kmsDoc = await kmsDAL.create(
        {
          name: sanitizedName,
          keyUsage,
          orgId,
          isReserved,
          isExportable,
          projectId,
          description
        },
        db
      );

      await internalKmsDAL.create(
        {
          version: 1,
          encryptedKey: encryptedKeyMaterial,
          encryptionAlgorithm,
          kmsKeyId: kmsDoc.id
        },
        db
      );
      return kmsDoc;
    };

    if (tx) return dbQuery(tx);
    const doc = await kmsDAL.transaction(async (tx2) => dbQuery(tx2));
    return doc;
  };

  /*
   * Rotate KMS Key
   * Archives the current key material in the key version table and generates fresh material.
   * Old material is never deleted so existing ciphertexts stay decryptable.
   */
  const rotateKmsKey = async (kmsKeyId: string, tx?: Knex) => {
    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

    const dbQuery = async (db: Knex) => {
      const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsKeyId, db);
      if (!kmsDoc) {
        throw new NotFoundError({ message: `KMS with ID '${kmsKeyId}' not found` });
      }

      if (kmsDoc.externalKms) {
        throw new BadRequestError({
          message: "Cannot rotate external KMS keys from Infisical. Rotate the key in your external provider instead."
        });
      }

      if (kmsDoc.isReserved) {
        throw new BadRequestError({ message: "Reserved Infisical-managed KMS keys cannot be rotated." });
      }

      if (kmsDoc.isDisabled) {
        throw new BadRequestError({ message: "Key is disabled" });
      }

      if ((kmsDoc.keyUsage as KmsKeyUsage) !== KmsKeyUsage.ENCRYPT_DECRYPT) {
        throw new BadRequestError({
          message:
            "Only encrypt-decrypt keys support rotation. Rotate sign-verify keys manually by creating a new key and updating your applications to use it."
        });
      }

      const internalKms = await internalKmsDAL.findByKmsKeyIdForUpdate(kmsKeyId, db);
      if (!internalKms) {
        throw new NotFoundError({ message: `Internal KMS not found for KMS with ID '${kmsKeyId}'` });
      }

      const encryptionAlgorithm = internalKms.encryptionAlgorithm as SymmetricKeyAlgorithm;
      const newKeyMaterial = crypto.randomBytes(getByteLengthForSymmetricEncryptionAlgorithm(encryptionAlgorithm));
      const encryptedNewKeyMaterial = keyCipher.encrypt(newKeyMaterial, ROOT_ENCRYPTION_KEY);

      // archive the current material BEFORE overwriting it
      await internalKmsKeyVersionDAL.create(
        {
          internalKmsId: internalKms.id,
          encryptedKey: internalKms.encryptedKey,
          version: internalKms.version
        },
        db
      );

      const updatedInternalKms = await internalKmsDAL.updateById(
        internalKms.id,
        {
          encryptedKey: encryptedNewKeyMaterial,
          version: internalKms.version + 1
        },
        db
      );

      return { id: kmsDoc.id, version: updatedInternalKms.version };
    };

    return tx ? dbQuery(tx) : kmsDAL.transaction(dbQuery);
  };

  const deleteInternalKms = async (kmsId: string, orgId: string, tx?: Knex) => {
    const kms = await kmsDAL.findByIdWithAssociatedKms(kmsId, tx);
    if (kms.isExternal) return;
    if (kms.orgId !== orgId) throw new ForbiddenRequestError({ message: "KMS doesn't belong to organization" });
    return kmsDAL.deleteById(kmsId, tx);
  };

  /*
   * Simple encryption service function to do all the encryption tasks in infisical
   * This can be even later exposed directly as api for encryption as function
   * The encrypted binary even has everything into it. The IV, the version etc
   */
  const encryptWithInputKey = async ({ key }: Omit<TEncryptionWithKeyDTO, "plainText">) => {
    // akhilmhdh: as more encryption are added do a check here on kmsDoc.encryptionAlgorithm
    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    return ({ plainText }: Pick<TEncryptWithKmsDTO, "plainText">) => {
      const encryptedPlainTextBlob = cipher.encrypt(plainText, key);
      // Buffer#1 encrypted text + Buffer#2 version number
      const versionBlob = Buffer.from(KMS_VERSION, "utf8"); // length is 3
      const cipherTextBlob = Buffer.concat([encryptedPlainTextBlob, versionBlob]);
      return { cipherTextBlob };
    };
  };

  /*
   * Simple decryption service function to do all the encryption tasks in infisical
   * This can be even later exposed directly as api for encryption as function
   */
  const decryptWithInputKey = async ({ key }: Omit<TDecryptWithKeyDTO, "cipherTextBlob">) => {
    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

    return ({ cipherTextBlob: versionedCipherTextBlob }: Pick<TDecryptWithKeyDTO, "cipherTextBlob">) => {
      const cipherTextBlob = versionedCipherTextBlob.subarray(0, -KMS_VERSION_BLOB_LENGTH);
      const decryptedBlob = cipher.decrypt(cipherTextBlob, key);
      return decryptedBlob;
    };
  };

  /*
   * Function to generate a KMS for an org
   * We handle concurrent with redis locking and waitReady
   * What happens is first we check kms is assigned else first we acquire lock and create the kms with connection
   * In mean time the rest of the request will wait until creation is finished followed by getting the created on
   * In real time this would be milliseconds
   */
  // Helper function to create org KMS key within a transaction
  const $createOrgKmsKey = async (orgId: string, tx: Knex) => {
    const org = await orgDAL.findById(orgId, tx);
    if (org.kmsDefaultKeyId) {
      return org.kmsDefaultKeyId;
    }

    const key = await generateKmsKey({
      isReserved: true,
      orgId: org.id,
      tx
    });

    await orgDAL.updateById(
      org.id,
      {
        kmsDefaultKeyId: key.id
      },
      tx
    );

    return key.id;
  };

  const getOrgKmsKeyId = async (orgId: string, trx?: Knex) => {
    const org = await orgDAL.findById(orgId, trx);

    if (!org) {
      throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
    }

    if (!org.kmsDefaultKeyId) {
      if (trx) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await trx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsOrgKeyCreation(orgId)]);
        return $createOrgKmsKey(orgId, trx);
      }

      const keyId = await orgDAL.transaction(async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsOrgKeyCreation(orgId)]);
        return $createOrgKmsKey(orgId, tx);
      });

      return keyId;
    }

    return org.kmsDefaultKeyId;
  };

  const encryptWithRootKey = () => {
    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

    return (plainTextBuffer: Buffer) => {
      const encryptedBuffer = cipher.encrypt(plainTextBuffer, ROOT_ENCRYPTION_KEY);
      return encryptedBuffer;
    };
  };

  const decryptWithRootKey = () => {
    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

    return (cipherTextBuffer: Buffer) => {
      return cipher.decrypt(cipherTextBuffer, ROOT_ENCRYPTION_KEY);
    };
  };

  const decryptWithKmsKey = async ({
    kmsId,
    depth = 0,
    tx
  }: Omit<TDecryptWithKmsDTO, "cipherTextBlob"> & { depth?: number; tx?: Knex }) => {
    if (depth > 2) throw new BadRequestError({ message: "KMS depth max limit" });

    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId, tx);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }

    if (kmsDoc.externalKms) {
      let externalKms: TExternalKmsProviderFns;

      if (!kmsDoc.orgKms.id || !kmsDoc.orgKms.encryptedDataKey) {
        throw new BadRequestError({ message: "Invalid organization KMS" });
      }

      // The idea is external kms connection info is encrypted by an org default KMS
      // This could be external kms(in future) but at the end of the day, the end KMS will be an infisical internal one
      // we put a limit of depth to avoid too many cycles
      const orgKmsDecryptor = await decryptWithKmsKey({
        kmsId: kmsDoc.orgKms.id,
        depth: depth + 1,
        tx
      });

      const orgKmsDataKey = await orgKmsDecryptor({
        cipherTextBlob: kmsDoc.orgKms.encryptedDataKey
      });

      const kmsDecryptor = await decryptWithInputKey({
        key: orgKmsDataKey
      });

      const decryptedProviderInputBlob = kmsDecryptor({
        cipherTextBlob: kmsDoc.externalKms.encryptedProviderInput
      });

      switch (kmsDoc.externalKms.provider) {
        case KmsProviders.Aws: {
          const decryptedProviderInput = await ExternalKmsAwsSchema.parseAsync(
            JSON.parse(decryptedProviderInputBlob.toString("utf8"))
          );

          externalKms = await AwsKmsProviderFactory({
            inputs: decryptedProviderInput
          });
          break;
        }
        case KmsProviders.Gcp: {
          const decryptedProviderInput = await ExternalKmsGcpSchema.parseAsync(
            JSON.parse(decryptedProviderInputBlob.toString("utf8"))
          );

          externalKms = await GcpKmsProviderFactory({
            inputs: decryptedProviderInput
          });
          break;
        }
        default:
          throw new BadRequestError({ message: "Invalid KMS provider." });
      }

      return async ({ cipherTextBlob }: Pick<TDecryptWithKmsDTO, "cipherTextBlob">) => {
        try {
          const { data } = await externalKms.decrypt(cipherTextBlob);
          return data;
        } finally {
          await externalKms.cleanup();
        }
      };
    }

    const encryptionAlgorithm = kmsDoc.internalKms?.encryptionAlgorithm as SymmetricKeyAlgorithm;
    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.ENCRYPT_DECRYPT
    });

    // internal KMS
    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const dataCipher = symmetricCipherService(encryptionAlgorithm);
    const internalKmsId = kmsDoc.internalKms?.id as string;
    const currentKeyVersion = kmsDoc.internalKms?.version as number; // NOT NULL, defaults to 1
    const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

    const keyMaterialByVersion = new Map<number, Buffer>([[currentKeyVersion, kmsKey]]);
    let archivedVersionsLoaded = false;
    const $loadArchivedVersions = async () => {
      if (archivedVersionsLoaded) return;
      // one query for all archived versions; DB errors propagate (never silently treated as a decrypt failure)
      const archivedVersions = await internalKmsKeyVersionDAL.find({ internalKmsId }, { tx });
      for (const archived of archivedVersions) {
        if (!keyMaterialByVersion.has(archived.version)) {
          keyMaterialByVersion.set(archived.version, keyCipher.decrypt(archived.encryptedKey, ROOT_ENCRYPTION_KEY));
        }
      }
      archivedVersionsLoaded = true;
    };

    // Try the preferred version first (cheap, no DB), then the current material, then every archived version
    // newest-first. Returns the plaintext, or null if no available material authenticates the blob. Trying the
    // current material covers the export/import case where rotated material was re-imported as version 1, and
    // trying older material covers stale-replica writers that used pre-rotation material.
    const $tryDecryptWithAnyMaterial = async (cipherTextBlob: Buffer, preferredVersion: number) => {
      const attempt = (material?: Buffer) => {
        if (!material) return null;
        try {
          return dataCipher.decrypt(cipherTextBlob, material);
        } catch {
          return null; // GCM auth failure for this material; try the next candidate
        }
      };

      const preferred = attempt(keyMaterialByVersion.get(preferredVersion));
      if (preferred) return preferred;

      // skip when preferred already was the current material (seeded under currentKeyVersion)
      if (preferredVersion !== currentKeyVersion) {
        const current = attempt(kmsKey);
        if (current) return current;
      }

      await $loadArchivedVersions();
      for (let version = currentKeyVersion - 1; version >= 1; version -= 1) {
        const decrypted = attempt(keyMaterialByVersion.get(version));
        if (decrypted) return decrypted;
      }
      return null;
    };

    return async ({ cipherTextBlob: versionedCipherTextBlob }: Pick<TDecryptWithKmsDTO, "cipherTextBlob">) => {
      const suffix =
        versionedCipherTextBlob.length >= KMS_VERSION_BLOB_LENGTH
          ? versionedCipherTextBlob.subarray(-KMS_VERSION_BLOB_LENGTH).toString("utf8")
          : "";

      // v02 is recognized structurally (suffix + minimum length), never by trusting the embedded version: a blob
      // too short to be real AES-GCM output that happens to end in "v02" is treated as legacy/garbage and falls
      // through, so readUInt32BE can never run on a negative offset.
      if (suffix === KMS_VERSION_V2 && versionedCipherTextBlob.length >= MIN_V02_BLOB_LENGTH) {
        const keyVersionOffset = versionedCipherTextBlob.length - KMS_VERSION_BLOB_LENGTH - KMS_KEY_VERSION_BLOB_LENGTH;
        const embeddedVersion = versionedCipherTextBlob.readUInt32BE(keyVersionOffset);
        const cipherTextBlob = versionedCipherTextBlob.subarray(0, keyVersionOffset);

        const decrypted = await $tryDecryptWithAnyMaterial(cipherTextBlob, embeddedVersion);
        if (decrypted) return decrypted;

        return dataCipher.decrypt(cipherTextBlob, kmsKey);
      }

      // legacy v01 (or anything not validated as v02): strip the 3-byte suffix and try all available material
      const cipherTextBlob = versionedCipherTextBlob.subarray(0, -KMS_VERSION_BLOB_LENGTH);
      const decrypted = await $tryDecryptWithAnyMaterial(cipherTextBlob, currentKeyVersion);
      if (decrypted) return decrypted;
      return dataCipher.decrypt(cipherTextBlob, kmsKey);
    };
  };

  const getKeyMaterial = async ({ kmsId }: TGetKeyMaterialDTO) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }

    if (kmsDoc.isReserved) {
      throw new BadRequestError({
        message: "Cannot get key material for reserved key"
      });
    }

    if (kmsDoc.externalKms) {
      throw new BadRequestError({
        message: "Cannot get key material for external key"
      });
    }

    if (!kmsDoc.isExportable) {
      throw new BadRequestError({
        message: "You are not allowed to export this key"
      });
    }

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

    return kmsKey;
  };

  const getBulkKeyMaterial = async ({ kmsIds }: TGetBulkKeyMaterialDTO) => {
    const kmsDocs = await kmsDAL.findByIdsWithAssociatedKms(kmsIds);

    return kmsDocs.map((kmsDoc) => {
      if (kmsDoc.isReserved) {
        throw new BadRequestError({ message: `Cannot get key material for reserved key [kmsId=${kmsDoc.id}]` });
      }
      if (kmsDoc.externalKms) {
        throw new BadRequestError({ message: `Cannot get key material for external key [kmsId=${kmsDoc.id}]` });
      }
      if (!kmsDoc.isExportable) {
        throw new BadRequestError({ message: `You are not allowed to export this key [kmsId=${kmsDoc.id}]` });
      }

      const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
      const keyMaterial = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

      return { kmsId: kmsDoc.id, name: kmsDoc.name, keyMaterial };
    });
  };

  const importKeyMaterial = async (
    {
      key,
      algorithm,
      name,
      isReserved,
      isExportable = true,
      projectId,
      orgId,
      keyUsage,
      kmipMetadata
    }: TImportKeyMaterialDTO,
    tx?: Knex
  ) => {
    verifyKeyTypeAndAlgorithm(keyUsage, algorithm);

    if (keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT) {
      const expectedLength = getByteLengthForSymmetricEncryptionAlgorithm(algorithm as SymmetricKeyAlgorithm);
      if (key.length !== expectedLength) {
        throw new BadRequestError({
          message: `Invalid key material length for ${algorithm}. Expected ${expectedLength} bytes, got ${key.length}.`
        });
      }
    }

    if (keyUsage === KmsKeyUsage.SIGN_VERIFY) {
      const { getPublicKeyFromPrivateKey } = signingService(algorithm as AsymmetricKeyAlgorithm);
      try {
        await getPublicKeyFromPrivateKey(key);
      } catch {
        const expectedFormat = isPqcKeyAlgorithm(algorithm as string) ? "PKCS8 DER-encoded" : "PKCS8 PEM-encoded";
        throw new BadRequestError({
          message: `Invalid private key material. Expected a ${expectedFormat} private key.`
        });
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
        const keyObj = crypto.nativeCrypto.createPrivateKey({
          key,
          format: "pem",
          type: "pkcs8"
        });
        const keyType = keyObj.asymmetricKeyType;
        const keyDetails = keyObj.asymmetricKeyDetails;

        if (algorithm === AsymmetricKeyAlgorithm.RSA_4096) {
          if (keyType !== "rsa" || keyDetails?.modulusLength !== 4096) {
            throw new BadRequestError({
              message: `Key material does not match the declared algorithm. Expected an RSA 4096-bit key.`
            });
          }
        } else if (algorithm === AsymmetricKeyAlgorithm.ECC_NIST_P256) {
          if (keyType !== "ec" || keyDetails?.namedCurve !== "prime256v1") {
            throw new BadRequestError({
              message: `Key material does not match the declared algorithm. Expected an EC P-256 key.`
            });
          }
        } else if (algorithm === AsymmetricKeyAlgorithm.ECC_NIST_P384) {
          if (keyType !== "ec" || keyDetails?.namedCurve !== "secp384r1") {
            throw new BadRequestError({
              message: `Key material does not match the declared algorithm. Expected an EC P-384 key.`
            });
          }
        } else if (algorithm === AsymmetricKeyAlgorithm.ECC_NIST_P521) {
          if (keyType !== "ec" || keyDetails?.namedCurve !== "secp521r1") {
            throw new BadRequestError({
              message: `Key material does not match the declared algorithm. Expected an EC P-521 key.`
            });
          }
        } else if (algorithm === AsymmetricKeyAlgorithm.ECC_SECG_P256K1) {
          if (keyType !== "ec" || keyDetails?.namedCurve !== "secp256k1") {
            throw new BadRequestError({
              message: `Key material does not match the declared algorithm. Expected an EC secp256k1 key.`
            });
          }
        }
      }
    }

    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

    const encryptedKeyMaterial = cipher.encrypt(key, ROOT_ENCRYPTION_KEY);
    const sanitizedName = name ? slugify(name) : slugify(alphaNumericNanoId(8).toLowerCase());
    const dbQuery = async (db: Knex) => {
      const kmsDoc = await kmsDAL.create(
        {
          name: sanitizedName,
          keyUsage,
          orgId,
          isReserved,
          isExportable,
          projectId,
          kmipMetadata
        },
        db
      );

      await internalKmsDAL.create(
        {
          version: 1,
          encryptedKey: encryptedKeyMaterial,
          encryptionAlgorithm: algorithm,
          kmsKeyId: kmsDoc.id
        },
        db
      );
      return kmsDoc;
    };
    if (tx) return dbQuery(tx);
    const doc = await kmsDAL.transaction(async (tx2) => dbQuery(tx2));
    return doc;
  };

  const getPublicKey = async ({ kmsId }: TGetPublicKeyDTO) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }

    const encryptionAlgorithm = kmsDoc.internalKms?.encryptionAlgorithm as AsymmetricKeyAlgorithm;

    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.SIGN_VERIFY
    });

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

    return signingService(encryptionAlgorithm).getPublicKeyFromPrivateKey(kmsKey);
  };

  const signWithKmsKey = async ({ kmsId }: Pick<TSignWithKmsDTO, "kmsId">) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }

    const encryptionAlgorithm = kmsDoc.internalKms?.encryptionAlgorithm as AsymmetricKeyAlgorithm;
    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.SIGN_VERIFY
    });

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const { sign } = signingService(encryptionAlgorithm);
    return async ({
      data,
      signingAlgorithm,
      isDigest
    }: Pick<TSignWithKmsDTO, "data" | "signingAlgorithm" | "isDigest">) => {
      const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);
      const signature = await sign(data, kmsKey, signingAlgorithm, isDigest);

      return Promise.resolve({ signature, algorithm: signingAlgorithm });
    };
  };

  const verifyWithKmsKey = async ({
    kmsId,
    signingAlgorithm
  }: Pick<TVerifyWithKmsDTO, "kmsId" | "signingAlgorithm">) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }

    const encryptionAlgorithm = kmsDoc.internalKms?.encryptionAlgorithm as AsymmetricKeyAlgorithm;
    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.SIGN_VERIFY
    });

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const { verify, getPublicKeyFromPrivateKey } = signingService(encryptionAlgorithm);
    return async ({ data, signature, isDigest }: Pick<TVerifyWithKmsDTO, "data" | "signature" | "isDigest">) => {
      const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

      const publicKey = await getPublicKeyFromPrivateKey(kmsKey);
      const signatureValid = await verify(data, signature, publicKey, signingAlgorithm, isDigest);
      return Promise.resolve({ signatureValid, algorithm: signingAlgorithm });
    };
  };

  const encryptWithKmsKey = async ({ kmsId }: Omit<TEncryptWithKmsDTO, "plainText">, tx?: Knex) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId, tx);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }

    if (kmsDoc.externalKms) {
      let externalKms: TExternalKmsProviderFns;
      if (!kmsDoc.orgKms.id || !kmsDoc.orgKms.encryptedDataKey) {
        throw new BadRequestError({ message: "Invalid organization KMS" });
      }

      const orgKmsDecryptor = await decryptWithKmsKey({
        kmsId: kmsDoc.orgKms.id
      });

      const orgKmsDataKey = await orgKmsDecryptor({
        cipherTextBlob: kmsDoc.orgKms.encryptedDataKey
      });

      const kmsDecryptor = await decryptWithInputKey({
        key: orgKmsDataKey
      });

      const decryptedProviderInputBlob = kmsDecryptor({
        cipherTextBlob: kmsDoc.externalKms.encryptedProviderInput
      });

      switch (kmsDoc.externalKms.provider) {
        case KmsProviders.Aws: {
          const decryptedProviderInput = await ExternalKmsAwsSchema.parseAsync(
            JSON.parse(decryptedProviderInputBlob.toString("utf8"))
          );

          externalKms = await AwsKmsProviderFactory({
            inputs: decryptedProviderInput
          });
          break;
        }
        case KmsProviders.Gcp: {
          const decryptedProviderInput = await ExternalKmsGcpSchema.parseAsync(
            JSON.parse(decryptedProviderInputBlob.toString("utf8"))
          );

          externalKms = await GcpKmsProviderFactory({
            inputs: decryptedProviderInput
          });
          break;
        }
        default:
          throw new BadRequestError({ message: "Invalid KMS provider." });
      }

      return async ({ plainText }: Pick<TEncryptWithKmsDTO, "plainText">) => {
        try {
          const { encryptedBlob } = await externalKms.encrypt(plainText);
          return { cipherTextBlob: encryptedBlob };
        } finally {
          await externalKms.cleanup();
        }
      };
    }

    const encryptionAlgorithm = kmsDoc.internalKms?.encryptionAlgorithm as SymmetricKeyAlgorithm;
    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.ENCRYPT_DECRYPT
    });

    // internal KMS
    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const dataCipher = symmetricCipherService(encryptionAlgorithm);
    const currentKeyVersion = kmsDoc.internalKms?.version as number; // NOT NULL, defaults to 1
    const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

    return ({ plainText }: Pick<TEncryptWithKmsDTO, "plainText">) => {
      const encryptedPlainTextBlob = dataCipher.encrypt(plainText, kmsKey);
      const cipherTextBlob = buildKmsCipherTextBlob(encryptedPlainTextBlob, currentKeyVersion);
      return Promise.resolve({ cipherTextBlob });
    };
  };

  // Helper function to create org data key within a transaction
  const $createOrgKmsDataKey = async (orgId: string, kmsKeyId: string, tx: Knex) => {
    const org = await orgDAL.findById(orgId, tx);
    if (org.kmsEncryptedDataKey) {
      return;
    }

    const dataKey = crypto.randomBytes(32);
    const kmsEncryptor = await encryptWithKmsKey({ kmsId: kmsKeyId }, tx);
    const { cipherTextBlob } = await kmsEncryptor({ plainText: dataKey });

    await orgDAL.updateById(org.id, { kmsEncryptedDataKey: cipherTextBlob }, tx);

    return dataKey;
  };

  const $getOrgKmsDataKey = async (orgId: string, trx?: Knex) => {
    const kmsKeyId = await getOrgKmsKeyId(orgId, trx);
    let org = await orgDAL.findById(orgId, trx);

    if (!org) {
      throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
    }

    if (!org.kmsEncryptedDataKey) {
      let orgDataKey: Buffer | undefined;

      if (trx) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await trx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsOrgDataKeyCreation(orgId)]);
        orgDataKey = await $createOrgKmsDataKey(orgId, kmsKeyId, trx);
      } else {
        orgDataKey = await orgDAL.transaction(async (tx) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsOrgDataKeyCreation(orgId)]);
          return $createOrgKmsDataKey(orgId, kmsKeyId, tx);
        });
      }

      if (orgDataKey) {
        return orgDataKey;
      }

      org = await orgDAL.findById(orgId, trx);
    }

    if (!org.kmsEncryptedDataKey) {
      throw new BadRequestError({ message: "Invalid organization KMS" });
    }

    const kmsDecryptor = await decryptWithKmsKey({
      kmsId: kmsKeyId,
      tx: trx
    });

    return kmsDecryptor({
      cipherTextBlob: org.kmsEncryptedDataKey
    });
  };

  // Helper function to create project KMS key within a transaction
  const $createProjectKmsKey = async (projectId: string, tx: Knex) => {
    const project = await projectDAL.findById(projectId, tx);
    if (project.kmsSecretManagerKeyId) {
      return project.kmsSecretManagerKeyId;
    }

    const key = await generateKmsKey({
      isReserved: true,
      orgId: project.orgId,
      tx
    });

    await projectDAL.updateById(projectId, { kmsSecretManagerKeyId: key.id }, tx);

    return key.id;
  };

  /** Single project row read; reuses snapshot for data-key path to avoid duplicate findById. */
  const $getProjectSecretManagerKmsKeyIdAndProject = async (projectId: string, trx?: Knex) => {
    const project = await projectDAL.findById(projectId, trx);
    if (!project) {
      throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    }

    if (!project.kmsSecretManagerKeyId) {
      if (trx) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await trx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsProjectKeyCreation(projectId)]);
        const kmsKeyId = await $createProjectKmsKey(projectId, trx);
        return { kmsKeyId, project };
      }

      const kmsKeyId = await projectDAL.transaction(async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsProjectKeyCreation(projectId)]);
        return $createProjectKmsKey(projectId, tx);
      });

      return { kmsKeyId, project };
    }

    return { kmsKeyId: project.kmsSecretManagerKeyId, project };
  };

  const getProjectSecretManagerKmsKeyId = async (projectId: string, trx?: Knex) => {
    const { kmsKeyId } = await $getProjectSecretManagerKmsKeyIdAndProject(projectId, trx);
    return kmsKeyId;
  };

  // Helper function to create project data key within a transaction
  const $createProjectKmsDataKey = async (projectId: string, kmsKeyId: string, tx: Knex) => {
    const project = await projectDAL.findById(projectId, tx);
    if (project.kmsSecretManagerEncryptedDataKey) {
      return;
    }

    const dataKey = crypto.randomBytes(32);
    const kmsEncryptor = await encryptWithKmsKey({ kmsId: kmsKeyId }, tx);
    const { cipherTextBlob } = await kmsEncryptor({ plainText: dataKey });

    await projectDAL.updateById(projectId, { kmsSecretManagerEncryptedDataKey: cipherTextBlob }, tx);

    return dataKey;
  };

  const $getProjectSecretManagerKmsDataKey = async (projectId: string, trx?: Knex) => {
    const { kmsKeyId, project: projectSnapshot } = await $getProjectSecretManagerKmsKeyIdAndProject(projectId, trx);
    let project = projectSnapshot;

    if (!project.kmsSecretManagerEncryptedDataKey) {
      let projectDataKey: Buffer | undefined;

      if (trx) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await trx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsProjectDataKeyCreation(projectId)]);
        projectDataKey = await $createProjectKmsDataKey(projectId, kmsKeyId, trx);
      } else {
        projectDataKey = await projectDAL.transaction(async (tx) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsProjectDataKeyCreation(projectId)]);
          return $createProjectKmsDataKey(projectId, kmsKeyId, tx);
        });
      }

      if (projectDataKey) {
        return projectDataKey;
      }

      project = await projectDAL.findById(projectId, trx);
    }

    if (!project.kmsSecretManagerEncryptedDataKey) {
      throw new BadRequestError({ message: "Missing project data key" });
    }

    const kmsDecryptor = await decryptWithKmsKey({
      kmsId: kmsKeyId,
      tx: trx
    });

    return kmsDecryptor({
      cipherTextBlob: project.kmsSecretManagerEncryptedDataKey
    });
  };

  const $getDataKey = async (dto: TEncryptWithKmsDataKeyDTO, trx?: Knex) => {
    switch (dto.type) {
      case KmsDataKey.SecretManager: {
        return $getProjectSecretManagerKmsDataKey(dto.projectId, trx);
      }
      default: {
        return $getOrgKmsDataKey(dto.orgId, trx);
      }
    }
  };

  const $getBasicEncryptionKey = () => {
    const encryptionKey = envConfig.ENCRYPTION_KEY || envConfig.ROOT_ENCRYPTION_KEY;

    const isBase64 = !envConfig.ENCRYPTION_KEY;
    if (!encryptionKey)
      throw new BadRequestError({
        message:
          "Root encryption key not found for KMS service. Did you set the ENCRYPTION_KEY or ROOT_ENCRYPTION_KEY environment variables?"
      });

    const encryptionKeyBuffer = Buffer.from(encryptionKey, isBase64 ? "base64" : "utf8");

    return encryptionKeyBuffer;
  };

  const $decryptRootKey = async (kmsRootConfig: TKmsRootConfig) => {
    // case 1: root key is encrypted with HSM
    if (kmsRootConfig.encryptionStrategy === RootKeyEncryptionStrategy.HSM) {
      const hsmIsActive = await hsmService.isActive();
      if (!hsmIsActive) {
        throw new BadRequestError({
          message: "Unable to decrypt root KMS key. HSM service is inactive. Did you configure the HSM?"
        });
      }

      const decryptedKey = await hsmService.decrypt(kmsRootConfig.encryptedRootKey);
      return decryptedKey;
    }

    // case 2: root key is encrypted with software encryption
    if (kmsRootConfig.encryptionStrategy === RootKeyEncryptionStrategy.Software) {
      const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
      const encryptionKeyBuffer = $getBasicEncryptionKey();

      return cipher.decrypt(kmsRootConfig.encryptedRootKey, encryptionKeyBuffer);
    }

    throw new BadRequestError({ message: `Invalid root key encryption strategy: ${kmsRootConfig.encryptionStrategy}` });
  };

  const $encryptRootKey = async (plainKeyBuffer: Buffer, strategy: RootKeyEncryptionStrategy) => {
    if (strategy === RootKeyEncryptionStrategy.HSM) {
      const hsmIsActive = await hsmService.isActive();
      if (!hsmIsActive) {
        throw new BadRequestError({
          message: "Unable to encrypt root KMS key. HSM service is inactive. Did you configure the HSM?"
        });
      }
      const encrypted = await hsmService.encrypt(plainKeyBuffer);
      return encrypted;
    }

    if (strategy === RootKeyEncryptionStrategy.Software) {
      const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
      const encryptionKeyBuffer = $getBasicEncryptionKey();

      return cipher.encrypt(plainKeyBuffer, encryptionKeyBuffer);
    }

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new BadRequestError({ message: `Invalid root key encryption strategy: ${strategy}` });
  };

  // by keeping the decrypted data key in inner scope
  // none of the entities outside can interact directly or expose the data key
  // NOTICE: If changing here update migrations/utils/kms
  const createCipherPairWithDataKey = async (encryptionContext: TEncryptWithKmsDataKeyDTO, trx?: Knex) => {
    const dataKey = await $getDataKey(encryptionContext, trx);

    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

    return {
      encryptor: ({ plainText }: Pick<TEncryptWithKmsDTO, "plainText">) => {
        const encryptedPlainTextBlob = cipher.encrypt(plainText, dataKey);

        // Buffer#1 encrypted text + Buffer#2 version number
        const versionBlob = Buffer.from(KMS_VERSION, "utf8"); // length is 3
        const cipherTextBlob = Buffer.concat([encryptedPlainTextBlob, versionBlob]);
        return { cipherTextBlob };
      },
      decryptor: ({ cipherTextBlob: versionedCipherTextBlob }: Pick<TDecryptWithKeyDTO, "cipherTextBlob">) => {
        const cipherTextBlob = versionedCipherTextBlob.subarray(0, -KMS_VERSION_BLOB_LENGTH);
        const decryptedBlob = cipher.decrypt(cipherTextBlob, dataKey);
        return decryptedBlob;
      },
      generateSecretBlindIndex: (secretValue: Buffer) => generateSecretValueBlindIndexFromKmsKey(secretValue, dataKey)
    };
  };

  const updateProjectSecretManagerKmsKey = async ({ projectId, kms }: TUpdateProjectSecretManagerKmsKeyDTO) => {
    const kmsKeyId = await getProjectSecretManagerKmsKeyId(projectId);
    const currentKms = await kmsDAL.findById(kmsKeyId);

    // case: internal kms -> internal kms. no change needed
    if (kms.type === KmsType.Internal && currentKms.isReserved) {
      return KmsSanitizedSchema.parseAsync({ isExternal: false, ...currentKms });
    }

    if (kms.type === KmsType.External) {
      // validate kms is scoped in org
      const { kmsId } = kms;
      const project = await projectDAL.findById(projectId);
      if (!project) {
        throw new NotFoundError({
          message: `Project with ID '${projectId}' not found`
        });
      }
      const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
      if (!kmsDoc) {
        throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
      }

      if (kmsDoc.orgId !== project.orgId) {
        throw new ForbiddenRequestError({
          message: "KMS ID does not belong in the organization."
        });
      }
    }

    const dataKey = await $getProjectSecretManagerKmsDataKey(projectId);
    return kmsDAL.transaction(async (tx) => {
      const project = await projectDAL.findById(projectId, tx);
      let kmsId;
      if (kms.type === KmsType.Internal) {
        const internalKms = await generateKmsKey({
          isReserved: true,
          orgId: project.orgId,
          tx
        });
        kmsId = internalKms.id;
      } else {
        kmsId = kms.kmsId;
      }

      const kmsEncryptor = await encryptWithKmsKey({ kmsId }, tx);
      const { cipherTextBlob } = await kmsEncryptor({ plainText: dataKey });
      await projectDAL.updateById(
        projectId,
        {
          kmsSecretManagerKeyId: kmsId,
          kmsSecretManagerEncryptedDataKey: cipherTextBlob
        },
        tx
      );
      if (currentKms.isReserved) {
        await kmsDAL.deleteById(currentKms.id, tx);
      }
      const newKms = await kmsDAL.findById(kmsId, tx);
      return KmsSanitizedSchema.parseAsync({ isExternal: !currentKms.isReserved, ...newKms });
    });
  };

  const getProjectKeyBackup = async (projectId: string) => {
    const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
      projectDAL.findById(projectId)
    );
    if (!project) {
      throw new NotFoundError({
        message: `Project with ID '${projectId}' not found`
      });
    }

    const secretManagerDataKey = await $getProjectSecretManagerKmsDataKey(projectId);
    const kmsKeyIdForEncrypt = await getOrgKmsKeyId(project.orgId);
    const kmsEncryptor = await encryptWithKmsKey({ kmsId: kmsKeyIdForEncrypt });
    const { cipherTextBlob: encryptedSecretManagerDataKeyWithOrgKms } = await kmsEncryptor({
      plainText: secretManagerDataKey
    });

    // backup format: version.projectId.kmsFunction.kmsId.Base64(encryptedDataKey).verificationHash
    let secretManagerBackup = `v1.${projectId}.secretManager.${kmsKeyIdForEncrypt}.${encryptedSecretManagerDataKeyWithOrgKms.toString(
      "base64"
    )}`;

    const verificationHash = crypto.nativeCrypto.createHash("sha256").update(secretManagerBackup).digest("hex");
    secretManagerBackup = `${secretManagerBackup}.${verificationHash}`;

    return {
      secretManager: secretManagerBackup
    };
  };

  const loadProjectKeyBackup = async (projectId: string, backup: string) => {
    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({
        message: `Project with ID '${projectId}' not found`
      });
    }

    const [, backupProjectId, , backupKmsKeyId, backupBase64EncryptedDataKey, backupHash] = backup.split(".");

    const computedHash = crypto.nativeCrypto
      .createHash("sha256")
      .update(backup.substring(0, backup.lastIndexOf(".")))
      .digest("hex");

    if (computedHash !== backupHash) {
      throw new BadRequestError({
        message: "Invalid backup"
      });
    }

    if (backupProjectId !== projectId) {
      throw new ForbiddenRequestError({
        message: "Backup does not belong to project"
      });
    }

    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(backupKmsKeyId);
    if (kmsDoc.orgId !== project.orgId)
      throw new ForbiddenRequestError({
        message: "Backup does not belong to project"
      });

    const kmsDecryptor = await decryptWithKmsKey({ kmsId: backupKmsKeyId });
    const dataKey = await kmsDecryptor({
      cipherTextBlob: Buffer.from(backupBase64EncryptedDataKey, "base64")
    });

    const newKms = await kmsDAL.transaction(async (tx) => {
      const key = await generateKmsKey({
        isReserved: true,
        orgId: project.orgId,
        tx
      });

      const kmsEncryptor = await encryptWithKmsKey({ kmsId: key.id }, tx);
      const { cipherTextBlob } = await kmsEncryptor({ plainText: dataKey });

      await projectDAL.updateById(
        projectId,
        {
          kmsSecretManagerKeyId: key.id,
          kmsSecretManagerEncryptedDataKey: cipherTextBlob
        },
        tx
      );
      return kmsDAL.findByIdWithAssociatedKms(key.id, tx);
    });

    return {
      secretManagerKmsKey: newKms
    };
  };

  const getKmsById = async (kmsKeyId: string, tx?: Knex) => {
    const kms = await kmsDAL.findByIdWithAssociatedKms(kmsKeyId, tx);

    if (!kms.id) {
      throw new NotFoundError({
        message: `KMS with ID '${kmsKeyId}' not found`
      });
    }
    const { id, name, orgId, isExternal } = kms;
    return { id, name, orgId, isExternal };
  };

  const startService = async (hsmStatus: THsmStatus) => {
    const kmsRootConfig = await kmsRootConfigDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);
      // check if KMS root key was already generated and saved in DB
      const existingRootConfig = await kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID);
      if (existingRootConfig) return existingRootConfig;

      const isHsmActive = hsmStatus.isHsmConfigured;

      logger.info(`KMS: Generating new ROOT Key with ${isHsmActive ? "HSM" : "software"} encryption`);
      const newRootKey = isHsmActive ? await hsmService.randomBytes(32) : crypto.randomBytes(32);

      const encryptionStrategy = isHsmActive ? RootKeyEncryptionStrategy.HSM : RootKeyEncryptionStrategy.Software;

      const encryptedRootKey = await $encryptRootKey(newRootKey, encryptionStrategy).catch((err) => {
        logger.error({ hsmEnabled: isHsmActive, encryptionStrategy }, "KMS: Failed to encrypt ROOT Key");
        throw err;
      });

      const newRootConfig = await kmsRootConfigDAL.create({
        // @ts-expect-error id is kept as fixed for idempotence and to avoid race condition
        id: KMS_ROOT_CONFIG_UUID,
        encryptedRootKey,
        encryptionStrategy
      });
      return newRootConfig;
    });

    const decryptedRootKey = await $decryptRootKey(kmsRootConfig);

    logger.info("KMS: Loading ROOT Key into Memory.");

    ROOT_ENCRYPTION_KEY = decryptedRootKey;
  };

  const updateEncryptionStrategy = async (strategy: RootKeyEncryptionStrategy) => {
    const kmsRootConfig = await kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID);
    if (!kmsRootConfig) {
      throw new NotFoundError({ message: "KMS root config not found" });
    }

    if (kmsRootConfig.encryptionStrategy === strategy) {
      return;
    }

    if (strategy === RootKeyEncryptionStrategy.Software) {
      if (!envConfig.ROOT_ENCRYPTION_KEY && !envConfig.ENCRYPTION_KEY) {
        throw new BadRequestError({
          message:
            "Root KMS encryption strategy is set to software. Please set the ENCRYPTION_KEY environment variable and restart your deployment before trying to update the encryption strategy to software mode."
        });
      }
    }

    const decryptedRootKey = await $decryptRootKey(kmsRootConfig);
    const encryptedRootKey = await $encryptRootKey(decryptedRootKey, strategy);

    if (!encryptedRootKey) {
      logger.error("KMS: Failed to re-encrypt ROOT Key with selected strategy");
      throw new BadRequestError({ message: "Failed to re-encrypt ROOT Key with selected strategy" });
    }

    await kmsRootConfigDAL.updateById(KMS_ROOT_CONFIG_UUID, {
      encryptedRootKey,
      encryptionStrategy: strategy
    });

    ROOT_ENCRYPTION_KEY = decryptedRootKey;
  };

  return {
    startService,
    generateKmsKey,
    rotateKmsKey,
    deleteInternalKms,
    encryptWithKmsKey,
    decryptWithKmsKey,
    encryptWithInputKey,
    decryptWithInputKey,
    encryptWithRootKey,
    decryptWithRootKey,
    getOrgKmsKeyId,
    updateEncryptionStrategy,
    getProjectSecretManagerKmsKeyId,
    updateProjectSecretManagerKmsKey,
    getProjectKeyBackup,
    loadProjectKeyBackup,
    getKmsById,
    createCipherPairWithDataKey,
    getKeyMaterial,
    getBulkKeyMaterial,
    importKeyMaterial,
    signWithKmsKey,
    verifyWithKmsKey,
    getPublicKey
  };
};
