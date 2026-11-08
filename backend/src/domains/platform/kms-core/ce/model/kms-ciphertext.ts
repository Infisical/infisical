// Frozen wire format: old and new pods read each other's ciphertext during a rolling deploy.
const KMS_VERSION = "v01";
const KMS_VERSION_BLOB_LENGTH = 3;
// v02 blobs also embed the key material version that encrypted them: [ciphertext][4-byte BE version]["v02"].
// Written only for keys with version > 1 so never-rotated keys keep producing byte-identical v01 blobs.
const KMS_VERSION_V2 = "v02";
const KMS_KEY_VERSION_BLOB_LENGTH = 4;
// AES-GCM output is at least a 12-byte IV and a 16-byte tag. Anything shorter that ends in "v02" is malformed input
// and must fall through to the v01 path rather than read out of bounds.
const MIN_AES_GCM_BLOB_LENGTH = 12 + 16;
const MIN_V02_BLOB_LENGTH = MIN_AES_GCM_BLOB_LENGTH + KMS_KEY_VERSION_BLOB_LENGTH + KMS_VERSION_BLOB_LENGTH;

// A stored ciphertext's trailer: which key version wrote it, if it says.
export class KmsCiphertext {
  private constructor(
    readonly cipherText: Buffer,
    // The version a v02 blob names; null for v01, where every version is a candidate.
    readonly keyVersion: number | null
  ) {}

  // Internal KMS key blobs: v01 for a never-rotated key, v02 with the version once rotated.
  static encodeForKey(encryptedBlob: Buffer, keyVersion: number): Buffer<ArrayBuffer> {
    if (keyVersion > 1) {
      const keyVersionBlob = Buffer.alloc(KMS_KEY_VERSION_BLOB_LENGTH);
      keyVersionBlob.writeUInt32BE(keyVersion, 0);
      return Buffer.concat([encryptedBlob, keyVersionBlob, Buffer.from(KMS_VERSION_V2, "utf8")]);
    }
    return KmsCiphertext.encodeV01(encryptedBlob);
  }

  // Data-key and input-key blobs, which are always v01.
  static encodeV01(encryptedBlob: Buffer): Buffer<ArrayBuffer> {
    return Buffer.concat([encryptedBlob, Buffer.from(KMS_VERSION, "utf8")]);
  }

  static stripV01(blob: Buffer): Buffer {
    return blob.subarray(0, -KMS_VERSION_BLOB_LENGTH);
  }

  // v02 is recognised structurally, never by trusting the embedded version alone.
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
