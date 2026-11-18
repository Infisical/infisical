import { generateKeyPairSync } from "node:crypto";

import { RuleViolationError } from "@app/domains/lib/errors";
import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { HmacAlgorithm } from "@app/lib/crypto/hmac";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign";

import { KeyMaterial, KmsKeyUsage } from "./key-material";
import { RootKey } from "./root-key";

const ed25519Pem = () => KeyMaterial.generate(KmsKeyUsage.SIGN_VERIFY, AsymmetricKeyAlgorithm.ED25519);

describe("KeyMaterial.assertAlgorithmFits", () => {
  test.each([
    [KmsKeyUsage.ENCRYPT_DECRYPT, "RSA_4096", "Unsupported encryption algorithm for encrypt/decrypt key: RSA_4096"],
    [KmsKeyUsage.SIGN_VERIFY, "aes-256-gcm", "Unsupported sign/verify algorithm for sign/verify key: aes-256-gcm"],
    [
      KmsKeyUsage.GENERATE_VERIFY_MAC,
      "aes-256-gcm",
      "Unsupported HMAC algorithm for generate/verify MAC key: aes-256-gcm"
    ],
    ["nonsense", "aes-256-gcm", "Unsupported key type: nonsense"]
  ])("should refuse %s with %s", (usage, algorithm, message) => {
    // Setup
    const fit = () => KeyMaterial.assertAlgorithmFits(usage as KmsKeyUsage, algorithm as never);

    // Action
    const result = fit;

    // Assert
    expect(result).toThrow(RuleViolationError);
    expect(result).toThrow(message);
  });
});

describe("KeyMaterial.generate", () => {
  test.each([
    [KmsKeyUsage.ENCRYPT_DECRYPT, SymmetricKeyAlgorithm.AES_GCM_256, 32],
    [KmsKeyUsage.ENCRYPT_DECRYPT, SymmetricKeyAlgorithm.AES_GCM_128, 16],
    [KmsKeyUsage.GENERATE_VERIFY_MAC, HmacAlgorithm.HMAC_SHA_256, 32],
    [KmsKeyUsage.GENERATE_VERIFY_MAC, HmacAlgorithm.HMAC_SHA_512, 64]
  ])("should generate %s material for %s of %i bytes", async (usage, algorithm, length) => {
    // Setup
    const generate = KeyMaterial.generate(usage, algorithm);

    // Action
    const material = await generate;

    // Assert
    expect(material.exportBytes()).toHaveLength(length);
  });

  test("should generate a signing key whose public half can be derived", async () => {
    // Setup
    const material = await ed25519Pem();

    // Action
    const publicKey = await material.publicKey();

    // Assert
    expect(publicKey.length).toBeGreaterThan(0);
  });

  test("should refuse an algorithm the usage cannot use", async () => {
    // Setup
    const generate = KeyMaterial.generate(KmsKeyUsage.ENCRYPT_DECRYPT, HmacAlgorithm.HMAC_SHA_256);

    // Action
    const result = generate;

    // Assert
    await expect(result).rejects.toThrow("Unsupported encryption algorithm for encrypt/decrypt key");
  });
});

