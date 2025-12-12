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
import { KeyStorePrefixes, KeyStoreTtls, PgSqlLock, TKeyStoreFactory } from "@app/keystore/keystore";
import { TEnvConfig } from "@app/lib/config/env";
import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { AsymmetricKeyAlgorithm, signingService } from "@app/lib/crypto/sign";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import {
  getByteLengthForSymmetricEncryptionAlgorithm,
  KMS_ROOT_CONFIG_UUID,
  verifyKeyTypeAndAlgorithm
} from "@app/services/kms/kms-fns";

import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TInternalKmsDALFactory } from "./internal-kms-dal";
import { TKmsKeyDALFactory } from "./kms-key-dal";
import { TKmsRootConfigDALFactory } from "./kms-root-config-dal";
import {
  KmsDataKey,
  KmsKeyRotationStatus,
  KmsKeyUsage,
  KmsType,
  MS_PER_DAY,
  RootKeyEncryptionStrategy,
  TDecryptWithKeyDTO,
  TDecryptWithKmsDTO,
  TEncryptionWithKeyDTO,
  TEncryptWithKmsDataKeyDTO,
  TEncryptWithKmsDTO,
  TGenerateKMSDTO,
  TGetKeyMaterialDTO,
  TGetPublicKeyDTO,
  TImportKeyMaterialDTO,
  TSignWithKmsDTO,
  TUpdateProjectSecretManagerKmsKeyDTO,
  TVerifyWithKmsDTO,
  KMS_ROTATION_CONSTANTS
} from "./kms-types";

type TKmsServiceFactoryDep = {
  kmsDAL: TKmsKeyDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById" | "updateById" | "transaction">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "updateById" | "transaction">;
  kmsRootConfigDAL: Pick<TKmsRootConfigDALFactory, "findById" | "create" | "updateById" | "transaction">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "waitTillReady" | "setItemWithExpiry" | "getItem">;
  internalKmsDAL: Pick<
    TInternalKmsDALFactory,
    | "create"
    | "findByKmsKeyId"
    | "createKeyVersion"
    | "findKeyVersion"
    | "findAllKeyVersions"
    | "findMaxVersionNumber"
    | "updateVersionAndRotatedAt"
    | "updateScheduledRotation"
    | "findKeysToRotate"
    | "deleteOldKeyVersions"
    | "updateRotationStatus"
  >;
  hsmService: THsmServiceFactory;
  envConfig: Pick<TEnvConfig, "ENCRYPTION_KEY" | "ROOT_ENCRYPTION_KEY">;
};

export type TKmsServiceFactory = ReturnType<typeof kmsServiceFactory>;

// akhilmhdh: Don't edit this value. This is measured for blob concatination in kms
const KMS_VERSION = "v01";
const KMS_VERSION_BLOB_LENGTH = 3;
const V02_PREFIX = "v2:";

const createV02Header = (keyVersion: number): Buffer => {
  return Buffer.from(`${V02_PREFIX}${keyVersion}:`);
};

const parseV02Header = (blob: Buffer): { keyVersion: number; encryptedData: Buffer } | null => {
  const prefix = blob.toString("utf8", 0, 3);
  if (prefix !== V02_PREFIX) return null;

  const headerEnd = blob.indexOf(":", 3);
  if (headerEnd === -1) return null;

  const keyVersion = parseInt(blob.toString("utf8", 3, headerEnd), 10);
  if (Number.isNaN(keyVersion) || keyVersion < 1 || keyVersion > 10_000_000) {
    throw new BadRequestError({ message: `Invalid key version in ciphertext: ${keyVersion}` });
  }

  return { keyVersion, encryptedData: blob.subarray(headerEnd + 1) };
};

const KmsSanitizedSchema = KmsKeysSchema.extend({ isExternal: z.boolean() });

