import { randomUUID } from "node:crypto";

import { KeyMaterial, KmsKeyUsage, TKmsKeyAlgorithmName } from "./key-material";
import { KmsKeyVersion } from "./kms-key-version";
import { RootKey } from "./root-key";

export type TInternalKeyMaterialRecord = {
  id: string;
  // Wrapped with the root key. Never leaves the domain.
  encryptedKey: Buffer;
  encryptionAlgorithm: string;
  version: number;
};

// The wrapped material an internal KMS key currently encrypts with (internal_kms), and which version of it that is.
export class InternalKeyMaterial {
  private constructor(
    readonly id: string,
    private readonly encryptedKey: Buffer,
    readonly algorithm: TKmsKeyAlgorithmName,
    readonly version: number
  ) {}

  static create(material: KeyMaterial, rootKey: RootKey): InternalKeyMaterial {
    return new InternalKeyMaterial(randomUUID(), material.wrap(rootKey), material.algorithm, 1);
  }

  static restore(record: TInternalKeyMaterialRecord): InternalKeyMaterial {
    return new InternalKeyMaterial(
      record.id,
      record.encryptedKey,
      record.encryptionAlgorithm as TKmsKeyAlgorithmName,
      record.version
    );
  }

  open(rootKey: RootKey, usage: KmsKeyUsage): KeyMaterial {
    return KeyMaterial.restore(rootKey.decrypt(this.encryptedKey), usage, this.algorithm);
  }

  // The same material for another version, once its predecessor is archived.
  succeededBy(material: KeyMaterial, rootKey: RootKey): InternalKeyMaterial {
    return new InternalKeyMaterial(this.id, material.wrap(rootKey), this.algorithm, this.version + 1);
  }

  archive(): KmsKeyVersion {
    return KmsKeyVersion.create({ internalKmsId: this.id, encryptedKey: this.encryptedKey, version: this.version });
  }

  toJSON(): TInternalKeyMaterialRecord {
    return {
      id: this.id,
      encryptedKey: this.encryptedKey,
      encryptionAlgorithm: this.algorithm,
      version: this.version
    };
  }
}
