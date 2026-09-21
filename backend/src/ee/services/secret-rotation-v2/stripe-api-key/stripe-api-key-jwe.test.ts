import crypto from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { decryptStripeJwe, generateStripeEncryptionKeyPair, readStripeSecret } from "./stripe-api-key-jwe";

/** Builds the compact JWE Stripe would return, so the test proves the real unwrap path. */
const encryptJwe = (
  plaintext: string,
  publicKeyPem: string,
  { alg = "RSA-OAEP", enc = "A256GCM" }: { alg?: string; enc?: string } = {}
) => {
  const header = Buffer.from(JSON.stringify({ alg, enc })).toString("base64url");
  const contentKey = crypto.randomBytes(32);
  const wrapped = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: alg === "RSA-OAEP" ? "sha1" : "sha256"
    },
    contentKey
  );
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", contentKey, iv);
  cipher.setAAD(Buffer.from(header, "ascii"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return [
    header,
    wrapped.toString("base64url"),
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url")
  ].join(".");
};

describe("decryptStripeJwe", () => {
  it("round-trips both algorithms Stripe may use, under FIPS", async () => {
    // The unit suite runs with --force-fips. OAEP with SHA-1 is the algorithm Stripe returns as
    // `RSA-OAEP`, and this assertion is what stops a toolchain bump from breaking live mode silently.
    expect(crypto.getFips()).toBe(1);

    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();

    for (const alg of ["RSA-OAEP", "RSA-OAEP-256"]) {
      const jwe = encryptJwe("rk_live_secret", publicKey, { alg });
      expect(decryptStripeJwe(jwe, privateKey)).toBe("rk_live_secret");
    }
  });

  it("rejects a JWE without exactly five segments", async () => {
    const { privateKey } = await generateStripeEncryptionKeyPair();

    expect(() => decryptStripeJwe("a.b.c", privateKey)).toThrow(/5 segments, got 3/);
  });

  it("names an unsupported key algorithm rather than guessing", async () => {
    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();
    const jwe = encryptJwe("rk_live_secret", publicKey, { alg: "RSA1_5" });

    expect(() => decryptStripeJwe(jwe, privateKey)).toThrow(/RSA1_5/);
  });

  it("rejects an unsupported content encryption algorithm", async () => {
    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();
    const jwe = encryptJwe("rk_live_secret", publicKey, { enc: "A128GCM" });

    expect(() => decryptStripeJwe(jwe, privateKey)).toThrow(/A128GCM/);
  });

  it("rejects an authentication tag that is not the 16 bytes A256GCM requires", async () => {
    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();
    const segments = encryptJwe("rk_live_secret", publicKey).split(".");
    segments[4] = Buffer.from(segments[4], "base64url").subarray(0, 12).toString("base64url");

    expect(() => decryptStripeJwe(segments.join("."), privateKey)).toThrow(/authentication tag is 12 bytes/);
  });

  it("fails a tampered ciphertext with a message an administrator can act on, and logs the cause", async () => {
    const { logger } = await import("@app/lib/logger");
    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();
    const segments = encryptJwe("rk_live_secret", publicKey).split(".");
    segments[4] = Buffer.alloc(16).toString("base64url");

    expect(() => decryptStripeJwe(segments.join("."), privateKey)).toThrow(/could not decrypt the secret/);
    expect(logger.error).toHaveBeenCalledWith(expect.any(Error), expect.stringContaining("decryptStripeJwe"));
  });
});

describe("readStripeSecret", () => {
  // Observed against a real sandbox: supplying a public key makes Stripe return the JWE and the
  // plaintext token together, so this is the ordinary case rather than an edge one.
  it("decrypts the JWE even when Stripe also returns the plaintext token", async () => {
    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();
    const jwe = encryptJwe("rk_test_from_jwe", publicKey);

    expect(readStripeSecret({ token: "rk_test_plain", encrypted_secret: { ciphertext: jwe } }, privateKey)).toBe(
      "rk_test_from_jwe"
    );
  });

  it("falls back to the plaintext token when Stripe returns no ciphertext", async () => {
    const { privateKey } = await generateStripeEncryptionKeyPair();

    expect(readStripeSecret({ token: "rk_test_plain", encrypted_secret: null }, privateKey)).toBe("rk_test_plain");
  });

  it("throws when Stripe returns neither", async () => {
    const { privateKey } = await generateStripeEncryptionKeyPair();

    expect(() => readStripeSecret({}, privateKey)).toThrow(/without a secret/);
    expect(() => readStripeSecret(undefined, privateKey)).toThrow(/without a secret/);
  });
});
