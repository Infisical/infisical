import { beforeEach, describe, expect, it, vi } from "vitest";

import { CertificateSource } from "@app/ee/services/pki-discovery/pki-discovery-types";
import { ActorType } from "@app/services/auth/auth-type";
import { rebuildCaCrlAfterChange } from "@app/services/certificate-authority/certificate-authority-fns";

import { certificateServiceFactory } from "./certificate-service";
import { CertStatus, CrlReason, PlatformRevocationOutcome } from "./certificate-types";

const mlDsaCa = {
  id: "ca-1",
  projectId: "project-1",
  internalCa: { id: "internal-ca-1", keyAlgorithm: "ML-DSA-65", notAfter: new Date("2099-01-01T00:00:00.000Z") },
  externalCa: undefined
};

const planWithoutPqc = () => ({ getPlan: vi.fn().mockResolvedValue({ has: () => false }) });

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/services/certificate-authority/certificate-authority-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/certificate-authority/certificate-authority-fns")>()),
  rebuildCaCrlAfterChange: vi.fn().mockResolvedValue({ isRegenerated: true })
}));
vi.mock("@app/services/certificate-common/certificate-permission-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/certificate-common/certificate-permission-fns")>()),
  assertCanRevokeOrRequestRevocation: vi.fn().mockResolvedValue({ canRevokeDirectly: true })
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

