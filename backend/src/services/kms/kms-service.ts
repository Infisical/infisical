import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";
import { z } from "zod";

import { KmsKeysSchema } from "@app/db/schemas";
import { AwsKmsProviderFactory } from "@app/ee/services/external-kms/providers/aws-kms";
import {
  ExternalKmsAwsSchema,
  KmsProviders,
  TExternalKmsProviderFns
} from "@app/ee/services/external-kms/providers/model";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { randomSecureBytes } from "@app/lib/crypto";
import { symmetricCipherService, SymmetricEncryption } from "@app/lib/crypto/cipher";
import { generateHash } from "@app/lib/crypto/encryption";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TInternalKmsDALFactory } from "./internal-kms-dal";
import { TKmsKeyDALFactory } from "./kms-key-dal";
import { TKmsRootConfigDALFactory } from "./kms-root-config-dal";
import {
  KmsDataKey,
  KmsType,
  TDecryptWithKeyDTO,
  TDecryptWithKmsDTO,
  TEncryptionWithKeyDTO,
  TEncryptWithKmsDataKeyDTO,
  TEncryptWithKmsDTO,
  TGenerateKMSDTO,
  TUpdateProjectSecretManagerKmsKeyDTO
} from "./kms-types";

type TKmsServiceFactoryDep = {
  kmsDAL: TKmsKeyDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById" | "updateById" | "transaction">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "updateById" | "transaction">;
  kmsRootConfigDAL: Pick<TKmsRootConfigDALFactory, "findById" | "create">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "waitTillReady" | "setItemWithExpiry">;
  internalKmsDAL: Pick<TInternalKmsDALFactory, "create">;
};

export type TKmsServiceFactory = ReturnType<typeof kmsServiceFactory>;

const KMS_ROOT_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";

const KMS_ROOT_CREATION_WAIT_KEY = "wait_till_ready_kms_root_key";
const KMS_ROOT_CREATION_WAIT_TIME = 10;

// akhilmhdh: Don't edit this value. This is measured for blob concatination in kms
const KMS_VERSION = "v01";
const KMS_VERSION_BLOB_LENGTH = 3;
const KmsSanitizedSchema = KmsKeysSchema.extend({ isExternal: z.boolean() });

