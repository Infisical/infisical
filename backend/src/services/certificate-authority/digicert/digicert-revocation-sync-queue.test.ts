import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";

import { TableName } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { OcspCertStatus } from "@app/ee/services/certificate-authority-ocsp/certificate-authority-ocsp-enums";
import { ActorType } from "@app/services/auth/auth-type";
import { CertStatus } from "@app/services/certificate/certificate-types";

import { CaStatus } from "../certificate-authority-enums";
import { digicertRevocationSyncQueueFactory } from "./digicert-revocation-sync-queue";

const getCertificateOcspStatus = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const listOrderStatusChanges = vi.fn();
const downloadCertificatePem = vi.fn();

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ isSecondaryInstance: false }) }));
vi.mock("@app/services/certificate/certificate-ocsp-client", () => ({
  getCertificateOcspStatus: (...args: unknown[]) => getCertificateOcspStatus(...args)
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

const TX = { tx: true };

type TRevokedSigner = { id: string; name: string; previousStatus: string; status: string };

const runSync = async ({
  active,
  revokedOrderCertificates = [],
  storedBody = certificateBody,
  lockedCertificateStatus = CertStatus.ACTIVE,
  revokedSigners = [],
  isSignerLockHeld = false,
  failCertificateAudit = false
}: {
  active: (ReturnType<typeof activeCertificate> & { externalMetadata?: unknown })[];
  revokedOrderCertificates?: ReturnType<typeof activeCertificate>[];
  storedBody?: typeof certificateBody | null;
  lockedCertificateStatus?: CertStatus;
  revokedSigners?: TRevokedSigner[];
  isSignerLockHeld?: boolean;
  failCertificateAudit?: boolean;
}) => {
  let handler: (() => Promise<void>) | undefined;
  const certificateDAL = {
    findActiveDigiCertCertsByOrderIds: vi.fn().mockResolvedValue(revokedOrderCertificates),
    findActiveDigiCertCertsByCaId: vi.fn().mockResolvedValue(active),
    findByIdForUpdate: vi.fn().mockResolvedValue({ status: lockedCertificateStatus }),
    updateById: vi.fn()
  };
  const auditLogService = {
    createAuditLog: vi.fn(async (log: { event: { type: string } }) => {
      if (failCertificateAudit && log.event.type === EventType.REVOKE_CERT) throw new Error("audit stream down");
    })
  };
  const certificateAlertEventEmitter = { notify: vi.fn() };
  const certificateAuthorityDAL = { findWithAssociatedCa: vi.fn().mockResolvedValue([{ id: "ca-1" }]) };
  const pkiAlertV2Queue = { queueCertificateEvent: vi.fn() };
  const signerService = {
    revokeWithCertificate: vi.fn(
      async (_certificateId: string, revokeCertificate: (tx: unknown) => Promise<boolean>) => {
        if (isSignerLockHeld) return null;
        const isCertificateRevoked = await revokeCertificate(TX);
        return { isCertificateRevoked, revokedSigners: isCertificateRevoked ? revokedSigners : [] };
      }
    )
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
    certificateAuthorityDAL,
    pkiAlertV2Queue,
    certificateDAL,
    certificateBodyDAL: { findOne: vi.fn().mockResolvedValue(storedBody) },
    appConnectionDAL: {},
    kmsDataKeyService: { getProjectCertificateKmsKeyId: vi.fn().mockResolvedValue("kms-1") },
    kmsKeyService: {
      decryptWithKmsKey: vi.fn().mockResolvedValue(({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob)
    },
    auditLogService,
    certificateAlertEventEmitter,
    signerService
  } as unknown as Parameters<typeof digicertRevocationSyncQueueFactory>[0]).init();

  await handler!();
  return { ...certificateDAL, auditLogService, certificateAlertEventEmitter, certificateAuthorityDAL, pkiAlertV2Queue };
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
      expect.objectContaining({ status: CertStatus.REVOKED, revokedAt: REVOKED_AT }),
      TX
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
    expect(certificateDAL.updateById).toHaveBeenCalledWith("cert-2", expect.any(Object), TX);
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
      expect.objectContaining({ status: CertStatus.REVOKED, revokedAt: REVOKED_AT }),
      TX
    );
  });
});