const buildService = (
  certificate: Record<string, unknown> | null = activeCertificate,
  overrides: Record<string, unknown> = {}
) => {
  const certificateDAL = {
    findById: vi.fn().mockResolvedValue(certificate ?? undefined),
    findByIdForUpdate: vi.fn().mockResolvedValue(certificate ?? undefined),
    update: vi.fn().mockImplementation(async (filter: object) => ("$in" in filter ? [] : [{ id: "cert-1" }])),
    transaction: vi.fn().mockImplementation(async (run: (trx: unknown) => Promise<unknown>) => run({})),
    primaryNode: vi.fn().mockReturnValue({}),
    lockSerialNumber: vi.fn().mockResolvedValue(undefined),
    findSameCertificateRecords: vi.fn().mockResolvedValue([])
  };
  const internalCertificateAuthorityDAL = { update: vi.fn().mockResolvedValue([]) };

  const deps = {
    certificateDAL,
    internalCertificateAuthorityDAL,
    certificateAuthorityDAL: { findByIdWithAssociatedCa: vi.fn().mockResolvedValue(internalCa) },
    certificateAlertEventEmitter: { notify: vi.fn() },
    usageMeteringService: { emit: vi.fn() },
    projectDAL: { findById: vi.fn().mockResolvedValue({ id: "project-1", orgId: "org-1" }) },
    certificateSyncDAL: { find: vi.fn().mockResolvedValue([]) },
    pkiSyncDAL: { find: vi.fn().mockResolvedValue([]) },
    pkiSyncQueue: {},
    pkiApplicationDAL: { findById: vi.fn().mockResolvedValue(undefined) },
    auditLogService: { createAuditLog: vi.fn() },
    signerDAL: { findOne: vi.fn().mockResolvedValue(undefined) },
    ...overrides
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

  it("reports a revocation that committed after the certificate was read as already revoked without overwriting it", async () => {
    const { service, certificateDAL, internalCertificateAuthorityDAL } = buildService();
    certificateDAL.findByIdForUpdate.mockResolvedValueOnce({ ...activeCertificate, status: CertStatus.REVOKED });

    const result = await service.revokeCertAsPlatform({
      certificateId: "cert-1",
      revocationReason: CrlReason.UNSPECIFIED
    });

    expect(result.outcome).toBe(PlatformRevocationOutcome.AlreadyRevoked);
    expect(internalCertificateAuthorityDAL.update).not.toHaveBeenCalled();
  });

  it("revokes a certificate from an ML-DSA CA even when the license no longer includes PQC", async () => {
    const licenseService = planWithoutPqc();
    const { service, certificateDAL } = buildService(activeCertificate, {
      certificateAuthorityDAL: { findByIdWithAssociatedCa: vi.fn().mockResolvedValue(mlDsaCa) },
      licenseService
    });

    const result = await service.revokeCertAsPlatform({
      certificateId: "cert-1",
      revocationReason: CrlReason.UNSPECIFIED
    });

    expect(result.outcome).toBe(PlatformRevocationOutcome.Revoked);
    expect(certificateDAL.update).toHaveBeenCalled();
    expect(licenseService.getPlan).not.toHaveBeenCalled();
  });

  it("revokes the active certificate re-imported from the deleted one Intune matched", async () => {
    const reimportedCertificate = { ...activeCertificate, id: "cert-2" };
    const { service, certificateDAL } = buildService({
      ...activeCertificate,
      deletedAt: new Date("2026-10-01T00:00:00.000Z")
    });
    certificateDAL.findSameCertificateRecords.mockResolvedValue([reimportedCertificate]);
    certificateDAL.findByIdForUpdate.mockResolvedValue(reimportedCertificate);

    const result = await service.revokeCertAsPlatform({
      certificateId: "cert-1",
      revocationReason: CrlReason.UNSPECIFIED
    });

    expect(result).toMatchObject({ outcome: PlatformRevocationOutcome.Revoked, cert: { id: "cert-2" } });
    expect(certificateDAL.findSameCertificateRecords).toHaveBeenCalledWith(
      {
        serialNumbers: ["0a1b", "a1b", "a1b".padStart(40, "0")],
        caId: "ca-1",
        fingerprintSha256: undefined
      },
      {}
    );
    expect(certificateDAL.update).toHaveBeenCalledWith(
      { id: "cert-2" },
      expect.objectContaining({ status: CertStatus.REVOKED }),
      expect.anything()
    );
  });

  it("reports the deleted certificate Intune matched as already revoked once its re-import is revoked", async () => {
    const { service, certificateDAL } = buildService({
      ...activeCertificate,
      deletedAt: new Date("2026-10-01T00:00:00.000Z")
    });
    certificateDAL.findSameCertificateRecords.mockResolvedValue([
      { ...activeCertificate, id: "cert-2", status: CertStatus.REVOKED }
    ]);

    const result = await service.revokeCertAsPlatform({
      certificateId: "cert-1",
      revocationReason: CrlReason.UNSPECIFIED
    });

    expect(result).toEqual({ outcome: PlatformRevocationOutcome.AlreadyRevoked });
    expect(certificateDAL.update).not.toHaveBeenCalled();
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

  it("refuses an imported certificate whose stored body is missing, before writing anything", async () => {
    const { service, certificateDAL } = buildService(
      { ...activeCertificate, profileId: "profile-1", source: CertificateSource.Imported },
      { certificateBodyDAL: { findOne: vi.fn().mockResolvedValue(undefined) } }
    );

    await expect(
      service.revokeCertAsPlatform({ certificateId: "cert-1", revocationReason: CrlReason.UNSPECIFIED })
    ).rejects.toThrow("Certificate body not found");
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

  it("keeps rebuilding the other CAs when one CA cannot be read", async () => {
    const { service } = buildService(activeCertificate, {
      certificateAuthorityDAL: {
        findByIdWithAssociatedCa: vi.fn().mockRejectedValueOnce(new Error("CA not found")).mockResolvedValue(internalCa)
      }
    });

    await service.rebuildCrlsAfterPlatformRevocations(["ca-gone", "ca-1"]);

    expect(rebuildCaCrlAfterChange).toHaveBeenCalledTimes(1);
  });
});

describe("certificateService.revokeCert", () => {
  beforeEach(() => {
    vi.mocked(rebuildCaCrlAfterChange).mockClear();
  });

  const revokeAsUser = (service: ReturnType<typeof buildService>["service"]) =>
    service.revokeCert({
      id: "cert-1",
      revocationReason: CrlReason.KEY_COMPROMISE,
      actor: ActorType.USER,
      actorId: "user-1",
      actorAuthMethod: null,
      actorOrgId: "org-1"
    });

  it("rebuilds the CRL right after the revocation commits, before later steps can fail", async () => {
    const { service, certificateDAL } = buildService(activeCertificate, {
      certificateAlertEventEmitter: { notify: vi.fn().mockRejectedValue(new Error("alert queue unavailable")) }
    });

    await expect(revokeAsUser(service)).rejects.toThrow("alert queue unavailable");

    expect(certificateDAL.update).toHaveBeenCalled();
    expect(rebuildCaCrlAfterChange).toHaveBeenCalledTimes(1);
  });

  it("tells the user the certificate is already revoked when another revocation committed first", async () => {
    const { service, certificateDAL } = buildService();
    certificateDAL.findByIdForUpdate.mockResolvedValueOnce({ ...activeCertificate, status: CertStatus.REVOKED });

    await expect(revokeAsUser(service)).rejects.toThrow("is already revoked");
    expect(rebuildCaCrlAfterChange).not.toHaveBeenCalled();
  });

  it("still checks the PQC license when a user revokes a certificate from an ML-DSA CA", async () => {
    const { service, certificateDAL } = buildService(activeCertificate, {
      certificateAuthorityDAL: { findByIdWithAssociatedCa: vi.fn().mockResolvedValue(mlDsaCa) },
      licenseService: planWithoutPqc()
    });

    await expect(revokeAsUser(service)).rejects.toThrow("Your license does not include PQC algorithms");

    expect(certificateDAL.update).not.toHaveBeenCalled();
  });

  it("resolves the application name before committing, so a failed lookup revokes nothing", async () => {
    const { service, certificateDAL } = buildService(
      { ...activeCertificate, applicationId: "app-1" },
      { pkiApplicationDAL: { findById: vi.fn().mockRejectedValue(new Error("read replica unavailable")) } }
    );

    await expect(revokeAsUser(service)).rejects.toThrow("read replica unavailable");

    expect(certificateDAL.update).not.toHaveBeenCalled();
    expect(rebuildCaCrlAfterChange).not.toHaveBeenCalled();
  });

  it("refuses an imported certificate that was deleted, before writing anything", async () => {
    const deletedAt = new Date("2026-01-02T03:04:05.000Z");
    const { service, certificateDAL } = buildService({
      ...activeCertificate,
      profileId: "profile-1",
      source: CertificateSource.Imported,
      deletedAt
    });

    await expect(revokeAsUser(service)).rejects.toThrow(
      `Certificate 'device' can't be revoked because it was imported and then deleted on ${deletedAt.toISOString()}.`
    );
    expect(certificateDAL.update).not.toHaveBeenCalled();
  });
});
