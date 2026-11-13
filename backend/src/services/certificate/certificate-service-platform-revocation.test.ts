import { beforeEach, describe, expect, it, vi } from "vitest";

import { rebuildCaCrlAfterChange } from "@app/services/certificate-authority/certificate-authority-fns";

import { certificateServiceFactory } from "./certificate-service";
import { CertStatus, CrlReason, PlatformRevocationOutcome } from "./certificate-types";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/services/certificate-authority/certificate-authority-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/certificate-authority/certificate-authority-fns")>()),
  rebuildCaCrlAfterChange: vi.fn().mockResolvedValue({ isRegenerated: true })
}));

type TDeps = Parameters<typeof certificateServiceFactory>[0];

const activeCertificate = {
  id: "cert-1",
  caId: "ca-1",
  projectId: "project-1",
  applicationId: null,
  profileId: null,
  commonName: "device.example.com",
  friendlyName: "device",
  serialNumber: "0a1b",
  status: CertStatus.ACTIVE,
  source: null,
  deletedAt: null
};

const internalCa = {
  id: "ca-1",
  projectId: "project-1",
  internalCa: { id: "internal-ca-1", keyAlgorithm: "RSA_2048", notAfter: new Date("2099-01-01T00:00:00.000Z") },
  externalCa: undefined
};

const buildService = (certificate: Record<string, unknown> | null = activeCertificate) => {
  const certificateDAL = {
    findById: vi.fn().mockResolvedValue(certificate ?? undefined),
    update: vi.fn().mockResolvedValue([]),
    transaction: vi.fn().mockImplementation(async (run: (trx: unknown) => Promise<unknown>) => run({}))
  };
  const internalCertificateAuthorityDAL = { update: vi.fn().mockResolvedValue([]) };

  const deps = {
    certificateDAL,
    internalCertificateAuthorityDAL,
    certificateAuthorityDAL: { findByIdWithAssociatedCa: vi.fn().mockResolvedValue(internalCa) },
    certificateAlertEventEmitter: { notify: vi.fn() },
    usageMeteringService: { emitForProject: vi.fn() },
    certificateSyncDAL: { find: vi.fn().mockResolvedValue([]) },
    pkiSyncDAL: { find: vi.fn().mockResolvedValue([]) },
    pkiSyncQueue: {},
    auditLogService: { createAuditLog: vi.fn() }
  } as unknown as TDeps;

  return { service: certificateServiceFactory(deps), certificateDAL, internalCertificateAuthorityDAL };
};

describe("certificateService.revokeCertAsPlatform", () => {
  beforeEach(() => {
    vi.mocked(rebuildCaCrlAfterChange).mockClear();
  });

  it("revokes the certificate and bumps the OCSP generation, leaving the CRL rebuild to the caller", async () => {
    const { service, certificateDAL, internalCertificateAuthorityDAL } = buildService();

    const result = await service.revokeCertAsPlatform({
      certificateId: "cert-1",
      revocationReason: CrlReason.UNSPECIFIED
    });

    expect(result.outcome).toBe(PlatformRevocationOutcome.Revoked);
    expect(certificateDAL.update).toHaveBeenCalledWith(
      { id: "cert-1" },
      expect.objectContaining({ status: CertStatus.REVOKED }),
      expect.anything()
    );
    expect(internalCertificateAuthorityDAL.update).toHaveBeenCalledWith(
      { caId: "ca-1" },
      { $incr: { ocspGeneration: 1 } },
      expect.anything()
    );
    expect(rebuildCaCrlAfterChange).not.toHaveBeenCalled();
  });

  it("reports an already revoked certificate without writing to it", async () => {
    const { service, certificateDAL } = buildService({ ...activeCertificate, status: CertStatus.REVOKED });

    const result = await service.revokeCertAsPlatform({
      certificateId: "cert-1",
      revocationReason: CrlReason.UNSPECIFIED
    });

    expect(result).toEqual({ outcome: PlatformRevocationOutcome.AlreadyRevoked });
    expect(certificateDAL.update).not.toHaveBeenCalled();
  });

  it("reports a certificate that no longer exists as not revocable", async () => {
    const { service } = buildService(null);

    const result = await service.revokeCertAsPlatform({
      certificateId: "cert-1",
      revocationReason: CrlReason.UNSPECIFIED
    });

    expect(result).toEqual({
      outcome: PlatformRevocationOutcome.NotRevocable,
      reason: "The certificate no longer exists."
    });
  });

  it("reports an imported certificate as not revocable", async () => {
    const { service, certificateDAL } = buildService({ ...activeCertificate, caId: null });

    const result = await service.revokeCertAsPlatform({
      certificateId: "cert-1",
      revocationReason: CrlReason.UNSPECIFIED
    });

    expect(result).toEqual({
      outcome: PlatformRevocationOutcome.NotRevocable,
      reason: "Cannot revoke imported certificates"
    });
    expect(certificateDAL.update).not.toHaveBeenCalled();
  });
});

describe("certificateService.rebuildCrlsAfterPlatformRevocations", () => {
  beforeEach(() => {
    vi.mocked(rebuildCaCrlAfterChange).mockClear();
  });

  it("rebuilds each CA's CRL once", async () => {
    const { service } = buildService();

    await service.rebuildCrlsAfterPlatformRevocations(["ca-1", "ca-1"]);

    expect(rebuildCaCrlAfterChange).toHaveBeenCalledTimes(1);
  });
});
