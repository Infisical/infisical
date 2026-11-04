import { describe, expect, it } from "vitest";

import { compressSecretCachePayload, decompressSecretCachePayload } from "./secret-cache-compression";

const buildPayload = (count: number) =>
  Buffer.from(
    JSON.stringify({
      secrets: Array.from({ length: count }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        secretKey: `APP_SECRET_${i}`,
        secretValue: `postgres://svc_${i}:pa$$-${i}@db.internal:5432/app`,
        secretPath: "/",
        environment: "prod",
        tags: []
      })),
      imports: []
    })
  );

describe("secret cache compression", () => {
  it("returns the exact serialized bytes after a round trip", async () => {
    const payload = buildPayload(500);

    const restored = await decompressSecretCachePayload(await compressSecretCachePayload(payload));

    // The cache-hit ETag is a hash of these bytes, so they must match the miss path byte for byte.
    expect(restored.equals(payload)).toBe(true);
  });

  it("stores a secrets payload in a fraction of its serialized size", async () => {
    const payload = buildPayload(2000);

    const compressed = await compressSecretCachePayload(payload);

    expect(compressed.byteLength).toBeLessThan(payload.byteLength / 4);
  });

  it("round-trips an empty payload", async () => {
    const payload = Buffer.from(JSON.stringify({ secrets: [], imports: [] }));

    const restored = await decompressSecretCachePayload(await compressSecretCachePayload(payload));

    expect(restored.equals(payload)).toBe(true);
  });

  it("rejects bytes that are not a zstd frame", async () => {
    await expect(decompressSecretCachePayload(Buffer.from("not compressed"))).rejects.toThrow();
  });
});
