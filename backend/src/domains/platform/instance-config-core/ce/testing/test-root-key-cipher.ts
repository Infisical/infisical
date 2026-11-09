import { randomBytes } from "node:crypto";

import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";

import { TRootKeyCipher } from "../service/instance-config-types";

// The root key cipher Instance Config Core takes from KMS Core: real AES-GCM under a random key, without starting a
// KMS Core module, so consumers' tests need no logger or KMS setup.
export class TestRootKeyCipher implements TRootKeyCipher {
  private readonly rootKey = randomBytes(32);

  encryptWithRootKey = () => {
    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    return (plainText: Buffer) => cipher.encrypt(plainText, this.rootKey);
  };

  decryptWithRootKey = () => {
    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    return (cipherText: Buffer) => cipher.decrypt(cipherText, this.rootKey);
  };
}
