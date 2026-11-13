import { Knex } from "knex";
import { describe, expect, it, vi } from "vitest";

import { TPkiSignerCertificateIssuanceJobs, TPkiSigners } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

import { CaStatus, CaType } from "../certificate-authority/certificate-authority-enums";
import { DIGICERT_REVOCATION_REQUEST_TIMEOUT_MS } from "../certificate-authority/digicert/digicert-api-client";
import { DigiCertLifecycleMode } from "../certificate-authority/digicert/digicert-certificate-authority-enums";
import { CertKeyAlgorithm, CertStatus, CrlReason } from "../certificate/certificate-types";
import { CertKeySource, SignerIssuanceJobStatus, SignerStatus } from "./signer-enums";
import { signerIssuanceServiceFactory } from "./signer-issuance-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock("../project/project-fns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../project/project-fns")>();
  return { ...actual, getProjectKmsCertificateKeyId: vi.fn().mockResolvedValue("kms-1") };
});

vi.mock("./signer-issuance-fns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./signer-issuance-fns")>();
  return { ...actual, verifyCodeSigningEku: vi.fn().mockResolvedValue(undefined) };
});

const SIGNER_ID = "signer-1";
const PROJECT_ID = "project-1";
const ORG_ID = "org-1";
const CA_ID = "ca-1";
const OLD_CERT_ID = "cert-old";
const NEW_CERT_ID = "cert-new";
const JOB_ID = "job-1";

const tx = { isTransaction: true } as unknown as Knex;

const buildJob = (overrides: Partial<TPkiSignerCertificateIssuanceJobs> = {}) =>
  ({
    id: JOB_ID,
    signerId: SIGNER_ID,
    caId: CA_ID,
    caType: CaType.AWS_PCA,
    status: SignerIssuanceJobStatus.Pending,
    commonName: "Example Release Signing",
    certificateTtlDays: 365,
    keyAlgorithm: CertKeyAlgorithm.RSA_2048,
    keySource: CertKeySource.Infisical,
    encryptedCsr: Buffer.from("csr"),
    encryptedPrivateKey: null,
    externalOrderRef: null,
    attempts: 0,
    maxAttempts: 100,
    lastAttemptAt: null,
    createdAt: new Date(),
    ...overrides
  }) as TPkiSignerCertificateIssuanceJobs;

