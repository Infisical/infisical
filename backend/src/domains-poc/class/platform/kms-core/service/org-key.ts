import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { NotFoundError } from "@app/lib/errors";

import { KmsKey, ORG_DEFAULT_KMS_KEY_NAME } from "../model/kms-key";
import { TKmsKeyRepository } from "../repository/kms-key-repository";
import { TKmsCoreUnitOfWork } from "../repository/unit-of-work";

const KEY_MATERIAL_BYTES = 32;

export const keyCipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

export const unwrapKeyMaterial = (kmsKey: KmsKey, rootKey: Buffer) =>
  keyCipher.decrypt(kmsKey.encryptedKeyMaterial, rootKey);

export const getOrgKeyOrThrow = async (kmsKeyRepository: TKmsKeyRepository, orgId: string) => {
  const kmsKey = await kmsKeyRepository.findByOrgAndName(orgId, ORG_DEFAULT_KMS_KEY_NAME);
  if (!kmsKey) {
    throw new NotFoundError({ message: `No KMS key found for organization with ID "${orgId}"` });
  }
  return kmsKey;
};

export const getOrCreateOrgKey = async (
  {
    kmsKeyRepository,
    unitOfWork,
    rootKey
  }: { kmsKeyRepository: TKmsKeyRepository; unitOfWork: TKmsCoreUnitOfWork; rootKey: Buffer },
  orgId: string
) => {
  const existingKey = await kmsKeyRepository.findByOrgAndName(orgId, ORG_DEFAULT_KMS_KEY_NAME);
  if (existingKey) return existingKey;

  return unitOfWork.run(async ({ kmsKeys }) => {
    await kmsKeys.lockOrgKeyCreation(orgId);
    const keyCreatedMeanwhile = await kmsKeys.findByOrgAndName(orgId, ORG_DEFAULT_KMS_KEY_NAME);
    if (keyCreatedMeanwhile) return keyCreatedMeanwhile;

    const kmsKey = KmsKey.create({
      orgId,
      name: ORG_DEFAULT_KMS_KEY_NAME,
      encryptedKeyMaterial: keyCipher.encrypt(crypto.randomBytes(KEY_MATERIAL_BYTES), rootKey)
    });
    await kmsKeys.create(kmsKey);
    return kmsKey;
  });
};
