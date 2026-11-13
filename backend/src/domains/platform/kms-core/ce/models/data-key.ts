import { createSecretValueBlindIndexer } from "@app/lib/crypto/blind-index";
import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";

import { KmsCiphertext } from "./kms-ciphertext";

export type TEncryptor = (input: { plainText: Buffer }) => { cipherTextBlob: Buffer<ArrayBuffer> };
export type TDecryptor = (input: { cipherTextBlob: Buffer }) => Buffer<ArrayBuffer>;

// What callers encrypt with. The data key stays inside these closures.
export type TCipherPair = {
  encryptor: TEncryptor;
  decryptor: TDecryptor;
  generateSecretBlindIndex: (secretValue: Buffer) => Promise<string>;
};

const dataCipher = () => symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

// An org's or project's data key (and the key behind encryptWithInputKey). Its blobs always end in v01.
export class DataKey {
  private constructor(private readonly bytes: Buffer) {}

  static generate(): DataKey {
    return new DataKey(crypto.randomBytes(32));
  }

  // Bytes a KMS key unwrapped, or a key a caller supplies.
  static fromBytes(bytes: Buffer): DataKey {
    return new DataKey(bytes);
  }

  encrypt(plainText: Buffer): Buffer<ArrayBuffer> {
    return KmsCiphertext.encodeV01(dataCipher().encrypt(plainText, this.bytes));
  }

  decrypt(cipherTextBlob: Buffer): Buffer<ArrayBuffer> {
    return dataCipher().decrypt(KmsCiphertext.stripV01(cipherTextBlob), this.bytes);
  }

  toCipherPair(): TCipherPair {
    return {
      encryptor: ({ plainText }) => ({ cipherTextBlob: this.encrypt(plainText) }),
      decryptor: ({ cipherTextBlob }) => this.decrypt(cipherTextBlob),
      generateSecretBlindIndex: createSecretValueBlindIndexer(this.bytes)
    };
  }

  // Only for a KMS key to wrap: its internal material or an external provider encrypts these bytes.
  exportForWrapping(): Buffer {
    return this.bytes;
  }
}
