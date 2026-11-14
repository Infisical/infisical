import { createMongoAbility, ForbiddenError, RawRuleOf } from "@casl/ability";
import { Knex } from "knex";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResourceMembershipRole, TPkiSignerCertificateRevocations } from "@app/db/schemas";
import {
  ResourcePermissionSet,
  ResourcePermissionSignerActions,
  ResourcePermissionSub,
  TResourceAbility
} from "@app/ee/services/permission/resource-permission";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { ExecutionError, ExecutionStats, ResourceLockedError } from "@app/lib/red-lock";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { CaStatus, CaType } from "../certificate-authority/certificate-authority-enums";
import {
  CodeSigningOrderStatus,
  DigiCertRevocationRequestStatus
} from "../certificate-authority/digicert/digicert-certificate-authority-enums";
import { CertKeyAlgorithm, CertStatus, CrlReason } from "../certificate/certificate-types";
import { NotificationType } from "../notification/notification-types";
import { TSignerWithCertificate } from "./signer-dal";
import {
  CertKeySource,
  DigiCertLifecycleMode,
  SignerAutoRenewalOutcome,
  SignerIssuanceJobCancelReason,
  SignerIssuanceJobStatus,
  SignerRevocationStatus,
  SignerStatus,
  UNSETTLED_SIGNER_REVOCATION_STATUSES
} from "./signer-enums";
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
const REVOCATION_ID = "revocation-1";
const DIGICERT_ORDER_ID = 12345;
const DAY_MS = 24 * 60 * 60 * 1000;
const ADMIN_USER_ID = "user-admin";
const GROUP_ADMIN_USER_ID = "user-group-admin";

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

const buildSigner = (overrides: Partial<TSignerWithCertificate> = {}): TSignerWithCertificate =>
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
    nextAutoRenewalAt: null,
    certificateStatus: CertStatus.ACTIVE,
    certificateCaId: CA_ID,
    caType: CaType.INTERNAL,
    certificateNotAfter: new Date(Date.now() + 10 * DAY_MS),
    certificateExternalMetadata: null,
    hasOpenCertificateRequest: false,
    ...overrides
  }) as TSignerWithCertificate;

