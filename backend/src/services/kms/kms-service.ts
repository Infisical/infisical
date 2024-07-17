import crypto from "node:crypto";

import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { randomSecureBytes } from "@app/lib/crypto";
import { symmetricCipherService, SymmetricEncryption } from "@app/lib/crypto/cipher";
import { BadRequestError } from "@app/lib/errors";
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
  TGenerateKMSDTO,
  TUpdateProjectKmsDTO
} from "./kms-types";

type TKmsServiceFactoryDep = {
  kmsDAL: TKmsKeyDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById" | "updateById" | "transaction">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "updateById" | "transaction">;
  kmsRootConfigDAL: Pick<TKmsRootConfigDALFactory, "findById" | "create">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "waitTillReady" | "setItemWithExpiry">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  internalKmsDAL: Pick<TInternalKmsDALFactory, "create">;
};

export type TKmsServiceFactory = ReturnType<typeof kmsServiceFactory>;

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
  projectDAL,
  permissionService
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

  const encryptWithKmsKey = async ({ kmsId }: Omit<TEncryptWithKmsDTO, "plainText">) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) throw new BadRequestError({ message: "KMS ID not found" });
    // akhilmhdh: as more encryption are added do a check here on kmsDoc.encryptionAlgorithm
    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);
    return ({ plainText }: Pick<TEncryptWithKmsDTO, "plainText">) => {
      const kmsKey = cipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);
      const encryptedPlainTextBlob = cipher.encrypt(plainText, kmsKey);

      // Buffer#1 encrypted text + Buffer#2 version number
      const versionBlob = Buffer.from(KMS_VERSION, "utf8"); // length is 3
      const cipherTextBlob = Buffer.concat([encryptedPlainTextBlob, versionBlob]);
      return { cipherTextBlob };
    };
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

  const decryptWithKmsKey = async ({ kmsId }: Omit<TDecryptWithKmsDTO, "cipherTextBlob">) => {
    const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(kmsId);
    if (!kmsDoc) throw new BadRequestError({ message: "KMS ID not found" });
    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);
    const kmsKey = cipher.decrypt(kmsDoc.internalKms?.encryptedKey as Buffer, ROOT_ENCRYPTION_KEY);

    return ({ cipherTextBlob: versionedCipherTextBlob }: Pick<TDecryptWithKmsDTO, "cipherTextBlob">) => {
      const cipherTextBlob = versionedCipherTextBlob.subarray(0, -KMS_VERSION_BLOB_LENGTH);
      const decryptedBlob = cipher.decrypt(cipherTextBlob, kmsKey);
      return decryptedBlob;
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
    const keyId = await orgDAL.transaction(async (tx) => {
      const org = await orgDAL.findById(orgId, tx);
      if (!org) {
        throw new BadRequestError({ message: "Org not found" });
      }

      if (!org.kmsDefaultKeyId) {
        // create default kms key for certificate service
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
      }

      return org.kmsDefaultKeyId;
    });

    return keyId;
  };

  const getOrgKmsDataKey = async (orgId: string) => {
    const kmsKeyId = await getOrgKmsKeyId(orgId);
    const orgKmsDataKey = await orgDAL.transaction(async (tx) => {
      const org = await orgDAL.findById(orgId, tx);

      if (!org) {
        throw new BadRequestError({ message: "Org not found" });
      }

      let encryptedDataKey = org.kmsEncryptedDataKey;
      if (!encryptedDataKey) {
        const dataKey = crypto.randomBytes(32);
        const kmsEncryptor = await encryptWithKmsKey({
          kmsId: kmsKeyId
        });

        const { cipherTextBlob } = kmsEncryptor({
          plainText: dataKey
        });

        encryptedDataKey = cipherTextBlob;
        await orgDAL.updateById(
          org.id,
          {
            kmsEncryptedDataKey: encryptedDataKey
          },
          tx
        );

        return dataKey;
      }

      const kmsDecryptor = await decryptWithKmsKey({
        kmsId: kmsKeyId
      });

      return kmsDecryptor({
        cipherTextBlob: encryptedDataKey
      });
    });

    return orgKmsDataKey;
  };

  const getProjectSecretManagerKmsKeyId = async (projectId: string) => {
    let project = await projectDAL.findById(projectId);
    if (!project) {
      throw new BadRequestError({ message: "Project not found" });
    }

    if (!project.kmsSecretManagerKeyId) {
      // create default kms key for certificate service
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
          const dataKey = randomSecureBytes();
          const kmsEncryptor = await encryptWithKmsKey({
            kmsId: kmsKeyId
          });

          const { cipherTextBlob } = kmsEncryptor({
            plainText: dataKey
          });

          await projectDAL.updateById(projectId, {
            kmsSecretManagerEncryptedDataKey: cipherTextBlob
          });

          await keyStore.setItemWithExpiry(
            `${KeyStorePrefixes.WaitUntilReadyKmsProjectDataKeyCreation}${projectId}`,
            10,
            "true"
          );
          return dataKey;
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
    const dataKey = await getProjectSecretManagerKmsDataKey(projectId);

    if (currentKms.isReserved && kmsId === "internal") {
      return currentKms;
    }

    return kmsDAL.transaction(async (tx) => {
      const project = await projectDAL.findById(projectId, tx);
      let newKmsId = kmsId;

      if (newKmsId === "internal") {
        const key = await generateKmsKey({
          isReserved: true,
          orgId: project.orgId,
          tx
        });

        newKmsId = key.id;
      }

      const kmsEncryptor = await encryptWithKmsKey({ kmsId: newKmsId });
      const { cipherTextBlob } = kmsEncryptor({ plainText: dataKey });
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

      return kmsDAL.findByIdWithAssociatedKms(newKmsId);
    });
  };

  const updateProjectKmsKey = async ({
    projectId,
    secretManagerKmsKeyId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateProjectKmsDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
    if (secretManagerKmsKeyId !== "internal") {
      const kmsDoc = await kmsDAL.findByIdWithAssociatedKms(secretManagerKmsKeyId);
      if (!kmsDoc) {
        throw new BadRequestError({ message: "KMS ID not found." });
      }

      if (kmsDoc.orgId !== actorOrgId) {
        throw new BadRequestError({
          message: "KMS ID does not belong in the organization."
        });
      }
    }

    return {
      secretManagerKmsKey: await updateProjectSecretManagerKmsKey(projectId, secretManagerKmsKeyId)
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
    updateProjectKmsKey,
    updateProjectSecretManagerKmsKey
  };
};
