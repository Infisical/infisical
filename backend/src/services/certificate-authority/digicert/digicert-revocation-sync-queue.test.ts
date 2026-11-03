import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";

import { OcspCertStatus } from "@app/ee/services/certificate-authority-ocsp/certificate-authority-ocsp-enums";
import { CertStatus } from "@app/services/certificate/certificate-types";

import { digicertRevocationSyncQueueFactory } from "./digicert-revocation-sync-queue";

const getCertificateOcspStatus = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const listOrderStatusChanges = vi.fn();
const downloadCertificatePem = vi.fn();

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ isSecondaryInstance: false }) }));
vi.mock("@app/services/certificate/certificate-ocsp-client", () => ({
  getCertificateOcspStatus: (...args: unknown[]) => getCertificateOcspStatus(...args)
}));
vi.mock("@app/services/project/project-fns", () => ({
  getProjectKmsCertificateKeyId: vi.fn().mockResolvedValue("kms-1")
}));
vi.mock("./digicert-api-client", () => ({
  createDigiCertApiClient: () => ({ listOrderStatusChanges, downloadCertificatePem })
}));
vi.mock("./digicert-certificate-authority-fns", () => ({
  castDbEntryToDigiCertCertificateAuthority: () => ({ id: "ca-1", configuration: { appConnectionId: "connection-1" } }),
  getDigiCertClientCredentials: vi.fn().mockResolvedValue({ apiKey: "key", baseUrl: "https://digicert.example" })
}));

const RSA_ALG: RsaHashedKeyGenParams = {
  name: "RSASSA-PKCS1-v1_5",
  hash: "SHA-256",
  publicExponent: new Uint8Array([1, 0, 1]),
  modulusLength: 2048
};
const REVOKED_AT = new Date("2026-10-28T09:02:41.000Z");

const activeCertificate = (id: string) => ({
  id,
  commonName: "example.com",
  serialNumber: id,
  projectId: "project-1",
  applicationId: null
});

let certificateBody: { encryptedCertificate: Buffer; encryptedCertificateChain: Buffer };
let digicertPemBundle: string;

beforeAll(async () => {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);
  const caKeys = (await webcrypto.subtle.generateKey(RSA_ALG, true, ["sign", "verify"])) as CryptoKeyPair;
  const caCertificate = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=Example Issuing CA",
    notBefore: new Date(Date.now() - 86_400_000),
    notAfter: new Date(Date.now() + 86_400_000),
    signingAlgorithm: RSA_ALG,
    keys: caKeys
  });
  const leafKeys = (await webcrypto.subtle.generateKey(RSA_ALG, true, ["sign", "verify"])) as CryptoKeyPair;
  const leafCertificate = await x509.X509CertificateGenerator.create({
    serialNumber: "02",
    subject: "CN=example.com",
    issuer: caCertificate.subject,
    notBefore: new Date(Date.now() - 3_600_000),
    notAfter: new Date(Date.now() + 3_600_000),
    signingKey: caKeys.privateKey,
    publicKey: leafKeys.publicKey,
    signingAlgorithm: RSA_ALG
  });
  digicertPemBundle = `${leafCertificate.toString("pem")}\n${caCertificate.toString("pem")}`;
  certificateBody = {
    encryptedCertificate: Buffer.from(leafCertificate.rawData),
    encryptedCertificateChain: Buffer.from(caCertificate.toString("pem"))
  };
});

