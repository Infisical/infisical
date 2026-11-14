import { EncryptedDataKey } from "./encrypted-data-key";

describe("EncryptedDataKey", () => {
  const key = EncryptedDataKey.restore({ kmsKeyId: "kms-1", encryptedDataKey: Buffer.from("dk"), orgId: "org-1" });

  test("should produce the cache payload old pods read", () => {
    expect(key.toCacheJSON()).toEqual({
      kmsSecretManagerKeyId: "kms-1",
      kmsSecretManagerEncryptedDataKey: Buffer.from("dk").toString("base64"),
      orgId: "org-1"
    });
  });

  test("should round trip through the cache payload", () => {
    const restored = EncryptedDataKey.fromCacheJSON(
      JSON.parse(JSON.stringify(key.toCacheJSON())) as ReturnType<typeof key.toCacheJSON>
    );

    expect(restored?.equals(key)).toBe(true);
  });

  test("should treat a payload with any null or missing field as a miss", () => {
    const payload = key.toCacheJSON();

    expect(EncryptedDataKey.fromCacheJSON({ ...payload, kmsSecretManagerKeyId: null })).toBeNull();
    expect(EncryptedDataKey.fromCacheJSON({ ...payload, kmsSecretManagerEncryptedDataKey: null })).toBeNull();
    expect(EncryptedDataKey.fromCacheJSON({ ...payload, orgId: null })).toBeNull();
    expect(EncryptedDataKey.fromCacheJSON({ orgId: "org-1" })).toBeNull();
    expect(EncryptedDataKey.fromCacheJSON(null)).toBeNull();
  });
});