const buildService = ({
  signerStatus,
  job = buildJob()
}: {
  signerStatus: SignerStatus;
  job?: TPkiSignerCertificateIssuanceJobs;
}) => {
  const signer = {
    id: SIGNER_ID,
    projectId: PROJECT_ID,
    certificateId: OLD_CERT_ID,
    status: signerStatus
  } as TPkiSigners;
  const signerIssuanceJobDAL = {
    findById: vi.fn().mockResolvedValue(job),
    claimForAttempt: vi.fn().mockResolvedValue({ ...job, attempts: job.attempts + 1 }),
    completeIfPending: vi.fn().mockResolvedValue({ ...job, status: SignerIssuanceJobStatus.Completed }),
    update: vi.fn().mockResolvedValue([{ id: job.id }]),
    updateById: vi.fn().mockResolvedValue(job),
    findPendingForSignerForUpdate: vi.fn().mockResolvedValue([job]),
    cancelOpenForSigner: vi.fn().mockResolvedValue(undefined),
    find: vi.fn().mockResolvedValue([job]),
    cancelPendingByIds: vi.fn().mockResolvedValue(undefined),
    findLatestForSigner: vi.fn().mockResolvedValue(job),
    transaction: vi.fn(async (cb: (trx: Knex) => unknown) => cb(tx))
  };
  const signerDAL = {
    findById: vi.fn().mockResolvedValue(signer),
    findByIdForUpdate: vi.fn().mockResolvedValue(signer),
    findOne: vi.fn().mockResolvedValue(undefined),
    updateUnlessRevoked: vi.fn(async (_id: string, data: Partial<TPkiSigners>) => ({ ...signer, ...data })),
    transaction: vi.fn(async (cb: (trx: Knex) => unknown) => cb(tx))
  };
  const certificateDAL = {
    findById: vi.fn(async (id: string) =>
      id === OLD_CERT_ID
        ? {
            id: OLD_CERT_ID,
            status: signerStatus === SignerStatus.Revoked ? CertStatus.REVOKED : CertStatus.ACTIVE,
            externalMetadata: null
          }
        : { id, status: CertStatus.ACTIVE, commonName: "Example Release Signing" }
    ),
    findByIdForUpdate: vi.fn().mockResolvedValue(undefined),
    updateById: vi.fn()
  };
  const certificateService = { revokeOwnedCertificate: vi.fn().mockResolvedValue({ cert: {} }) };
  const awsPcaFns = { orderCertificate: vi.fn().mockResolvedValue({ certificateId: NEW_CERT_ID }) };
  const digicertFns = {
    cancelReissue: vi.fn().mockResolvedValue(true),
    getCodeSigningOrderStatus: vi
      .fn()
      .mockResolvedValue({ status: "pending", rawStatus: "pending", certificateId: null }),
    findCodeSigningOrderByReference: vi.fn().mockResolvedValue(null),
    orderCodeSigningCertificate: vi.fn().mockResolvedValue({ orderId: 9999, certificateId: null }),
    reissueCodeSigningCertificate: vi.fn().mockResolvedValue({ orderId: 9999, certificateId: null })
  };
  const deps = {
    signerIssuanceJobDAL,
    signerDAL,
    certificateDAL,
    certificateService,
    certificateAuthorityDAL: {
      findByIdWithAssociatedCa: vi.fn().mockResolvedValue({ id: CA_ID, projectId: PROJECT_ID, status: CaStatus.ACTIVE })
    },
    projectDAL: { findOne: vi.fn().mockResolvedValue({ id: PROJECT_ID, orgId: ORG_ID }) },
    kmsService: {
      decryptWithKmsKey: vi
        .fn()
        .mockResolvedValue(async ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob)
    },
    certificateSecretDAL: {},
    certificateBodyDAL: {},
    hsmConnectorService: {},
    cronJob: {},
    certificateIssuanceQueue: { awsPcaFns, azureAdCsFns: {}, adcsFns: {}, digicertFns }
  };
  const service = signerIssuanceServiceFactory(deps as unknown as Parameters<typeof signerIssuanceServiceFactory>[0]);
  return { service, deps };
};

const statusesWritten = (updateById: ReturnType<typeof vi.fn>) =>
  updateById.mock.calls.map(([, data]) => (data as Partial<TPkiSigners>).status).filter(Boolean);

