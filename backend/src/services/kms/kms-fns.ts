import { SymmetricEncryption } from "@app/lib/crypto/cipher";

export const getByteLengthForAlgorithm = (encryptionAlgorithm: SymmetricEncryption) => {
  switch (encryptionAlgorithm) {
    case SymmetricEncryption.AES_GCM_128:
      return 16;
    case SymmetricEncryption.AES_GCM_256:
    default:
      return 32;
  }
};
