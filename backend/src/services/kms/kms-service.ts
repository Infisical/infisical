import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { randomSecureBytes } from "@app/lib/crypto";
import { symmetricCipherService, SymmetricEncryption } from "@app/lib/crypto/cipher";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TKmsDALFactory } from "./kms-dal";
import { TKmsRootConfigDALFactory } from "./kms-root-config-dal";
import { TDecryptWithKmsDTO, TEncryptWithKmsDTO, TGenerateKMSDTO } from "./kms-types";

type TKmsServiceFactoryDep = {
  kmsDAL: TKmsDALFactory;
  kmsRootConfigDAL: Pick<TKmsRootConfigDALFactory, "findById" | "create">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "waitTillReady" | "setItemWithExpiry">;
};

export type TKmsServiceFactory = ReturnType<typeof kmsServiceFactory>;

const KMS_ROOT_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";

const KMS_ROOT_CREATION_WAIT_KEY = "wait_till_ready_kms_root_key";
const KMS_ROOT_CREATION_WAIT_TIME = 10;

// akhilmhdh: Don't edit this value. This is measured for blob concatination in kms
const KMS_VERSION = "v01";
const KMS_VERSION_BLOB_LENGTH = 3;
export const kmsServiceFactory = ({ kmsDAL, kmsRootConfigDAL, keyStore }: TKmsServiceFactoryDep) => {
  let ROOT_ENCRYPTION_KEY = Buffer.alloc(0);

  // this is used symmetric encryption
  const generateKmsKey = async ({ scopeId, scopeType, isReserved = true, tx }: TGenerateKMSDTO) => {
    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);
    const kmsKeyMaterial = randomSecureBytes(32);
    const encryptedKeyMaterial = cipher.encrypt(kmsKeyMaterial, ROOT_ENCRYPTION_KEY);

    const { encryptedKey, ...doc } = await kmsDAL.create(
      {
        version: 1,
        encryptedKey: encryptedKeyMaterial,
        encryptionAlgorithm: SymmetricEncryption.AES_GCM_256,
        isReserved,
        orgId: scopeType === "org" ? scopeId : undefined,
        projectId: scopeType === "project" ? scopeId : undefined
      },
      tx
    );
    return doc;
  };

  const encrypt = async ({ kmsId, plainText }: TEncryptWithKmsDTO) => {
    const kmsDoc = await kmsDAL.findById(kmsId);
    if (!kmsDoc) throw new BadRequestError({ message: "KMS ID not found" });
    // akhilmhdh: as more encryption are added do a check here on kmsDoc.encryptionAlgorithm
    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);

    const kmsKey = cipher.decrypt(kmsDoc.encryptedKey, ROOT_ENCRYPTION_KEY);
    const encryptedPlainTextBlob = cipher.encrypt(plainText, kmsKey);

    // Buffer#1 encrypted text + Buffer#2 version number
    const versionBlob = Buffer.from(KMS_VERSION, "utf8"); // length is 3
    const cipherTextBlob = Buffer.concat([encryptedPlainTextBlob, versionBlob]);
    return { cipherTextBlob };
  };

  const decrypt = async ({ cipherTextBlob: versionedCipherTextBlob, kmsId }: TDecryptWithKmsDTO) => {
    const kmsDoc = await kmsDAL.findById(kmsId);
    if (!kmsDoc) throw new BadRequestError({ message: "KMS ID not found" });
    // akhilmhdh: as more encryption are added do a check here on kmsDoc.encryptionAlgorithm
    const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);
    const kmsKey = cipher.decrypt(kmsDoc.encryptedKey, ROOT_ENCRYPTION_KEY);

    const cipherTextBlob = versionedCipherTextBlob.subarray(0, -KMS_VERSION_BLOB_LENGTH);
    const decryptedBlob = cipher.decrypt(cipherTextBlob, kmsKey);
    return decryptedBlob;
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
    encrypt,
    decrypt
  };
};
