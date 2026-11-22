import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";
import * as pkijs from "pkijs";

import { OcspCertStatus } from "@app/ee/services/certificate-authority-ocsp/certificate-authority-ocsp-enums";
import {
  buildSignedOcspResponse,
  parseOcspRequest
} from "@app/ee/services/certificate-authority-ocsp/certificate-authority-ocsp-fns";
import { TOcspCertStatus } from "@app/ee/services/certificate-authority-ocsp/certificate-authority-ocsp-types";
import { asNonSharedBuffer } from "@app/lib/fn";
import { TCaSigner } from "@app/services/certificate-authority/ca-signer";

import { getCertificateOcspStatus } from "./certificate-ocsp-client";

const post = vi.fn<(url: string, body: Buffer) => Promise<{ data: ArrayBuffer }>>();
vi.mock("@app/lib/validator/safe-request", () => ({
  safeRequest: { post: (url: string, body: Buffer) => post(url, body) }
}));

const RSA_ALG: RsaHashedKeyGenParams = {
  name: "RSASSA-PKCS1-v1_5",
  hash: "SHA-256",
  publicExponent: new Uint8Array([1, 0, 1]),
  modulusLength: 2048
};
const OCSP_URL = "http://ocsp.example.com";
const REVOKED_AT = new Date("2026-10-28T09:02:41.000Z");

const createCa = async (name: string) => {
  const keys = (await webcrypto.subtle.generateKey(RSA_ALG, true, ["sign", "verify"])) as CryptoKeyPair;
  const certificate = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name,
    notBefore: new Date(Date.now() - 86_400_000),
    notAfter: new Date(Date.now() + 86_400_000),
    signingAlgorithm: RSA_ALG,
    keys,
    extensions: [new x509.BasicConstraintsExtension(true, 2, true)]
  });
  const signer = {
    caPublicKey: keys.publicKey,
    signingAlgorithm: RSA_ALG,
    signTbs: (tbs: Buffer) => webcrypto.subtle.sign(RSA_ALG, keys.privateKey, asNonSharedBuffer(tbs))
  } as unknown as TCaSigner;
  return { keys, certificate, signer };
};

let issuingCa: Awaited<ReturnType<typeof createCa>>;
let otherCa: Awaited<ReturnType<typeof createCa>>;
let leafCertificate: x509.X509Certificate;

const respondWith = (
  status: TOcspCertStatus,
  responder = issuingCa,
  window = { thisUpdate: new Date(), nextUpdate: new Date(Date.now() + 3_600_000) }
) =>
  post.mockImplementation(async (_url: string, body: Buffer) => {
    const parsed = parseOcspRequest(body);
    const data = await buildSignedOcspResponse({
      signer: responder.signer,
      caCertificate: responder.certificate,
      statuses: parsed!.entries.map((entry) => ({ entry, status })),
      ...window
    });
    return { data: new Uint8Array(data).buffer };
  });

beforeAll(async () => {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);
  pkijs.setEngine("test", new pkijs.CryptoEngine({ crypto: webcrypto as unknown as Crypto }));

  issuingCa = await createCa("CN=Example Issuing CA");
  otherCa = await createCa("CN=Example Other CA");

  const leafKeys = (await webcrypto.subtle.generateKey(RSA_ALG, true, ["sign", "verify"])) as CryptoKeyPair;
  leafCertificate = await x509.X509CertificateGenerator.create({
    serialNumber: "4f2a9c1b33",
    subject: "CN=example.com",
    issuer: issuingCa.certificate.subject,
    notBefore: new Date(Date.now() - 3_600_000),
    notAfter: new Date(Date.now() + 3_600_000),
    signingKey: issuingCa.keys.privateKey,
    publicKey: leafKeys.publicKey,
    signingAlgorithm: RSA_ALG,
    extensions: [new x509.AuthorityInfoAccessExtension({ ocsp: [new x509.GeneralName("url", OCSP_URL)] })]
  });
});

describe("getCertificateOcspStatus", () => {
  beforeEach(() => {
    post.mockReset();
  });

  test("reports a good certificate", async () => {
    respondWith({ kind: OcspCertStatus.Good });

    await expect(
      getCertificateOcspStatus({ certificate: leafCertificate, issuer: issuingCa.certificate })
    ).resolves.toEqual({ status: OcspCertStatus.Good });
    expect(post).toHaveBeenCalledWith(OCSP_URL, expect.any(Buffer));
  });

  test("reports a revoked certificate with its revocation time", async () => {
    respondWith({ kind: OcspCertStatus.Revoked, revokedAt: REVOKED_AT });

    await expect(
      getCertificateOcspStatus({ certificate: leafCertificate, issuer: issuingCa.certificate })
    ).resolves.toEqual({ status: OcspCertStatus.Revoked, revokedAt: REVOKED_AT });
  });

  test("rejects a response signed by a CA other than the issuer", async () => {
    respondWith({ kind: OcspCertStatus.Revoked, revokedAt: REVOKED_AT }, otherCa);

    await expect(
      getCertificateOcspStatus({ certificate: leafCertificate, issuer: issuingCa.certificate })
    ).rejects.toThrow("failed signature verification");
  });

  test("refuses a certificate without an OCSP responder URL", async () => {
    await expect(
      getCertificateOcspStatus({ certificate: issuingCa.certificate, issuer: issuingCa.certificate })
    ).rejects.toThrow("has no OCSP responder URL");
    expect(post).not.toHaveBeenCalled();
  });

  test("rejects a response whose validity window has passed", async () => {
    respondWith({ kind: OcspCertStatus.Good }, issuingCa, {
      thisUpdate: new Date(Date.now() - 14 * 86_400_000),
      nextUpdate: new Date(Date.now() - 7 * 86_400_000)
    });

    await expect(
      getCertificateOcspStatus({ certificate: leafCertificate, issuer: issuingCa.certificate })
    ).rejects.toThrow("outside its validity window");
  });
});