describe("signerIssuanceService attaching an issued certificate", () => {
  it("leaves the job open without revoking the new certificate while the signer's revoke is still in progress", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked });
    deps.certificateDAL.findById.mockImplementation(async (id: string) => ({
      id,
      status: CertStatus.ACTIVE,
      commonName: "Example Release Signing"
    }));

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.update).not.toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      expect.objectContaining({ status: SignerIssuanceJobStatus.Failed }),
      tx
    );
    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
    expect(deps.signerDAL.updateUnlessRevoked).not.toHaveBeenCalled();
    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      { certificateId: NEW_CERT_ID, attempts: 0 }
    );
  });

  it.each([
    ["", new Date()],
    [", even after the job's window has passed", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)]
  ])(
    "attaches a certificate kept on its job once a failed revoke restored the signer, without issuing again%s",
    async (_label, createdAt) => {
      const { service, deps } = buildService({
        signerStatus: SignerStatus.Active,
        job: buildJob({ certificateId: NEW_CERT_ID, createdAt })
      });

      await service.processJob(JOB_ID);

      expect(deps.certificateIssuanceQueue.awsPcaFns.orderCertificate).not.toHaveBeenCalled();
      expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
        SIGNER_ID,
        expect.objectContaining({ certificateId: NEW_CERT_ID, status: SignerStatus.Active }),
        tx
      );
    }
  );

  it.each([
    ["keeps the job open with the certificate to retry it", new Error("CA unavailable"), false],
    [
      "closes the job when the CA refuses it",
      new BadRequestError({ message: "Certificate revocation is not supported by this certificate authority type" }),
      true
    ]
  ])("when revoking a revoked signer's new certificate fails, %s", async (_label, error, isJobClosed) => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked });
    deps.certificateService.revokeOwnedCertificate.mockRejectedValue(error);

    await service.processJob(JOB_ID);

    const keptCertificate: unknown[] = [
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      { status: SignerIssuanceJobStatus.Pending, certificateId: NEW_CERT_ID }
    ];
    const closedJob: unknown[] = [
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      expect.objectContaining({
        status: SignerIssuanceJobStatus.Failed,
        failureReason: expect.stringContaining("revoking the new certificate failed") as string
      }),
      tx
    ];
    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(...(isJobClosed ? closedJob : keptCertificate));
    expect(deps.signerIssuanceJobDAL.update).not.toHaveBeenCalledWith(...(isJobClosed ? keptCertificate : closedJob));
  });

  it("keeps the certificate on the job a finished revoke closed when the CA revoke fails", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Revoked,
      job: buildJob({ isCancelledByRevoke: true })
    });
    deps.certificateService.revokeOwnedCertificate.mockRejectedValue(new Error("CA unavailable"));
    deps.signerIssuanceJobDAL.update.mockImplementation(async (filter: { status: SignerIssuanceJobStatus }) =>
      filter.status === SignerIssuanceJobStatus.Pending ? [] : [{ id: JOB_ID }]
    );

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Failed, isCancelledByRevoke: true },
      { status: SignerIssuanceJobStatus.Pending, certificateId: NEW_CERT_ID }
    );
  });

  it("treats a certificate that is already revoked as revoked", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked });
    deps.certificateService.revokeOwnedCertificate.mockRejectedValue(
      new BadRequestError({ message: "already revoked" })
    );
    deps.certificateDAL.findById.mockImplementation(async (id: string) => ({
      id,
      status: CertStatus.REVOKED,
      commonName: "Example Release Signing"
    }));

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      expect.objectContaining({
        failureReason: expect.stringContaining("so the new certificate was revoked too") as string
      }),
      tx
    );
  });

  it("holds a certificate without spending an attempt while the signer's revocation waits for approval", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Revoked,
      job: buildJob({ certificateId: NEW_CERT_ID, attempts: 99 })
    });
    deps.certificateDAL.findById.mockImplementation(async (id: string) => ({
      id,
      status: CertStatus.ACTIVE,
      commonName: "Example Release Signing"
    }));

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      { certificateId: NEW_CERT_ID, attempts: 99 }
    );
    expect(deps.signerIssuanceJobDAL.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: SignerIssuanceJobStatus.Failed }),
      tx
    );
  });

  it("refuses a renewal that reuses the key of a certificate revoked outside the signer", async () => {
    const revokedKey = Buffer.from("revoked-key");
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Active,
      job: buildJob({ keySource: CertKeySource.Hsm, hsmPublicKeySpki: revokedKey })
    });
    deps.certificateDAL.findById.mockImplementation(async (id: string) =>
      id === OLD_CERT_ID
        ? { id, status: CertStatus.REVOKED, hsmPublicKeySpki: revokedKey, externalMetadata: null }
        : { id, status: CertStatus.ACTIVE, commonName: "Example Release Signing" }
    );

    await service.processJob(JOB_ID);

    expect(deps.signerDAL.updateUnlessRevoked).not.toHaveBeenCalledWith(
      SIGNER_ID,
      expect.objectContaining({ certificateId: NEW_CERT_ID }),
      tx
    );
    expect(deps.certificateService.revokeOwnedCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: NEW_CERT_ID })
    );
  });

  it("closes a job holding a certificate after its last attempt", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Active,
      job: buildJob({ certificateId: NEW_CERT_ID, attempts: 100 })
    });

    await service.processJob(JOB_ID);

    expect(deps.signerDAL.updateUnlessRevoked).not.toHaveBeenCalledWith(
      SIGNER_ID,
      expect.objectContaining({ certificateId: NEW_CERT_ID }),
      tx
    );
    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      expect.objectContaining({ failureReason: expect.stringContaining("couldn't be attached or revoked") as string }),
      tx
    );
  });

  it("does not make a revoked signer Active again, fails the job and revokes the unattached certificate", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked });

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.awsPcaFns.orderCertificate).toHaveBeenCalled();
    expect(deps.signerIssuanceJobDAL.completeIfPending).toHaveBeenCalledWith(JOB_ID, NEW_CERT_ID, tx);
    expect(statusesWritten(deps.signerDAL.updateUnlessRevoked)).not.toContain(SignerStatus.Active);
    expect(deps.signerDAL.updateUnlessRevoked).not.toHaveBeenCalledWith(
      SIGNER_ID,
      expect.objectContaining({ certificateId: NEW_CERT_ID }),
      expect.anything()
    );
    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      {
        status: SignerIssuanceJobStatus.Failed,
        failureReason: expect.stringContaining("revoked before its new certificate was issued") as string
      },
      tx
    );
    expect(deps.certificateService.revokeOwnedCertificate).toHaveBeenCalledWith({
      certificateId: NEW_CERT_ID,
      revocationReason: CrlReason.CESSATION_OF_OPERATION,
      orgId: ORG_ID
    });
  });

  it.each([
    ["after a revoke already cancelled its job", SignerStatus.Revoked, false],
    ["after its signer was deleted", SignerStatus.Active, true]
  ])("revokes a certificate that comes back %s", async (_label, signerStatus, isSignerDeleted) => {
    const { service, deps } = buildService({ signerStatus });
    deps.signerIssuanceJobDAL.completeIfPending.mockResolvedValue(null);
    if (isSignerDeleted) {
      const signer = (await deps.signerDAL.findById(SIGNER_ID)) as TPkiSigners;
      deps.signerDAL.findById.mockImplementation(async (_id: string, trx?: Knex) => (trx ? undefined : signer));
    }

    await service.processJob(JOB_ID);

    expect(deps.signerDAL.updateUnlessRevoked).not.toHaveBeenCalled();
    expect(deps.certificateService.revokeOwnedCertificate).toHaveBeenCalledWith({
      certificateId: NEW_CERT_ID,
      revocationReason: CrlReason.CESSATION_OF_OPERATION,
      orgId: ORG_ID
    });
  });

  it("leaves the certificate alone when it was imported into another signer after its signer was deleted", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Active });
    deps.signerIssuanceJobDAL.completeIfPending.mockResolvedValue(null);
    const signer = (await deps.signerDAL.findById(SIGNER_ID)) as TPkiSigners;
    deps.signerDAL.findById.mockImplementation(async (_id: string, trx?: Knex) => (trx ? undefined : signer));
    deps.signerDAL.findOne.mockResolvedValue({ id: "replacement-signer", certificateId: NEW_CERT_ID } as TPkiSigners);

    await service.processJob(JOB_ID);

    expect(deps.certificateDAL.findByIdForUpdate).toHaveBeenCalledWith(NEW_CERT_ID, tx);
    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
  });

  it("leaves the certificate alone when another request superseded the job on a signer that is still in use", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Active });
    deps.signerIssuanceJobDAL.completeIfPending.mockResolvedValue(null);

    await service.processJob(JOB_ID);

    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
  });

  it.each([
    ["makes a renewing signer Active", SignerStatus.Active],
    ["keeps a signer that was disabled during its renewal Disabled", SignerStatus.Disabled]
  ])("attaches the certificate and %s", async (_label, signerStatus) => {
    const { service, deps } = buildService({ signerStatus });

    await service.processJob(JOB_ID);

    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      expect.objectContaining({ certificateId: NEW_CERT_ID, status: signerStatus, certificateFailureReason: null }),
      tx
    );
    expect(deps.signerIssuanceJobDAL.update).not.toHaveBeenCalled();
    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
  });
});

