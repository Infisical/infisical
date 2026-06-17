/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CaStatus } from "../certificate-authority-enums";
import { internalCertificateAuthorityServiceFactory } from "./internal-certificate-authority-service";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://test.infisical.com" })
}));

// Exercises signCertFromCa end to end with real signing — only the DAL/KMS
// boundary is faked (identity KMS) — to lock in RFC 5280 §4.1.2.6: an empty
// subject DN must yield a CRITICAL subjectAltName, and a present subject must not.
describe("signCertFromCa — subjectAltName criticality (RFC 5280 §4.1.2.6)", () => {
  const RSA_ALG = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1])
  };

  let service: ReturnType<typeof internalCertificateAuthorityServiceFactory>;
  let csrWithoutCn: string;

  const issue = (overrides: Record<string, unknown>) =>
    service.signCertFromCa({ isInternal: true, caId: "ca-1", csr: csrWithoutCn, ttl: "1h", ...overrides } as any);

  const getSanExtensions = (leaf: x509.X509Certificate) =>
    leaf.extensions.filter((ext): ext is x509.SubjectAlternativeNameExtension => ext.type === "2.5.29.17");

  beforeAll(async () => {
    x509.cryptoProvider.set(webcrypto as Crypto);

    // Real CA: self-signed cert + private key exported as DER PKCS8 (the form the
    // CA-secret DAL stores and getCaCredentials imports).
    const caKeys = (await webcrypto.subtle.generateKey(RSA_ALG, true, ["sign", "verify"])) as CryptoKeyPair;
    const caCert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "01",
      name: "CN=Test CA",
      notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
      notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      signingAlgorithm: RSA_ALG,
      keys: caKeys,
      extensions: [new x509.BasicConstraintsExtension(true, undefined, true)]
    });
    const caCertPem = caCert.toString("pem");
    const caKeyDer = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", caKeys.privateKey));

    // A standards-compliant ACME CSR: no Common Name, SAN carries the only name.
    const leafKeys = (await webcrypto.subtle.generateKey(RSA_ALG, true, ["sign", "verify"])) as CryptoKeyPair;
    csrWithoutCn = (
      await x509.Pkcs10CertificateRequestGenerator.create({
        name: "",
        keys: leafKeys,
        signingAlgorithm: RSA_ALG,
        extensions: [new x509.SubjectAlternativeNameExtension([{ type: "dns", value: "svc.example" }])]
      })
    ).toString("pem");

    // Identity KMS: ciphertext === plaintext, so the real CA material round-trips.
    const kmsService = {
      decryptWithKmsKey: vi
        .fn()
        .mockResolvedValue(async ({ cipherTextBlob }: { cipherTextBlob: unknown }) =>
          Buffer.isBuffer(cipherTextBlob) ? cipherTextBlob : Buffer.from(cipherTextBlob as string)
        ),
      encryptWithKmsKey: vi.fn().mockResolvedValue(async ({ plainText }: { plainText: Buffer }) => ({
        cipherTextBlob: Buffer.from(plainText)
      })),
      generateKmsKey: vi.fn()
    };

    const ca = {
      id: "ca-1",
      projectId: "project-1",
      status: CaStatus.ACTIVE,
      enableDirectIssuance: true,
      internalCa: {
        id: "internal-ca-1",
        activeCaCertId: "ca-cert-1",
        keyAlgorithm: "RSA_2048",
        notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        crlDistributionPointUrls: null,
        disableManagedCrlDistributionPointUrl: false
      }
    };

    const deps = {
      certificateAuthorityDAL: {
        findByIdWithAssociatedCa: vi.fn().mockResolvedValue(ca),
        findById: vi.fn().mockResolvedValue({ projectId: "project-1" })
      },
      certificateAuthorityCertDAL: {
        findById: vi.fn().mockResolvedValue({
          id: "ca-cert-1",
          caId: "ca-1",
          encryptedCertificate: caCertPem,
          encryptedCertificateChain: Buffer.from(caCertPem)
        })
      },
      certificateAuthoritySecretDAL: {
        findOne: vi.fn().mockResolvedValue({ id: "ca-secret-1", encryptedPrivateKey: caKeyDer })
      },
      certificateAuthorityCrlDAL: { findOne: vi.fn().mockResolvedValue({ id: "crl-1" }) },
      certificateDAL: {
        create: vi.fn().mockResolvedValue({ id: "cert-1" }),
        transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb({}))
      },
      certificateBodyDAL: { create: vi.fn().mockResolvedValue({}) },
      pkiCollectionItemDAL: { create: vi.fn() },
      projectDAL: {
        findOne: vi.fn().mockResolvedValue({ id: "project-1", orgId: "org-1", kmsCertificateKeyId: "kms-key-1" }),
        updateById: vi.fn(),
        transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb({}))
      },
      kmsService,
      usageMeteringService: { emitForProject: vi.fn() },
      licenseService: { getPlan: vi.fn() }
    };

    service = internalCertificateAuthorityServiceFactory(deps as any);
  });

  it("issues an empty-subject leaf with a CRITICAL subjectAltName (default ACME path)", async () => {
    // subjectOverride "" mirrors a CN-less CSR resolved through the profile flow.
    const { certificate } = await issue({ subjectOverride: "" });

    expect(certificate.subject).toBe("");
    const sans = getSanExtensions(certificate);
    expect(sans).toHaveLength(1); // exactly one SAN extension, never duplicated
    expect(sans[0].critical).toBe(true);
    expect(sans[0].names.items.map((n) => n.value)).toContain("svc.example");
  });

  it("issues a leaf carrying a subject DN with a non-critical subjectAltName", async () => {
    const { certificate } = await issue({ subjectOverride: "CN=svc.example" });

    expect(certificate.subject).toBe("CN=svc.example");
    const sans = getSanExtensions(certificate);
    expect(sans).toHaveLength(1);
    expect(sans[0].critical).toBe(false);
  });

  it("emits a single SAN extension when altNames are passed explicitly (no duplicate)", async () => {
    // Guards the historical double-push in the explicit-altNames branch.
    const { certificate } = await issue({ subjectOverride: "", altNames: "svc.example" });

    const sans = getSanExtensions(certificate);
    expect(sans).toHaveLength(1);
    expect(sans[0].critical).toBe(true);
  });
});
