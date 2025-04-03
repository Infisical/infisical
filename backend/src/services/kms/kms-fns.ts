import { SymmetricKeyEncryptDecrypt } from "@app/lib/crypto/cipher";
import { AsymmetricKeySignVerify } from "@app/lib/crypto/sign";
import { BadRequestError } from "@app/lib/errors";

import { KmsKeyIntent } from "./kms-types";

export const KMS_ROOT_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";

export const getByteLengthForSymmetricEncryptionAlgorithm = (encryptionAlgorithm: SymmetricKeyEncryptDecrypt) => {
  switch (encryptionAlgorithm) {
    case SymmetricKeyEncryptDecrypt.AES_GCM_128:
      return 16;
    case SymmetricKeyEncryptDecrypt.AES_GCM_256:
    default:
      return 32;
  }
};

export const verifyKeyTypeAndAlgorithm = (
  type: KmsKeyIntent,
  algorithm: SymmetricKeyEncryptDecrypt | AsymmetricKeySignVerify,
  extra?: {
    forceType?: KmsKeyIntent;
  }
) => {
  if (extra?.forceType && type !== extra.forceType) {
    throw new BadRequestError({
      message: `Unsupported key type, expected ${extra.forceType} but got ${type}`
    });
  }

  if (type === KmsKeyIntent.ENCRYPT_DECRYPT) {
    if (!Object.values(SymmetricKeyEncryptDecrypt).includes(algorithm as SymmetricKeyEncryptDecrypt)) {
      throw new BadRequestError({
        message: `Unsupported encryption algorithm for encrypt/decrypt key: ${algorithm as string}`
      });
    }

    return true;
  }

  if (type === KmsKeyIntent.SIGN_VERIFY) {
    if (!Object.values(AsymmetricKeySignVerify).includes(algorithm as AsymmetricKeySignVerify)) {
      throw new BadRequestError({
        message: `Unsupported sign/verify algorithm for sign/verify key: ${algorithm as string}`
      });
    }

    return true;
  }

  throw new BadRequestError({
    message: `Unsupported key type: ${type as string}`
  });
};