const buildCertificate = (overrides: Record<string, unknown> = {}) => ({
  id: OLD_CERT_ID,
  caId: CA_ID,
  projectId: PROJECT_ID,
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

const buildRevocation = (
  overrides: Partial<TPkiSignerCertificateRevocations> = {}
): TPkiSignerCertificateRevocations => ({
  id: REVOCATION_ID,
  signerId: SIGNER_ID,
  certificateId: OLD_CERT_ID,
  status: SignerRevocationStatus.Submitting,
  revocationReason: CrlReason.KEY_COMPROMISE,
  previousSignerStatus: SignerStatus.Active,
  caRequestId: null,
  failureReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
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

const digicertCertificate = () =>
  buildCertificate({
    externalMetadata: { type: CaType.DIGICERT, orderId: DIGICERT_ORDER_ID },
    keySource: CertKeySource.Hsm,
    hsmConnectorId: "hsm-1",
    hsmKeyLabel: "key-1",
    keyAlgorithm: CertKeyAlgorithm.RSA_4096
  });

const buildService = ({
  signer = buildSigner(),
  replicaSigner = signer,
  certificate = buildCertificate(),
  ca = internalCa,
  revocations = [],
  permission = abilityWith(
    ResourcePermissionSignerActions.ReissueCertificate,
    ResourcePermissionSignerActions.RevokeCertificate,
    ResourcePermissionSignerActions.ManageStatus,
    ResourcePermissionSignerActions.Read
  )
}: {
  signer?: TSignerWithCertificate;
  replicaSigner?: TSignerWithCertificate;
  certificate?: ReturnType<typeof buildCertificate>;
  ca?: typeof internalCa | typeof digicertCa | null;
  revocations?: TPkiSignerCertificateRevocations[];
  permission?: TResourceAbility;
} = {}) => {
  const lock = { release: vi.fn().mockResolvedValue(undefined) };
  let currentSigner = signer;
  const writeSigner = (data: Partial<TSignerWithCertificate>) => {
    currentSigner = { ...currentSigner, ...data };
    return currentSigner;
  };
  const isRevokedOrRevoking = () =>
    currentSigner.status === SignerStatus.Revoked || currentSigner.status === SignerStatus.RevocationPending;
  const signerDAL = {
    findById: vi.fn(async () => replicaSigner),
    findByIdForUpdate: vi.fn(async () => currentSigner),
    findByIdWithCertificate: vi.fn(async () => currentSigner),
    find: vi.fn().mockResolvedValue([]),
    updateById: vi.fn(async (_id: string, data: Partial<TSignerWithCertificate>) => writeSigner(data)),
    updateUnlessRevoked: vi.fn(async (_id: string, data: Partial<TSignerWithCertificate>) =>
      isRevokedOrRevoking() ? undefined : writeSigner(data)
    ),
    transaction: vi.fn(async (cb: (trx: Knex) => unknown) => cb(tx))
  };
  let revocationRows = [...revocations];
  const isUnsettled = (row: TPkiSignerCertificateRevocations) =>
    (UNSETTLED_SIGNER_REVOCATION_STATUSES as readonly string[]).includes(row.status);
  const signerRevocationDAL = {
    create: vi.fn(async (data: Partial<TPkiSignerCertificateRevocations>) => {
      if (revocationRows.some(isUnsettled)) throw new Error("unique violation: one unsettled revocation per signer");
      const row = buildRevocation({ id: `revocation-${revocationRows.length + 1}`, ...data });
      revocationRows = [...revocationRows, row];
      return row;
    }),
    updateIfUnsettled: vi.fn(async (id: string, data: Partial<TPkiSignerCertificateRevocations>) => {
      const row = revocationRows.find((candidate) => candidate.id === id && isUnsettled(candidate));
      if (!row) return undefined;
      const updated = { ...row, ...data };
      revocationRows = revocationRows.map((candidate) => (candidate.id === id ? updated : candidate));
      return updated;
    }),
    findUnsettledForSigner: vi.fn(async () => revocationRows.find(isUnsettled)),
    find: vi.fn(async ({ status }: { status: SignerRevocationStatus }) =>
      revocationRows.filter((row) => row.status === status)
    )
  };
  let currentCertificate = certificate;
  const certificateDAL = { findById: vi.fn(async () => currentCertificate) };
  const certificateService = {
    revokeOwnedCertificate: vi.fn(async () => {
      currentCertificate = { ...currentCertificate, status: CertStatus.REVOKED };
      return { cert: currentCertificate, revokedAt: new Date() };
    }),
    completeOwnedCertificateRevocation: vi.fn(async () => {
      currentCertificate = { ...currentCertificate, status: CertStatus.REVOKED };
      return { revokedAt: new Date() };
    })
  };
  const signerIssuanceService = {
    requestIssuance: vi.fn().mockResolvedValue({ id: "job-1" }),
    getLatestIssuanceRequest: vi.fn().mockResolvedValue(null),
    cancelOpenRequests: vi.fn().mockResolvedValue([]),
    cancelPendingDigiCertReissue: vi.fn().mockResolvedValue(undefined),
    revokeUnattachedCertificate: vi.fn().mockResolvedValue(null),
    cleanUpRequestsBeforeDelete: vi.fn().mockResolvedValue(undefined)
  };
  const membershipDAL = {
    find: vi.fn().mockResolvedValue([
      { id: "membership-admin", actorUserId: ADMIN_USER_ID },
      { id: "membership-group", actorGroupId: "group-1" },
      { id: "membership-viewer", actorUserId: "user-viewer" }
    ])
  };
  const membershipRoleDAL = {
    find: vi.fn().mockResolvedValue([
      { membershipId: "membership-admin", role: ResourceMembershipRole.Admin, isTemporary: false },
      { membershipId: "membership-group", role: ResourceMembershipRole.Admin, isTemporary: false }
    ])
  };
  const deps = {
    signerDAL,
    signerRevocationDAL,
    certificateDAL,
    certificateAuthorityDAL: { findByIdWithAssociatedCa: vi.fn().mockResolvedValue(ca) },
    certificateService,
    signerIssuanceService,
    permissionService: { getResourcePermission: vi.fn().mockResolvedValue({ permission, memberships: [] }) },
    keyStore: { acquireLock: vi.fn().mockResolvedValue(lock) },
    hsmConnectorService: { assertAttachPermission: vi.fn() },
    digicertFns: {
      assertCodeSigningOrderReusable: vi.fn(),
      getRevocationRequestStatus: vi.fn(),
      revokeCertificate: vi.fn().mockResolvedValue(undefined)
    },
    projectDAL: { findOne: vi.fn().mockResolvedValue({ id: PROJECT_ID, orgId: ORG_ID }) },
    membershipDAL,
    membershipRoleDAL,
    userGroupMembershipDAL: { find: vi.fn().mockResolvedValue([{ groupId: "group-1", userId: GROUP_ADMIN_USER_ID }]) },
    notificationService: { createUserNotifications: vi.fn().mockResolvedValue(undefined) },
    orgDAL: {
      findMembership: vi.fn(async ({ $in }: { $in: { actorUserId: string[] } }) =>
        $in.actorUserId.map((actorUserId) => ({ actorUserId, isActive: true, status: "accepted" }))
      ),
      findActorsWithActiveOrgAccess: vi.fn().mockResolvedValue({ userIds: [], identityIds: [] })
    },
    userDAL: { find: vi.fn().mockResolvedValue([]) },
    auditLogService: { createAuditLog: vi.fn().mockResolvedValue(undefined) }
  };
  Object.assign(signerIssuanceService, {
    revokeAtCa: vi.fn(
      async (
        revokedCertificate: { id: string; caId: string; serialNumber: string },
        revocationReason: CrlReason,
        orgId: string
      ) => {
        const certificateCa = (await deps.certificateAuthorityDAL.findByIdWithAssociatedCa(
          revokedCertificate.caId
        )) as { id: string; externalCa: { type: CaType } | null } | null;
        if (certificateCa?.externalCa?.type === CaType.DIGICERT) {
          const caRequestId = (await deps.digicertFns.revokeCertificate({
            caId: certificateCa.id,
            serialNumber: revokedCertificate.serialNumber,
            reason: revocationReason,
            allowPendingApproval: true
          })) as number | undefined;
          if (caRequestId) return { caRequestId };
          await (certificateService.completeOwnedCertificateRevocation as (...args: unknown[]) => Promise<unknown>)({
            certificateId: revokedCertificate.id,
            revocationReason,
            orgId
          });
          return {};
        }
        const { crlWarning } = (await (
          certificateService.revokeOwnedCertificate as (...args: unknown[]) => Promise<unknown>
        )({ certificateId: revokedCertificate.id, revocationReason, orgId })) as { crlWarning?: string };
        return { crlWarning };
      }
    )
  });
  const service = signerServiceFactory(deps as unknown as Parameters<typeof signerServiceFactory>[0]);
  return {
    service,
    deps,
    lock,
    signer: () => currentSigner,
    revocation: () => revocationRows[revocationRows.length - 1],
    revocationRows: () => revocationRows
  };
};

const mockInternalIssuance = () =>
  vi
    .mocked(issueSignerCertificate)
    .mockResolvedValue({ certificateId: NEW_CERT_ID } as Awaited<ReturnType<typeof issueSignerCertificate>>);

const revoke = (service: ReturnType<typeof buildService>["service"]) =>
  service.revokeCertificate({ ...actorFields, signerId: SIGNER_ID, revocationReason: CrlReason.KEY_COMPROMISE });

beforeEach(() => {
  vi.mocked(issueSignerCertificate).mockReset();
});

describe("signerService locked fresh read", () => {
  it("refuses a renew when the primary shows a revoke the replica hasn't seen yet", async () => {
    const { service, deps } = buildService({
      signer: buildSigner({ status: SignerStatus.RevocationPending }),
      replicaSigner: buildSigner({ status: SignerStatus.Active })
    });

    await expect(service.renewCertificate({ ...actorFields, signerId: SIGNER_ID })).rejects.toThrow("is being revoked");
    expect(deps.signerDAL.findByIdWithCertificate).toHaveBeenCalledWith(SIGNER_ID, tx);
    expect(deps.signerDAL.updateById).not.toHaveBeenCalled();
    expect(issueSignerCertificate).not.toHaveBeenCalled();
  });

  it("checks the permission before taking the lock", async () => {
    const { service, deps } = buildService({ permission: abilityWith(ResourcePermissionSignerActions.Read) });

    await expect(revoke(service)).rejects.toThrow(ForbiddenError);
    expect(deps.keyStore.acquireLock).not.toHaveBeenCalled();
  });

  it("tells the user to wait when another request holds the lock, and surfaces a Redis failure", async () => {
    const lockFailure = (voteError: Error) =>
      new ExecutionError("The operation was unable to achieve a quorum during its retry window.", [
        Promise.resolve({ votesAgainst: new Map([[{}, voteError]]) } as unknown as ExecutionStats)
      ]);
    const held = buildService();
    held.deps.keyStore.acquireLock.mockRejectedValue(lockFailure(new ResourceLockedError("locked")));
    await expect(held.service.disable({ ...actorFields, signerId: SIGNER_ID })).rejects.toThrow(
      "is being changed by another request"
    );

    const broken = buildService();
    const redisFailure = lockFailure(new Error("Connection is closed."));
    broken.deps.keyStore.acquireLock.mockRejectedValue(redisFailure);
    await expect(broken.service.disable({ ...actorFields, signerId: SIGNER_ID })).rejects.toBe(redisFailure);
  });
});

describe("signerService.renewCertificate", () => {
  it("issues and attaches a new internal CA certificate", async () => {
    mockInternalIssuance();
    const { service, deps, lock } = buildService();

    const result = await service.renewCertificate({ ...actorFields, signerId: SIGNER_ID });

    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      expect.objectContaining({ certificateId: NEW_CERT_ID, status: SignerStatus.Active, nextAutoRenewalAt: null }),
      tx
    );
    expect(result).toMatchObject({ caId: CA_ID, previousSerialNumber: "0a1b2c" });
    expect(deps.signerIssuanceService.cancelOpenRequests).not.toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalled();
  });

  it("keeps the signer's status while a DigiCert renewal is requested", async () => {
    const { service, deps, signer } = buildService({ ca: digicertCa, certificate: digicertCertificate() });

    await service.renewCertificate({ ...actorFields, signerId: SIGNER_ID });

    expect(signer().status).toBe(SignerStatus.Active);
    expect(deps.signerIssuanceService.requestIssuance).toHaveBeenCalledWith(
      expect.objectContaining({
        digicertLifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: DIGICERT_ORDER_ID }
      })
    );
  });

  it("records the failure without marking the signer Failed when the internal CA refuses", async () => {
    const issueError = new Error("internal CA refused to sign");
    vi.mocked(issueSignerCertificate).mockRejectedValue(issueError);
    const { service, signer } = buildService();

    await expect(service.renewCertificate({ ...actorFields, signerId: SIGNER_ID })).rejects.toBe(issueError);
    expect(signer()).toMatchObject({
      status: SignerStatus.Active,
      certificateFailureReason: "internal CA refused to sign"
    });
  });

  it.each([
    [{ hasOpenCertificateRequest: true }, "is already waiting for a new certificate"],
    [{ status: SignerStatus.Revoked }, "certificate was revoked"],
    [{ certificateStatus: CertStatus.REVOKED }, "certificate was revoked"],
    [{ status: SignerStatus.Disabled }, "is disabled"]
  ])("refuses a signer with %o", async (overrides, message) => {
    const { service, deps } = buildService({ signer: buildSigner(overrides) });

    await expect(service.renewCertificate({ ...actorFields, signerId: SIGNER_ID })).rejects.toThrow(message);
    expect(deps.signerIssuanceService.requestIssuance).not.toHaveBeenCalled();
    expect(issueSignerCertificate).not.toHaveBeenCalled();
  });
});

describe("signerService.reissueCertificate", () => {
  it("cancels open requests in the settings transaction, keeping the order the reissue targets", async () => {
    const { service, deps, signer } = buildService({ ca: digicertCa, certificate: digicertCertificate() });

    await service.reissueCertificate({ ...actorFields, signerId: SIGNER_ID, caId: CA_ID });

    expect(deps.signerIssuanceService.cancelOpenRequests).toHaveBeenCalledWith(
      SIGNER_ID,
      SignerIssuanceJobCancelReason.Superseded,
      { keepOrderId: DIGICERT_ORDER_ID, leaveKeptJobPending: true },
      tx
    );
    expect(deps.signerIssuanceService.requestIssuance).toHaveBeenCalledWith(
      expect.objectContaining({ keepOrderId: DIGICERT_ORDER_ID })
    );
    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(
      SIGNER_ID,
      expect.objectContaining({ status: SignerStatus.Pending, nextAutoRenewalAt: null }),
      tx
    );
    expect(signer().status).toBe(SignerStatus.Pending);
    expect(deps.signerIssuanceService.requestIssuance).toHaveBeenCalledWith(
      expect.objectContaining({
        digicertLifecycle: { mode: DigiCertLifecycleMode.Reissue, previousOrderId: DIGICERT_ORDER_ID }
      })
    );
  });

  it("revives a revoked signer with a new key in the settings write", async () => {
    mockInternalIssuance();
    const { service, signer } = buildService({
      signer: buildSigner({ status: SignerStatus.Revoked, certificateStatus: CertStatus.REVOKED }),
      certificate: buildCertificate({ status: CertStatus.REVOKED })
    });

    await service.reissueCertificate({ ...actorFields, signerId: SIGNER_ID, caId: CA_ID });

    expect(signer()).toMatchObject({ status: SignerStatus.Active, certificateId: NEW_CERT_ID });
  });

  it("refuses while the revoke is still in progress", async () => {
    const { service, deps } = buildService({ signer: buildSigner({ status: SignerStatus.RevocationPending }) });

    await expect(service.reissueCertificate({ ...actorFields, signerId: SIGNER_ID, caId: CA_ID })).rejects.toThrow(
      "is being revoked"
    );
    expect(deps.signerIssuanceService.cancelOpenRequests).not.toHaveBeenCalled();
  });
});

describe("signerService.disable", () => {
  it("writes Disabled through the guarded update and refuses a revoked signer", async () => {
    const { service, deps } = buildService();
    await service.disable({ ...actorFields, signerId: SIGNER_ID });
    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      { status: SignerStatus.Disabled },
      undefined
    );

    const revoked = buildService({ signer: buildSigner({ status: SignerStatus.Revoked }) });
    await expect(revoked.service.disable({ ...actorFields, signerId: SIGNER_ID })).rejects.toThrow(
      "certificate was revoked"
    );
  });
});

describe("signerService.revokeCertificate", () => {
  it("opens the revocation and cancels open requests in one transaction, then marks the signer Revoked", async () => {
    const { service, deps, signer, revocation } = buildService({
      signer: buildSigner({ status: SignerStatus.Pending })
    });

    const result = await revoke(service);

    expect(deps.signerRevocationDAL.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: SignerRevocationStatus.Submitting,
        previousSignerStatus: SignerStatus.Pending
      }),
      tx
    );
    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(SIGNER_ID, { status: SignerStatus.RevocationPending }, tx);
    expect(deps.signerIssuanceService.cancelOpenRequests).toHaveBeenCalledWith(
      SIGNER_ID,
      SignerIssuanceJobCancelReason.Revoked,
      { keepOrderId: undefined },
      tx
    );
    expect(deps.certificateService.revokeOwnedCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: OLD_CERT_ID, revocationReason: CrlReason.KEY_COMPROMISE })
    );
    expect(signer().status).toBe(SignerStatus.Revoked);
    expect(revocation().status).toBe(SignerRevocationStatus.Completed);
    expect(result.signer.status).toBe(SignerStatus.Revoked);
  });

  it("returns the CRL warning", async () => {
    const { service, deps } = buildService();
    deps.certificateService.revokeOwnedCertificate.mockResolvedValue({
      cert: buildCertificate(),
      revokedAt: new Date(),
      crlWarning: "The CRL couldn't be regenerated."
    } as never);

    await expect(revoke(service)).resolves.toMatchObject({ crlWarning: "The CRL couldn't be regenerated." });
  });

  it.each([
    [SignerStatus.Active, SignerStatus.Active],
    [SignerStatus.Pending, SignerStatus.Active],
    [SignerStatus.Failed, SignerStatus.Active],
    [SignerStatus.Disabled, SignerStatus.Disabled]
  ])(
    "restores a %s signer to %s and notifies its admins when the CA refuses",
    async (previousStatus, restoredStatus) => {
      const { service, deps, signer, revocation } = buildService({ signer: buildSigner({ status: previousStatus }) });
      deps.certificateService.revokeOwnedCertificate.mockRejectedValue(
        new BadRequestError({ message: "The CA does not accept this revocation reason." })
      );

      await expect(revoke(service)).rejects.toThrow("does not accept");

      expect(signer().status).toBe(restoredStatus);
      expect(revocation()).toMatchObject({
        status: SignerRevocationStatus.Rejected,
        failureReason: "The CA does not accept this revocation reason."
      });
      const [notifications] = deps.notificationService.createUserNotifications.mock.calls[0] as [
        { userId: string; type: string; body: string; orgId: string }[]
      ];
      expect(notifications.map(({ userId }) => userId).sort()).toEqual([ADMIN_USER_ID, GROUP_ADMIN_USER_ID].sort());
      expect(notifications[0]).toMatchObject({ type: NotificationType.SIGNER_REVOKE_REFUSED, orgId: ORG_ID });
      expect(notifications[0].body).toContain("still valid");
      expect(notifications[0].body).toContain("canceled");
    }
  );

  it("leaves the signer RevocationPending with a failed row on an unknown outcome, and revoking again reuses the row", async () => {
    const { service, deps, signer, revocation, revocationRows } = buildService();
    deps.certificateService.revokeOwnedCertificate.mockRejectedValueOnce(
      new InternalServerError({ message: "upstream timed out" })
    );

    await expect(revoke(service)).rejects.toThrow("upstream timed out");
    expect(signer().status).toBe(SignerStatus.RevocationPending);
    expect(revocation().status).toBe(SignerRevocationStatus.Failed);
    expect(revocation().failureReason).toContain("didn't finish");
    expect(deps.notificationService.createUserNotifications).not.toHaveBeenCalled();

    await revoke(service);

    expect(deps.signerRevocationDAL.create).toHaveBeenCalledTimes(1);
    expect(deps.signerRevocationDAL.updateIfUnsettled).toHaveBeenCalledWith(
      REVOCATION_ID,
      expect.objectContaining({ status: SignerRevocationStatus.Submitting }),
      tx
    );
    expect(revocationRows()).toHaveLength(1);
    expect(revocation().status).toBe(SignerRevocationStatus.Completed);
    expect(signer().status).toBe(SignerStatus.Revoked);
  });

  it("finishes and returns success when the certificate turns out revoked after an error", async () => {
    const { service, deps, signer, revocation } = buildService();
    deps.certificateService.revokeOwnedCertificate.mockImplementationOnce(async () => {
      deps.certificateDAL.findById.mockResolvedValue(buildCertificate({ status: CertStatus.REVOKED }));
      throw new InternalServerError({ message: "CRL upload failed" });
    });

    await expect(revoke(service)).resolves.toMatchObject({ signer: { status: SignerStatus.Revoked } });
    expect(revocation().status).toBe(SignerRevocationStatus.Completed);
    expect(signer().status).toBe(SignerStatus.Revoked);
  });

  it("completes a retry at once when the certificate is already revoked", async () => {
    const { service, deps, signer, revocation } = buildService({
      signer: buildSigner({ status: SignerStatus.RevocationPending }),
      certificate: buildCertificate({ status: CertStatus.REVOKED }),
      revocations: [buildRevocation({ status: SignerRevocationStatus.Failed })]
    });

    await revoke(service);

    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
    expect(revocation().status).toBe(SignerRevocationStatus.Completed);
    expect(signer().status).toBe(SignerStatus.Revoked);
  });

  it("refuses an imported certificate before opening a revocation", async () => {
    const { service, deps } = buildService({
      signer: buildSigner({ certificateCaId: null }),
      certificate: buildCertificate({ caId: null })
    });

    await expect(revoke(service)).rejects.toThrow("imported certificate");
    expect(deps.signerIssuanceService.cancelPendingDigiCertReissue).not.toHaveBeenCalled();
    expect(deps.signerRevocationDAL.create).not.toHaveBeenCalled();
  });
});

