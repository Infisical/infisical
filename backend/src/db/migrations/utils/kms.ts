import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { randomSecureBytes } from "@app/lib/crypto";
import { symmetricCipherService, SymmetricEncryption } from "@app/lib/crypto/cipher";
import { alphaNumericNanoId } from "@app/lib/nanoid";

const getInstanceRootKey = async (knex: Knex) => {
  const encryptionKey = process.env.ENCRYPTION_KEY || process.env.ROOT_ENCRYPTION_KEY;
  // if root key its base64 encoded
  const isBase64 = !process.env.ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY variable needed for migration");
  const encryptionKeyBuffer = Buffer.from(encryptionKey, isBase64 ? "base64" : "utf8");

  const KMS_ROOT_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";
  const kmsRootConfig = await knex(TableName.KmsServerRootConfig).where({ id: KMS_ROOT_CONFIG_UUID }).first();
  const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);
  if (kmsRootConfig) {
    const decryptedRootKey = cipher.decrypt(kmsRootConfig.encryptedRootKey, encryptionKeyBuffer);
    // set the flag so that other instancen nodes can start
    return decryptedRootKey;
  }

  const newRootKey = randomSecureBytes(32);
  const encryptedRootKey = cipher.encrypt(newRootKey, encryptionKeyBuffer);
  await knex(TableName.KmsServerRootConfig).insert({
    encryptedRootKey,
    // eslint-disable-next-line
    // @ts-ignore id is kept as fixed for idempotence and to avoid race condition
    id: KMS_ROOT_CONFIG_UUID
  });
  return encryptedRootKey;
};

export const getSecretManagerDataKey = async (knex: Knex, projectId: string) => {
  const KMS_VERSION = "v01";
  const KMS_VERSION_BLOB_LENGTH = 3;
  const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);
  const project = await knex(TableName.Project).where({ id: projectId }).first();
  if (!project) throw new Error("Missing project id");

  const ROOT_ENCRYPTION_KEY = await getInstanceRootKey(knex);

  let secretManagerKmsKey;
  const projectSecretManagerKmsId = project?.kmsSecretManagerKeyId;
  if (projectSecretManagerKmsId) {
    const kmsDoc = await knex(TableName.KmsKey)
      .leftJoin(TableName.InternalKms, `${TableName.KmsKey}.id`, `${TableName.InternalKms}.kmsKeyId`)
      .where({ [`${TableName.KmsKey}.id` as "id"]: projectSecretManagerKmsId })
      .first();
    if (!kmsDoc) throw new Error("missing kms");
    secretManagerKmsKey = cipher.decrypt(kmsDoc.encryptedKey, ROOT_ENCRYPTION_KEY);
  } else {
    const [kmsDoc] = await knex(TableName.KmsKey)
      .insert({
        name: slugify(alphaNumericNanoId(8).toLowerCase()),
        orgId: project.orgId,
        isReserved: false
      })
      .returning("*");

    secretManagerKmsKey = randomSecureBytes(32);
    const encryptedKeyMaterial = cipher.encrypt(secretManagerKmsKey, ROOT_ENCRYPTION_KEY);
    await knex(TableName.InternalKms).insert({
      version: 1,
      encryptedKey: encryptedKeyMaterial,
      encryptionAlgorithm: SymmetricEncryption.AES_GCM_256,
      kmsKeyId: kmsDoc.id
    });
  }

  const encryptedSecretManagerDataKey = project?.kmsSecretManagerEncryptedDataKey;
  let dataKey: Buffer;
  if (!encryptedSecretManagerDataKey) {
    dataKey = randomSecureBytes();
    // the below versioning we do it automatically in kms service
    const unversionedDataKey = cipher.encrypt(dataKey, secretManagerKmsKey);
    const versionBlob = Buffer.from(KMS_VERSION, "utf8"); // length is 3
    await knex(TableName.Project)
      .where({ id: projectId })
      .update({
        kmsSecretManagerEncryptedDataKey: Buffer.concat([unversionedDataKey, versionBlob])
      });
  } else {
    const cipherTextBlob = encryptedSecretManagerDataKey.subarray(0, -KMS_VERSION_BLOB_LENGTH);
    dataKey = cipher.decrypt(cipherTextBlob, secretManagerKmsKey);
  }

  return {
    encryptor: ({ plainText }: { plainText: Buffer }) => {
      const encryptedPlainTextBlob = cipher.encrypt(plainText, dataKey);

      // Buffer#1 encrypted text + Buffer#2 version number
      const versionBlob = Buffer.from(KMS_VERSION, "utf8"); // length is 3
      const cipherTextBlob = Buffer.concat([encryptedPlainTextBlob, versionBlob]);
      return { cipherTextBlob };
    },
    decryptor: ({ cipherTextBlob: versionedCipherTextBlob }: { cipherTextBlob: Buffer }) => {
      const cipherTextBlob = versionedCipherTextBlob.subarray(0, -KMS_VERSION_BLOB_LENGTH);
      const decryptedBlob = cipher.decrypt(cipherTextBlob, dataKey);
      return decryptedBlob;
    }
  };
};
