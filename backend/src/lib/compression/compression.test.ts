import { describe, expect, it } from "vitest";

import { compressZstd, decompressZstd } from "./index";

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

describe("zstd compression", () => {
  it("returns the exact serialized bytes after a round trip", async () => {
    const payload = buildPayload(500);

    const restored = await decompressZstd(await compressZstd(payload));

    // Callers that hash the original bytes (the secret cache ETag) need them back byte for byte.
    expect(restored.equals(payload)).toBe(true);
  });

  it("shrinks a repetitive JSON payload to a fraction of its size", async () => {
    const payload = buildPayload(2000);

    const compressed = await compressZstd(payload);

    expect(compressed.byteLength).toBeLessThan(payload.byteLength / 4);
  });

  it("round-trips an empty payload", async () => {
    const payload = Buffer.from(JSON.stringify({ secrets: [], imports: [] }));

    const restored = await decompressZstd(await compressZstd(payload));

    expect(restored.equals(payload)).toBe(true);
  });

  it("rejects bytes that are not a zstd frame", async () => {
    await expect(decompressZstd(Buffer.from("not compressed"))).rejects.toThrow();
  });
});