describe("signerService DigiCert revoke", () => {
  it("cancels a pending DigiCert reissue first and keeps its order out of the wind-down", async () => {
    const { service, deps } = buildService({ ca: digicertCa, certificate: digicertCertificate() });
    deps.signerIssuanceService.cancelPendingDigiCertReissue.mockResolvedValue(DIGICERT_ORDER_ID);

    await revoke(service);

    expect(deps.signerIssuanceService.cancelOpenRequests).toHaveBeenCalledWith(
      SIGNER_ID,
      SignerIssuanceJobCancelReason.Revoked,
      { keepOrderId: DIGICERT_ORDER_ID },
      tx
    );
    expect(deps.digicertFns.revokeCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ caId: CA_ID, serialNumber: "0a1b2c", allowPendingApproval: true })
    );
    expect(deps.certificateService.completeOwnedCertificateRevocation).toHaveBeenCalled();
    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
  });

  it("refuses the revoke and changes nothing when the reissue can't be canceled", async () => {
    const { service, deps, signer } = buildService({ ca: digicertCa, certificate: digicertCertificate() });
    deps.signerIssuanceService.cancelPendingDigiCertReissue.mockRejectedValue(
      new BadRequestError({ message: `a reissue is pending on order #${DIGICERT_ORDER_ID}` })
    );

    await expect(revoke(service)).rejects.toThrow(`#${DIGICERT_ORDER_ID}`);
    expect(deps.signerRevocationDAL.create).not.toHaveBeenCalled();
    expect(signer().status).toBe(SignerStatus.Active);
  });

  it("waits for approval, refuses a second revoke meanwhile, and settles once DigiCert approves", async () => {
    const { service, deps, signer, revocation } = buildService({ ca: digicertCa, certificate: digicertCertificate() });
    deps.digicertFns.revokeCertificate.mockResolvedValue(41);

    const result = await revoke(service);

    expect(result.pendingRevocationRequestId).toBe(41);
    expect(revocation()).toMatchObject({ status: SignerRevocationStatus.AwaitingApproval, caRequestId: 41 });
    expect(signer().status).toBe(SignerStatus.RevocationPending);
    await expect(revoke(service)).rejects.toThrow("request #41");

    deps.digicertFns.getRevocationRequestStatus.mockResolvedValue(DigiCertRevocationRequestStatus.Approved);
    await service.syncPendingRevocations();

    expect(deps.certificateService.completeOwnedCertificateRevocation).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: OLD_CERT_ID, orgId: ORG_ID })
    );
    expect(revocation().status).toBe(SignerRevocationStatus.Completed);
    expect(signer().status).toBe(SignerStatus.Revoked);
  });

  it("restores the signer and notifies its admins when DigiCert rejects the pending request", async () => {
    const { service, deps, signer, revocation } = buildService({
      ca: digicertCa,
      certificate: digicertCertificate(),
      signer: buildSigner({ status: SignerStatus.RevocationPending }),
      revocations: [buildRevocation({ status: SignerRevocationStatus.AwaitingApproval, caRequestId: 41 })]
    });
    deps.digicertFns.getRevocationRequestStatus.mockResolvedValue(DigiCertRevocationRequestStatus.Rejected);

    await service.syncPendingRevocations();

    expect(revocation().status).toBe(SignerRevocationStatus.Rejected);
    expect(signer().status).toBe(SignerStatus.Active);
    expect(deps.notificationService.createUserNotifications).toHaveBeenCalledTimes(1);
  });

  it("leaves a revocation alone once it's settled", async () => {
    const { service, deps } = buildService({
      ca: digicertCa,
      signer: buildSigner({ status: SignerStatus.Revoked }),
      revocations: [buildRevocation({ status: SignerRevocationStatus.AwaitingApproval, caRequestId: 41 })]
    });
    deps.digicertFns.getRevocationRequestStatus.mockResolvedValue(DigiCertRevocationRequestStatus.Rejected);
    deps.signerRevocationDAL.updateIfUnsettled.mockResolvedValue(undefined);

    await service.syncPendingRevocations();

    expect(deps.signerDAL.updateById).not.toHaveBeenCalled();
    expect(deps.notificationService.createUserNotifications).not.toHaveBeenCalled();
  });
});