export const kmsServiceFactory = ({
  envConfig,
  kmsDAL,
  kmsRootConfigDAL,
  keyStore,
  internalKmsDAL,
  orgDAL,
  projectDAL,
  hsmService
}: TKmsServiceFactoryDep) => {
  let ROOT_ENCRYPTION_KEY = Buffer.alloc(0);

  /*
   * Generate KMS Key
   * This function is responsibile for generating the infisical internal KMS for various entities
   * Like for secret manager, cert manager or for organization
   */
  const generateKmsKey = async ({
    orgId,
    isReserved = true,
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
      getPublicKeyFromPrivateKey(kmsKeyMaterial);
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
  const getOrgKmsKeyId = async (orgId: string, trx?: Knex) => {
    let org = await orgDAL.findById(orgId, trx);

    if (!org) {
      throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
    }

    if (!org.kmsDefaultKeyId) {
      const lock = await keyStore
        .acquireLock([KeyStorePrefixes.KmsOrgKeyCreation, orgId], 3000, { retryCount: 3 })
        .catch(() => null);

      try {
        if (!lock) {
          await keyStore.waitTillReady({
            key: `${KeyStorePrefixes.WaitUntilReadyKmsOrgKeyCreation}${orgId}`,
            keyCheckCb: (val) => val === "true",
            waitingCb: () => logger.info("KMS. Waiting for org key to be created")
          });

          org = await orgDAL.findById(orgId, trx);
        } else {
          const keyId = await (trx || orgDAL).transaction(async (tx) => {
            org = await orgDAL.findById(orgId, tx);
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

            await keyStore.setItemWithExpiry(`${KeyStorePrefixes.WaitUntilReadyKmsOrgKeyCreation}${orgId}`, 10, "true");

            return key.id;
          });

          return keyId;
        }
      } finally {
        await lock?.release();
      }
    }

    if (!org.kmsDefaultKeyId) {
      throw new BadRequestError({ message: `Organization '${orgId}' does not have a default KMS key configured` });
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
        throw new BadRequestError({ message: `Invalid organization KMS configuration for key '${kmsId}'` });
      }

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

    // internal KMS
    const { internalKms } = kmsDoc;
    if (!internalKms) {
      throw new BadRequestError({ message: `Internal KMS record not found for key '${kmsId}'` });
    }

    const encryptionAlgorithm = internalKms.encryptionAlgorithm as SymmetricKeyAlgorithm;
    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.ENCRYPT_DECRYPT
    });

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const dataCipher = symmetricCipherService(encryptionAlgorithm);

    return async ({ cipherTextBlob: versionedCipherTextBlob }: Pick<TDecryptWithKmsDTO, "cipherTextBlob">) => {
      let cipherTextBlob: Buffer;
      let encryptedKeyToUse: Buffer;

      const v02Header = parseV02Header(versionedCipherTextBlob);
      if (v02Header) {
        const { keyVersion, encryptedData } = v02Header;
        cipherTextBlob = encryptedData;

        const keyVersionRecord = await internalKmsDAL.findKeyVersion(internalKms.id, keyVersion);

        if (keyVersionRecord) {
          encryptedKeyToUse = keyVersionRecord.encryptedKey;
        } else {
          const freshInternalKms = await internalKmsDAL.findByKmsKeyId(kmsId);
          if (!freshInternalKms) {
            throw new NotFoundError({ message: `Internal KMS record not found for key ID '${kmsId}'` });
          }

          if (keyVersion === freshInternalKms.version) {
            encryptedKeyToUse = freshInternalKms.encryptedKey;
          } else {
            throw new NotFoundError({
              message: `Key version ${keyVersion} not found. The key version may have been deleted due to retention limits.`
            });
          }
        }
      } else {
        cipherTextBlob = versionedCipherTextBlob.subarray(0, -KMS_VERSION_BLOB_LENGTH);

        // If current version is 1, use current key; otherwise look up version 1
        if (internalKms.version === 1) {
          encryptedKeyToUse = internalKms.encryptedKey;
        } else {
          const version1Record = await internalKmsDAL.findKeyVersion(internalKms.id, 1);
          if (version1Record) {
            encryptedKeyToUse = version1Record.encryptedKey;
          } else {
            throw new NotFoundError({
              message: "Cannot decrypt legacy data: original key version has been deleted due to retention limits."
            });
          }
        }
      }

      const kmsKey = keyCipher.decrypt(encryptedKeyToUse, ROOT_ENCRYPTION_KEY);
      const decryptedBlob = dataCipher.decrypt(cipherTextBlob, kmsKey);
      return decryptedBlob;
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

    if (kmsDoc.externalKms || !kmsDoc.internalKms) {
      throw new BadRequestError({
        message: "Cannot get key material for external key"
      });
    }

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const kmsKey = keyCipher.decrypt(kmsDoc.internalKms.encryptedKey, ROOT_ENCRYPTION_KEY);

    return kmsKey;
  };

  const importKeyMaterial = async (
    { key, algorithm, name, isReserved, projectId, orgId, keyUsage, kmipMetadata }: TImportKeyMaterialDTO,
    tx?: Knex
  ) => {
    // daniel: currently we only support imports for encrypt/decrypt keys
    verifyKeyTypeAndAlgorithm(keyUsage, algorithm, { forceType: KmsKeyUsage.ENCRYPT_DECRYPT });

    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

    const encryptedKeyMaterial = cipher.encrypt(key, ROOT_ENCRYPTION_KEY);
    const sanitizedName = name ? slugify(name) : slugify(alphaNumericNanoId(8).toLowerCase());
    const dbQuery = async (db: Knex) => {
      const kmsDoc = await kmsDAL.create(
        {
          name: sanitizedName,
          keyUsage: KmsKeyUsage.ENCRYPT_DECRYPT,
          orgId,
          isReserved,
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

    if (!kmsDoc.internalKms) {
      throw new BadRequestError({ message: `Internal KMS record not found for key '${kmsId}'` });
    }

    const encryptionAlgorithm = kmsDoc.internalKms.encryptionAlgorithm as AsymmetricKeyAlgorithm;

    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.SIGN_VERIFY
    });

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const kmsKey = keyCipher.decrypt(kmsDoc.internalKms.encryptedKey, ROOT_ENCRYPTION_KEY);

    return signingService(encryptionAlgorithm).getPublicKeyFromPrivateKey(kmsKey);
  };

  const signWithKmsKey = async ({ kmsId }: Pick<TSignWithKmsDTO, "kmsId">) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) {
      throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    }

    if (!kmsDoc.internalKms) {
      throw new BadRequestError({ message: `Internal KMS record not found for key '${kmsId}'` });
    }

    const encryptionAlgorithm = kmsDoc.internalKms.encryptionAlgorithm as AsymmetricKeyAlgorithm;
    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.SIGN_VERIFY
    });

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const { sign } = signingService(encryptionAlgorithm);
    const { encryptedKey } = kmsDoc.internalKms;

    return async ({
      data,
      signingAlgorithm,
      isDigest
    }: Pick<TSignWithKmsDTO, "data" | "signingAlgorithm" | "isDigest">) => {
      const kmsKey = keyCipher.decrypt(encryptedKey, ROOT_ENCRYPTION_KEY);
      const signature = await sign(data, kmsKey, signingAlgorithm, isDigest);

      return { signature, algorithm: signingAlgorithm };
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

    if (!kmsDoc.internalKms) {
      throw new BadRequestError({ message: `Internal KMS record not found for key '${kmsId}'` });
    }

    const encryptionAlgorithm = kmsDoc.internalKms.encryptionAlgorithm as AsymmetricKeyAlgorithm;
    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.SIGN_VERIFY
    });

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const { verify, getPublicKeyFromPrivateKey } = signingService(encryptionAlgorithm);
    const { encryptedKey } = kmsDoc.internalKms;

    return async ({ data, signature, isDigest }: Pick<TVerifyWithKmsDTO, "data" | "signature" | "isDigest">) => {
      const kmsKey = keyCipher.decrypt(encryptedKey, ROOT_ENCRYPTION_KEY);

      const publicKey = getPublicKeyFromPrivateKey(kmsKey);
      const signatureValid = await verify(data, signature, publicKey, signingAlgorithm, isDigest);
      return { signatureValid, algorithm: signingAlgorithm };
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
        throw new BadRequestError({ message: `Invalid organization KMS configuration for key '${kmsId}'` });
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

    // internal KMS
    if (!kmsDoc.internalKms) {
      throw new BadRequestError({ message: `Internal KMS record not found for key '${kmsId}'` });
    }

    const encryptionAlgorithm = kmsDoc.internalKms.encryptionAlgorithm as SymmetricKeyAlgorithm;
    verifyKeyTypeAndAlgorithm(kmsDoc.keyUsage as KmsKeyUsage, encryptionAlgorithm, {
      forceType: KmsKeyUsage.ENCRYPT_DECRYPT
    });

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const dataCipher = symmetricCipherService(encryptionAlgorithm);
    const { encryptedKey, version: currentKeyVersion } = kmsDoc.internalKms;

    return ({ plainText }: Pick<TEncryptWithKmsDTO, "plainText">) => {
      const kmsKey = keyCipher.decrypt(encryptedKey, ROOT_ENCRYPTION_KEY);
      const encryptedPlainTextBlob = dataCipher.encrypt(plainText, kmsKey);
      const header = createV02Header(currentKeyVersion);
      const cipherTextBlob = Buffer.concat([header, encryptedPlainTextBlob]);

      return { cipherTextBlob };
    };
  };

  const $getOrgKmsDataKey = async (orgId: string, trx?: Knex) => {
    const kmsKeyId = await getOrgKmsKeyId(orgId, trx);
    let org = await orgDAL.findById(orgId, trx);

    if (!org) {
      throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
    }

    if (!org.kmsEncryptedDataKey) {
      const lock = await keyStore
        .acquireLock([KeyStorePrefixes.KmsOrgDataKeyCreation, orgId], 500, { retryCount: 0 })
        .catch(() => null);

      try {
        if (!lock) {
          await keyStore.waitTillReady({
            key: `${KeyStorePrefixes.WaitUntilReadyKmsOrgDataKeyCreation}${orgId}`,
            keyCheckCb: (val) => val === "true",
            waitingCb: () => logger.info("KMS. Waiting for org data key to be created")
          });

          org = await orgDAL.findById(orgId, trx);
        } else {
          const orgDataKey = await (trx || orgDAL).transaction(async (tx) => {
            org = await orgDAL.findById(orgId, tx);
            if (org.kmsEncryptedDataKey) {
              return;
            }

            const dataKey = crypto.randomBytes(32);
            const kmsEncryptor = await encryptWithKmsKey(
              {
                kmsId: kmsKeyId
              },
              tx
            );

            const { cipherTextBlob } = await kmsEncryptor({
              plainText: dataKey
            });

            await orgDAL.updateById(
              org.id,
              {
                kmsEncryptedDataKey: cipherTextBlob
              },
              tx
            );

            await keyStore.setItemWithExpiry(
              `${KeyStorePrefixes.WaitUntilReadyKmsOrgDataKeyCreation}${orgId}`,
              10,
              "true"
            );

            return dataKey;
          });

          if (orgDataKey) {
            return orgDataKey;
          }
        }
      } finally {
        await lock?.release();
      }
    }

    if (!org.kmsEncryptedDataKey) {
      throw new BadRequestError({ message: `Organization '${orgId}' does not have an encrypted data key` });
    }

    const kmsDecryptor = await decryptWithKmsKey({
      kmsId: kmsKeyId,
      tx: trx
    });

    return kmsDecryptor({
      cipherTextBlob: org.kmsEncryptedDataKey
    });
  };

  const getProjectSecretManagerKmsKeyId = async (projectId: string, trx?: Knex) => {
    let project = await projectDAL.findById(projectId, trx);
    if (!project) {
      throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    }

    if (!project.kmsSecretManagerKeyId) {
      const lock = await keyStore
        .acquireLock([KeyStorePrefixes.KmsProjectKeyCreation, projectId], 3000, { retryCount: 0 })
        .catch(() => null);

      try {
        if (!lock) {
          await keyStore.waitTillReady({
            key: `${KeyStorePrefixes.WaitUntilReadyKmsProjectKeyCreation}${projectId}`,
            keyCheckCb: (val) => val === "true",
            waitingCb: () => logger.debug("KMS. Waiting for project key to be created"),
            delay: 500
          });

          project = await projectDAL.findById(projectId);
        } else {
          const kmsKeyId = await (trx || projectDAL).transaction(async (tx) => {
            project = await projectDAL.findById(projectId, tx);
            if (project.kmsSecretManagerKeyId) {
              return project.kmsSecretManagerKeyId;
            }

            const key = await generateKmsKey({
              isReserved: true,
              orgId: project.orgId,
              tx
            });

            await projectDAL.updateById(
              projectId,
              {
                kmsSecretManagerKeyId: key.id
              },
              tx
            );

            return key.id;
          });

          await keyStore.setItemWithExpiry(
            `${KeyStorePrefixes.WaitUntilReadyKmsProjectKeyCreation}${projectId}`,
            10,
            "true"
          );

          return kmsKeyId;
        }
      } finally {
        await lock?.release();
      }
    }

    if (!project.kmsSecretManagerKeyId) {
      throw new BadRequestError({ message: "Missing project KMS key ID" });
    }

    return project.kmsSecretManagerKeyId;
  };

  const $getProjectSecretManagerKmsDataKey = async (projectId: string, trx?: Knex) => {
    const kmsKeyId = await getProjectSecretManagerKmsKeyId(projectId, trx);
    let project = await projectDAL.findById(projectId, trx);

    if (!project.kmsSecretManagerEncryptedDataKey) {
      const lock = await keyStore
        .acquireLock([KeyStorePrefixes.KmsProjectDataKeyCreation, projectId], 3000, { retryCount: 0 })
        .catch((err) => {
          logger.error(err, "KMS. Failed to acquire lock.");
          return null;
        });

      try {
        if (!lock) {
          await keyStore.waitTillReady({
            key: `${KeyStorePrefixes.WaitUntilReadyKmsProjectDataKeyCreation}${projectId}`,
            keyCheckCb: (val) => val === "true",
            waitingCb: () => logger.info("KMS. Waiting for secret manager data key to be created"),
            delay: 500
          });

          project = await projectDAL.findById(projectId, trx);
        } else {
          logger.info(`KMS. Generating KMS key for project ${projectId}`);
          const projectDataKey = await (trx || projectDAL).transaction(async (tx) => {
            project = await projectDAL.findById(projectId, tx);
            if (project.kmsSecretManagerEncryptedDataKey) {
              return project.kmsSecretManagerEncryptedDataKey;
            }

            const dataKey = crypto.randomBytes(32);
            const kmsEncryptor = await encryptWithKmsKey(
              {
                kmsId: kmsKeyId
              },
              tx
            );

            const { cipherTextBlob } = await kmsEncryptor({
              plainText: dataKey
            });

            await projectDAL.updateById(
              projectId,
              {
                kmsSecretManagerEncryptedDataKey: cipherTextBlob
              },
              tx
            );

            await keyStore.setItemWithExpiry(
              `${KeyStorePrefixes.WaitUntilReadyKmsProjectDataKeyCreation}${projectId}`,
              10,
              "true"
            );
            return dataKey;
          });

          if (projectDataKey) {
            return projectDataKey;
          }
        }
      } catch (error) {
        logger.error(
          error,
          `getProjectSecretManagerKmsDataKey: Failed to get project data key for [projectId=${projectId}]`
        );
        throw error;
      } finally {
        await lock?.release();
      }
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
      }
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
    const project = await projectDAL.findById(projectId);
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

  const rotateInternalKmsKey = async (
    kmsKeyId: string,
    options?: {
      isInternalCall?: boolean;
      isManualRotation?: boolean;
      jobId?: string;
    }
  ) => {
    const { isInternalCall = false, isManualRotation = true, jobId } = options ?? {};

    const lock = await keyStore
      .acquireLock([KeyStorePrefixes.KmsKeyRotationLock(kmsKeyId)], KMS_ROTATION_CONSTANTS.LOCK_DURATION_MS, {
        retryCount: KMS_ROTATION_CONSTANTS.LOCK_RETRY_COUNT
      })
      .catch(() => null);

    if (!lock) {
      throw new BadRequestError({
        message: "A rotation is already in progress for this key. Please wait a moment and try again."
      });
    }

    let internalKmsId: string | null = null;

    try {
      // Check cooldown INSIDE lock to prevent race condition
      if (!isInternalCall) {
        const cooldownKey = KeyStorePrefixes.KmsKeyRotationCooldown(kmsKeyId);
        const isInCooldown = await keyStore.getItem(cooldownKey);
        if (isInCooldown) {
          throw new BadRequestError({
            message: "This key was recently rotated. Please wait at least 1 minute between rotations."
          });
        }
      }

      const result = await kmsDAL.transaction(async (tx) => {
        const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsKeyId, tx);

        if (!kmsDoc) {
          throw new NotFoundError({ message: "The requested key could not be found" });
        }
        if (kmsDoc.isExternal || !kmsDoc.internalKms) {
          throw new BadRequestError({
            message:
              "Key rotation is only available for internal KMS keys. External KMS keys are managed by their respective providers."
          });
        }
        if (kmsDoc.isDisabled) {
          throw new BadRequestError({
            message: "Cannot rotate a disabled key. Please enable the key first and try again."
          });
        }
        if (kmsDoc.keyUsage !== KmsKeyUsage.ENCRYPT_DECRYPT) {
          throw new BadRequestError({
            message: "Key rotation is only available for encryption keys. Signing keys cannot be rotated."
          });
        }

        const encryptionAlgorithm = kmsDoc.internalKms.encryptionAlgorithm as SymmetricKeyAlgorithm;
        const currentVersion = kmsDoc.internalKms.version;

        const internalKms = await internalKmsDAL.findByKmsKeyId(kmsKeyId, tx);
        if (!internalKms) {
          throw new NotFoundError({ message: "Internal key data could not be found. Please contact support." });
        }

        internalKmsId = internalKms.id;

        // Check version integrity BEFORE updating status to IN_PROGRESS
        const maxVersionInHistory = await internalKmsDAL.findMaxVersionNumber(internalKms.id, tx);

        if (maxVersionInHistory > 0 && maxVersionInHistory < currentVersion) {
          logger.error(
            { kmsKeyId, currentVersion, maxVersionInHistory },
            "KMS key rotation: Version integrity check failed - maxVersionInHistory is less than currentVersion"
          );
          throw new BadRequestError({
            message: "Unable to rotate key due to a version conflict. Please contact support for assistance."
          });
        }

        // Now safe to update status to IN_PROGRESS
        await internalKmsDAL.updateRotationStatus(
          internalKms.id,
          {
            lastRotationStatus: KmsKeyRotationStatus.IN_PROGRESS,
            lastRotationAttemptedAt: new Date(),
            lastRotationJobId: jobId,
            isLastRotationManual: isManualRotation
          },
          tx
        );

        const newKeyMaterial = crypto.randomBytes(getByteLengthForSymmetricEncryptionAlgorithm(encryptionAlgorithm));
        const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
        const encryptedNewKey = cipher.encrypt(newKeyMaterial, ROOT_ENCRYPTION_KEY);

        const newVersion = Math.max(currentVersion, maxVersionInHistory || 0) + 1;

        const existingVersion = await internalKmsDAL.findKeyVersion(internalKms.id, currentVersion, tx);
        if (!existingVersion) {
          await internalKmsDAL.createKeyVersion(
            {
              encryptedKey: internalKms.encryptedKey,
              version: currentVersion,
              internalKmsId: internalKms.id
            },
            tx
          );
        }

        await internalKmsDAL.createKeyVersion(
          {
            encryptedKey: encryptedNewKey,
            version: newVersion,
            internalKmsId: internalKms.id
          },
          tx
        );

        const nextRotationAt =
          internalKms.isAutoRotationEnabled && internalKms.rotationInterval
            ? new Date(Date.now() + internalKms.rotationInterval * MS_PER_DAY)
            : null;

        // Update version FIRST before deleting old versions to prevent data loss
        const updatedInternalKms = await internalKmsDAL.updateVersionAndRotatedAt(
          internalKms.id,
          {
            encryptedKey: encryptedNewKey,
            version: newVersion,
            rotatedAt: new Date(),
            nextRotationAt
          },
          tx
        );

        // Delete old versions AFTER successfully updating the current version
        const { deletedCount, deletedVersions } = await internalKmsDAL.deleteOldKeyVersions(
          internalKms.id,
          KMS_ROTATION_CONSTANTS.MAX_VERSIONS_TO_RETAIN,
          tx
        );

        if (deletedCount > 0) {
          logger.warn(
            { kmsKeyId, deletedCount, deletedVersions, retainedLimit: KMS_ROTATION_CONSTANTS.MAX_VERSIONS_TO_RETAIN },
            `KMS key rotation: Deleted ${deletedCount} old key versions that exceeded retention limit. Deleted versions: [${deletedVersions.join(", ")}]. Data encrypted with these versions can no longer be decrypted.`
          );
        }

        await internalKmsDAL.updateRotationStatus(
          internalKms.id,
          {
            lastRotationStatus: KmsKeyRotationStatus.COMPLETED,
            lastRotationAttemptedAt: new Date(),
            lastRotationJobId: jobId,
            encryptedLastRotationMessage: null,
            isLastRotationManual: isManualRotation
          },
          tx
        );

        return {
          kmsKeyId,
          version: newVersion,
          rotatedAt: updatedInternalKms.rotatedAt,
          deletedVersions,
          deletedVersionCount: deletedCount,
          isAutoRotation: !isManualRotation
        };
      });

      await keyStore.setItemWithExpiry(
        KeyStorePrefixes.KmsKeyRotationCooldown(kmsKeyId),
        KeyStoreTtls.KmsKeyRotationCooldownInSeconds,
        "1"
      );

      return result;
    } catch (error) {
      // Update rotation status to failed if we have the internalKmsId
      if (internalKmsId) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error during key rotation";
        const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
        const encryptedErrorMessage = cipher.encrypt(Buffer.from(errorMessage, "utf8"), ROOT_ENCRYPTION_KEY);

        await internalKmsDAL
          .updateRotationStatus(internalKmsId, {
            lastRotationStatus: KmsKeyRotationStatus.FAILED,
            lastRotationAttemptedAt: new Date(),
            lastRotationJobId: jobId,
            encryptedLastRotationMessage: encryptedErrorMessage,
            isLastRotationManual: isManualRotation
          })
          .catch((statusErr) => {
            logger.error(statusErr, `Failed to update rotation status to FAILED [kmsKeyId=${kmsKeyId}]`);
          });
      }
      throw error;
    } finally {
      await lock.release().catch((err) => {
        logger.error(err, `Failed to release lock for key rotation [kmsKeyId=${kmsKeyId}]`);
      });
    }
  };

  const updateScheduledRotation = async (
    kmsKeyId: string,
    data: {
      enableAutoRotation: boolean;
      rotationIntervalDays?: number;
    }
  ) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsKeyId);

    if (!kmsDoc) {
      throw new NotFoundError({ message: "The requested key could not be found" });
    }
    if (kmsDoc.isExternal || !kmsDoc.internalKms) {
      throw new BadRequestError({
        message:
          "Scheduled rotation is only available for internal KMS keys. External KMS keys are managed by their respective providers."
      });
    }
    if (kmsDoc.isDisabled) {
      throw new BadRequestError({
        message: "Cannot configure rotation for a disabled key. Please enable the key first and try again."
      });
    }
    if (kmsDoc.keyUsage !== KmsKeyUsage.ENCRYPT_DECRYPT) {
      throw new BadRequestError({
        message: "Scheduled rotation is only available for encryption keys. Signing keys cannot be rotated."
      });
    }

    let nextRotationAt: Date | null = null;
    let rotationInterval: number | null = null;

    if (data.enableAutoRotation) {
      if (!data.rotationIntervalDays || data.rotationIntervalDays < KMS_ROTATION_CONSTANTS.MIN_INTERVAL_DAYS) {
        throw new BadRequestError({
          message: `Rotation interval must be at least ${KMS_ROTATION_CONSTANTS.MIN_INTERVAL_DAYS} day(s)`
        });
      }
      if (data.rotationIntervalDays > KMS_ROTATION_CONSTANTS.MAX_INTERVAL_DAYS) {
        throw new BadRequestError({
          message: `Rotation interval cannot exceed ${KMS_ROTATION_CONSTANTS.MAX_INTERVAL_DAYS} days (1 year)`
        });
      }
      rotationInterval = data.rotationIntervalDays;
      nextRotationAt = new Date(Date.now() + data.rotationIntervalDays * MS_PER_DAY);
    }

    return kmsDAL.transaction(async (tx) => {
      const internalKms = await internalKmsDAL.findByKmsKeyId(kmsKeyId, tx);
      if (!internalKms) {
        throw new NotFoundError({ message: "Internal key data could not be found. Please contact support." });
      }

      const updatedInternalKms = await internalKmsDAL.updateScheduledRotation(
        internalKms.id,
        {
          rotationInterval,
          nextRotationAt,
          isAutoRotationEnabled: data.enableAutoRotation
        },
        tx
      );

      return {
        kmsKeyId,
        isAutoRotationEnabled: updatedInternalKms.isAutoRotationEnabled,
        rotationIntervalDays: updatedInternalKms.rotationInterval,
        nextRotationAt: updatedInternalKms.nextRotationAt
      };
    });
  };

  const getScheduledRotation = async (kmsKeyId: string) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsKeyId);

    if (!kmsDoc) {
      throw new NotFoundError({ message: "The requested key could not be found" });
    }
    if (kmsDoc.isExternal || !kmsDoc.internalKms) {
      throw new BadRequestError({
        message:
          "Scheduled rotation is only available for internal KMS keys. External KMS keys are managed by their respective providers."
      });
    }

    return {
      kmsKeyId,
      isAutoRotationEnabled: kmsDoc.internalKms.isAutoRotationEnabled,
      rotationIntervalDays: kmsDoc.internalKms.rotationInterval,
      nextRotationAt: kmsDoc.internalKms.nextRotationAt,
      lastRotatedAt: kmsDoc.internalKms.rotatedAt
    };
  };

  const rollbackInternalKmsKey = async (kmsKeyId: string, targetVersion: number) => {
    const lock = await keyStore
      .acquireLock([KeyStorePrefixes.KmsKeyRotationLock(kmsKeyId)], KMS_ROTATION_CONSTANTS.LOCK_DURATION_MS, {
        retryCount: KMS_ROTATION_CONSTANTS.LOCK_RETRY_COUNT
      })
      .catch(() => null);

    if (!lock) {
      throw new BadRequestError({
        message: "Another key operation is currently in progress. Please wait a moment and try again."
      });
    }

    try {
      if (targetVersion < 1) {
        throw new BadRequestError({ message: "Invalid version number. Version must be 1 or greater." });
      }

      return kmsDAL.transaction(async (tx) => {
        const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsKeyId, tx);

        if (!kmsDoc) {
          throw new NotFoundError({ message: "The requested key could not be found" });
        }
        if (kmsDoc.isExternal || !kmsDoc.internalKms) {
          throw new BadRequestError({
            message:
              "Key rollback is only available for internal KMS keys. External KMS keys are managed by their respective providers."
          });
        }
        if (kmsDoc.isDisabled) {
          throw new BadRequestError({
            message: "Cannot rollback a disabled key. Please enable the key first and try again."
          });
        }
        if (kmsDoc.keyUsage !== KmsKeyUsage.ENCRYPT_DECRYPT) {
          throw new BadRequestError({
            message: "Key rollback is only available for encryption keys. Signing keys cannot be rolled back."
          });
        }

        const currentVersion = kmsDoc.internalKms.version;

        if (targetVersion === currentVersion) {
          throw new BadRequestError({
            message: "The selected version is already the active version. Please choose a different version."
          });
        }

        const internalKms = await internalKmsDAL.findByKmsKeyId(kmsKeyId, tx);
        if (!internalKms) {
          throw new NotFoundError({ message: "Internal key data could not be found. Please contact support." });
        }

        const targetVersionRecord = await internalKmsDAL.findKeyVersion(internalKms.id, targetVersion, tx);
        if (!targetVersionRecord) {
          throw new NotFoundError({
            message: `Version ${targetVersion} is no longer available. Only the last ${KMS_ROTATION_CONSTANTS.MAX_VERSIONS_TO_RETAIN} versions are retained.`
          });
        }

        const existingCurrentVersion = await internalKmsDAL.findKeyVersion(internalKms.id, currentVersion, tx);
        if (!existingCurrentVersion) {
          await internalKmsDAL.createKeyVersion(
            {
              encryptedKey: internalKms.encryptedKey,
              version: currentVersion,
              internalKmsId: internalKms.id
            },
            tx
          );
        }

        await internalKmsDAL.updateVersionAndRotatedAt(
          internalKms.id,
          {
            encryptedKey: targetVersionRecord.encryptedKey,
            version: targetVersion
          },
          tx
        );

        logger.info(
          { kmsKeyId, targetVersion, previousVersion: currentVersion },
          "KMS key rollback: Key rolled back to previous version"
        );

        return {
          kmsKeyId,
          version: targetVersion,
          previousVersion: currentVersion
        };
      });
    } finally {
      await lock.release().catch((err) => {
        logger.error(err, `Failed to release lock for key rollback [kmsKeyId=${kmsKeyId}]`);
      });
    }
  };

  const listInternalKmsKeyVersions = async (kmsKeyId: string) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsKeyId);

    if (!kmsDoc) {
      throw new NotFoundError({ message: "The requested key could not be found" });
    }
    if (kmsDoc.isExternal || !kmsDoc.internalKms) {
      throw new BadRequestError({
        message:
          "Version history is only available for internal KMS keys. External KMS keys are managed by their respective providers."
      });
    }

    const versions = await internalKmsDAL.findAllKeyVersions(kmsDoc.internalKms.id);

    return {
      kmsKeyId,
      currentVersion: kmsDoc.internalKms.version,
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        createdAt: v.createdAt
      }))
    };
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
    importKeyMaterial,
    signWithKmsKey,
    verifyWithKmsKey,
    getPublicKey,
    rotateInternalKmsKey,
    listInternalKmsKeyVersions,
    updateScheduledRotation,
    getScheduledRotation,
    rollbackInternalKmsKey
  };
};