describe("signerIssuanceService failing a job", () => {
  it.each([
    ["keeps an Active signer Active", SignerStatus.Active, {}],
    ["keeps a Disabled signer Disabled", SignerStatus.Disabled, {}],
    [
      "marks a signer still waiting for its first certificate Failed",
      SignerStatus.Pending,
      { status: SignerStatus.Failed }
    ]
  ])("closes a job that ran past its window and %s", async (_label, signerStatus, statusWrite) => {
    const { service, deps } = buildService({
      signerStatus,
      job: buildJob({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
    });

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      expect.objectContaining({ status: SignerIssuanceJobStatus.Failed }),
      tx
    );
    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      { ...statusWrite, certificateFailureReason: expect.stringContaining("pending for more than 24 hours") as string },
      tx
    );
  });

  it("keeps an Active signer Active when a renewal attempt fails and will be retried", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Active });
    deps.certificateIssuanceQueue.awsPcaFns.orderCertificate.mockRejectedValue(new Error("AWS PCA is unavailable"));

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      expect.objectContaining({ nextPollAt: expect.any(Date) as Date }),
      tx
    );
    expect(statusesWritten(deps.signerDAL.updateUnlessRevoked)).toEqual([]);
    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      { certificateFailureReason: expect.stringContaining("AWS PCA is unavailable") as string },
      tx
    );
  });

  it("revokes a certificate kept on a job before closing it, and keeps the job if that revoke fails", async () => {
    const held = buildService({ signerStatus: SignerStatus.Revoked, job: buildJob({ certificateId: NEW_CERT_ID }) });
    await held.service.cancelOpenJobsForRevokedSigner(SIGNER_ID);
    expect(held.deps.certificateService.revokeOwnedCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: NEW_CERT_ID })
    );
    expect(held.deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      expect.objectContaining({ status: SignerIssuanceJobStatus.Failed })
    );

    const failing = buildService({ signerStatus: SignerStatus.Revoked, job: buildJob({ certificateId: NEW_CERT_ID }) });
    failing.deps.certificateService.revokeOwnedCertificate.mockRejectedValue(new Error("CA unavailable"));
    await failing.service.cancelOpenJobsForRevokedSigner(SIGNER_ID);
    expect(failing.deps.signerIssuanceJobDAL.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: SignerIssuanceJobStatus.Failed })
    );
    expect(failing.deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { $in: { id: [JOB_ID] }, status: SignerIssuanceJobStatus.Pending },
      { isCancelledByRevoke: true }
    );
  });

  it("keeps a DigiCert job whose placement outcome is unknown open on revoke, so the poller recovers the order", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Revoked,
      job: buildJob({
        caType: CaType.DIGICERT,
        lastAttemptAt: new Date(),
        externalOrderRef: { digicert: { lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: 9804 } } }
      })
    });

    await service.cancelOpenJobsForRevokedSigner(SIGNER_ID);

    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith([], expect.any(String), {
      isCancelledByRevoke: true
    });
  });

  it("doesn't write the signer when a job a revoke canceled fails later", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Active,
      job: buildJob({ caType: CaType.DIGICERT, externalOrderRef: { digicert: { orderId: 9900 } } })
    });
    deps.signerIssuanceJobDAL.update.mockResolvedValue([{ id: JOB_ID, isCancelledByRevoke: true }]);
    deps.certificateIssuanceQueue.digicertFns.getCodeSigningOrderStatus.mockResolvedValue({
      status: "rejected",
      rawStatus: "rejected",
      certificateId: null
    });

    await service.processJob(JOB_ID);

    expect(deps.signerDAL.updateUnlessRevoked).not.toHaveBeenCalled();
  });

  it.each([
    ["counts a failed auto-renewal", { isAutoRenewal: true }, true],
    ["ignores a failed manual request", { isAutoRenewal: false }, false],
    ["ignores an auto-renewal a revoke canceled", { isAutoRenewal: true, isCancelledByRevoke: true }, false],
    ["ignores an auto-renewal from a CA the signer no longer uses", { isAutoRenewal: true, caId: "other-ca" }, false]
  ])("auto-renewal backoff %s", async (_label, overrides, isCounted) => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Active });
    deps.signerIssuanceJobDAL.findLatestForSigner.mockResolvedValue(
      buildJob({ status: SignerIssuanceJobStatus.Failed, updatedAt: new Date(), ...overrides })
    );

    expect(Boolean(await service.getLatestFailedAutoRenewalAt(SIGNER_ID, CA_ID))).toBe(isCounted);
  });

  it("revokes the certificates held on a signer's open jobs, for a signer being deleted", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Revoked,
      job: buildJob({ certificateId: NEW_CERT_ID })
    });

    await service.revokeHeldCertificates(SIGNER_ID, PROJECT_ID);

    expect(deps.certificateService.revokeOwnedCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: NEW_CERT_ID })
    );
  });

  it("cancels an open renewal's DigiCert order before a reissue replaces it", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Active,
      job: buildJob({
        caType: CaType.DIGICERT,
        externalOrderRef: {
          digicert: { orderId: 9900, lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: 9804 } }
        }
      })
    });

    await service.cancelOpenRequestsForReissue(SIGNER_ID, { caId: CA_ID, digicertOrderId: 9804 });

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 9900 })
    );
    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith(
      [JOB_ID],
      "Replaced by a newer certificate request."
    );
  });

  it("refuses the reissue and keeps the request open when DigiCert won't cancel its order", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Active,
      job: buildJob({
        caType: CaType.DIGICERT,
        externalOrderRef: { digicert: { orderId: 9900 } }
      })
    });
    deps.certificateIssuanceQueue.digicertFns.cancelReissue.mockResolvedValue(false);

    await expect(service.cancelOpenRequestsForReissue(SIGNER_ID, { caId: CA_ID })).rejects.toThrow(
      "DigiCert order #9900 for the open certificate request couldn't be canceled"
    );
    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).not.toHaveBeenCalled();
  });

  it("doesn't cancel an open reissue on the order the new reissue targets", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Active,
      job: buildJob({
        caType: CaType.DIGICERT,
        lastAttemptAt: new Date(Date.now() - 60 * 60 * 1000),
        externalOrderRef: { digicert: { lifecycle: { mode: DigiCertLifecycleMode.Reissue, previousOrderId: 9804 } } }
      })
    });

    await service.cancelOpenRequestsForReissue(SIGNER_ID, { caId: CA_ID, digicertOrderId: 9804 });

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).not.toHaveBeenCalled();
    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith(
      [JOB_ID],
      "Replaced by a newer certificate request."
    );
  });

  it("asks the user to retry while the open request is still placing its DigiCert order", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Active,
      job: buildJob({ caType: CaType.DIGICERT, lastAttemptAt: new Date(), externalOrderRef: null })
    });

    await expect(service.cancelOpenRequestsForReissue(SIGNER_ID, { caId: CA_ID })).rejects.toThrow(
      "placing its DigiCert order right now"
    );
    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).not.toHaveBeenCalled();
  });

  it("leaves an order alone when its job was closed during placement but a newer open request owns that order", async () => {
    const job = buildJob({
      caType: CaType.DIGICERT,
      externalOrderRef: { digicert: { lifecycle: { mode: DigiCertLifecycleMode.Reissue, previousOrderId: 9999 } } }
    });
    const { service, deps } = buildService({ signerStatus: SignerStatus.Pending, job });
    deps.signerIssuanceJobDAL.update.mockResolvedValue([]);
    deps.signerIssuanceJobDAL.find.mockResolvedValue([
      buildJob({
        id: "job-newer",
        caType: CaType.DIGICERT,
        externalOrderRef: { digicert: { lifecycle: { mode: DigiCertLifecycleMode.Reissue, previousOrderId: 9999 } } }
      })
    ]);

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.reissueCodeSigningCertificate).toHaveBeenCalled();
    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).not.toHaveBeenCalled();
  });

  it("records an order it couldn't cancel on the job a newer request closed, without reopening it", async () => {
    const job = buildJob({
      caType: CaType.DIGICERT,
      externalOrderRef: { digicert: { lifecycle: { mode: DigiCertLifecycleMode.Reissue, previousOrderId: 9999 } } }
    });
    const { service, deps } = buildService({ signerStatus: SignerStatus.Pending, job });
    deps.signerIssuanceJobDAL.update.mockResolvedValue([]);
    deps.signerIssuanceJobDAL.find.mockResolvedValue([]);
    deps.certificateIssuanceQueue.digicertFns.cancelReissue.mockResolvedValue(false);

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).toHaveBeenCalled();
    expect(deps.signerIssuanceJobDAL.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: SignerIssuanceJobStatus.Pending })
    );
    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Failed },
      expect.objectContaining({
        externalOrderRef: expect.objectContaining({
          digicert: expect.objectContaining({ orderId: 9999 }) as unknown
        }) as unknown,
        failureReason: expect.stringContaining("Cancel it in CertCentral") as unknown
      })
    );
  });

  it("refuses a new certificate request while a job holds a certificate issued during a revoke", async () => {
    const { service } = buildService({
      signerStatus: SignerStatus.Active,
      job: buildJob({ certificateId: NEW_CERT_ID })
    });

    await expect(service.assertNoHeldCertificate(SIGNER_ID, tx)).rejects.toThrow("still being processed");
  });

  it("cancels open jobs for a revoked signer with a readable reason", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked });

    await service.cancelOpenJobsForRevokedSigner(SIGNER_ID);

    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith(
      [JOB_ID],
      "Cancelled because the signer was revoked.",
      { isCancelledByRevoke: true }
    );
    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).not.toHaveBeenCalled();
  });

  it.each([
    ["reissue on the current order", 9550, DigiCertLifecycleMode.Reissue, 9550],
    ["renewal order", 9960, DigiCertLifecycleMode.Renew, 9804]
  ])("cancels a DigiCert %s at DigiCert before closing its job", async (_label, orderId, mode, previousOrderId) => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Revoked,
      job: buildJob({
        caType: CaType.DIGICERT,
        externalOrderRef: { digicert: { orderId, lifecycle: { mode, previousOrderId } } }
      })
    });

    await service.cancelOpenJobsForRevokedSigner(SIGNER_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).toHaveBeenCalledWith({
      caId: CA_ID,
      orderId,
      requestTimeoutMs: DIGICERT_REVOCATION_REQUEST_TIMEOUT_MS
    });
    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith([JOB_ID], expect.any(String), {
      isCancelledByRevoke: true
    });
  });

  it("leaves renewal orders for later when only DigiCert reissues are cancelled before the revoke", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Revoked,
      job: buildJob({
        caType: CaType.DIGICERT,
        externalOrderRef: {
          digicert: { orderId: 9960, lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: 9804 } }
        }
      })
    });

    await service.cancelOpenJobsForRevokedSigner(SIGNER_ID, { digicertReissuesOnly: true });

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).not.toHaveBeenCalled();
    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith([], expect.any(String), {
      isCancelledByRevoke: true
    });
  });

  it.each([
    ["revoked", SignerStatus.Revoked],
    ["deleted", null]
  ])("cancels the DigiCert order of a %s signer when it polls the job", async (_label, signerStatus) => {
    const job = buildJob({
      caType: CaType.DIGICERT,
      externalOrderRef: {
        digicert: { orderId: 9960, lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: 9804 } }
      }
    });
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked, job });
    if (signerStatus === null) deps.signerDAL.findById.mockResolvedValue(undefined);

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).toHaveBeenCalledWith({
      caId: CA_ID,
      orderId: 9960,
      requestTimeoutMs: DIGICERT_REVOCATION_REQUEST_TIMEOUT_MS
    });
    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith(
      [JOB_ID],
      "Cancelled because the signer was revoked.",
      { isCancelledByRevoke: true }
    );
    expect(deps.certificateIssuanceQueue.digicertFns.getCodeSigningOrderStatus).toHaveBeenCalledWith(CA_ID, 9960);
  });

  it("keeps polling a revoked signer's DigiCert order when the cancel fails, so a late certificate is still revoked", async () => {
    const job = buildJob({
      caType: CaType.DIGICERT,
      externalOrderRef: {
        digicert: { orderId: 9960, lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: 9804 } }
      }
    });
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked, job });
    deps.certificateIssuanceQueue.digicertFns.cancelReissue.mockResolvedValue(false);

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).not.toHaveBeenCalled();
    expect(deps.certificateIssuanceQueue.digicertFns.getCodeSigningOrderStatus).toHaveBeenCalledWith(CA_ID, 9960);
  });

  it("doesn't cancel an order DigiCert already issued for a revoked signer, so its certificate is revoked instead", async () => {
    const job = buildJob({
      caType: CaType.DIGICERT,
      externalOrderRef: {
        digicert: { orderId: 9960, lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: 9804 } }
      }
    });
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked, job });
    deps.certificateIssuanceQueue.digicertFns.getCodeSigningOrderStatus.mockResolvedValue({
      status: "issued",
      rawStatus: "issued",
      certificateId: 109960
    });

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).not.toHaveBeenCalled();
  });

  it.each([
    ["with an order", { orderId: 9960, lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: 9804 } }],
    ["without an order yet", { lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: 9804 } }]
  ])("leaves a DigiCert job %s alone while the signer's revoke is still in progress", async (_label, digicert) => {
    const job = buildJob({ caType: CaType.DIGICERT, externalOrderRef: { digicert } });
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked, job });
    deps.certificateDAL.findById.mockResolvedValue({
      id: OLD_CERT_ID,
      status: CertStatus.ACTIVE,
      externalMetadata: null
    });

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).not.toHaveBeenCalled();
    expect(deps.certificateIssuanceQueue.digicertFns.orderCodeSigningCertificate).not.toHaveBeenCalled();
    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).not.toHaveBeenCalled();
  });

  it("cancels the order when its job was closed while the order was being placed", async () => {
    const job = buildJob({
      caType: CaType.DIGICERT,
      externalOrderRef: { digicert: { lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: 9804 } } }
    });
    const { service, deps } = buildService({ signerStatus: SignerStatus.Active, job });
    deps.signerIssuanceJobDAL.update.mockResolvedValue([]);

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.orderCodeSigningCertificate).toHaveBeenCalled();
    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 9999 })
    );
  });

  it("never places a new DigiCert order for a revoked signer and closes the job", async () => {
    const job = buildJob({
      caType: CaType.DIGICERT,
      externalOrderRef: { digicert: { lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: 9804 } } }
    });
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked, job });

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.orderCodeSigningCertificate).not.toHaveBeenCalled();
    expect(deps.certificateIssuanceQueue.digicertFns.reissueCodeSigningCertificate).not.toHaveBeenCalled();
    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith(
      [JOB_ID],
      "Cancelled because the signer was revoked.",
      { isCancelledByRevoke: true }
    );
  });

  it("cancels an order an earlier attempt placed for a revoked signer before closing the job", async () => {
    const job = buildJob({
      caType: CaType.DIGICERT,
      externalOrderRef: { digicert: { lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: 9804 } } }
    });
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked, job });
    deps.certificateIssuanceQueue.digicertFns.findCodeSigningOrderByReference.mockResolvedValue({
      orderId: 9970,
      certificateId: null
    });

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 9970 })
    );
    expect(deps.certificateIssuanceQueue.digicertFns.orderCodeSigningCertificate).not.toHaveBeenCalled();
    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith([JOB_ID], expect.any(String), {
      isCancelledByRevoke: true
    });
  });

  it("keeps tracking a recovered order for a revoked signer when DigiCert won't cancel it", async () => {
    const job = buildJob({
      caType: CaType.DIGICERT,
      externalOrderRef: { digicert: { lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: 9804 } } }
    });
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked, job });
    deps.certificateIssuanceQueue.digicertFns.findCodeSigningOrderByReference.mockResolvedValue({
      orderId: 9970,
      certificateId: null
    });
    deps.certificateIssuanceQueue.digicertFns.cancelReissue.mockResolvedValue(false);

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).not.toHaveBeenCalled();
    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      expect.objectContaining({
        externalOrderRef: expect.objectContaining({
          digicert: expect.objectContaining({ orderId: 9970 }) as unknown
        }) as unknown
      })
    );
  });

  it("cancels a reissue an earlier attempt may have placed for a revoked signer", async () => {
    const job = buildJob({
      caType: CaType.DIGICERT,
      externalOrderRef: { digicert: { lifecycle: { mode: DigiCertLifecycleMode.Reissue, previousOrderId: 9804 } } }
    });
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked, job });

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 9804 })
    );
    expect(deps.certificateIssuanceQueue.digicertFns.reissueCodeSigningCertificate).not.toHaveBeenCalled();
    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith([JOB_ID], expect.any(String), {
      isCancelledByRevoke: true
    });
  });

  it("keeps a DigiCert job open when DigiCert doesn't cancel its order, so a late certificate is still revoked", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Revoked,
      job: buildJob({
        caType: CaType.DIGICERT,
        externalOrderRef: {
          digicert: { orderId: 9960, lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: 9804 } }
        }
      })
    });
    deps.certificateIssuanceQueue.digicertFns.cancelReissue.mockResolvedValue(false);

    await expect(service.cancelOpenJobsForRevokedSigner(SIGNER_ID)).resolves.toEqual({
      uncancelledDigicertOrderIds: [9960],
      cancelledJobCount: 0
    });

    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith([], expect.any(String), {
      isCancelledByRevoke: true
    });
  });
});