describe("signerService.autoRenewCertificate", () => {
  it("renews through the reissue path with a bounded backoff and no actor checks", async () => {
    const { service, deps } = buildService({ ca: digicertCa, certificate: digicertCertificate() });

    const before = Date.now();
    await expect(service.autoRenewCertificate(SIGNER_ID)).resolves.toBe(SignerAutoRenewalOutcome.Renewed);

    const { nextAutoRenewalAt } = deps.signerDAL.updateById.mock.calls[0][1] as { nextAutoRenewalAt: Date };
    expect(nextAutoRenewalAt.getTime() - before).toBeGreaterThanOrEqual(5 * DAY_MS - 1000);
    expect(nextAutoRenewalAt.getTime() - before).toBeLessThanOrEqual(5 * DAY_MS + 1000);
    expect(deps.hsmConnectorService.assertAttachPermission).not.toHaveBeenCalled();
    const [request] = deps.signerIssuanceService.requestIssuance.mock.calls[0] as [{ hsm?: { actor?: unknown } }];
    expect(request.hsm).toBeDefined();
    expect(request.hsm?.actor).toBeUndefined();
  });

  it("keeps the backoff between one and seven days", async () => {
    const nearExpiry = buildService({ signer: buildSigner({ certificateNotAfter: new Date(Date.now() + DAY_MS) }) });
    mockInternalIssuance();
    await nearExpiry.service.autoRenewCertificate(SIGNER_ID);
    const { nextAutoRenewalAt } = nearExpiry.deps.signerDAL.updateById.mock.calls[0][1] as { nextAutoRenewalAt: Date };
    expect(nextAutoRenewalAt.getTime() - Date.now()).toBeGreaterThan(DAY_MS - 60_000);
  });

  it("skips a signer whose backoff ends more than the margin away, but not one ending within it", async () => {
    const waiting = buildService({ signer: buildSigner({ nextAutoRenewalAt: new Date(Date.now() + 2 * DAY_MS) }) });
    await expect(waiting.service.autoRenewCertificate(SIGNER_ID)).resolves.toBe(SignerAutoRenewalOutcome.Skipped);

    mockInternalIssuance();
    const due = buildService({ signer: buildSigner({ nextAutoRenewalAt: new Date(Date.now() + 60_000) }) });
    await expect(due.service.autoRenewCertificate(SIGNER_ID)).resolves.toBe(SignerAutoRenewalOutcome.Renewed);
  });

  it("skips revoked signers and signers with an open request", async () => {
    const revoked = buildService({ signer: buildSigner({ status: SignerStatus.RevocationPending }) });
    await expect(revoked.service.autoRenewCertificate(SIGNER_ID)).resolves.toBe(SignerAutoRenewalOutcome.Skipped);

    const requesting = buildService({ signer: buildSigner({ hasOpenCertificateRequest: true }) });
    await expect(requesting.service.autoRenewCertificate(SIGNER_ID)).resolves.toBe(SignerAutoRenewalOutcome.Skipped);
    expect(requesting.deps.signerDAL.updateById).not.toHaveBeenCalled();
  });

  it("records the failure and reports it when the renewal fails", async () => {
    const { service, signer } = buildService({ ca: { ...internalCa, status: CaStatus.DISABLED } });

    await expect(service.autoRenewCertificate(SIGNER_ID)).resolves.toBe(SignerAutoRenewalOutcome.Failed);
    expect(signer().certificateFailureReason).toContain("not active");
  });
});

