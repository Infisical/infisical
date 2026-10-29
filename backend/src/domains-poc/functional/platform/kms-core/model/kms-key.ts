import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";

export const KMS_KEY_NAME_MAX_LENGTH = 32;
export const ORG_DEFAULT_KMS_KEY_NAME = "poc-org-default";

export type TKmsKey = Readonly<{
  id: string;
  orgId: string;
  name: string;
  isDisabled: boolean;
  encryptedKeyMaterial: Buffer;
  encryptionAlgorithm: SymmetricKeyAlgorithm;
  version: number;
}>;

export const createKmsKey = ({
  orgId,
  name,
  encryptedKeyMaterial
}: {
  orgId: string;
  name: string;
  encryptedKeyMaterial: Buffer;
}): TKmsKey => {
  if (!name || name.length > KMS_KEY_NAME_MAX_LENGTH) {
    throw new BadRequestError({ message: `KMS key name must be 1 to ${KMS_KEY_NAME_MAX_LENGTH} characters` });
  }

  return {
    id: crypto.nativeCrypto.randomUUID(),
    orgId,
    name,
    isDisabled: false,
    encryptedKeyMaterial,
    encryptionAlgorithm: SymmetricKeyAlgorithm.AES_GCM_256,
    version: 1
  };
};

export const assertKmsKeyCanEncrypt = (kmsKey: TKmsKey) => {
  if (kmsKey.isDisabled) {
    throw new BadRequestError({ message: `KMS key "${kmsKey.name}" is disabled` });
  }
};

export const disableKmsKey = (kmsKey: TKmsKey): TKmsKey => ({ ...kmsKey, isDisabled: true });
