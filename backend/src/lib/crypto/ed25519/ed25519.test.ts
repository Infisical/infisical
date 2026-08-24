import { createHash } from "crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "../sign/types";
import { signingService } from "../sign/signing";

import { initializeOpenSSLExtSupport, isOpenSSLExtAvailable } from "./openssl-ext";

describe("Ed25519ph signing", () => {
  beforeAll(async () => {
    await initializeOpenSSLExtSupport();
  });

  it("signs and verifies a SHA-512 prehash with a generated key pair", async ({ skip }) => {
    if (!isOpenSSLExtAvailable()) skip();

    const ed25519 = signingService(AsymmetricKeyAlgorithm.ECC_NIST_EDWARDS25519);
    const privateKey = await ed25519.generateAsymmetricPrivateKey();
    const publicKey = await ed25519.getPublicKeyFromPrivateKey(privateKey);
    const digest = createHash("sha512").update("Ed25519ph signing test").digest();

    const signature = await ed25519.sign(digest, privateKey, SigningAlgorithm.ED25519_PH_SHA_512, true);

    expect(signature).toBeInstanceOf(Buffer);
    expect(signature).toHaveLength(64);

    await expect(
      ed25519.verify(digest, signature, publicKey, SigningAlgorithm.ED25519_PH_SHA_512, true)
    ).resolves.toBe(true);
  });
});