describe("signerService.getById", () => {
  it("returns the open request, the unsettled revocation, and only the issued certificate's order", async () => {
    const { service, deps } = buildService({
      signer: buildSigner({
        status: SignerStatus.RevocationPending,
        certificateExternalMetadata: { type: CaType.DIGICERT, orderId: DIGICERT_ORDER_ID },
        hasOpenCertificateRequest: false
      }),
      revocations: [
        buildRevocation({ status: SignerRevocationStatus.Failed, failureReason: "The revoke didn't finish." })
      ]
    });
    deps.signerIssuanceService.getLatestIssuanceRequest.mockResolvedValue({
      status: SignerIssuanceJobStatus.Cancelled,
      failureReason: "Canceled because the signer's certificate was revoked.",
      externalOrder: { provider: CaType.DIGICERT, orderId: 999, status: "pending" }
    });

    const result = await service.getById({ ...actorFields, signerId: SIGNER_ID });

    expect(result.externalOrder).toEqual({
      provider: CaType.DIGICERT,
      orderId: DIGICERT_ORDER_ID,
      status: CodeSigningOrderStatus.Issued
    });
    expect(result.certificateRequest?.externalOrder?.orderId).toBe(999);
    expect(result.revocation).toEqual({
      status: SignerRevocationStatus.Failed,
      caRequestId: null,
      failureReason: "The revoke didn't finish."
    });
    expect(result.hasOpenCertificateRequest).toBe(false);
  });
});

