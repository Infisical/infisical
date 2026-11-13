import { createMongoAbility, ForbiddenError, RawRuleOf } from "@casl/ability";
import { Knex } from "knex";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TPkiSigners } from "@app/db/schemas";
import {
  ResourcePermissionSet,
  ResourcePermissionSignerActions,
  ResourcePermissionSub,
  TResourceAbility
} from "@app/ee/services/permission/resource-permission";
import { ExecutionError, ExecutionStats, ResourceLockedError } from "@app/lib/red-lock";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { CaStatus, CaType } from "../certificate-authority/certificate-authority-enums";
import { DigiCertLifecycleMode } from "../certificate-authority/digicert/digicert-certificate-authority-enums";
import { CertKeyAlgorithm, CertStatus, CrlReason } from "../certificate/certificate-types";
import { CertKeySource, SignerStatus } from "./signer-enums";
import { issueSignerCertificate } from "./signer-issuance-fns";
import { signerServiceFactory } from "./signer-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock("./signer-issuance-fns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./signer-issuance-fns")>();
  return { ...actual, issueSignerCertificate: vi.fn() };
});

const SIGNER_ID = "signer-1";
const PROJECT_ID = "project-1";
const ORG_ID = "org-1";
const CA_ID = "ca-1";
const OLD_CERT_ID = "cert-old";
const NEW_CERT_ID = "cert-new";
const DIGICERT_ORDER_ID = 12345;

const tx = { isTransaction: true } as unknown as Knex;

const actorFields = {
  actor: ActorType.USER,
  actorId: "user-1",
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: ORG_ID
};

const abilityWith = (...actions: ResourcePermissionSignerActions[]): TResourceAbility =>
  createMongoAbility<ResourcePermissionSet>(
    actions.map((action) => ({ action, subject: ResourcePermissionSub.Signer })) as RawRuleOf<TResourceAbility>[]
  );

const buildSigner = (overrides: Partial<TPkiSigners> = {}): TPkiSigners =>
  ({
    id: SIGNER_ID,
    projectId: PROJECT_ID,
    name: "release-signer",
    status: SignerStatus.Active,
    certificateId: OLD_CERT_ID,
    caId: CA_ID,
    commonName: "Example Release Signing",
    certificateTtlDays: 365,
    certificateRenewBeforeDays: 30,
    keyAlgorithm: CertKeyAlgorithm.RSA_2048,
    externalCaConfig: null,
    certificateFailureReason: null,
    ...overrides
  }) as TPkiSigners;

const buildCertificate = (overrides: Record<string, unknown> = {}) => ({
  id: OLD_CERT_ID,
  caId: CA_ID,
  status: CertStatus.ACTIVE,
  serialNumber: "0a1b2c",
  commonName: "Example Release Signing",
  keySource: CertKeySource.Infisical,
  keyAlgorithm: CertKeyAlgorithm.RSA_2048,
  hsmConnectorId: null,
  hsmKeyLabel: null,
  externalMetadata: null,
  ...overrides
});

const internalCa = { id: CA_ID, projectId: PROJECT_ID, name: "Internal CA", status: CaStatus.ACTIVE, externalCa: null };
const digicertCa = {
  id: CA_ID,
  projectId: PROJECT_ID,
  name: "DigiCert CA",
  status: CaStatus.ACTIVE,
  externalCa: { type: CaType.DIGICERT }
};

