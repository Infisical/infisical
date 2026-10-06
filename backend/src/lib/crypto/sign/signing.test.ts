import { describe, expect, it } from "vitest";

import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";

import { signingService } from "./signing";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "./types";

const data = Buffer.from("payload to sign");

describe("signingService ED25519", () => {
  const service = signingService(AsymmetricKeyAlgorithm.ED25519);

  it("generates a PKCS8 PEM Ed25519 private key", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    const keyObject = crypto.nativeCrypto.createPrivateKey({ key: privateKey, format: "pem", type: "pkcs8" });
    expect(keyObject.asymmetricKeyType).toBe("ed25519");
  });

  it("derives a SPKI DER public key", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    const publicKey = await service.getPublicKeyFromPrivateKey(privateKey);
    const keyObject = crypto.nativeCrypto.createPublicKey({ key: publicKey, format: "der", type: "spki" });
    expect(keyObject.asymmetricKeyType).toBe("ed25519");
    expect(publicKey.length).toBe(44);
  });

  it("signs and verifies, deterministically", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    const publicKey = await service.getPublicKeyFromPrivateKey(privateKey);

    const signature = await service.sign(data, privateKey, SigningAlgorithm.ED25519, false);
    const signatureAgain = await service.sign(data, privateKey, SigningAlgorithm.ED25519, false);

    expect(signature.length).toBe(64);
    expect(signature.equals(signatureAgain)).toBe(true);
    await expect(service.verify(data, signature, publicKey, SigningAlgorithm.ED25519, false)).resolves.toBe(true);
  });

  it("rejects a tampered message and a tampered signature", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    const publicKey = await service.getPublicKeyFromPrivateKey(privateKey);
    const signature = await service.sign(data, privateKey, SigningAlgorithm.ED25519, false);

    const tamperedSignature = Buffer.from(signature);
    tamperedSignature[0] = tamperedSignature[0] === 0 ? 1 : 0;

    await expect(
      service.verify(Buffer.from("other payload"), signature, publicKey, SigningAlgorithm.ED25519, false)
    ).resolves.toBe(false);
    await expect(service.verify(data, tamperedSignature, publicKey, SigningAlgorithm.ED25519, false)).resolves.toBe(
      false
    );
  });

  it("rejects a signature from a different key", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    const otherPublicKey = await service.getPublicKeyFromPrivateKey(await service.generateAsymmetricPrivateKey());
    const signature = await service.sign(data, privateKey, SigningAlgorithm.ED25519, false);

    await expect(service.verify(data, signature, otherPublicKey, SigningAlgorithm.ED25519, false)).resolves.toBe(false);
  });

  it("rejects digest input", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    const publicKey = await service.getPublicKeyFromPrivateKey(privateKey);
    const digest = crypto.nativeCrypto.createHash("sha256").update(data).digest();

    await expect(service.sign(digest, privateKey, SigningAlgorithm.ED25519, true)).rejects.toBeInstanceOf(
      BadRequestError
    );
    await expect(
      service.verify(digest, Buffer.alloc(64), publicKey, SigningAlgorithm.ED25519, true)
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects non-Ed25519 signing algorithms", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    const publicKey = await service.getPublicKeyFromPrivateKey(privateKey);

    await expect(service.sign(data, privateKey, SigningAlgorithm.ECDSA_SHA_256, false)).rejects.toBeInstanceOf(
      BadRequestError
    );
    await expect(
      service.verify(data, Buffer.alloc(64), publicKey, SigningAlgorithm.RSASSA_PSS_SHA_256, false)
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("verifies a signature produced by node crypto directly", async () => {
    const privateKey = await service.generateAsymmetricPrivateKey();
    const publicKey = await service.getPublicKeyFromPrivateKey(privateKey);
    const keyObject = crypto.nativeCrypto.createPrivateKey({ key: privateKey, format: "pem", type: "pkcs8" });
    const externalSignature = crypto.nativeCrypto.sign(null, data, keyObject);

    await expect(service.verify(data, externalSignature, publicKey, SigningAlgorithm.ED25519, false)).resolves.toBe(
      true
    );
  });
});

describe("signingService rejects ED25519 on other key types", () => {
  it.each([AsymmetricKeyAlgorithm.RSA_4096, AsymmetricKeyAlgorithm.ECC_NIST_P256])(
    "%s key cannot sign with ED25519",
    async (keyAlgorithm) => {
      const service = signingService(keyAlgorithm);
      const privateKey = await service.generateAsymmetricPrivateKey();
      await expect(service.sign(data, privateKey, SigningAlgorithm.ED25519, false)).rejects.toBeInstanceOf(
        BadRequestError
      );
    }
  );
});
