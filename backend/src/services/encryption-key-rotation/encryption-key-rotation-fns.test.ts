import { crypto } from "@app/lib/crypto/cryptography";
import { initLogger } from "@app/lib/logger";
import { resolveInstanceEncryptionKeyBuffer } from "@app/services/kms/kms-fns";

import { generateRootEncryptionKey, getKeyRemovalEligibleAt, resolveKekBuffer } from "./encryption-key-rotation-fns";

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

  // The instance is down when this throws, so the command it names is the operator's way out. Naming
  // the wrong one loops them: the hex recipe read as base64 is 24 bytes, which reproduces this error.
  test("the wrong-length error names the command that works for the key it was reading", () => {
    expect(() => resolveInstanceEncryptionKeyBuffer({ ENCRYPTION_KEY: "tooshort" })).toThrow(/openssl rand -hex 16/);
    expect(() => resolveInstanceEncryptionKeyBuffer({ ROOT_ENCRYPTION_KEY: "dG9vc2hvcnQ=" })).toThrow(
      /openssl rand -base64 32/
    );
  });

  test("and the command it names actually produces a key that resolves", () => {
    for (const isFips of [false, true]) {
      const command = isFips ? "openssl rand -base64 32" : "openssl rand -hex 16";
      let message = "";
      try {
        resolveKekBuffer("tooshort", isFips);
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      expect(message).toContain(command);
      expect(resolveKekBuffer(generateRootEncryptionKey(isFips), isFips)).toHaveLength(32);
    }
  });
});

describe("getKeyRemovalEligibleAt", () => {
  const RETENTION_DAYS = 7;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const supersededAt = new Date("2026-01-01T00:00:00.000Z");

  it("counts from when the key was superseded if nothing has started on it", () => {
    const at = getKeyRemovalEligibleAt({ supersededAt, lastResolvedAt: null }, RETENTION_DAYS);

    expect(at.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("restarts the clock when an instance starts on the key", () => {
    // The whole reason this is computed rather than shown as supersededAt plus the window: a straggler
    // boot is evidence the key is still needed, and the collector declines while that evidence is fresh.
    const lastResolvedAt = new Date(supersededAt.getTime() + 5 * DAY_MS);
    const at = getKeyRemovalEligibleAt({ supersededAt, lastResolvedAt }, RETENTION_DAYS);

    expect(at.toISOString()).toBe("2026-01-13T00:00:00.000Z");
  });

  it("ignores a stamp older than the supersede, which cannot be evidence about this key", () => {
    const lastResolvedAt = new Date(supersededAt.getTime() - 3 * DAY_MS);
    const at = getKeyRemovalEligibleAt({ supersededAt, lastResolvedAt }, RETENTION_DAYS);

    expect(at.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });
});