describe("signerService revoke refusal notification recipients", () => {
  it("skips admins without org access and admins whose temporary role expired", async () => {
    const { service, deps } = buildService();
    deps.membershipRoleDAL.find.mockResolvedValue([
      { membershipId: "membership-admin", role: ResourceMembershipRole.Admin, isTemporary: false },
      {
        membershipId: "membership-group",
        role: ResourceMembershipRole.Admin,
        isTemporary: true,
        temporaryAccessEndTime: new Date(Date.now() - DAY_MS)
      }
    ]);
    deps.orgDAL.findMembership.mockResolvedValue([{ actorUserId: ADMIN_USER_ID, isActive: false, status: "accepted" }]);
    deps.certificateService.revokeOwnedCertificate.mockRejectedValue(
      new BadRequestError({ message: "The CA does not accept this revocation reason." })
    );

    await expect(revoke(service)).rejects.toThrow("does not accept");

    expect(deps.membershipDAL.find).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
    expect(deps.userGroupMembershipDAL.find).not.toHaveBeenCalled();
    expect(deps.notificationService.createUserNotifications).not.toHaveBeenCalled();
  });
});

describe("signerService.delete with a certificate request in progress", () => {
  it("cleans up the signer's requests before deleting, and deletes nothing when cleanup is refused", async () => {
    const { service, deps } = buildService({ permission: abilityWith(ResourcePermissionSignerActions.Delete) });
    deps.signerIssuanceService.cleanUpRequestsBeforeDelete.mockRejectedValue(
      new BadRequestError({
        message: `DigiCert order #${DIGICERT_ORDER_ID} for this signer couldn't be canceled. Cancel it in CertCentral, then delete the signer again.`
      })
    );

    await expect(service.delete({ ...actorFields, signerId: SIGNER_ID })).rejects.toThrow(`#${DIGICERT_ORDER_ID}`);
    expect(deps.keyStore.acquireLock).toHaveBeenCalled();
    expect(deps.signerIssuanceService.cleanUpRequestsBeforeDelete).toHaveBeenCalledWith(SIGNER_ID);
    expect(deps.membershipDAL.find).not.toHaveBeenCalled();
  });
});

