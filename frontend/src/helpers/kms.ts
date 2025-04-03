import {
  AsymmetricKeySignVerify,
  KmsKeyIntent,
  SymmetricKeyEncryptDecrypt
} from "@app/hooks/api/cmeks";

export const kmsKeyUsageOptions: Record<
  KmsKeyIntent,
  {
    label: string;
    tooltip: string;
  }
> = {
  [KmsKeyIntent.ENCRYPT_DECRYPT]: {
    label: "Encrypt/Decrypt",
    tooltip: "Use the key only to encrypt and decrypt data."
  },
  [KmsKeyIntent.SIGN_VERIFY]: {
    label: "Sign/Verify",
    tooltip:
      "Key pairs for digital signing. Uses the private key for signing and the public key for verification."
  }
};

export const keyUsageDefaultOption: Record<
  KmsKeyIntent,
  SymmetricKeyEncryptDecrypt | AsymmetricKeySignVerify
> = {
  [KmsKeyIntent.ENCRYPT_DECRYPT]: SymmetricKeyEncryptDecrypt.AES_GCM_256,
  [KmsKeyIntent.SIGN_VERIFY]: AsymmetricKeySignVerify.RSA_4096
};
