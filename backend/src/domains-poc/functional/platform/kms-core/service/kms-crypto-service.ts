import { TDecryptWithOrgKeyInput, TEncryptWithOrgKeyInput } from "../contract";
import { assertKmsKeyCanEncrypt } from "../model/kms-key";
import { TKmsKeyRepository } from "../repository/kms-key-repository";
import { TKmsCoreUnitOfWork } from "../repository/unit-of-work";
import { getOrCreateOrgKey, getOrgKeyOrThrow, keyCipher, unwrapKeyMaterial } from "./org-key";

export type TKmsCryptoService = {
  encryptWithOrgKey: (input: TEncryptWithOrgKeyInput) => Promise<Buffer>;
  decryptWithOrgKey: (input: TDecryptWithOrgKeyInput) => Promise<Buffer>;
};

export type TKmsCryptoServiceDependencies = {
  kmsKeyRepository: TKmsKeyRepository;
  unitOfWork: TKmsCoreUnitOfWork;
  rootKey: Buffer;
};

export const createKmsCryptoService = (deps: TKmsCryptoServiceDependencies): TKmsCryptoService => {
  const encryptWithOrgKey = async ({ orgId, plaintext }: TEncryptWithOrgKeyInput) => {
    const kmsKey = await getOrCreateOrgKey(deps, orgId);
    assertKmsKeyCanEncrypt(kmsKey);
    return keyCipher.encrypt(plaintext, unwrapKeyMaterial(kmsKey, deps.rootKey));
  };

  const decryptWithOrgKey = async ({ orgId, ciphertext }: TDecryptWithOrgKeyInput) => {
    const kmsKey = await getOrgKeyOrThrow(deps.kmsKeyRepository, orgId);
    return keyCipher.decrypt(ciphertext, unwrapKeyMaterial(kmsKey, deps.rootKey));
  };

  return { encryptWithOrgKey, decryptWithOrgKey };
};
