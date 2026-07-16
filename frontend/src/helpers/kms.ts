import {
  AsymmetricKeyAlgorithm,
  HmacAlgorithm,
  KmsKeyUsage,
  SigningAlgorithm,
  SymmetricKeyAlgorithm,
  TCmek
} from "@app/hooks/api/cmeks";

export const kmsKeyUsageOptions: Record<
  KmsKeyUsage,
  {
    label: string;
    tooltip: string;
  }
> = {
  [KmsKeyUsage.ENCRYPT_DECRYPT]: {
    label: "Encrypt/Decrypt",
    tooltip: "Use the key only to encrypt and decrypt data."
  },
  [KmsKeyUsage.SIGN_VERIFY]: {
    label: "Sign/Verify",
    tooltip:
      "Key pairs for digital signing. Uses the private key for signing and the public key for verification."
  },
  [KmsKeyUsage.GENERATE_VERIFY_MAC]: {
    label: "Generate/Verify MAC",
    tooltip:
      "Symmetric HMAC keys for generating and verifying hash-based message authentication codes (MACs)."
  }
};

export const keyUsageDefaultOption: Record<
  KmsKeyUsage,
  SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm | HmacAlgorithm
> = {
  [KmsKeyUsage.ENCRYPT_DECRYPT]: SymmetricKeyAlgorithm.AES_GCM_256,
  [KmsKeyUsage.SIGN_VERIFY]: AsymmetricKeyAlgorithm.RSA_4096,
  [KmsKeyUsage.GENERATE_VERIFY_MAC]: HmacAlgorithm.HMAC_SHA_256
};

export const getDefaultSigningAlgorithm = (cmek: TCmek): SigningAlgorithm => {
  if (cmek?.encryptionAlgorithm?.startsWith("ML_DSA")) {
    return cmek.encryptionAlgorithm as unknown as SigningAlgorithm;
  }
  if (cmek?.encryptionAlgorithm?.startsWith("RSA")) {
    return SigningAlgorithm.RSASSA_PSS_SHA_512;
  }
  return SigningAlgorithm.ECDSA_SHA_256;
};