describe("DigiCert revocation sync, signers of a revoked certificate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("audits each signer the CA revocation revoked", async () => {
    const certificateDAL = await runSync({
      active: [],
      revokedOrderCertificates: [activeCertificate("cert-1")],
      revokedSigners: [
        { id: "signer-1", name: "release-signer", previousStatus: "disabled", status: "revoked" },
        { id: "signer-2", name: "backup-signer", previousStatus: "active", status: "revoked" }
      ]
    });

    const signerAudits = certificateDAL.auditLogService.createAuditLog.mock.calls
      .map(([log]) => log as { actor: { type: string }; event: { type: string; metadata: Record<string, unknown> } })
      .filter((log) => log.event.type === EventType.PKI_SIGNER_CERTIFICATE_REVOKED_BY_CA);
    expect(signerAudits.map((log) => [log.actor.type, log.event.metadata])).toEqual([
      [
        ActorType.PLATFORM,
        expect.objectContaining({
          signerId: "signer-1",
          certificateId: "cert-1",
          previousStatus: "disabled",
          status: "revoked"
        })
      ],
      [ActorType.PLATFORM, expect.objectContaining({ signerId: "signer-2", previousStatus: "active" })]
    ]);
  });

  test("audits the signers even when the certificate audit fails", async () => {
    const certificateDAL = await runSync({
      active: [],
      revokedOrderCertificates: [activeCertificate("cert-1")],
      revokedSigners: [{ id: "signer-1", name: "release-signer", previousStatus: "active", status: "revoked" }],
      failCertificateAudit: true
    });

    expect(certificateDAL.auditLogService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ type: EventType.PKI_SIGNER_CERTIFICATE_REVOKED_BY_CA }) as unknown
      })
    );
    expect(certificateDAL.pkiAlertV2Queue.queueCertificateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: "cert-1" })
    );
  });

  test("checks disabled DigiCert CAs too, since their certificates stay valid upstream", async () => {
    const certificateDAL = await runSync({ active: [] });

    expect(certificateDAL.certificateAuthorityDAL.findWithAssociatedCa).toHaveBeenCalledWith(
      expect.objectContaining({
        $in: { [`${TableName.CertificateAuthority}.status`]: [CaStatus.ACTIVE, CaStatus.DISABLED] }
      })
    );
  });

  test("leaves the certificate for the next run while a signer of it is being changed", async () => {
    getCertificateOcspStatus.mockResolvedValue({ status: OcspCertStatus.Revoked, revokedAt: REVOKED_AT });

    const certificateDAL = await runSync({
      active: [activeCertificate("cert-1")],
      revokedOrderCertificates: [activeCertificate("cert-1")],
      isSignerLockHeld: true
    });

    expect(getCertificateOcspStatus).toHaveBeenCalledTimes(1);
    expect(certificateDAL.updateById).not.toHaveBeenCalled();
    expect(certificateDAL.auditLogService.createAuditLog).not.toHaveBeenCalled();
    expect(certificateDAL.certificateAlertEventEmitter.notify).not.toHaveBeenCalled();
  });

  test("does not revoke or audit again a certificate revoked since it was listed", async () => {
    const certificateDAL = await runSync({
      active: [],
      revokedOrderCertificates: [activeCertificate("cert-1")],
      lockedCertificateStatus: CertStatus.REVOKED
    });

    expect(certificateDAL.updateById).not.toHaveBeenCalled();
    expect(certificateDAL.auditLogService.createAuditLog).not.toHaveBeenCalled();
  });
});
