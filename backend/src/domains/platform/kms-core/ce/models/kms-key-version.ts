import { randomUUID } from "node:crypto";

import { KeyMaterial, KmsKeyUsage, TKmsKeyAlgorithmName } from "./key-material";
import { RootKey } from "./root-key";

export type TKmsKeyVersionRecord = {
  id: string;
  internalKmsId: string;
  // Wrapped with the root key. Never leaves the domain.
  encryptedKey: Buffer;
  version: number;
};

// Material a rotation replaced. Never deleted, so ciphertext written under it stays readable.
export class KmsKeyVersion {
  private constructor(
    readonly id: string,
    readonly internalKmsId: string,
    private readonly encryptedKey: Buffer,
    readonly version: number
  ) {}

  static create(input: Omit<TKmsKeyVersionRecord, "id">): KmsKeyVersion {
    return new KmsKeyVersion(randomUUID(), input.internalKmsId, input.encryptedKey, input.version);
  }

  static restore(record: TKmsKeyVersionRecord): KmsKeyVersion {
    return new KmsKeyVersion(record.id, record.internalKmsId, record.encryptedKey, record.version);
  }

  // Versions exist only for encrypt-decrypt keys, the only ones a rotation accepts.
  open(rootKey: RootKey, algorithm: TKmsKeyAlgorithmName): KeyMaterial {
    return KeyMaterial.restore(rootKey.decrypt(this.encryptedKey), KmsKeyUsage.ENCRYPT_DECRYPT, algorithm);
  }

  toJSON(): TKmsKeyVersionRecord {
    return {
      id: this.id,
      internalKmsId: this.internalKmsId,
      encryptedKey: this.encryptedKey,
      version: this.version
    };
  }
}
