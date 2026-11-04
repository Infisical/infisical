import { TTransactionRunner } from "@app/domains-poc/lib/transaction-runner";
import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { NotFoundError } from "@app/lib/errors";

import { TKmsCoreDataAccess } from "../data-access";
import { TKmsKeyDataAccess } from "../data-access/kms-key-data-access";
import { KmsKey, ORG_DEFAULT_KMS_KEY_NAME } from "../model/kms-key";

const KEY_MATERIAL_BYTES = 32;

export const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

export const unwrapWithRootKey = (kmsKey: KmsKey, rootKey: Buffer) =>
  keyCipher.decrypt(kmsKey.encryptedKeyMaterial, rootKey);

export const getOrgKeyOrThrow = async (kmsKeyDataAccess: TKmsKeyDataAccess, orgId: string) => {
  const kmsKey = await kmsKeyDataAccess.findByOrgAndName(orgId, ORG_DEFAULT_KMS_KEY_NAME);
  if (!kmsKey) {
    throw new NotFoundError({ message: `No KMS key found for organization with ID "${orgId}"` });
  }
  return kmsKey;
};

export const getOrCreateOrgKey = async (
  {
    kmsKeyDataAccess,
    transactionRunner,
    rootKey
  }: {
    kmsKeyDataAccess: TKmsKeyDataAccess;
    transactionRunner: TTransactionRunner<TKmsCoreDataAccess>;
    rootKey: Buffer;
  },
  orgId: string
) => {
  const existingKey = await kmsKeyDataAccess.findByOrgAndName(orgId, ORG_DEFAULT_KMS_KEY_NAME);
  if (existingKey) return existingKey;

  const encryptedKeyMaterial = keyCipher.encrypt(crypto.randomBytes(KEY_MATERIAL_BYTES), rootKey);

  return transactionRunner.run(async ({ kmsKeys }) => {
    await kmsKeys.lockOrgKeyCreation(orgId);
    const keyCreatedMeanwhile = await kmsKeys.findByOrgAndName(orgId, ORG_DEFAULT_KMS_KEY_NAME);
    if (keyCreatedMeanwhile) return keyCreatedMeanwhile;

    const kmsKey = KmsKey.create({ orgId, name: ORG_DEFAULT_KMS_KEY_NAME, encryptedKeyMaterial });
    await kmsKeys.create(kmsKey);
    return kmsKey;
  });
};