describe("signerService DigiCert revocation decision audit", () => {
  it.each([
    [DigiCertRevocationRequestStatus.Approved, SignerStatus.Revoked],
    [DigiCertRevocationRequestStatus.Rejected, SignerStatus.Active]
  ])("writes a platform audit event when DigiCert's request is %s", async (decision, status) => {
    const { service, deps } = buildService({
      ca: digicertCa,
      certificate: digicertCertificate(),
      signer: buildSigner({ status: SignerStatus.RevocationPending }),
      revocations: [buildRevocation({ status: SignerRevocationStatus.AwaitingApproval, caRequestId: 41 })]
    });
    deps.digicertFns.getRevocationRequestStatus.mockResolvedValue(decision);

    await service.syncPendingRevocations();

    const [auditLog] = deps.auditLogService.createAuditLog.mock.calls[0] as [
      { actor: { type: string }; event: { metadata: { decision: string; status: string } } }
    ];
    expect(auditLog.actor.type).toBe(ActorType.PLATFORM);
    expect(auditLog.event.metadata.decision).toBe(decision);
    expect(auditLog.event.metadata.status).toBe(status);
  });
});

describe("signerService.autoRenewCertificate failure reason", () => {
  it("records an issuance failure on the signer once", async () => {
    vi.mocked(issueSignerCertificate).mockRejectedValue(new Error("internal CA refused to sign"));
    const { service, deps } = buildService();

    await expect(service.autoRenewCertificate(SIGNER_ID)).resolves.toBe(SignerAutoRenewalOutcome.Failed);

    const failureWrites = deps.signerDAL.updateUnlessRevoked.mock.calls.filter(
      ([, data]) => (data as { certificateFailureReason?: string }).certificateFailureReason
    );
    expect(failureWrites).toHaveLength(1);
  });
});

describe("signerService revoking again while DigiCert still has the request", () => {
  const failedWithRequest = () =>
    buildService({
      ca: digicertCa,
      certificate: digicertCertificate(),
      signer: buildSigner({ status: SignerStatus.RevocationPending, caType: CaType.DIGICERT }),
      revocations: [buildRevocation({ status: SignerRevocationStatus.Failed, caRequestId: 41 })]
    });

  it("goes back to waiting for approval when the request is still pending", async () => {
    const { service, deps, revocation } = failedWithRequest();
    deps.digicertFns.getRevocationRequestStatus.mockResolvedValue(DigiCertRevocationRequestStatus.Pending);

    const result = await revoke(service);

    expect(result.pendingRevocationRequestId).toBe(41);
    expect(revocation()).toMatchObject({ status: SignerRevocationStatus.AwaitingApproval, caRequestId: 41 });
    expect(deps.digicertFns.revokeCertificate).not.toHaveBeenCalled();
  });

  it("finishes the revoke when the request was approved", async () => {
    const { service, deps, signer, revocation } = failedWithRequest();
    deps.digicertFns.getRevocationRequestStatus.mockResolvedValue(DigiCertRevocationRequestStatus.Approved);

    await revoke(service);

    expect(deps.certificateService.completeOwnedCertificateRevocation).toHaveBeenCalled();
    expect(deps.digicertFns.revokeCertificate).not.toHaveBeenCalled();
    expect(revocation().status).toBe(SignerRevocationStatus.Completed);
    expect(signer().status).toBe(SignerStatus.Revoked);
  });

  it("restores the signer when the request was rejected", async () => {
    const { service, deps, signer, revocation } = failedWithRequest();
    deps.digicertFns.getRevocationRequestStatus.mockResolvedValue(DigiCertRevocationRequestStatus.Rejected);

    await expect(revoke(service)).rejects.toThrow("DigiCert rejected revocation request #41");

    expect(deps.digicertFns.revokeCertificate).not.toHaveBeenCalled();
    expect(revocation().status).toBe(SignerRevocationStatus.Rejected);
    expect(signer().status).toBe(SignerStatus.Active);
  });
});

