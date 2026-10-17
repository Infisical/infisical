import { createPublicKey, verify, webcrypto } from "node:crypto";

import { CertificationRequest } from "@peculiar/asn1-csr";
import { AsnConvert } from "@peculiar/asn1-schema";
import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, it } from "vitest";

import { HsmKeyAlgorithm } from "@app/services/signer/signer-enums";

import { buildCsrWithExternalSigner } from "./build-csr-with-external-signer";

type TCase = {
  hsmKeyAlgorithm: HsmKeyAlgorithm;
  gen: RsaHashedKeyGenParams | EcKeyGenParams;
  sign: AlgorithmIdentifier | EcdsaParams;
  hash: string;
};

const CASES: TCase[] = [
  {
    hsmKeyAlgorithm: HsmKeyAlgorithm.RSA_3072,
    gen: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 3072 },
    sign: { name: "RSASSA-PKCS1-v1_5" },
    hash: "sha256"
  },
  {
    hsmKeyAlgorithm: HsmKeyAlgorithm.ECC_P256,
    gen: { name: "ECDSA", namedCurve: "P-256" },
    sign: { name: "ECDSA", hash: "SHA-256" },
    hash: "sha256"
  },
  {
    hsmKeyAlgorithm: HsmKeyAlgorithm.ECC_P384,
    gen: { name: "ECDSA", namedCurve: "P-384" },
    sign: { name: "ECDSA", hash: "SHA-384" },
    hash: "sha384"
  }
];

beforeAll(() => {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);
});

describe.each(CASES)("buildCsrWithExternalSigner: $hsmKeyAlgorithm", (testCase) => {
  it("should produce CSRs whose DER signature verifies with OpenSSL for every signature value", async () => {
    const keys = (await webcrypto.subtle.generateKey(testCase.gen, true, ["sign", "verify"])) as CryptoKeyPair;
    const publicKeySpkiDer = Buffer.from(await webcrypto.subtle.exportKey("spki", keys.publicKey));
    const iterations = testCase.hsmKeyAlgorithm === HsmKeyAlgorithm.RSA_3072 ? 3 : 40;

    for (let i = 0; i < iterations; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { csrDer } = await buildCsrWithExternalSigner({
        publicKeySpkiDer,
        keyAlgorithm: testCase.hsmKeyAlgorithm,
        subjectCommonName: "Example Code Signing",
        signCallback: async (tbs) => Buffer.from(await webcrypto.subtle.sign(testCase.sign, keys.privateKey, tbs))
      });
      const csr = AsnConvert.parse(csrDer, CertificationRequest);
      const isValid = verify(
        testCase.hash,
        Buffer.from(AsnConvert.serialize(csr.certificationRequestInfo)),
        createPublicKey({ key: publicKeySpkiDer, format: "der", type: "spki" }),
        Buffer.from(csr.signature)
      );
      expect(isValid).toBe(true);
    }
  });
});
