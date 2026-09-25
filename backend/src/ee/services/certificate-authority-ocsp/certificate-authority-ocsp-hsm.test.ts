import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import { beforeAll, describe, expect, it } from "vitest";

import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { buildHsmCaSigner } from "@app/services/certificate-authority/ca-signer";

import { OcspCertStatus, OcspResponseStatus } from "./certificate-authority-ocsp-enums";
import { buildSignedOcspResponse, parseOcspRequest } from "./certificate-authority-ocsp-fns";

type TCase = {
  keyAlgorithm: CertKeyAlgorithm;
  gen: RsaHashedKeyGenParams | EcKeyGenParams;
  sign: AlgorithmIdentifier | EcdsaParams;
  isEcdsa: boolean;
};

const CASES: TCase[] = [
  {
    keyAlgorithm: CertKeyAlgorithm.RSA_2048,
    gen: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048 },
    sign: { name: "RSASSA-PKCS1-v1_5" },
    isEcdsa: false
  },
  {
    keyAlgorithm: CertKeyAlgorithm.ECDSA_P256,
    gen: { name: "ECDSA", namedCurve: "P-256" },
    sign: { name: "ECDSA", hash: "SHA-256" },
    isEcdsa: true
  },
  {
    keyAlgorithm: CertKeyAlgorithm.ECDSA_P384,
    gen: { name: "ECDSA", namedCurve: "P-384" },
    sign: { name: "ECDSA", hash: "SHA-384" },
    isEcdsa: true
  }
];

beforeAll(() => {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);
  pkijs.setEngine("hsm-test", new pkijs.CryptoEngine({ crypto: webcrypto as unknown as Crypto }));
});

describe.each(CASES)("HSM-backed OCSP signing: $keyAlgorithm", (testCase) => {
  it("should produce a response whose signature verifies against the CA public key", async () => {
    const keys = (await webcrypto.subtle.generateKey(testCase.gen, true, ["sign", "verify"])) as CryptoKeyPair;

    const caCert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "01",
      name: "CN=HSM Stand-in Root",
      notBefore: new Date(Date.now() - 86_400_000),
      notAfter: new Date(Date.now() + 86_400_000),
      signingAlgorithm: testCase.gen as Algorithm,
      keys,
      extensions: [new x509.BasicConstraintsExtension(true, 2, true)]
    });

    const signer = buildHsmCaSigner({
      caPublicKey: keys.publicKey,
      keyAlgorithm: testCase.keyAlgorithm,
      sign: async (tbs) => Buffer.from(await webcrypto.subtle.sign(testCase.sign, keys.privateKey, tbs))
    });

    const request = new pkijs.OCSPRequest();
    await request.createForCertificate(pkijs.Certificate.fromBER(caCert.rawData), {
      hashAlgorithm: "SHA-1",
      issuerCertificate: pkijs.Certificate.fromBER(caCert.rawData)
    });
    const parsed = parseOcspRequest(Buffer.from(request.toSchema(true).toBER(false)));
    expect(parsed).not.toBeNull();

    const thisUpdate = new Date();
    thisUpdate.setMilliseconds(0);

    const der = await buildSignedOcspResponse({
      signer,
      caCertificate: caCert,
      statuses: [{ entry: parsed!.entries[0], status: { kind: OcspCertStatus.Good } }],
      thisUpdate,
      nextUpdate: new Date(thisUpdate.getTime() + 3_600_000)
    });

    const response = pkijs.OCSPResponse.fromBER(der);
    expect(response.responseStatus.valueBlock.valueDec).toBe(OcspResponseStatus.Successful);

    const basic = new pkijs.BasicOCSPResponse({
      schema: asn1js.fromBER(response.responseBytes!.response.valueBlock.valueHexView).result
    });

    if (testCase.isEcdsa) {
      const sig = Buffer.from(basic.signature.valueBlock.valueHexView);
      expect(sig[0]).toBe(0x30);
    }

    await expect(basic.verify({ trustedCerts: [pkijs.Certificate.fromBER(caCert.rawData)] })).resolves.toBe(true);
  });
});
