import { TDecryptWithOrgKeyInput, TEncryptWithOrgKeyInput } from "../contract";
import { TKmsKeyRepository } from "../repository/kms-key-repository";
import { TKmsCoreUnitOfWork } from "../repository/unit-of-work";
import { getOrCreateOrgKey, getOrgKeyOrThrow, keyCipher, unwrapKeyMaterial } from "./org-key";

export interface TKmsCryptoService {
  encryptWithOrgKey(input: TEncryptWithOrgKeyInput): Promise<Buffer>;
  decryptWithOrgKey(input: TDecryptWithOrgKeyInput): Promise<Buffer>;
}

export type TKmsCryptoServiceDependencies = {
  kmsKeyRepository: TKmsKeyRepository;
  unitOfWork: TKmsCoreUnitOfWork;
  rootKey: Buffer;
};

export class KmsCryptoService implements TKmsCryptoService {
  constructor(private readonly deps: TKmsCryptoServiceDependencies) {}

  async encryptWithOrgKey({ orgId, plaintext }: TEncryptWithOrgKeyInput) {
    const kmsKey = await getOrCreateOrgKey(this.deps, orgId);
    kmsKey.assertCanEncrypt();
    return keyCipher.encrypt(plaintext, unwrapKeyMaterial(kmsKey, this.deps.rootKey));
  }

  async decryptWithOrgKey({ orgId, ciphertext }: TDecryptWithOrgKeyInput) {
    const kmsKey = await getOrgKeyOrThrow(this.deps.kmsKeyRepository, orgId);
    return keyCipher.decrypt(ciphertext, unwrapKeyMaterial(kmsKey, this.deps.rootKey));
  }
}
