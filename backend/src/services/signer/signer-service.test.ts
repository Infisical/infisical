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
import { BadRequestError, InternalServerError } from "@app/lib/errors";
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
    update: vi.fn().mockResolvedValue([signer]),
    findWithPendingRevocation: vi.fn().mockResolvedValue([signer]),
    updateById: vi.fn(async (_id: string, data: Partial<TPkiSigners>) => ({ ...signer, ...data })),
    updateUnlessRevoked: vi.fn(async (_id: string, data: Partial<TPkiSigners>) => ({ ...signer, ...data })),
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
    }),
    completeOwnedCertificateRevocation: vi.fn().mockResolvedValue({ revokedAt: new Date() })
  };
  const signerIssuanceService = {
    requestIssuance: vi.fn().mockResolvedValue({ id: "job-1" }),
    getLatestIssuanceKeyConfig: vi.fn().mockResolvedValue(null),
    hasOpenJobs: vi.fn().mockResolvedValue(false),
    assertNoHeldCertificate: vi.fn(),
    getLatestFailedAutoRenewalAt: vi.fn().mockResolvedValue(null),
    cancelOpenRequestsForReissue: vi.fn().mockResolvedValue(undefined),
    cancelOpenJobsForRevokedSigner: vi
      .fn()
      .mockResolvedValue({ uncancelledDigicertOrderIds: [], cancelledJobCount: 0 }),
    revokeUnattachedCertificate: vi.fn().mockResolvedValue(undefined),
    revokeHeldCertificates: vi.fn().mockResolvedValue(undefined)
  };
  signerIssuanceService.assertNoHeldCertificate.mockImplementation(async () => ({
    openJobs: [],
    hasOpenRequest: (await signerIssuanceService.hasOpenJobs()) as boolean
  }));
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
    digicertFns: { assertCodeSigningOrderReusable: vi.fn(), getRevocationRequestStatus: vi.fn() },
    projectDAL: { findOne: vi.fn().mockResolvedValue({ id: PROJECT_ID, orgId: ORG_ID }) }
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
      certificate: buildCertificate({
        externalMetadata: { type: CaType.DIGICERT, orderId: DIGICERT_ORDER_ID },
        keySource: CertKeySource.Hsm,
        hsmConnectorId: "hsm-1",
        hsmKeyLabel: "key-1",
        keyAlgorithm: CertKeyAlgorithm.RSA_4096
      })
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
  it("refuses a reissue when the open renewal's DigiCert order can't be canceled", async () => {
    const { service, deps, lock } = buildService({
      ca: digicertCa,
      certificate: buildCertificate({
        keySource: CertKeySource.Hsm,
        hsmConnectorId: "hsm-1",
        hsmKeyLabel: "key-1",
        keyAlgorithm: CertKeyAlgorithm.RSA_4096
      })
    });
    deps.signerIssuanceService.hasOpenJobs.mockResolvedValue(true);
    deps.signerIssuanceService.cancelOpenRequestsForReissue.mockRejectedValue(
      new BadRequestError({ message: "DigiCert order #9804 for the open certificate request couldn't be canceled." })
    );

    await expect(
      service.reissueCertificate({ ...actorFields, signerId: SIGNER_ID, caId: CA_ID } as Parameters<
        typeof service.reissueCertificate
      >[0])
    ).rejects.toThrow("DigiCert order #9804 for the open certificate request couldn't be canceled.");

    expect(deps.keyStore.acquireLock).toHaveBeenCalled();
    expect(deps.signerIssuanceService.requestIssuance).not.toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalled();
  });

  it("cancels an open renewal and its DigiCert order, then reissues", async () => {
    const { service, deps } = buildService({
      ca: digicertCa,
      certificate: buildCertificate({
        keySource: CertKeySource.Hsm,
        hsmConnectorId: "hsm-1",
        hsmKeyLabel: "key-1",
        keyAlgorithm: CertKeyAlgorithm.RSA_4096
      })
    });
    deps.signerIssuanceService.hasOpenJobs.mockResolvedValue(true);

    await service.reissueCertificate({ ...actorFields, signerId: SIGNER_ID, caId: CA_ID } as Parameters<
      typeof service.reissueCertificate
    >[0]);

    expect(deps.signerIssuanceService.cancelOpenRequestsForReissue).toHaveBeenCalledWith(SIGNER_ID, {
      caId: CA_ID,
      digicertOrderId: undefined
    });
    const [cancelOrder] = deps.signerIssuanceService.cancelOpenRequestsForReissue.mock.invocationCallOrder;
    const [requestOrder] = deps.signerIssuanceService.requestIssuance.mock.invocationCallOrder;
    expect(cancelOrder).toBeLessThan(requestOrder);
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

  it.each([
    ["waits before placing another order", 1, false],
    ["places a new order once the backoff has passed", 8, true]
  ])("after a failed certificate request, auto-renewal %s", async (_label, daysSinceFailure, isPlaced) => {
    const { service, deps } = buildService({
      ca: digicertCa,
      certificate: buildCertificate({ externalMetadata: { type: CaType.DIGICERT, orderId: DIGICERT_ORDER_ID } })
    });
    deps.signerIssuanceService.getLatestFailedAutoRenewalAt.mockResolvedValue(
      new Date(Date.now() - daysSinceFailure * 24 * 60 * 60 * 1000)
    );

    await service.autoRenewCertificate(SIGNER_ID);

    expect(deps.signerIssuanceService.requestIssuance.mock.calls.length > 0).toBe(isPlaced);
    if (isPlaced) {
      expect(deps.signerIssuanceService.requestIssuance).toHaveBeenCalledWith(
        expect.objectContaining({ isAutoRenewal: true })
      );
    }
  });

  it.each([
    ["waits 1 day when the certificate had 2 days left", 2, 0.5, false],
    ["retries after 1 day when the certificate had 2 days left", 2, 1.1, true],
    ["retries at half the time left when the certificate had 6 days left", 6, 3.1, true]
  ])(
    "bounds the wait after a failed auto-renewal by the certificate's lifetime: %s",
    async (_label, daysLeftAtFailure, daysSinceFailure, isPlaced) => {
      const failedAt = Date.now() - daysSinceFailure * 24 * 60 * 60 * 1000;
      const { service, deps } = buildService({
        ca: digicertCa,
        certificate: buildCertificate({
          externalMetadata: { type: CaType.DIGICERT, orderId: DIGICERT_ORDER_ID },
          notAfter: new Date(failedAt + daysLeftAtFailure * 24 * 60 * 60 * 1000)
        })
      });
      deps.signerIssuanceService.getLatestFailedAutoRenewalAt.mockResolvedValue(new Date(failedAt));

      await service.autoRenewCertificate(SIGNER_ID);

      expect(deps.signerIssuanceService.requestIssuance.mock.calls.length > 0).toBe(isPlaced);
    }
  );

  it.each([
    [
      "the CA is no longer active",
      () => buildService({ ca: { ...internalCa, status: CaStatus.DISABLED } }),
      "Certificate authority 'Internal CA' is not active."
    ],
    [
      "scheduling the DigiCert renewal fails",
      () => {
        const built = buildService({ ca: digicertCa });
        built.deps.signerIssuanceService.requestIssuance.mockRejectedValue(new Error("queue unavailable"));
        return built;
      },
      "queue unavailable"
    ],
    [
      "the internal CA refuses to sign",
      () => {
        vi.mocked(issueSignerCertificate).mockRejectedValue(new Error("internal CA refused to sign"));
        return buildService();
      },
      "internal CA refused to sign"
    ]
  ])("keeps the signer Active and records the reason when %s", async (_label, build, reason) => {
    const { service, deps } = build();

    await service.autoRenewCertificate(SIGNER_ID);

    expect(statusesWritten(deps.signerDAL.updateById)).toEqual([]);
    expect(deps.signerDAL.updateById).toHaveBeenLastCalledWith(SIGNER_ID, { certificateFailureReason: reason });
  });

  it("keeps the signer's status while a DigiCert auto-renewal request is open", async () => {
    const { service, deps } = buildService({
      ca: digicertCa,
      certificate: buildCertificate({ externalMetadata: { type: CaType.DIGICERT, orderId: DIGICERT_ORDER_ID } })
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
      orgId: ORG_ID,
      allowPendingApproval: true
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
    expect(deps.signerDAL.updateById).toHaveBeenCalledTimes(1);
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

  it.each([
    [
      "keeps a Disabled signer Disabled",
      buildSigner({ status: SignerStatus.Disabled }),
      0,
      false,
      SignerStatus.Disabled,
      null
    ],
    [
      "keeps the failure reason it had",
      buildSigner({ certificateFailureReason: "Gateway connection timeout" }),
      0,
      false,
      SignerStatus.Active,
      "Gateway connection timeout"
    ],
    [
      "keeps a Pending signer Pending while its request is still open",
      buildSigner({ status: SignerStatus.Pending }),
      0,
      true,
      SignerStatus.Pending,
      null
    ],
    [
      "marks a Pending signer Failed, with the request's failure reason, when its request failed during the revoke",
      buildSigner({ status: SignerStatus.Pending }),
      0,
      false,
      SignerStatus.Failed,
      "AD CS denied the request"
    ],
    [
      "keeps an Active signer Active and says its renewal was canceled",
      buildSigner(),
      1,
      false,
      SignerStatus.Active,
      "The revoke canceled this signer's pending certificate request, then failed. Revoke the certificate again."
    ],
    [
      "returns a Pending signer whose reissue was canceled to Active",
      buildSigner({ status: SignerStatus.Pending }),
      1,
      false,
      SignerStatus.Active,
      "The revoke canceled this signer's pending certificate request, then failed. Revoke the certificate again."
    ]
  ])(
    "restores the signer when the CA refuses the revoke: %s",
    async (_label, signer, cancelledJobCount, hasOpenJobs, status, certificateFailureReason) => {
      const { service, deps, lock } = buildService({ signer });
      deps.signerIssuanceService.hasOpenJobs.mockResolvedValue(hasOpenJobs);
      if (status === SignerStatus.Failed) {
        deps.signerDAL.findByIdForUpdate
          .mockResolvedValueOnce(signer)
          .mockResolvedValue({ ...signer, certificateFailureReason });
      }
      deps.signerIssuanceService.cancelOpenJobsForRevokedSigner.mockResolvedValueOnce({
        uncancelledDigicertOrderIds: [],
        cancelledJobCount
      });
      deps.certificateService.revokeOwnedCertificate.mockRejectedValue(
        new BadRequestError({ message: "CA refused the revoke" })
      );

      await expect(service.revokeCertificate(revokeDto)).rejects.toThrow("CA refused the revoke");

      expect(deps.signerDAL.updateById).toHaveBeenLastCalledWith(
        SIGNER_ID,
        { status, certificateFailureReason },
        expect.anything()
      );
      expect(deps.signerIssuanceService.cancelOpenJobsForRevokedSigner.mock.calls).toEqual([
        [SIGNER_ID, { digicertReissuesOnly: true }]
      ]);
      expect(lock.release).toHaveBeenCalled();
    }
  );

  it("keeps the signer Revoked when the CA revoke throws after the certificate was revoked", async () => {
    const { service, deps } = buildService();
    const caError = new Error("CRL update failed");
    deps.certificateService.revokeOwnedCertificate.mockRejectedValue(caError);
    deps.certificateDAL.findById
      .mockResolvedValueOnce(buildCertificate())
      .mockResolvedValueOnce(buildCertificate({ status: CertStatus.REVOKED }));

    await expect(service.revokeCertificate(revokeDto)).rejects.toBe(caError);

    expect(deps.signerDAL.updateById).toHaveBeenCalledTimes(1);
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
    expect(deps.signerDAL.updateById).toHaveBeenLastCalledWith(
      SIGNER_ID,
      { status: SignerStatus.Active, certificateFailureReason: null },
      expect.anything()
    );
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

describe("signerService reissue after revoke", () => {
  beforeEach(() => {
    vi.mocked(issueSignerCertificate).mockReset();
  });

  const reissueDto = {
    ...actorFields,
    signerId: SIGNER_ID,
    caId: CA_ID
  } as Parameters<ReturnType<typeof signerServiceFactory>["reissueCertificate"]>[0];

  it("reissues a revoked signer with a new key and a new DigiCert order", async () => {
    const revokedSigner = buildSigner({ status: SignerStatus.Revoked });
    const { service, deps } = buildService({
      signer: revokedSigner,
      ca: digicertCa,
      certificate: buildCertificate({
        status: CertStatus.REVOKED,
        keySource: CertKeySource.Hsm,
        keyAlgorithm: CertKeyAlgorithm.RSA_4096,
        hsmConnectorId: "hsm-1",
        hsmKeyLabel: "old-key",
        externalMetadata: { type: CaType.DIGICERT, orderId: DIGICERT_ORDER_ID }
      })
    });

    await service.reissueCertificate(reissueDto);

    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(
      SIGNER_ID,
      { status: SignerStatus.Pending, certificateFailureReason: null },
      tx
    );
    expect(deps.signerIssuanceService.requestIssuance).toHaveBeenCalledWith(
      expect.objectContaining({
        hsm: expect.objectContaining({
          hsmKeyLabel: undefined,
          hsmPublicKeySpki: undefined
        }) as unknown,
        digicertLifecycle: undefined
      })
    );
  });

  it("issues an internal CA certificate with a new key when the signer was revoked", async () => {
    vi.mocked(issueSignerCertificate).mockResolvedValue({
      certificateId: NEW_CERT_ID
    } as Awaited<ReturnType<typeof issueSignerCertificate>>);
    const revokedSigner = buildSigner({ status: SignerStatus.Revoked });
    const { service, deps } = buildService({
      signer: revokedSigner,
      certificate: buildCertificate({ status: CertStatus.REVOKED })
    });
    deps.signerDAL.findByIdForUpdate
      .mockResolvedValueOnce(revokedSigner)
      .mockResolvedValue(buildSigner({ status: SignerStatus.Pending }));

    await service.reissueCertificate(reissueDto);

    expect(issueSignerCertificate).toHaveBeenCalled();
    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      {
        certificateId: NEW_CERT_ID,
        status: SignerStatus.Active,
        certificateFailureReason: null
      },
      tx
    );
  });

  it("refuses to reissue while the revoke is still in progress", async () => {
    const { service, deps } = buildService({
      signer: buildSigner({ status: SignerStatus.Revoked })
    });

    await expect(service.reissueCertificate(reissueDto)).rejects.toThrow("Revoke the certificate again to finish");
    expect(deps.signerIssuanceService.requestIssuance).not.toHaveBeenCalled();
    expect(issueSignerCertificate).not.toHaveBeenCalled();
  });

  it("refuses to reissue while a DigiCert revocation waits for approval", async () => {
    const { service } = buildService({
      signer: buildSigner({
        status: SignerStatus.Revoked,
        pendingRevocation: {
          caType: CaType.DIGICERT,
          requestId: 41,
          certificateId: OLD_CERT_ID,
          revocationReason: CrlReason.KEY_COMPROMISE,
          previousStatus: SignerStatus.Active,
          hasCancelledRequest: false,
          requestedAt: new Date().toISOString()
        }
      })
    });

    await expect(service.reissueCertificate(reissueDto)).rejects.toThrow("waiting for approval");
  });

  it("refuses to renew a revoked certificate, since that would keep the revoked key", async () => {
    const { service, deps } = buildService({
      certificate: buildCertificate({ status: CertStatus.REVOKED })
    });

    await expect(service.renewCertificate({ ...actorFields, signerId: SIGNER_ID })).rejects.toThrow(
      "Reissue it with a new key from Edit Settings"
    );
    expect(issueSignerCertificate).not.toHaveBeenCalled();
    expect(deps.signerIssuanceService.requestIssuance).not.toHaveBeenCalled();
  });
});

describe("signerService pending DigiCert revocation", () => {
  const revokeDto = {
    ...actorFields,
    signerId: SIGNER_ID,
    revocationReason: CrlReason.KEY_COMPROMISE
  };
  const pendingRevocation = {
    caType: CaType.DIGICERT,
    requestId: 41,
    certificateId: OLD_CERT_ID,
    revocationReason: CrlReason.KEY_COMPROMISE,
    previousStatus: SignerStatus.Active,
    hasCancelledRequest: false,
    requestedAt: new Date().toISOString()
  };

  it("keeps the signer Revoked with the request recorded, and leaves its other requests until approval", async () => {
    const { service, deps } = buildService({ ca: digicertCa });
    deps.certificateService.revokeOwnedCertificate.mockResolvedValue({
      cert: buildCertificate(),
      pendingRequestId: 41
    });

    const result = await service.revokeCertificate(revokeDto);

    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(SIGNER_ID, {
      pendingRevocation: expect.objectContaining({
        requestId: 41,
        previousStatus: SignerStatus.Active
      }) as unknown
    });
    expect(deps.signerIssuanceService.cancelOpenJobsForRevokedSigner.mock.calls).toEqual([
      [SIGNER_ID, { digicertReissuesOnly: true }]
    ]);
    expect(result).toMatchObject({
      signer: { status: SignerStatus.Revoked },
      pendingRevocationRequestId: 41
    });
  });

  it("refuses a second revoke while the first waits for approval", async () => {
    const { service, deps } = buildService({
      signer: buildSigner({ status: SignerStatus.Revoked, pendingRevocation })
    });

    await expect(service.revokeCertificate(revokeDto)).rejects.toThrow("request #41");
    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
  });

  it("marks the certificate revoked and closes the signer's requests once DigiCert approves", async () => {
    const { service, deps } = buildService({
      signer: buildSigner({ status: SignerStatus.Revoked, pendingRevocation })
    });
    deps.digicertFns.getRevocationRequestStatus.mockResolvedValue("approved");

    await service.syncPendingRevocations();

    expect(deps.certificateService.completeOwnedCertificateRevocation).toHaveBeenCalledWith({
      certificateId: OLD_CERT_ID,
      revocationReason: CrlReason.KEY_COMPROMISE,
      orgId: ORG_ID
    });
    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(SIGNER_ID, { pendingRevocation: null }, tx);
    expect(deps.signerIssuanceService.cancelOpenJobsForRevokedSigner).toHaveBeenCalledWith(SIGNER_ID);
  });

  it("restores the signer's earlier status with the reason once DigiCert rejects", async () => {
    const { service, deps } = buildService({
      signer: buildSigner({ status: SignerStatus.Revoked, pendingRevocation })
    });
    deps.digicertFns.getRevocationRequestStatus.mockResolvedValue("rejected");

    await service.syncPendingRevocations();

    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(
      SIGNER_ID,
      {
        status: SignerStatus.Active,
        certificateFailureReason: "DigiCert rejected revocation request #41, so the certificate wasn't revoked.",
        pendingRevocation: null
      },
      tx
    );
    expect(deps.certificateService.completeOwnedCertificateRevocation).not.toHaveBeenCalled();
    expect(deps.signerIssuanceService.cancelOpenJobsForRevokedSigner).not.toHaveBeenCalled();
  });

  it("does nothing while the request is still pending", async () => {
    const { service, deps } = buildService({
      signer: buildSigner({ status: SignerStatus.Revoked, pendingRevocation })
    });
    deps.digicertFns.getRevocationRequestStatus.mockResolvedValue("pending");

    await service.syncPendingRevocations();

    expect(deps.signerDAL.updateById).not.toHaveBeenCalled();
    expect(deps.signerDAL.update).not.toHaveBeenCalled();
    expect(deps.certificateService.completeOwnedCertificateRevocation).not.toHaveBeenCalled();
  });
});

describe("signerService reissue checks before replacing an open request", () => {
  it("keeps the open renewal when the reissue is invalid", async () => {
    const { service, deps } = buildService({ ca: { ...digicertCa, status: CaStatus.DISABLED } });
    deps.signerIssuanceService.hasOpenJobs.mockResolvedValue(true);

    await expect(
      service.reissueCertificate({ ...actorFields, signerId: SIGNER_ID, caId: CA_ID } as Parameters<
        typeof service.reissueCertificate
      >[0])
    ).rejects.toThrow("not active");
    expect(deps.signerIssuanceService.cancelOpenRequestsForReissue).not.toHaveBeenCalled();
  });

  it("finishes a revoke that stopped before the CA revoked the certificate", async () => {
    const { service, deps } = buildService({ signer: buildSigner({ status: SignerStatus.Revoked }) });

    await expect(
      service.revokeCertificate({ ...actorFields, signerId: SIGNER_ID, revocationReason: CrlReason.KEY_COMPROMISE })
    ).resolves.toMatchObject({ signer: { status: SignerStatus.Revoked } });
    expect(deps.certificateService.revokeOwnedCertificate).toHaveBeenCalled();
  });
});

describe("signerService pending DigiCert revocation that can't be checked", () => {
  const pendingRevocation = {
    caType: CaType.DIGICERT,
    requestId: 41,
    certificateId: OLD_CERT_ID,
    revocationReason: CrlReason.KEY_COMPROMISE,
    previousStatus: SignerStatus.Active,
    hasCancelledRequest: false,
    requestedAt: new Date().toISOString()
  };

  it.each([
    ["the CA is disabled", { ...digicertCa, status: CaStatus.DISABLED }, "pending", "is disabled"],
    ["DigiCert reports an unknown status", digicertCa, "canceled", "DigiCert reports it as 'canceled'"]
  ])(
    "stops tracking it, keeps the signer from signing, and says to revoke again when %s",
    async (_label, ca, status, cause) => {
      const { service, deps } = buildService({
        ca,
        signer: buildSigner({ status: SignerStatus.Revoked, pendingRevocation })
      });
      deps.digicertFns.getRevocationRequestStatus.mockResolvedValue(status);

      await service.syncPendingRevocations();

      expect(deps.signerDAL.updateById).toHaveBeenCalledWith(
        SIGNER_ID,
        {
          pendingRevocation: null,
          certificateFailureReason: expect.stringContaining(cause) as string
        },
        tx
      );
      expect(statusesWritten(deps.signerDAL.updateById)).toEqual([]);
      expect(deps.certificateService.completeOwnedCertificateRevocation).not.toHaveBeenCalled();
    }
  );
});

describe("signerService revoke outcomes and DigiCert key checks", () => {
  const revokeDto = { ...actorFields, signerId: SIGNER_ID, revocationReason: CrlReason.KEY_COMPROMISE };

  it("keeps the signer Revoked when the CA doesn't answer the revoke, since it may have gone through", async () => {
    const { service, deps } = buildService();
    deps.certificateService.revokeOwnedCertificate.mockRejectedValue(
      new InternalServerError({ message: "DigiCert revoke failed (no response)" })
    );

    await expect(service.revokeCertificate(revokeDto)).rejects.toThrow("no response");

    expect(statusesWritten(deps.signerDAL.updateById)).toEqual([SignerStatus.Revoked]);
    expect(deps.signerDAL.updateById).toHaveBeenLastCalledWith(SIGNER_ID, {
      certificateFailureReason: expect.stringContaining("Revoke the certificate again") as string
    });
  });

  it("keeps the signer Revoked when the CA revoke fails with an error that doesn't say it was refused", async () => {
    const { service, deps } = buildService();
    deps.certificateService.revokeOwnedCertificate.mockRejectedValue(new Error("socket hang up"));

    await expect(service.revokeCertificate(revokeDto)).rejects.toThrow("socket hang up");

    expect(statusesWritten(deps.signerDAL.updateById)).toEqual([SignerStatus.Revoked]);
    expect(deps.signerDAL.updateById).toHaveBeenLastCalledWith(SIGNER_ID, {
      certificateFailureReason: expect.stringContaining("Revoke the certificate again") as string
    });
  });

  it("refuses a DigiCert reissue with a software key before canceling the open renewal", async () => {
    const { service, deps } = buildService({ ca: digicertCa });
    deps.signerIssuanceService.hasOpenJobs.mockResolvedValue(true);

    await expect(
      service.reissueCertificate({
        ...actorFields,
        signerId: SIGNER_ID,
        caId: CA_ID,
        certificate: { keySource: CertKeySource.Infisical }
      } as Parameters<typeof service.reissueCertificate>[0])
    ).rejects.toThrow("requires an HSM-backed key");
    expect(deps.signerIssuanceService.cancelOpenRequestsForReissue).not.toHaveBeenCalled();
  });
});