const buildService = ({
  signer = buildSigner(),
  certificate = buildCertificate(),
  ca = internalCa,
  permission = abilityWith(
    ResourcePermissionSignerActions.ReissueCertificate,
    ResourcePermissionSignerActions.RevokeCertificate
  )
}: {
  signer?: TPkiSigners;
  certificate?: ReturnType<typeof buildCertificate>;
  ca?: typeof internalCa | typeof digicertCa;
  permission?: TResourceAbility;
} = {}) => {
  const lock = { release: vi.fn().mockResolvedValue(undefined) };
  const signerDAL = {
    findById: vi.fn().mockResolvedValue(signer),
    findByIdForUpdate: vi.fn().mockResolvedValue(signer),
    find: vi.fn().mockResolvedValue([]),
    updateById: vi.fn(async (_id: string, data: Partial<TPkiSigners>) => ({ ...signer, ...data })),
    updateUnlessRevoked: vi.fn(async (_id: string, data: Partial<TPkiSigners>) => ({ ...signer, ...data })),
    restoreStatusAfterFailedRevoke: vi.fn().mockResolvedValue(signer),
    transaction: vi.fn(async (cb: (trx: Knex) => unknown) => cb(tx))
  };
  const certificateDAL = {
    findById: vi.fn().mockResolvedValue(certificate)
  };
  const certificateAuthorityDAL = {
    findByIdWithAssociatedCa: vi.fn().mockResolvedValue(ca)
  };
  const certificateService = {
    revokeOwnedCertificate: vi.fn().mockResolvedValue({
      cert: { serialNumber: certificate.serialNumber, commonName: certificate.commonName }
    })
  };
  const signerIssuanceService = {
    requestIssuance: vi.fn().mockResolvedValue({ id: "job-1" }),
    getLatestIssuanceKeyConfig: vi.fn().mockResolvedValue(null),
    hasOpenJobs: vi.fn().mockResolvedValue(false),
    getLatestFailedRequestAt: vi.fn().mockResolvedValue(null),
    cancelOpenJobsForRevokedSigner: vi
      .fn()
      .mockResolvedValue({ uncancelledDigicertOrderIds: [], cancelledJobCount: 0 }),
    revokeUnattachedCertificate: vi.fn().mockResolvedValue(undefined)
  };
  const permissionService = {
    getResourcePermission: vi.fn().mockResolvedValue({ permission, memberships: [] })
  };
  const keyStore = { acquireLock: vi.fn().mockResolvedValue(lock) };
  const deps = {
    signerDAL,
    certificateDAL,
    certificateAuthorityDAL,
    certificateService,
    signerIssuanceService,
    permissionService,
    keyStore,
    hsmConnectorService: { assertAttachPermission: vi.fn() },
    digicertFns: { assertCodeSigningOrderReusable: vi.fn() }
  };
  const service = signerServiceFactory(deps as unknown as Parameters<typeof signerServiceFactory>[0]);
  return { service, deps, lock };
};

const statusesWritten = (updateById: ReturnType<typeof vi.fn>) =>
  updateById.mock.calls.map(([, data]) => (data as Partial<TPkiSigners>).status).filter(Boolean);

describe("signerService.renewCertificate", () => {
  beforeEach(() => {
    vi.mocked(issueSignerCertificate).mockReset();
  });

  it("issues a new certificate on an internal CA and attaches it without revoking the previous one", async () => {
    vi.mocked(issueSignerCertificate).mockResolvedValue({ certificateId: NEW_CERT_ID } as Awaited<
      ReturnType<typeof issueSignerCertificate>
    >);
    const { service, deps, lock } = buildService();

    const result = await service.renewCertificate({ ...actorFields, signerId: SIGNER_ID });

    expect(issueSignerCertificate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ caId: CA_ID, projectId: PROJECT_ID, keyAlgorithm: CertKeyAlgorithm.RSA_2048 })
    );
    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      { certificateId: NEW_CERT_ID, status: SignerStatus.Active, certificateFailureReason: null },
      tx
    );
    expect(result.signer).toMatchObject({ certificateId: NEW_CERT_ID, status: SignerStatus.Active });
    expect(result.previousSerialNumber).toBe("0a1b2c");
    expect(result.caId).toBe(CA_ID);
    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
    expect(deps.signerIssuanceService.revokeUnattachedCertificate).not.toHaveBeenCalled();
    expect(deps.signerIssuanceService.requestIssuance).not.toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalled();
  });

  it("keeps the signer's status while a DigiCert renewal request is open", async () => {
    const { service, deps } = buildService({
      ca: digicertCa,
      certificate: buildCertificate({ externalMetadata: { orderId: DIGICERT_ORDER_ID } })
    });

    const result = await service.renewCertificate({ ...actorFields, signerId: SIGNER_ID });

    expect(statusesWritten(deps.signerDAL.updateUnlessRevoked)).toEqual([]);
    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(SIGNER_ID, { certificateFailureReason: null });
    expect(deps.signerIssuanceService.requestIssuance).toHaveBeenCalledWith(
      expect.objectContaining({
        signerId: SIGNER_ID,
        caId: CA_ID,
        digicertLifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: DIGICERT_ORDER_ID }
      })
    );
    expect(result.signer).toMatchObject({ status: SignerStatus.Active });
    expect(issueSignerCertificate).not.toHaveBeenCalled();
  });

  it("records the failure reason without marking the signer Failed when an internal CA renewal fails", async () => {
    const issueError = new Error("internal CA refused to sign");
    vi.mocked(issueSignerCertificate).mockRejectedValue(issueError);
    const { service, deps } = buildService();

    await expect(service.renewCertificate({ ...actorFields, signerId: SIGNER_ID })).rejects.toBe(issueError);

    expect(statusesWritten(deps.signerDAL.updateUnlessRevoked)).toEqual([]);
    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(SIGNER_ID, {
      certificateFailureReason: "internal CA refused to sign"
    });
  });

  it("refuses to renew while a certificate request is in progress", async () => {
    const { service, deps } = buildService();
    deps.signerIssuanceService.hasOpenJobs.mockResolvedValue(true);

    await expect(service.renewCertificate({ ...actorFields, signerId: SIGNER_ID })).rejects.toThrow(
      "is already waiting for a new certificate"
    );
    expect(issueSignerCertificate).not.toHaveBeenCalled();
    expect(deps.signerIssuanceService.requestIssuance).not.toHaveBeenCalled();
  });
});

