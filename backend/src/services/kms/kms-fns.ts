import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { AsymmetricKeyAlgorithm } from "@app/lib/crypto/sign";
import { BadRequestError } from "@app/lib/errors";

import { KmsKeyUsage } from "./kms-types";

export const KMS_ROOT_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";

export const getByteLengthForSymmetricEncryptionAlgorithm = (encryptionAlgorithm: SymmetricKeyAlgorithm) => {
  switch (encryptionAlgorithm) {
    case SymmetricKeyAlgorithm.AES_GCM_128:
      return 16;
    case SymmetricKeyAlgorithm.AES_GCM_256:
    default:
      return 32;
  }
};

export const verifyKeyTypeAndAlgorithm = (
  keyUsage: KmsKeyUsage,
  algorithm: SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm,
  extra?: {
    forceType?: KmsKeyUsage;
  }
) => {
  if (extra?.forceType && keyUsage !== extra.forceType) {
    throw new BadRequestError({
      message: `Unsupported key type, expected ${extra.forceType} but got ${keyUsage}`
    });
  }

  if (keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT) {
    if (!Object.values(SymmetricKeyAlgorithm).includes(algorithm as SymmetricKeyAlgorithm)) {
      throw new BadRequestError({
        message: `Unsupported encryption algorithm for encrypt/decrypt key: ${algorithm as string}`
      });
    }

    return true;
  }

  if (keyUsage === KmsKeyUsage.SIGN_VERIFY) {
    if (!Object.values(AsymmetricKeyAlgorithm).includes(algorithm as AsymmetricKeyAlgorithm)) {
      throw new BadRequestError({
        message: `Unsupported sign/verify algorithm for sign/verify key: ${algorithm as string}`
      });
    }

    return true;
  }

  throw new BadRequestError({
    message: `Unsupported key type: ${keyUsage as string}`
  });
};
