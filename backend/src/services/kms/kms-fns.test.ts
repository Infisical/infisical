import { createHash, generateKeyPairSync } from "crypto";
import { describe, expect, it } from "vitest";

import { AsymmetricKeyAlgorithm } from "@app/lib/crypto/sign";
import { BadRequestError } from "@app/lib/errors";

import { buildWrappedKeyPayload, openWrappedKey, validateClassicalKeyMaterial } from "./kms-fns";

const pkcs8Pem = (key: { export: (o: { format: "pem"; type: "pkcs8" }) => string | Buffer }) =>
  Buffer.from(key.export({ format: "pem", type: "pkcs8" }));

describe("validateClassicalKeyMaterial", () => {
  const ed25519 = pkcs8Pem(generateKeyPairSync("ed25519").privateKey);
  const p256 = pkcs8Pem(generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey);
  const p384 = pkcs8Pem(generateKeyPairSync("ec", { namedCurve: "secp384r1" }).privateKey);
  const rsa2048 = pkcs8Pem(generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey);

  it("accepts an Ed25519 PKCS8 PEM declared as ED25519", () => {
    expect(() => validateClassicalKeyMaterial(ed25519, AsymmetricKeyAlgorithm.ED25519)).not.toThrow();
  });

  it("rejects an RSA PEM declared as ED25519", () => {
    expect(() => validateClassicalKeyMaterial(rsa2048, AsymmetricKeyAlgorithm.ED25519)).toThrow(BadRequestError);
  });

  it("rejects an Ed25519 PEM declared as RSA_4096 or ECC_NIST_P256", () => {
    expect(() => validateClassicalKeyMaterial(ed25519, AsymmetricKeyAlgorithm.RSA_4096)).toThrow(BadRequestError);
    expect(() => validateClassicalKeyMaterial(ed25519, AsymmetricKeyAlgorithm.ECC_NIST_P256)).toThrow(BadRequestError);
  });

  it("rejects an RSA key with the wrong modulus length", () => {
    expect(() => validateClassicalKeyMaterial(rsa2048, AsymmetricKeyAlgorithm.RSA_4096)).toThrow(BadRequestError);
  });

  it("distinguishes EC curves", () => {
    expect(() => validateClassicalKeyMaterial(p256, AsymmetricKeyAlgorithm.ECC_NIST_P256)).not.toThrow();
    expect(() => validateClassicalKeyMaterial(p384, AsymmetricKeyAlgorithm.ECC_NIST_P384)).not.toThrow();
    expect(() => validateClassicalKeyMaterial(p256, AsymmetricKeyAlgorithm.ECC_NIST_P384)).toThrow(BadRequestError);
    expect(() => validateClassicalKeyMaterial(p384, AsymmetricKeyAlgorithm.ECC_NIST_P521)).toThrow(BadRequestError);
  });

  it("ignores algorithms it has no shape for", () => {
    expect(() => validateClassicalKeyMaterial(ed25519, AsymmetricKeyAlgorithm.ML_DSA_44)).not.toThrow();
  });
});

describe("wrapped keys", () => {
  const key = Buffer.alloc(32, 7);

  // An Agent Vault session can have no expiry, so keys wrapped before this helper existed must keep opening.
  it("opens a key in the layout Agent Vault session keys were always stored in", () => {
    const sessionId = "6f1c7a52-3f7e-4c8e-9a40-0b2d6c1e9f11";
    const storedBefore = Buffer.concat([createHash("sha256").update(`${sessionId}|v1`).digest(), key]);

    expect(buildWrappedKeyPayload(`${sessionId}|v1`, key).equals(storedBefore)).toBe(true);
    expect(openWrappedKey({ label: `${sessionId}|v1`, payload: storedBefore, keyBytes: 32 })?.equals(key)).toBe(true);
  });

  it("refuses a key wrapped for another label", () => {
    const payload = buildWrappedKeyPayload("session-a|v1", key);
    expect(openWrappedKey({ label: "session-b|v1", payload, keyBytes: 32 })).toBeNull();
  });

  it("refuses a payload of the wrong size", () => {
    expect(openWrappedKey({ label: "session-a|v1", payload: key, keyBytes: 32 })).toBeNull();
    const payload = buildWrappedKeyPayload("session-a|v1", key);
    expect(openWrappedKey({ label: "session-a|v1", payload, keyBytes: 16 })).toBeNull();
  });
});