describe("signerService.reissueCertificate", () => {
  it("refuses a new certificate while a renewal request is open, so its order isn't orphaned", async () => {
    const { service, deps, lock } = buildService({ ca: digicertCa });
    deps.signerIssuanceService.hasOpenJobs.mockResolvedValue(true);

    await expect(
      service.reissueCertificate({ ...actorFields, signerId: SIGNER_ID, caId: CA_ID } as Parameters<
        typeof service.reissueCertificate
      >[0])
    ).rejects.toThrow("is already waiting for a new certificate. Try again after it's issued.");

    expect(deps.keyStore.acquireLock).toHaveBeenCalled();
    expect(deps.signerIssuanceService.requestIssuance).not.toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalled();
  });

  it("tells the user to wait when a renewal or revoke holds the signer's lock", async () => {
    const { service, deps } = buildService();
    deps.keyStore.acquireLock.mockRejectedValue(new ResourceLockedError("locked"));

    await expect(
      service.reissueCertificate({ ...actorFields, signerId: SIGNER_ID, caId: CA_ID } as Parameters<
        typeof service.reissueCertificate
      >[0])
    ).rejects.toThrow("is being renewed or revoked right now");
    expect(deps.signerIssuanceService.requestIssuance).not.toHaveBeenCalled();
  });
});