describe("KeyMaterial.import", () => {
  test.each([
    [SymmetricKeyAlgorithm.AES_GCM_256, 16, "Invalid key material length for aes-256-gcm. Expected 32 bytes, got 16."],
    [SymmetricKeyAlgorithm.AES_GCM_128, 32, "Invalid key material length for aes-128-gcm. Expected 16 bytes, got 32."]
  ])("should refuse symmetric material of the wrong length for %s", async (algorithm, length, message) => {
    // Setup
    const bytes = crypto.randomBytes(length);

    // Action
    const result = KeyMaterial.import(bytes, KmsKeyUsage.ENCRYPT_DECRYPT, algorithm);

    // Assert
    await expect(result).rejects.toThrow(message);
  });

  test.each([
    [15, false],
    [16, true],
    [1024, true],
    [1025, false]
  ])("should judge HMAC material of %i bytes valid: %s", async (length, valid) => {
    // Setup
    const result = KeyMaterial.import(
      crypto.randomBytes(length),
      KmsKeyUsage.GENERATE_VERIFY_MAC,
      HmacAlgorithm.HMAC_SHA_256
    );

    // Action
    const outcome = await result.then(
      () => true,
      (error: Error) => error.message
    );

    // Assert
    if (valid) expect(outcome).toBe(true);
    else {
      expect(outcome).toBe(`Invalid HMAC key material length. Expected between 16 and 1024 bytes, got ${length}.`);
    }
  });

  test.each([
    [AsymmetricKeyAlgorithm.ED25519, "PKCS8 PEM-encoded"],
    [AsymmetricKeyAlgorithm.RSA_4096, "PKCS8 PEM-encoded"],
    [AsymmetricKeyAlgorithm.ML_DSA_65, "PKCS8 DER-encoded"]
  ])("should refuse bytes that are not a private key for %s", async (algorithm, format) => {
    // Setup
    const result = KeyMaterial.import(Buffer.from("not a key"), KmsKeyUsage.SIGN_VERIFY, algorithm);

    // Action
    const outcome = result;

    // Assert
    await expect(outcome).rejects.toThrow(`Invalid private key material. Expected a ${format} private key.`);
  });

  test("should accept a key of the declared shape and sign with it", async () => {
    // Setup
    const generated = await ed25519Pem();

    // Action
    const imported = await KeyMaterial.import(
      generated.exportBytes(),
      KmsKeyUsage.SIGN_VERIFY,
      AsymmetricKeyAlgorithm.ED25519
    );

    // Assert
    const signature = await imported.sign(Buffer.from("x"), SigningAlgorithm.ED25519, false);
    expect(await generated.verify(Buffer.from("x"), signature, SigningAlgorithm.ED25519, false)).toBe(true);
  });

  test("should refuse a key whose shape differs from the declared algorithm", async () => {
    // Setup
    const generated = await ed25519Pem();

    // Action
    const result = KeyMaterial.import(
      generated.exportBytes(),
      KmsKeyUsage.SIGN_VERIFY,
      AsymmetricKeyAlgorithm.ECC_NIST_P256
    );

    // Assert
    await expect(result).rejects.toThrow(
      "Key material does not match the declared algorithm. Expected an EC P-256 key."
    );
  });
});

const pemFormat = {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
} as const;

const generateRsaPem = (modulusLength: number) =>
  generateKeyPairSync("rsa", { modulusLength, ...pemFormat }).privateKey;

const generateEcPem = (namedCurve: string) => generateKeyPairSync("ec", { namedCurve, ...pemFormat }).privateKey;

describe("KeyMaterial.import key shapes", () => {
  test.each([
    ["an RSA-2048 key declared RSA_4096", () => generateRsaPem(2048), "RSA_4096", "an RSA 4096-bit key"],
    ["an RSA key declared ED25519", () => generateRsaPem(2048), "ED25519", "an Ed25519 key"],
    ["a P-256 key declared P-384", () => generateEcPem("P-256"), "ECC_NIST_P384", "an EC P-384 key"],
    ["a P-384 key declared P-521", () => generateEcPem("P-384"), "ECC_NIST_P521", "an EC P-521 key"]
  ])("should refuse %s", async (_name, makePem, algorithm, label) => {
    // Setup
    const pem = Buffer.from(makePem());

    // Action
    const result = KeyMaterial.import(pem, KmsKeyUsage.SIGN_VERIFY, algorithm as AsymmetricKeyAlgorithm);

    // Assert
    await expect(result).rejects.toThrow(RuleViolationError);
    await expect(result).rejects.toThrow(`Key material does not match the declared algorithm. Expected ${label}.`);
  });

  test.each([
    ["P-256", "ECC_NIST_P256"],
    ["P-384", "ECC_NIST_P384"]
  ])("should accept a %s key declared at its own curve", async (curve, algorithm) => {
    // Setup
    const pem = Buffer.from(generateEcPem(curve));

    // Action
    const material = await KeyMaterial.import(pem, KmsKeyUsage.SIGN_VERIFY, algorithm as AsymmetricKeyAlgorithm);

    // Assert
    expect(material.exportBytes()).toEqual(pem);
  });
});

describe("KeyMaterial operations", () => {
  test("should refuse an operation the usage does not allow", () => {
    // Setup
    const material = KeyMaterial.generateSymmetric();

    // Action
    const result = () => material.generateMac(Buffer.from("x"));

    // Assert
    expect(result).toThrow("Unsupported key type, expected generate-verify-mac but got encrypt-decrypt");
  });

  test("should wrap so that only the same root key restores it", () => {
    // Setup
    const rootKey = RootKey.generate();
    const material = KeyMaterial.generateSymmetric();
    const wrapped = material.wrap(rootKey);

    // Action
    const restored = KeyMaterial.restore(rootKey.decrypt(wrapped), KmsKeyUsage.ENCRYPT_DECRYPT, material.algorithm);

    // Assert
    expect(restored.decrypt(material.encrypt(Buffer.from("x"))).toString()).toBe("x");
    expect(() => RootKey.generate().decrypt(wrapped)).toThrow();
  });
});
