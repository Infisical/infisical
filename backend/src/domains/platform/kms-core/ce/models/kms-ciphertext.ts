// Frozen wire format: old and new pods read each other's ciphertext during a rolling deploy.
const KMS_VERSION = "v01";
const KMS_VERSION_BLOB_LENGTH = 3;
// v02 layout: [ciphertext][4-byte BE key version]["v02"]. Only written for version > 1, so never-rotated keys keep
// producing byte-identical v01 blobs.
const KMS_VERSION_V2 = "v02";
const KMS_KEY_VERSION_BLOB_LENGTH = 4;
// AES-GCM output is at least a 12-byte IV plus a 16-byte tag. Anything shorter ending in "v02" is malformed and falls
// through to v01 instead of reading out of bounds.
const MIN_AES_GCM_BLOB_LENGTH = 12 + 16;
const MIN_V02_BLOB_LENGTH = MIN_AES_GCM_BLOB_LENGTH + KMS_KEY_VERSION_BLOB_LENGTH + KMS_VERSION_BLOB_LENGTH;

export class KmsCiphertext {
  private constructor(
    readonly cipherText: Buffer,
    // Null for v01, so every version is a candidate.
    readonly keyVersion: number | null
  ) {}

  static encodeForKey(encryptedBlob: Buffer, keyVersion: number): Buffer<ArrayBuffer> {
    if (keyVersion > 1) {
      const keyVersionBlob = Buffer.alloc(KMS_KEY_VERSION_BLOB_LENGTH);
      keyVersionBlob.writeUInt32BE(keyVersion, 0);
      return Buffer.concat([encryptedBlob, keyVersionBlob, Buffer.from(KMS_VERSION_V2, "utf8")]);
    }
    return KmsCiphertext.encodeV01(encryptedBlob);
  }

  static encodeV01(encryptedBlob: Buffer): Buffer<ArrayBuffer> {
    return Buffer.concat([encryptedBlob, Buffer.from(KMS_VERSION, "utf8")]);
  }

  static stripV01(blob: Buffer): Buffer {
    return blob.subarray(0, -KMS_VERSION_BLOB_LENGTH);
  }

  // v02 is detected by its structure too, never by trusting the trailer alone.
  static decode(blob: Buffer): KmsCiphertext {
    const suffix =
      blob.length >= KMS_VERSION_BLOB_LENGTH ? blob.subarray(-KMS_VERSION_BLOB_LENGTH).toString("utf8") : "";
    if (suffix === KMS_VERSION_V2 && blob.length >= MIN_V02_BLOB_LENGTH) {
      const keyVersionOffset = blob.length - KMS_VERSION_BLOB_LENGTH - KMS_KEY_VERSION_BLOB_LENGTH;
      return new KmsCiphertext(blob.subarray(0, keyVersionOffset), blob.readUInt32BE(keyVersionOffset));
    }
    return new KmsCiphertext(KmsCiphertext.stripV01(blob), null);
  }
}