const runSync = async ({
  active,
  revokedOrderCertificates = [],
  storedBody = certificateBody
}: {
  active: (ReturnType<typeof activeCertificate> & { externalMetadata?: unknown })[];
  revokedOrderCertificates?: ReturnType<typeof activeCertificate>[];
  storedBody?: typeof certificateBody | null;
}) => {
  let handler: (() => Promise<void>) | undefined;
  const certificateDAL = {
    findActiveDigiCertCertsByOrderIds: vi.fn().mockResolvedValue(revokedOrderCertificates),
    findActiveDigiCertCertsByCaId: vi.fn().mockResolvedValue(active),
    updateById: vi.fn()
  };
  listOrderStatusChanges.mockResolvedValue({
    orders: revokedOrderCertificates.length ? [{ order_id: 7001, status: "revoked" }] : []
  });

  digicertRevocationSyncQueueFactory({
    cronJob: {
      register: ({ handler: registered }: { handler: () => Promise<void> }) => {
        handler = registered;
      }
    },
    certificateAuthorityDAL: { findWithAssociatedCa: vi.fn().mockResolvedValue([{ id: "ca-1" }]) },
    certificateDAL,
    certificateBodyDAL: { findOne: vi.fn().mockResolvedValue(storedBody) },
    projectDAL: {},
    appConnectionDAL: {},
    kmsService: {
      decryptWithKmsKey: vi.fn().mockResolvedValue(({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob)
    },
    auditLogService: { createAuditLog: vi.fn() },
    certificateAlertEventEmitter: { notify: vi.fn() }
  } as unknown as Parameters<typeof digicertRevocationSyncQueueFactory>[0]).init();

  await handler!();
  return certificateDAL;
};

describe("DigiCert revocation sync, OCSP check of active certificates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("marks a certificate revoked when OCSP reports it revoked", async () => {
    getCertificateOcspStatus.mockResolvedValue({ status: OcspCertStatus.Revoked, revokedAt: REVOKED_AT });

    const certificateDAL = await runSync({ active: [activeCertificate("cert-1")] });

    expect(certificateDAL.updateById).toHaveBeenCalledWith(
      "cert-1",
      expect.objectContaining({ status: CertStatus.REVOKED, revokedAt: REVOKED_AT })
    );
  });

  test("leaves a certificate active when OCSP reports it good", async () => {
    getCertificateOcspStatus.mockResolvedValue({ status: OcspCertStatus.Good });

    const certificateDAL = await runSync({ active: [activeCertificate("cert-1")] });

    expect(certificateDAL.updateById).not.toHaveBeenCalled();
  });

  test("keeps checking the other certificates when one OCSP check fails", async () => {
    getCertificateOcspStatus
      .mockRejectedValueOnce(new Error("responder unavailable"))
      .mockResolvedValueOnce({ status: OcspCertStatus.Revoked, revokedAt: REVOKED_AT });

    const certificateDAL = await runSync({
      active: [activeCertificate("cert-1"), activeCertificate("cert-2")]
    });

    expect(certificateDAL.updateById).toHaveBeenCalledTimes(1);
    expect(certificateDAL.updateById).toHaveBeenCalledWith("cert-2", expect.any(Object));
  });

  test("skips certificates already revoked with their order", async () => {
    const certificateDAL = await runSync({
      active: [activeCertificate("cert-1")],
      revokedOrderCertificates: [activeCertificate("cert-1")]
    });

    expect(getCertificateOcspStatus).not.toHaveBeenCalled();
    expect(certificateDAL.updateById).toHaveBeenCalledTimes(1);
  });

  test("downloads a deleted certificate from DigiCert to check it", async () => {
    downloadCertificatePem.mockResolvedValue(digicertPemBundle);
    getCertificateOcspStatus.mockResolvedValue({ status: OcspCertStatus.Revoked, revokedAt: REVOKED_AT });

    const certificateDAL = await runSync({
      active: [
        {
          ...activeCertificate("cert-1"),
          externalMetadata: { type: "digicert", orderId: 7001, certificateId: 50001 }
        }
      ],
      storedBody: null
    });

    expect(downloadCertificatePem).toHaveBeenCalledWith(50001);
    expect(certificateDAL.updateById).toHaveBeenCalledWith(
      "cert-1",
      expect.objectContaining({ status: CertStatus.REVOKED, revokedAt: REVOKED_AT })
    );
  });
});
