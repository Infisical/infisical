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
import { KeyStorePrefixes, PgSqlLock, TKeyStoreFactory } from "@app/keystore/keystore";
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
  KmsKeyUsage,
  KmsType,
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
  TVerifyWithKmsDTO
} from "./kms-types";

type TKmsServiceFactoryDep = {
  kmsDAL: TKmsKeyDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById" | "updateById" | "transaction">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "updateById" | "transaction">;
  kmsRootConfigDAL: Pick<TKmsRootConfigDALFactory, "findById" | "create" | "updateById" | "transaction">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "waitTillReady" | "setItemWithExpiry">;
  internalKmsDAL: Pick<TInternalKmsDALFactory, "create">;
  hsmService: THsmServiceFactory;
  envConfig: Pick<TEnvConfig, "ENCRYPTION_KEY" | "ROOT_ENCRYPTION_KEY">;
};

export type TKmsServiceFactory = ReturnType<typeof kmsServiceFactory>;

// akhilmhdh: Don't edit this value. This is measured for blob concatination in kms
const KMS_VERSION = "v01";
const KMS_VERSION_BLOB_LENGTH = 3;
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
      throw new BadRequestError({ message: "Invalid organization KMS" });
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
    const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

    return ({ cipherTextBlob: versionedCipherTextBlob }: Pick<TDecryptWithKmsDTO, "cipherTextBlob">) => {
      const cipherTextBlob = versionedCipherTextBlob.subarray(0, -KMS_VERSION_BLOB_LENGTH);
      const decryptedBlob = dataCipher.decrypt(cipherTextBlob, kmsKey);
      return Promise.resolve(decryptedBlob);
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

    const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

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

      const publicKey = getPublicKeyFromPrivateKey(kmsKey);
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
    return ({ plainText }: Pick<TEncryptWithKmsDTO, "plainText">) => {
      const kmsKey = keyCipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);
      const encryptedPlainTextBlob = dataCipher.encrypt(plainText, kmsKey);

      // Buffer#1 encrypted text + Buffer#2 version number
      const versionBlob = Buffer.from(KMS_VERSION, "utf8"); // length is 3
      const cipherTextBlob = Buffer.concat([encryptedPlainTextBlob, versionBlob]);

      return Promise.resolve({ cipherTextBlob });
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
    getPublicKey
  };
};