describe("signerService.autoRenewCertificate", () => {
  beforeEach(() => {
    vi.mocked(issueSignerCertificate).mockReset();
  });

  it("waits before placing another order after the last certificate request failed", async () => {
    const { service, deps } = buildService({ ca: digicertCa });
    deps.signerIssuanceService.getLatestFailedRequestAt.mockResolvedValue(new Date(Date.now() - 24 * 60 * 60 * 1000));

    await service.autoRenewCertificate(SIGNER_ID);

    expect(deps.signerIssuanceService.requestIssuance).not.toHaveBeenCalled();
    expect(deps.signerDAL.updateById).not.toHaveBeenCalled();
  });

  it("tries again once the backoff after a failed request has passed", async () => {
    const { service, deps } = buildService({
      ca: digicertCa,
      certificate: buildCertificate({ externalMetadata: { orderId: DIGICERT_ORDER_ID } })
    });
    deps.signerIssuanceService.getLatestFailedRequestAt.mockResolvedValue(
      new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    );

    await service.autoRenewCertificate(SIGNER_ID);

    expect(deps.signerIssuanceService.requestIssuance).toHaveBeenCalled();
  });

  it("keeps the signer Active and records the reason when the CA is no longer active", async () => {
    const { service, deps } = buildService({ ca: { ...internalCa, status: CaStatus.DISABLED } });

    await service.autoRenewCertificate(SIGNER_ID);

    expect(statusesWritten(deps.signerDAL.updateById)).toEqual([]);
    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(SIGNER_ID, {
      certificateFailureReason: "Certificate authority 'Internal CA' is not active."
    });
    expect(issueSignerCertificate).not.toHaveBeenCalled();
  });

  it("keeps the signer's status while a DigiCert auto-renewal request is open", async () => {
    const { service, deps } = buildService({
      ca: digicertCa,
      certificate: buildCertificate({ externalMetadata: { orderId: DIGICERT_ORDER_ID } })
    });

    await service.autoRenewCertificate(SIGNER_ID);

    expect(statusesWritten(deps.signerDAL.updateById)).toEqual([]);
    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(SIGNER_ID, { certificateFailureReason: null });
    expect(deps.signerIssuanceService.requestIssuance).toHaveBeenCalledWith(
      expect.objectContaining({
        digicertLifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: DIGICERT_ORDER_ID }
      })
    );
  });

  it("keeps the signer Active when scheduling the DigiCert auto-renewal fails", async () => {
    const { service, deps } = buildService({ ca: digicertCa });
    deps.signerIssuanceService.requestIssuance.mockRejectedValue(new Error("queue unavailable"));

    await service.autoRenewCertificate(SIGNER_ID);

    expect(statusesWritten(deps.signerDAL.updateById)).toEqual([]);
    expect(deps.signerDAL.updateById).toHaveBeenLastCalledWith(SIGNER_ID, {
      certificateFailureReason: "queue unavailable"
    });
  });

  it("keeps the signer Active when an internal CA auto-renewal fails", async () => {
    vi.mocked(issueSignerCertificate).mockRejectedValue(new Error("internal CA refused to sign"));
    const { service, deps } = buildService();

    await service.autoRenewCertificate(SIGNER_ID);

    expect(statusesWritten(deps.signerDAL.updateById)).toEqual([]);
    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(SIGNER_ID, {
      certificateFailureReason: "internal CA refused to sign"
    });
  });

  it("keeps a signer disabled during the renewal Disabled when the new certificate is attached", async () => {
    vi.mocked(issueSignerCertificate).mockResolvedValue({ certificateId: NEW_CERT_ID } as Awaited<
      ReturnType<typeof issueSignerCertificate>
    >);
    const { service, deps } = buildService();
    deps.signerDAL.findByIdForUpdate.mockResolvedValue(buildSigner({ status: SignerStatus.Disabled }));

    await service.autoRenewCertificate(SIGNER_ID);

    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      { certificateId: NEW_CERT_ID, status: SignerStatus.Disabled, certificateFailureReason: null },
      tx
    );
  });
});

describe("signerService certificate lock", () => {
  const lockFailure = (voteError: Error) =>
    new ExecutionError("The operation was unable to achieve a quorum during its retry window.", [
      Promise.resolve({ votesAgainst: new Map([[{}, voteError]]) } as unknown as ExecutionStats)
    ]);

  it("tells the user to wait when another renewal or revoke holds the lock", async () => {
    const { service, deps } = buildService();
    deps.keyStore.acquireLock.mockRejectedValue(lockFailure(new ResourceLockedError("locked")));

    await expect(service.renewCertificate({ ...actorFields, signerId: SIGNER_ID })).rejects.toThrow(
      "is being renewed or revoked right now"
    );
  });

  it("surfaces a Redis failure instead of reporting the lock as held", async () => {
    const { service, deps } = buildService();
    const redisFailure = lockFailure(new Error("Connection is closed."));
    deps.keyStore.acquireLock.mockRejectedValue(redisFailure);

    await expect(service.renewCertificate({ ...actorFields, signerId: SIGNER_ID })).rejects.toBe(redisFailure);
  });
});

describe("signerService.disable", () => {
  it("writes Disabled through the guarded update, so it can't overwrite a concurrent revoke", async () => {
    const { service, deps } = buildService({ permission: abilityWith(ResourcePermissionSignerActions.ManageStatus) });

    await service.disable({ ...actorFields, signerId: SIGNER_ID });

    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(SIGNER_ID, { status: SignerStatus.Disabled });
    expect(deps.signerDAL.updateById).not.toHaveBeenCalled();
  });
});

