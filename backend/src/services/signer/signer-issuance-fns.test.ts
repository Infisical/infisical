import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, it } from "vitest";

import { assertHsmKeyMatchesCertificate } from "./signer-issuance-fns";

type TCase = {
  name: string;
  gen: RsaHashedKeyGenParams | EcKeyGenParams;
  sign: AlgorithmIdentifier | EcdsaParams;
  mechanism: string;
};

const CASES: TCase[] = [
  {
    name: "RSA-3072",
    gen: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 3072 },
    sign: { name: "RSASSA-PKCS1-v1_5" },
    mechanism: "CKM_SHA256_RSA_PKCS"
  },
  {
    name: "ECDSA P-256",
    gen: { name: "ECDSA", namedCurve: "P-256" },
    sign: { name: "ECDSA", hash: "SHA-256" },
    mechanism: "CKM_ECDSA_SHA256"
  },
  {
    name: "ECDSA P-384",
    gen: { name: "ECDSA", namedCurve: "P-384" },
    sign: { name: "ECDSA", hash: "SHA-256" },
    mechanism: "CKM_ECDSA_SHA256"
  }
];

const generateKeys = async (gen: TCase["gen"]) =>
  (await webcrypto.subtle.generateKey(gen, true, ["sign", "verify"])) as CryptoKeyPair;

const createCertificate = async (gen: TCase["gen"], keys: CryptoKeyPair) =>
  x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=Example Code Signing",
    notBefore: new Date(Date.now() - 86_400_000),
    notAfter: new Date(Date.now() + 86_400_000),
    signingAlgorithm: gen as Algorithm,
    keys
  });

const signedWithPublicKeys: (Buffer | null)[] = [];

const fakeHsm = (testCase: TCase, privateKey: CryptoKey, publicKeySpki?: Buffer) => ({
  getPublicKey: async () => {
    if (!publicKeySpki) throw new Error("PKCS#11 request failed (key_not_found): Key not found on this HSM");
    return publicKeySpki;
  },
  signWithKeyId: async (args: { mechanism: string; data: Buffer; isDigest: boolean; publicKeySpki: Buffer | null }) => {
    expect(args.mechanism).toBe(testCase.mechanism);
    signedWithPublicKeys.push(args.publicKeySpki);
    expect(args.isDigest).toBe(false);
    return {
      signature: Buffer.from(await webcrypto.subtle.sign(testCase.sign, privateKey, args.data)),
      keyId: "0a1b"
    };
  }
});

beforeAll(() => {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);
});

describe.each(CASES)("assertHsmKeyMatchesCertificate: $name", (testCase) => {
  const input = { hsmConnectorId: "connector", projectId: "project", hsmKeyLabel: "example-key" };

  it("should accept the key the certificate was issued for and return its key ID", async () => {
    const keys = await generateKeys(testCase.gen);
    const certificate = await createCertificate(testCase.gen, keys);

    await expect(
      assertHsmKeyMatchesCertificate(
        { hsmConnectorService: fakeHsm(testCase, keys.privateKey) },
        { ...input, certificate }
      )
    ).resolves.toEqual({ hsmKeyId: "0a1b" });
    expect(signedWithPublicKeys.at(-1)?.equals(Buffer.from(certificate.publicKey.rawData))).toBe(true);
  });

  it("should reject without signing when the HSM's public key for the label differs from the certificate", async () => {
    const certificateKeys = await generateKeys(testCase.gen);
    const otherKeys = await generateKeys(testCase.gen);
    const certificate = await createCertificate(testCase.gen, certificateKeys);
    const otherSpki = Buffer.from(await webcrypto.subtle.exportKey("spki", otherKeys.publicKey));
    const hsm = {
      getPublicKey: async () => otherSpki,
      signWithKeyId: async () => {
        throw new Error("sign must not be called");
      }
    };

    await expect(
      assertHsmKeyMatchesCertificate({ hsmConnectorService: hsm }, { ...input, certificate })
    ).rejects.toThrow("does not match the certificate's public key");
  });

  it("should fall back to a challenge signature when the HSM can't read the public key", async () => {
    const keys = await generateKeys(testCase.gen);
    const certificate = await createCertificate(testCase.gen, keys);
    const hsm = {
      ...fakeHsm(testCase, keys.privateKey),
      getPublicKey: async () => {
        throw new Error("PKCS#11 request failed (internal): Operation failed");
      }
    };

    await expect(
      assertHsmKeyMatchesCertificate({ hsmConnectorService: hsm }, { ...input, certificate })
    ).resolves.toEqual({ hsmKeyId: "0a1b" });
  });

  it("should surface HSM errors other than a missing public key without signing", async () => {
    const keys = await generateKeys(testCase.gen);
    const certificate = await createCertificate(testCase.gen, keys);
    const hsm = {
      getPublicKey: async () => {
        throw new Error("PKCS#11 request failed (pin_incorrect): The HSM rejected the PIN");
      },
      signWithKeyId: async () => {
        throw new Error("sign must not be called");
      }
    };

    await expect(
      assertHsmKeyMatchesCertificate({ hsmConnectorService: hsm }, { ...input, certificate })
    ).rejects.toThrow("(pin_incorrect)");
  });

  it("should explain an older gateway rejecting a duplicate label without signing", async () => {
    const keys = await generateKeys(testCase.gen);
    const certificate = await createCertificate(testCase.gen, keys);
    const hsm = {
      getPublicKey: async () => {
        throw new Error("PKCS#11 request failed (bad_request): Invalid request");
      },
      signWithKeyId: async () => {
        throw new Error("sign must not be called");
      }
    };

    await expect(
      assertHsmKeyMatchesCertificate({ hsmConnectorService: hsm }, { ...input, certificate })
    ).rejects.toThrow("Check that exactly one private key in the HSM Connector's slot has this label.");
  });

  it("should reject a key that does not match the certificate", async () => {
    const certificateKeys = await generateKeys(testCase.gen);
    const otherKeys = await generateKeys(testCase.gen);
    const certificate = await createCertificate(testCase.gen, certificateKeys);

    await expect(
      assertHsmKeyMatchesCertificate(
        { hsmConnectorService: fakeHsm(testCase, otherKeys.privateKey) },
        { ...input, certificate }
      )
    ).rejects.toThrow("does not match the certificate's public key");
  });
});
