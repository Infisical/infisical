import { describe, expect, test, vi } from "vitest";

import { createS3Bucket } from "./s3";

vi.mock("@app/lib/crypto/cryptography", async () => ({
  crypto: { isFipsModeEnabled: () => false, nativeCrypto: await import("node:crypto") }
}));

describe("presignCreateOnlyPut", () => {
  const bucket = createS3Bucket({
    region: "us-east-1",
    bucket: "my-bucket",
    credentials: { accessKeyId: "AKIAEXAMPLE", secretAccessKey: "example-secret" }
  });

  test("signs the length, the digest and a create-only condition, so none can be dropped or changed", async () => {
    const url = new URL(
      await bucket.presignCreateOnlyPut({
        key: "logs/a.json.enc",
        contentLength: 42,
        sha256Base64: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
        expiresInSeconds: 300
      })
    );
    const signed = (url.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");
    expect(signed).toContain("content-length");
    expect(signed).toContain("if-none-match");
    expect(signed).toContain("x-amz-checksum-sha256");
    expect(url.searchParams.has("x-amz-checksum-sha256")).toBe(false);
  });
});
