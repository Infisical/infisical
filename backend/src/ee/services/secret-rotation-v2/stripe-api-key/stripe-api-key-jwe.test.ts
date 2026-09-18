import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

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

  it("fails a tampered ciphertext", async () => {
    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();
    const segments = encryptJwe("rk_live_secret", publicKey).split(".");
    segments[4] = Buffer.alloc(16).toString("base64url");

    expect(() => decryptStripeJwe(segments.join("."), privateKey)).toThrow();
  });
});

describe("readStripeSecret", () => {
  it("prefers the plaintext token test mode returns", async () => {
    const { privateKey } = await generateStripeEncryptionKeyPair();

    expect(readStripeSecret({ token: "rk_test_plain", encrypted_secret: null }, privateKey)).toBe("rk_test_plain");
  });

  it("decrypts the JWE live mode returns", async () => {
    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();
    const jwe = encryptJwe("rk_live_secret", publicKey);

    expect(readStripeSecret({ encrypted_secret: { ciphertext: jwe } }, privateKey)).toBe("rk_live_secret");
  });

  it("throws when Stripe returns neither", async () => {
    const { privateKey } = await generateStripeEncryptionKeyPair();

    expect(() => readStripeSecret({}, privateKey)).toThrow(/without a secret/);
    expect(() => readStripeSecret(undefined, privateKey)).toThrow(/without a secret/);
  });
});
