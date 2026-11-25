import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CertStatus } from "@app/services/certificate/certificate-types";

const getCaCertChainsMock = vi.fn();

vi.mock("@app/services/certificate-authority/certificate-authority-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/certificate-authority/certificate-authority-fns")>()),
  getCaCertChains: (...args: unknown[]) => getCaCertChainsMock(...args) as unknown
}));

// eslint-disable-next-line import/first
import { isSignerCertIssuedByCa } from "./pki-scep-fns";

const ALG = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };

const buildSignerCert = async () => {
  const [caKeys, signerKeys] = await Promise.all([
    webcrypto.subtle.generateKey(ALG, true, ["sign", "verify"]) as Promise<CryptoKeyPair>,
    webcrypto.subtle.generateKey(ALG, true, ["sign", "verify"]) as Promise<CryptoKeyPair>
  ]);
  const notBefore = new Date(Date.now() - 86_400_000);
  const notAfter = new Date(Date.now() + 86_400_000);
  const caCert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=SCEP Root",
    notBefore,
    notAfter,
    keys: caKeys,
    signingAlgorithm: ALG,
    extensions: [
      new x509.BasicConstraintsExtension(true, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign, true)
    ]
  });
  const signerCert = await x509.X509CertificateGenerator.create({
    serialNumber: "0a1b2c",
    subject: "CN=device.example.com",
    issuer: caCert.subject,
    notBefore,
    notAfter,
    publicKey: signerKeys.publicKey,
    signingKey: caKeys.privateKey,
    signingAlgorithm: ALG
  });
  getCaCertChainsMock.mockResolvedValue([{ certificate: caCert.toString("pem"), certificateChain: "" }]);
  return signerCert;
};

const tx = { node: "primary" };
let signerCert: x509.X509Certificate;

const checkSigner = async (revokedCert: unknown) => {
  const certificateDAL = {
    transaction: vi.fn(async (run: (trx: unknown) => Promise<unknown>) => run(tx)),
    findOneLiveFirst: vi.fn().mockResolvedValue(revokedCert)
  };
  const result = await isSignerCertIssuedByCa({
    signerCertDer: Buffer.from(signerCert.rawData),
    caId: "ca-1",
    certificateDAL: certificateDAL as never,
    certificateAuthorityCertDAL: {} as never,
    certificateAuthorityDAL: {} as never,
    kmsDataKeyService: {} as never,
    kmsKeyService: {} as never
  });
  return { result, certificateDAL };
};

beforeAll(async () => {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);
  signerCert = await buildSignerCert();
});

describe("isSignerCertIssuedByCa revocation check", () => {
  it("refuses a signer certificate when any of its records on the CA is revoked, a deleted one included", async () => {
    const { result, certificateDAL } = await checkSigner({
      id: "cert-0",
      status: CertStatus.REVOKED,
      deletedAt: new Date("2026-10-01T00:00:00.000Z")
    });

    expect(result).toBe(false);
    expect(certificateDAL.findOneLiveFirst).toHaveBeenCalledWith(
      {
        $in: { serialNumber: ["0a1b2c", "a1b2c", "a1b2c".padStart(40, "0")] },
        caId: "ca-1",
        status: CertStatus.REVOKED
      },
      tx
    );
  });

  it("accepts a signer certificate with no revoked record on the CA", async () => {
    const { result } = await checkSigner(undefined);

    expect(result).toBe(true);
  });
});