describe("signerService.revokeCertificate", () => {
  const revokeDto = { ...actorFields, signerId: SIGNER_ID, revocationReason: CrlReason.KEY_COMPROMISE };

  it("cancels pending DigiCert reissues, revokes the certificate at the CA, then cancels the other open requests", async () => {
    const { service, deps, lock } = buildService();

    const result = await service.revokeCertificate(revokeDto);

    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(SIGNER_ID, { status: SignerStatus.Revoked }, tx);
    expect(deps.certificateService.revokeOwnedCertificate).toHaveBeenCalledWith({
      certificateId: OLD_CERT_ID,
      revocationReason: CrlReason.KEY_COMPROMISE,
      orgId: ORG_ID
    });
    expect(deps.signerIssuanceService.cancelOpenJobsForRevokedSigner.mock.calls).toEqual([
      [SIGNER_ID, { digicertReissuesOnly: true }],
      [SIGNER_ID]
    ]);

    const [revokedWriteOrder] = deps.signerDAL.updateById.mock.invocationCallOrder;
    const [caRevokeOrder] = deps.certificateService.revokeOwnedCertificate.mock.invocationCallOrder;
    const [cancelReissuesOrder, cancelOthersOrder] =
      deps.signerIssuanceService.cancelOpenJobsForRevokedSigner.mock.invocationCallOrder;
    expect(revokedWriteOrder).toBeLessThan(cancelReissuesOrder);
    expect(cancelReissuesOrder).toBeLessThan(caRevokeOrder);
    expect(caRevokeOrder).toBeLessThan(cancelOthersOrder);

    expect(result).toMatchObject({
      certificateId: OLD_CERT_ID,
      serialNumber: "0a1b2c",
      signer: { status: SignerStatus.Revoked }
    });
    expect(deps.signerDAL.restoreStatusAfterFailedRevoke).not.toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalled();
  });

  it("refuses a member without the revoke-certificate permission and changes nothing", async () => {
    const { service, deps } = buildService({
      permission: abilityWith(ResourcePermissionSignerActions.Read, ResourcePermissionSignerActions.ReissueCertificate)
    });

    await expect(service.revokeCertificate(revokeDto)).rejects.toBeInstanceOf(ForbiddenError);

    expect(deps.permissionService.getResourcePermission).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: SIGNER_ID, projectId: PROJECT_ID })
    );
    expect(deps.keyStore.acquireLock).not.toHaveBeenCalled();
    expect(deps.signerDAL.transaction).not.toHaveBeenCalled();
    expect(deps.signerDAL.updateById).not.toHaveBeenCalled();
    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
    expect(deps.signerIssuanceService.cancelOpenJobsForRevokedSigner).not.toHaveBeenCalled();
  });

  it("restores the signer's previous status when the CA revoke fails and the certificate is still active", async () => {
    const { service, deps, lock } = buildService({ signer: buildSigner({ status: SignerStatus.Disabled }) });
    const caError = new Error("CA unavailable");
    deps.certificateService.revokeOwnedCertificate.mockRejectedValue(caError);

    await expect(service.revokeCertificate(revokeDto)).rejects.toBe(caError);

    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(SIGNER_ID, { status: SignerStatus.Revoked }, tx);
    expect(deps.signerDAL.restoreStatusAfterFailedRevoke).toHaveBeenCalledWith(SIGNER_ID, {
      status: SignerStatus.Disabled,
      certificateFailureReason: null
    });
    expect(deps.signerIssuanceService.cancelOpenJobsForRevokedSigner.mock.calls).toEqual([
      [SIGNER_ID, { digicertReissuesOnly: true }]
    ]);
    expect(lock.release).toHaveBeenCalled();
  });

  it("restores the failure reason the signer had before a revoke that failed at the CA", async () => {
    const { service, deps } = buildService({
      signer: buildSigner({ certificateFailureReason: "Gateway connection timeout" })
    });
    deps.certificateService.revokeOwnedCertificate.mockRejectedValue(new Error("CA unavailable"));

    await expect(service.revokeCertificate(revokeDto)).rejects.toThrow("CA unavailable");

    expect(deps.signerDAL.restoreStatusAfterFailedRevoke).toHaveBeenCalledWith(SIGNER_ID, {
      status: SignerStatus.Active,
      certificateFailureReason: "Gateway connection timeout"
    });
  });

  it("keeps the signer Revoked when the CA revoke throws after the certificate was revoked", async () => {
    const { service, deps } = buildService();
    const caError = new Error("CRL update failed");
    deps.certificateService.revokeOwnedCertificate.mockRejectedValue(caError);
    deps.certificateDAL.findById
      .mockResolvedValueOnce(buildCertificate())
      .mockResolvedValueOnce(buildCertificate({ status: CertStatus.REVOKED }));

    await expect(service.revokeCertificate(revokeDto)).rejects.toBe(caError);

    expect(deps.signerDAL.restoreStatusAfterFailedRevoke).not.toHaveBeenCalled();
  });

  it("explains a DigiCert reissue it couldn't cancel and restores the signer", async () => {
    const { service, deps } = buildService();
    deps.signerIssuanceService.cancelOpenJobsForRevokedSigner.mockResolvedValueOnce({
      uncancelledDigicertOrderIds: [9504],
      cancelledJobCount: 0
    });

    await expect(service.revokeCertificate(revokeDto)).rejects.toThrow(
      "DigiCert can't revoke this certificate while a reissue is pending on order #9504. Cancel the reissue in CertCentral, then revoke again."
    );

    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
    expect(deps.signerDAL.restoreStatusAfterFailedRevoke).toHaveBeenCalledWith(SIGNER_ID, {
      status: SignerStatus.Active,
      certificateFailureReason: null
    });
  });

  it("returns a Pending signer to Active when its reissue was canceled and the revoke then failed", async () => {
    const { service, deps } = buildService({ signer: buildSigner({ status: SignerStatus.Pending }) });
    deps.signerIssuanceService.cancelOpenJobsForRevokedSigner.mockResolvedValueOnce({
      uncancelledDigicertOrderIds: [],
      cancelledJobCount: 1
    });
    deps.certificateService.revokeOwnedCertificate.mockRejectedValue(new Error("approval required"));

    await expect(service.revokeCertificate(revokeDto)).rejects.toThrow("approval required");

    expect(deps.signerDAL.restoreStatusAfterFailedRevoke).toHaveBeenCalledWith(SIGNER_ID, {
      status: SignerStatus.Active,
      certificateFailureReason: "The certificate request was canceled by a revoke that didn't complete"
    });
  });

  it("keeps a Pending signer Pending when the failed revoke canceled nothing", async () => {
    const { service, deps } = buildService({ signer: buildSigner({ status: SignerStatus.Pending }) });
    deps.certificateService.revokeOwnedCertificate.mockRejectedValue(new Error("CA unavailable"));

    await expect(service.revokeCertificate(revokeDto)).rejects.toThrow("CA unavailable");

    expect(deps.signerDAL.restoreStatusAfterFailedRevoke).toHaveBeenCalledWith(SIGNER_ID, {
      status: SignerStatus.Pending,
      certificateFailureReason: null
    });
  });

  it("refuses an imported certificate before marking the signer Revoked", async () => {
    const { service, deps } = buildService();
    deps.certificateDAL.findById.mockResolvedValue(buildCertificate({ caId: null }));

    await expect(service.revokeCertificate(revokeDto)).rejects.toThrow("uses an imported certificate");

    expect(deps.signerDAL.updateById).not.toHaveBeenCalled();
    expect(deps.signerIssuanceService.cancelOpenJobsForRevokedSigner).not.toHaveBeenCalled();
    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
  });

  it("returns the CRL warning when the CA couldn't re-sign its CRL", async () => {
    const { service, deps } = buildService();
    deps.certificateService.revokeOwnedCertificate.mockResolvedValue({
      revokedAt: new Date(),
      cert: buildCertificate({ status: CertStatus.REVOKED }),
      crlWarning: "Another CRL update for this CA is in progress. The CRL will be regenerated automatically."
    });

    await expect(service.revokeCertificate(revokeDto)).resolves.toMatchObject({
      crlWarning: "Another CRL update for this CA is in progress. The CRL will be regenerated automatically."
    });
  });

  it("revokes while a renewal job is still open", async () => {
    const { service, deps } = buildService();
    deps.signerIssuanceService.hasOpenJobs.mockResolvedValue(true);

    await expect(service.revokeCertificate(revokeDto)).resolves.toMatchObject({
      signer: { status: SignerStatus.Revoked }
    });

    expect(deps.certificateService.revokeOwnedCertificate).toHaveBeenCalled();
    expect(deps.signerIssuanceService.cancelOpenJobsForRevokedSigner).toHaveBeenCalledWith(SIGNER_ID);
  });
});
