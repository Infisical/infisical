import { AsymmetricKeyAlgorithm, KmsKeyUsage, SymmetricKeyAlgorithm } from "@app/hooks/api/cmeks";

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
  }
};

export const keyUsageDefaultOption: Record<
  KmsKeyUsage,
  SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm
> = {
  [KmsKeyUsage.ENCRYPT_DECRYPT]: SymmetricKeyAlgorithm.AES_GCM_256,
  [KmsKeyUsage.SIGN_VERIFY]: AsymmetricKeyAlgorithm.RSA_4096
};
