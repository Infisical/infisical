import crypto from "node:crypto";

import { createSecretValueBlindIndexer, generateSecretValueBlindIndexFromKmsKey } from "./blind-index";

describe("createSecretValueBlindIndexer", () => {
  const dataKey = crypto.randomBytes(32);

  test("matches the per-value derivation, so existing digests stay searchable", async () => {
    const generate = createSecretValueBlindIndexer(dataKey);
    const values = ["sk_live_abc123", "", " padded ", "-----BEGIN KEY-----\nline\n-----END KEY-----"];

    for await (const value of values) {
      expect(await generate(Buffer.from(value))).toBe(
        await generateSecretValueBlindIndexFromKmsKey(Buffer.from(value), dataKey)
      );
    }
  });

  test("gives the same digest when many values are hashed at once", async () => {
    const generate = createSecretValueBlindIndexer(dataKey);
    const digests = await Promise.all(Array.from({ length: 20 }, () => generate(Buffer.from("same"))));

    expect(new Set(digests).size).toBe(1);
  });

  test("gives different digests under different data keys", async () => {
    const value = Buffer.from("same");
    const a = await createSecretValueBlindIndexer(dataKey)(value);
    const b = await createSecretValueBlindIndexer(crypto.randomBytes(32))(value);

    expect(a).not.toBe(b);
  });
});
