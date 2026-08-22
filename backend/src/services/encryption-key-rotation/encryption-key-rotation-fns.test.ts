import { crypto } from "@app/lib/crypto/cryptography";
import { initLogger } from "@app/lib/logger";
import { resolveInstanceEncryptionKeyBuffer } from "@app/services/kms/kms-fns";

import { generateRootEncryptionKey, resolveKekBuffer } from "./encryption-key-rotation-fns";

// The cryptography module logs during initialization, and the logger is a module-level singleton that
// only exists once initLogger has run.
beforeAll(async () => {
  initLogger();
  await crypto.initialize({ findById: async () => null } as never, {} as never, {} as never, {} as never);
});

describe("generateRootEncryptionKey", () => {
  // The 16-versus-32 slip: randomBytes(32).toString("hex") is 64 characters, utf8-decodes to 64 bytes,
  // and AES-256 rejects it, so the instance would not boot. Assert the resolved buffer, not the string.
  test.each([
    [false, 32],
    [true, 44]
  ])("fips=%s generates a key that resolves to 32 bytes", (fips, expectedLength) => {
    const key = generateRootEncryptionKey(fips);
    expect(key).toHaveLength(expectedLength);
    expect(resolveKekBuffer(key, fips)).toHaveLength(32);
  });

  test("off FIPS the key is 32 hex characters, so it survives a utf8 read", () => {
    const key = generateRootEncryptionKey(false);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(Buffer.from(key, "utf8")).toHaveLength(32);
  });

  test("on FIPS the key decodes to exactly 256 bits", () => {
    expect(Buffer.from(generateRootEncryptionKey(true), "base64")).toHaveLength(32);
  });

  test("generated keys are not repeated", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateRootEncryptionKey(false)));
    expect(keys.size).toBe(50);
  });
});

describe("resolveKekBuffer", () => {
  test("rejects a key of the wrong length rather than producing a broken instance", () => {
    expect(() => resolveKekBuffer("tooshort", false)).toThrow();
    // the exact slip this guards: 32 random bytes rendered as hex
    expect(() => resolveKekBuffer(crypto.randomBytes(32).toString("hex"), false)).toThrow();
  });

  // The prediction has to agree with the boot path or the instance will not start. Both go through
  // resolveInstanceEncryptionKeyBuffer, so this asserts the simulated environments are the right ones:
  // off FIPS the operator's value lands in ENCRYPTION_KEY, on FIPS initEnvConfig relocates it.
  test("agrees with the boot path for the environment the operator will create", () => {
    const hexKey = generateRootEncryptionKey(false);
    expect(resolveKekBuffer(hexKey, false)).toEqual(resolveInstanceEncryptionKeyBuffer({ ENCRYPTION_KEY: hexKey }));

    const b64Key = generateRootEncryptionKey(true);
    expect(resolveKekBuffer(b64Key, true)).toEqual(resolveInstanceEncryptionKeyBuffer({ ROOT_ENCRYPTION_KEY: b64Key }));
  });

  test("a key generated for one mode does not resolve in the other", () => {
    // 32 hex characters base64-decode to 24 bytes, and a 44-character base64 value utf8-decodes to 44,
    // so a key generated for the wrong mode is caught rather than silently producing a bad AES key.
    expect(() => resolveKekBuffer(generateRootEncryptionKey(false), true)).toThrow();
    expect(() => resolveKekBuffer(generateRootEncryptionKey(true), false)).toThrow();
  });
});
