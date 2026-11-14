export type TEncryptedDataKeyRecord = {
  kmsKeyId: string;
  encryptedDataKey: Buffer;
  orgId: string;
};

// The KMS key id and the data key it encrypted, read from one row so a key switch committing between two reads can
// never pair one key with the other's ciphertext.
export type TEncryptedDataKeyCacheJSON = {
  kmsSecretManagerKeyId: string;
  kmsSecretManagerEncryptedDataKey: string;
  orgId: string;
};

export class EncryptedDataKey {
  private constructor(
    readonly kmsKeyId: string,
    readonly encryptedDataKey: Buffer,
    readonly orgId: string
  ) {}

  static restore(record: TEncryptedDataKeyRecord): EncryptedDataKey {
    return new EncryptedDataKey(record.kmsKeyId, record.encryptedDataKey, record.orgId);
  }

  // Old pods read and write this payload under the same Redis key during a rolling deploy, so it keeps main's names.
  // Null for any missing field: a partial entry is a miss, never a key.
  static fromCacheJSON(
    payload:
      | {
          kmsSecretManagerKeyId?: string | null;
          kmsSecretManagerEncryptedDataKey?: string | null;
          orgId?: string | null;
        }
      | null
      | undefined
  ): EncryptedDataKey | null {
    if (!payload?.kmsSecretManagerKeyId || !payload.kmsSecretManagerEncryptedDataKey || !payload.orgId) return null;
    return new EncryptedDataKey(
      payload.kmsSecretManagerKeyId,
      Buffer.from(payload.kmsSecretManagerEncryptedDataKey, "base64"),
      payload.orgId
    );
  }

  toCacheJSON(): TEncryptedDataKeyCacheJSON {
    return {
      kmsSecretManagerKeyId: this.kmsKeyId,
      kmsSecretManagerEncryptedDataKey: this.encryptedDataKey.toString("base64"),
      orgId: this.orgId
    };
  }

  equals(other: EncryptedDataKey): boolean {
    return (
      this.kmsKeyId === other.kmsKeyId &&
      this.orgId === other.orgId &&
      this.encryptedDataKey.equals(other.encryptedDataKey)
    );
  }

  toJSON(): TEncryptedDataKeyRecord {
    return { kmsKeyId: this.kmsKeyId, encryptedDataKey: this.encryptedDataKey, orgId: this.orgId };
  }
}