describe("signerService revoke on a CA that can't revoke", () => {
  it("refuses before canceling requests or opening a revocation", async () => {
    const { service, deps } = buildService({ signer: buildSigner({ caType: CaType.AZURE_AD_CS }) });

    await expect(revoke(service)).rejects.toThrow("can't revoke certificates");

    expect(deps.signerIssuanceService.cancelPendingDigiCertReissue).not.toHaveBeenCalled();
    expect(deps.signerRevocationDAL.create).not.toHaveBeenCalled();
    expect(deps.signerIssuanceService.cancelOpenRequests).not.toHaveBeenCalled();
    expect(deps.notificationService.createUserNotifications).not.toHaveBeenCalled();
  });
});

describe("signerService pending DigiCert revocation that DigiCert won't report on", () => {
  const awaiting = () =>
    buildService({
      ca: digicertCa,
      certificate: digicertCertificate(),
      signer: buildSigner({ status: SignerStatus.RevocationPending }),
      revocations: [buildRevocation({ status: SignerRevocationStatus.AwaitingApproval, caRequestId: 41 })]
    });

  it("stops tracking the request with DigiCert's message so the user can revoke again", async () => {
    const { service, deps, revocation } = awaiting();
    deps.digicertFns.getRevocationRequestStatus.mockRejectedValue(
      new BadRequestError({ message: "Request 41 not found." })
    );

    await service.syncPendingRevocations();

    expect(revocation().status).toBe(SignerRevocationStatus.Failed);
    expect(revocation().failureReason).toContain("Request 41 not found.");
  });

  it("keeps waiting after a transient error", async () => {
    const { service, deps, revocation } = awaiting();
    deps.digicertFns.getRevocationRequestStatus.mockRejectedValue(new Error("socket hang up"));

    await service.syncPendingRevocations();

    expect(revocation().status).toBe(SignerRevocationStatus.AwaitingApproval);
  });
});

describe("signerService revoking again after an unknown outcome", () => {
  it("keeps the revocation unsettled when the certificate authority refuses the retry", async () => {
    const { service, deps, signer, revocation } = buildService({
      signer: buildSigner({ status: SignerStatus.RevocationPending }),
      revocations: [buildRevocation({ status: SignerRevocationStatus.Failed })]
    });
    deps.certificateService.revokeOwnedCertificate.mockRejectedValue(
      new BadRequestError({ message: "A revocation is already in progress for this certificate." })
    );

    await expect(revoke(service)).rejects.toThrow("already in progress");

    expect(revocation().status).toBe(SignerRevocationStatus.Failed);
    expect(revocation().failureReason).toContain("may still be pending");
    expect(signer().status).toBe(SignerStatus.RevocationPending);
    expect(deps.notificationService.createUserNotifications).not.toHaveBeenCalled();
  });
});

describe("signerService resumed DigiCert revocation audit", () => {
  it.each([DigiCertRevocationRequestStatus.Approved, DigiCertRevocationRequestStatus.Rejected])(
    "writes the decision audit event when a retry finds the request %s",
    async (decision) => {
      const { service, deps } = buildService({
        ca: digicertCa,
        certificate: digicertCertificate(),
        signer: buildSigner({ status: SignerStatus.RevocationPending, caType: CaType.DIGICERT }),
        revocations: [buildRevocation({ status: SignerRevocationStatus.Failed, caRequestId: 41 })]
      });
      deps.digicertFns.getRevocationRequestStatus.mockResolvedValue(decision);

      await revoke(service).catch(() => undefined);

      const [auditLog] = deps.auditLogService.createAuditLog.mock.calls[0] as [
        { actor: { type: string }; event: { metadata: { decision: string } } }
      ];
      expect(auditLog.actor.type).toBe(ActorType.PLATFORM);
      expect(auditLog.event.metadata.decision).toBe(decision);
    }
  );
});

describe("signerService revoking again when DigiCert no longer knows the request", () => {
  it("clears the stale request and revokes at the CA", async () => {
    const { service, deps, signer, revocation } = buildService({
      ca: digicertCa,
      certificate: digicertCertificate(),
      signer: buildSigner({ status: SignerStatus.RevocationPending, caType: CaType.DIGICERT }),
      revocations: [buildRevocation({ status: SignerRevocationStatus.Failed, caRequestId: 41 })]
    });
    deps.digicertFns.getRevocationRequestStatus.mockRejectedValue(
      new BadRequestError({ message: "Request 41 not found." })
    );

    await revoke(service);

    expect(deps.signerRevocationDAL.updateIfUnsettled).toHaveBeenCalledWith(REVOCATION_ID, { caRequestId: null });
    expect(deps.digicertFns.revokeCertificate).toHaveBeenCalled();
    expect(revocation().status).toBe(SignerRevocationStatus.Completed);
    expect(signer().status).toBe(SignerStatus.Revoked);
  });
});
