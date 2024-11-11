import { SymmetricEncryption } from "@app/lib/crypto/cipher";

export const KMS_ROOT_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";

export const getByteLengthForAlgorithm = (encryptionAlgorithm: SymmetricEncryption) => {
  switch (encryptionAlgorithm) {
    case SymmetricEncryption.AES_GCM_128:
      return 16;
    case SymmetricEncryption.AES_GCM_256:
    default:
      return 32;
  }
};
