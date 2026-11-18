import { timingSafeEqual } from "node:crypto";

import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { deriveCookieSigningKey } from "@app/lib/crypto/cookie-signing-key";
import { crypto } from "@app/lib/crypto/cryptography";

const rootCipher = () => symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);

// Held in memory only. Its blobs are raw AES-GCM with no version trailer, the format every stored root-key blob
// already uses.
export class RootKey {
  private constructor(private readonly bytes: Buffer) {}

  static generate(): RootKey {
    return new RootKey(crypto.randomBytes(32));
  }

  static fromBytes(bytes: Buffer): RootKey {
    return new RootKey(bytes);
  }

  encrypt(plainText: Buffer): Buffer<ArrayBuffer> {
    return rootCipher().encrypt(plainText, this.bytes);
  }

  decrypt(cipherText: Buffer): Buffer<ArrayBuffer> {
    return rootCipher().decrypt(cipherText, this.bytes);
  }

  cookieSigningKey(): string {
    return deriveCookieSigningKey(this.bytes);
  }

  equals(other: RootKey): boolean {
    return this.bytes.length === other.bytes.length && timingSafeEqual(this.bytes, other.bytes);
  }

  // Only for wrapping the root key itself, with the instance encryption key or the HSM.
  exportForWrapping(): Buffer {
    return this.bytes;
  }
}
