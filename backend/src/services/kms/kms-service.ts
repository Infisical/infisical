import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

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
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TInternalKmsDALFactory } from "./internal-kms-dal";
import { TKmsKeyDALFactory } from "./kms-key-dal";
import { TKmsRootConfigDALFactory } from "./kms-root-config-dal";
import {
  TDecryptWithKeyDTO,
  TDecryptWithKmsDTO,
  TEncryptionWithKeyDTO,
  TEncryptWithKmsDTO,
  TGenerateKMSDTO
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

const INTERNAL_KMS_KEY_ID = "internal";
const KMS_ROOT_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";

const KMS_ROOT_CREATION_WAIT_KEY = "wait_till_ready_kms_root_key";
const KMS_ROOT_CREATION_WAIT_TIME = 10;

// akhilmhdh: Don't edit this value. This is measured for blob concatination in kms
const KMS_VERSION = "v01";
const KMS_VERSION_BLOB_LENGTH = 3;
export const kmsServiceFactory = ({
  kmsDAL,
  kmsRootConfigDAL,
  keyStore,
  internalKmsDAL,
  orgDAL,
  projectDAL
}: TKmsServiceFactoryDep) => {
  let ROOT_ENCRYPTION_KEY = Buffer.alloc(0);

  // this is used symmetric encryption
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

  const decryptWithInputKey = async ({ key }: Omit<TDecryptWithKeyDTO, "cipherTextBlob">) => {
    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);

    return ({ cipherTextBlob: versionedCipherTextBlob }: Pick<TDecryptWithKeyDTO, "cipherTextBlob">) => {
      const cipherTextBlob = versionedCipherTextBlob.subarray(0, -KMS_VERSION_BLOB_LENGTH);
      const decryptedBlob = cipher.decrypt(cipherTextBlob, key);
      return decryptedBlob;
    };
  };

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

  const decryptWithKmsKey = async ({ kmsId }: Omit<TDecryptWithKmsDTO, "cipherTextBlob">) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
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

  const getOrgKmsDataKey = async (orgId: string) => {
    const kmsKeyId = await getOrgKmsKeyId(orgId);
    let org = await orgDAL.findById(orgId);

    if (!org) {
      throw new NotFoundError({ message: "Org not found" });
    }

    if (!org.kmsEncryptedDataKey) {
      const lock = await keyStore
        .acquireLock([KeyStorePrefixes.KmsOrgDataKeyCreation, orgId], 3000, { retryCount: 3 })
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
        .acquireLock([KeyStorePrefixes.KmsProjectKeyCreation, projectId], 3000, { retryCount: 3 })
        .catch(() => null);

      try {
        if (!lock) {
          await keyStore.waitTillReady({
            key: `${KeyStorePrefixes.WaitUntilReadyKmsProjectKeyCreation}${projectId}`,
            keyCheckCb: (val) => val === "true",
            waitingCb: () => logger.info("KMS. Waiting for project key to be created")
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

  const getProjectSecretManagerKmsKey = async (projectId: string) => {
    const kmsKeyId = await getProjectSecretManagerKmsKeyId(projectId);
    const kmsKey = await kmsDAL.findByIdWithAssociatedKms(kmsKeyId);

    return kmsKey;
  };

  const getProjectSecretManagerKmsDataKey = async (projectId: string) => {
    const kmsKeyId = await getProjectSecretManagerKmsKeyId(projectId);
    let project = await projectDAL.findById(projectId);

    if (!project.kmsSecretManagerEncryptedDataKey) {
      const lock = await keyStore
        .acquireLock([KeyStorePrefixes.KmsProjectDataKeyCreation, projectId], 3000, { retryCount: 3 })
        .catch(() => null);

      try {
        if (!lock) {
          await keyStore.waitTillReady({
            key: `${KeyStorePrefixes.WaitUntilReadyKmsProjectDataKeyCreation}${projectId}`,
            keyCheckCb: (val) => val === "true",
            waitingCb: () => logger.info("KMS. Waiting for project data key to be created")
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

  const updateProjectSecretManagerKmsKey = async (projectId: string, kmsId: string) => {
    const currentKms = await getProjectSecretManagerKmsKey(projectId);

    if ((currentKms.isReserved && kmsId === INTERNAL_KMS_KEY_ID) || currentKms.id === kmsId) {
      return currentKms;
    }

    if (kmsId !== INTERNAL_KMS_KEY_ID) {
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

    const dataKey = await getProjectSecretManagerKmsDataKey(projectId);

    return kmsDAL.transaction(async (tx) => {
      const project = await projectDAL.findById(projectId, tx);
      let newKmsId = kmsId;

      if (newKmsId === INTERNAL_KMS_KEY_ID) {
        const key = await generateKmsKey({
          isReserved: true,
          orgId: project.orgId,
          tx
        });

        newKmsId = key.id;
      }

      const kmsEncryptor = await encryptWithKmsKey({ kmsId: newKmsId }, tx);
      const { cipherTextBlob } = await kmsEncryptor({ plainText: dataKey });
      await projectDAL.updateById(
        projectId,
        {
          kmsSecretManagerKeyId: newKmsId,
          kmsSecretManagerEncryptedDataKey: cipherTextBlob
        },
        tx
      );

      if (currentKms.isReserved) {
        await kmsDAL.deleteById(currentKms.id, tx);
      }

      return kmsDAL.findByIdWithAssociatedKms(newKmsId, tx);
    });
  };

  const getProjectKeyBackup = async (projectId: string) => {
    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({
        message: "Project not found"
      });
    }

    const secretManagerDataKey = await getProjectSecretManagerKmsDataKey(projectId);
    const kmsKeyIdForEncrypt = await getOrgKmsKeyId(project.orgId);
    const kmsEncryptor = await encryptWithKmsKey({ kmsId: kmsKeyIdForEncrypt });
    const { cipherTextBlob: encryptedSecretManagerDataKey } = await kmsEncryptor({ plainText: secretManagerDataKey });

    // format: version.projectId.kmsFunction.kmsId.Base64(encryptedDataKey)
    const secretManagerBackup = `v1.${projectId}.secretManager.${kmsKeyIdForEncrypt}.${encryptedSecretManagerDataKey.toString(
      "base64"
    )}`;

    return {
      secretManager: secretManagerBackup
    };
  };

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
    encryptWithKmsKey,
    encryptWithInputKey,
    decryptWithKmsKey,
    decryptWithInputKey,
    getOrgKmsKeyId,
    getProjectSecretManagerKmsKeyId,
    getOrgKmsDataKey,
    getProjectSecretManagerKmsDataKey,
    getProjectSecretManagerKmsKey,
    updateProjectSecretManagerKmsKey,
    getProjectKeyBackup
  };
};