export const kmsServiceFactory = ({
  kmsDAL,
  kmsRootConfigDAL,
  keyStore,
  internalKmsDAL,
  orgDAL,
  projectDAL
}: TKmsServiceFactoryDep) => {
  let ROOT_ENCRYPTION_KEY = Buffer.alloc(0);

  /*
   * Generate KMS Key
   * This function is responsibile for generating the infisical internal KMS for various entities
   * Like for secret manager, cert manager or for organization
   */
  const generateKmsKey = async ({ orgId, isReserved = true, tx, slug }: TGenerateKMSDTO) => {
    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);
    const kmsKeyMaterial = randomSecureBytes(32);
    const encryptedKeyMaterial = cipher.encrypt(kmsKeyMaterial, ROOT_ENCRYPTION_KEY);
    const sanitizedSlug = slug ? slugify(slug) : slugify(alphaNumericNanoId(8).toLowerCase());
    const dbQuery = async (db: Knex) => {
      const kmsDoc = await kmsDAL.create(
        {
          slug: sanitizedSlug,
          orgId,
          isReserved
        },
        db
      );

      await internalKmsDAL.create(
        {
          version: 1,
          encryptedKey: encryptedKeyMaterial,
          encryptionAlgorithm: SymmetricEncryption.AES_GCM_256,
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
    if (kms.orgId !== orgId) throw new BadRequestError({ message: "KMS doesn't belong to organization" });
    return kmsDAL.deleteById(kmsId, tx);
  };

  /*
   * Simple encryption service function to do all the encryption tasks in infisical
   * This can be even later exposed directly as api for encryption as function
   * The encrypted binary even has everything into it. The IV, the version etc
   */
  const encryptWithInputKey = async ({ key }: Omit<TEncryptionWithKeyDTO, "plainText">) => {
    // akhilmhdh: as more encryption are added do a check here on kmsDoc.encryptionAlgorithm
    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);
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
    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);

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
  const getOrgKmsKeyId = async (orgId: string) => {
    let org = await orgDAL.findById(orgId);

    if (!org) {
      throw new NotFoundError({ message: "Org not found" });
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

          org = await orgDAL.findById(orgId);
        } else {
          const keyId = await orgDAL.transaction(async (tx) => {
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
      throw new Error("Invalid organization KMS");
    }

    return org.kmsDefaultKeyId;
  };

  const decryptWithKmsKey = async ({
    kmsId,
    depth = 0
  }: Omit<TDecryptWithKmsDTO, "cipherTextBlob"> & { depth?: number }) => {
    if (depth > 2) throw new BadRequestError({ message: "KMS depth max limit" });

    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) {
      throw new NotFoundError({ message: "KMS ID not found" });
    }

    if (kmsDoc.externalKms) {
      let externalKms: TExternalKmsProviderFns;

      if (!kmsDoc.orgKms.id || !kmsDoc.orgKms.encryptedDataKey) {
        throw new Error("Invalid organization KMS");
      }

      // The idea is external kms connection info is encrypted by an org default KMS
      // This could be external kms(in future) but at the end of the day, the end KMS will be an infisical internal one
      // we put a limit of depth to avoid too many cycles
      const orgKmsDecryptor = await decryptWithKmsKey({
        kmsId: kmsDoc.orgKms.id,
        depth: depth + 1
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
        default:
          throw new Error("Invalid KMS provider.");
      }

      return async ({ cipherTextBlob }: Pick<TDecryptWithKmsDTO, "cipherTextBlob">) => {
        const { data } = await externalKms.decrypt(cipherTextBlob);

        return data;
      };
    }

    // internal KMS
    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);
    const kmsKey = cipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

    return ({ cipherTextBlob: versionedCipherTextBlob }: Pick<TDecryptWithKmsDTO, "cipherTextBlob">) => {
      const cipherTextBlob = versionedCipherTextBlob.subarray(0, -KMS_VERSION_BLOB_LENGTH);
      const decryptedBlob = cipher.decrypt(cipherTextBlob, kmsKey);
      return Promise.resolve(decryptedBlob);
    };
  };

  const encryptWithKmsKey = async ({ kmsId }: Omit<TEncryptWithKmsDTO, "plainText">, tx?: Knex) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId, tx);
    if (!kmsDoc) {
      throw new NotFoundError({ message: "KMS ID not found" });
    }

    if (kmsDoc.externalKms) {
      let externalKms: TExternalKmsProviderFns;
      if (!kmsDoc.orgKms.id || !kmsDoc.orgKms.encryptedDataKey) {
        throw new Error("Invalid organization KMS");
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
        default:
          throw new Error("Invalid KMS provider.");
      }

      return async ({ plainText }: Pick<TEncryptWithKmsDTO, "plainText">) => {
        const { encryptedBlob } = await externalKms.encrypt(plainText);

        return { cipherTextBlob: encryptedBlob };
      };
    }

    // internal KMS
    // akhilmhdh: as more encryption are added do a check here on kmsDoc.encryptionAlgorithm
    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);
    return ({ plainText }: Pick<TEncryptWithKmsDTO, "plainText">) => {
      const kmsKey = cipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);
      const encryptedPlainTextBlob = cipher.encrypt(plainText, kmsKey);

      // Buffer#1 encrypted text + Buffer#2 version number
      const versionBlob = Buffer.from(KMS_VERSION, "utf8"); // length is 3
      const cipherTextBlob = Buffer.concat([encryptedPlainTextBlob, versionBlob]);

      return Promise.resolve({ cipherTextBlob });
    };
  };

  const $getOrgKmsDataKey = async (orgId: string) => {
    const kmsKeyId = await getOrgKmsKeyId(orgId);
    let org = await orgDAL.findById(orgId);

    if (!org) {
      throw new NotFoundError({ message: "Org not found" });
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

          org = await orgDAL.findById(orgId);
        } else {
          const orgDataKey = await orgDAL.transaction(async (tx) => {
            org = await orgDAL.findById(orgId, tx);
            if (org.kmsEncryptedDataKey) {
              return;
            }

            const dataKey = randomSecureBytes();
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
      throw new Error("Invalid organization KMS");
    }

    const kmsDecryptor = await decryptWithKmsKey({
      kmsId: kmsKeyId
    });

    return kmsDecryptor({
      cipherTextBlob: org.kmsEncryptedDataKey
    });
  };

  const getProjectSecretManagerKmsKeyId = async (projectId: string) => {
    let project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({ message: "Project not found" });
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
          const kmsKeyId = await projectDAL.transaction(async (tx) => {
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
      throw new Error("Missing project KMS key ID");
    }

    return project.kmsSecretManagerKeyId;
  };

  const $getProjectSecretManagerKmsDataKey = async (projectId: string) => {
    const kmsKeyId = await getProjectSecretManagerKmsKeyId(projectId);
    let project = await projectDAL.findById(projectId);

    if (!project.kmsSecretManagerEncryptedDataKey) {
      const lock = await keyStore
        .acquireLock([KeyStorePrefixes.KmsProjectDataKeyCreation, projectId], 3000, { retryCount: 0 })
        .catch(() => null);

      try {
        if (!lock) {
          await keyStore.waitTillReady({
            key: `${KeyStorePrefixes.WaitUntilReadyKmsProjectDataKeyCreation}${projectId}`,
            keyCheckCb: (val) => val === "true",
            waitingCb: () => logger.debug("KMS. Waiting for secret manager data key to be created"),
            delay: 500
          });

          project = await projectDAL.findById(projectId);
        } else {
          const projectDataKey = await projectDAL.transaction(async (tx) => {
            project = await projectDAL.findById(projectId, tx);
            if (project.kmsSecretManagerEncryptedDataKey) {
              return;
            }

            const dataKey = randomSecureBytes();
            const kmsEncryptor = await encryptWithKmsKey({
              kmsId: kmsKeyId
            });

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
      } finally {
        await lock?.release();
      }
    }

    if (!project.kmsSecretManagerEncryptedDataKey) {
      throw new Error("Missing project data key");
    }

    const kmsDecryptor = await decryptWithKmsKey({
      kmsId: kmsKeyId
    });

    return kmsDecryptor({
      cipherTextBlob: project.kmsSecretManagerEncryptedDataKey
    });
  };

  const $getDataKey = async (dto: TEncryptWithKmsDataKeyDTO) => {
    switch (dto.type) {
      case KmsDataKey.SecretManager: {
        return $getProjectSecretManagerKmsDataKey(dto.projectId);
      }
      default: {
        return $getOrgKmsDataKey(dto.orgId);
      }
    }
  };

  // by keeping the decrypted data key in inner scope
  // none of the entities outside can interact directly or expose the data key
  // NOTICE: If changing here update migrations/utils/kms
  const createCipherPairWithDataKey = async (encryptionContext: TEncryptWithKmsDataKeyDTO) => {
    const dataKey = await $getDataKey(encryptionContext);
    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);

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
          message: "Project not found."
        });
      }
      const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
      if (!kmsDoc) {
        throw new NotFoundError({ message: "KMS ID not found." });
      }

      if (kmsDoc.orgId !== project.orgId) {
        throw new BadRequestError({
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
        message: "Project not found"
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

    const verificationHash = generateHash(secretManagerBackup);
    secretManagerBackup = `${secretManagerBackup}.${verificationHash}`;

    return {
      secretManager: secretManagerBackup
    };
  };

  const loadProjectKeyBackup = async (projectId: string, backup: string) => {
    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({
        message: "Project not found"
      });
    }

    const [, backupProjectId, , backupKmsKeyId, backupBase64EncryptedDataKey, backupHash] = backup.split(".");
    const computedHash = generateHash(backup.substring(0, backup.lastIndexOf(".")));
    if (computedHash !== backupHash) {
      throw new BadRequestError({
        message: "Invalid backup"
      });
    }

    if (backupProjectId !== projectId) {
      throw new BadRequestError({
        message: "Invalid backup for project"
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
        message: "KMS not found"
      });
    }
    const { id, slug, orgId, isExternal } = kms;
    return { id, slug, orgId, isExternal };
  };

  // akhilmhdh: a copy of this is made in migrations/utils/kms
  const startService = async () => {
    const appCfg = getConfig();
    // This will switch to a seal process and HMS flow in future
    const encryptionKey = appCfg.ENCRYPTION_KEY || appCfg.ROOT_ENCRYPTION_KEY;
    // if root key its base64 encoded
    const isBase64 = !appCfg.ENCRYPTION_KEY;
    if (!encryptionKey) throw new Error("Root encryption key not found for KMS service.");
    const encryptionKeyBuffer = Buffer.from(encryptionKey, isBase64 ? "base64" : "utf8");

    const lock = await keyStore.acquireLock([`KMS_ROOT_CFG_LOCK`], 3000, { retryCount: 3 }).catch(() => null);
    if (!lock) {
      await keyStore.waitTillReady({
        key: KMS_ROOT_CREATION_WAIT_KEY,
        keyCheckCb: (val) => val === "true",
        waitingCb: () => logger.info("KMS. Waiting for leader to finish creation of KMS Root Key")
      });
    }

    // check if KMS root key was already generated and saved in DB
    const kmsRootConfig = await kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID);
    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);
    if (kmsRootConfig) {
      if (lock) await lock.release();
      logger.info("KMS: Encrypted ROOT Key found from DB. Decrypting.");
      const decryptedRootKey = cipher.decrypt(kmsRootConfig.encryptedRootKey, encryptionKeyBuffer);
      // set the flag so that other instancen nodes can start
      await keyStore.setItemWithExpiry(KMS_ROOT_CREATION_WAIT_KEY, KMS_ROOT_CREATION_WAIT_TIME, "true");
      logger.info("KMS: Loading ROOT Key into Memory.");
      ROOT_ENCRYPTION_KEY = decryptedRootKey;
      return;
    }

    logger.info("KMS: Generating ROOT Key");
    const newRootKey = randomSecureBytes(32);
    const encryptedRootKey = cipher.encrypt(newRootKey, encryptionKeyBuffer);
    // @ts-expect-error id is kept as fixed for idempotence and to avoid race condition
    await kmsRootConfigDAL.create({ encryptedRootKey, id: KMS_ROOT_CONFIG_UUID });

    // set the flag so that other instancen nodes can start
    await keyStore.setItemWithExpiry(KMS_ROOT_CREATION_WAIT_KEY, KMS_ROOT_CREATION_WAIT_TIME, "true");
    logger.info("KMS: Saved and loaded ROOT Key into memory");
    if (lock) await lock.release();
    ROOT_ENCRYPTION_KEY = newRootKey;
  };

  return {
    startService,
    generateKmsKey,
    deleteInternalKms,
    encryptWithKmsKey,
    decryptWithKmsKey,
    encryptWithInputKey,
    decryptWithInputKey,
    getOrgKmsKeyId,
    getProjectSecretManagerKmsKeyId,
    updateProjectSecretManagerKmsKey,
    getProjectKeyBackup,
    loadProjectKeyBackup,
    getKmsById,
    createCipherPairWithDataKey
  };
};
