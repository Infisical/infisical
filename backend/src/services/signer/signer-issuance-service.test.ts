import { Knex } from "knex";
import { describe, expect, it, vi } from "vitest";

import { TPkiSignerCertificateIssuanceJobs, TPkiSigners } from "@app/db/schemas";
import { BadRequestError, ConflictError } from "@app/lib/errors";

import { CaStatus, CaType } from "../certificate-authority/certificate-authority-enums";
import {
  CodeSigningOrderStatus,
  DigiCertRevocationRequestStatus
} from "../certificate-authority/digicert/digicert-certificate-authority-enums";
import { CertKeyAlgorithm, CertStatus } from "../certificate/certificate-types";
import {
  CertKeySource,
  DigiCertLifecycleMode,
  SignerIssuanceJobCancelReason,
  SignerIssuanceJobStatus,
  SignerStatus
} from "./signer-enums";
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
const ORDER_ID = 4242;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

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
    certificateId: null,
    attempts: 0,
    maxAttempts: 100,
    lastAttemptAt: null,
    createdAt: new Date(),
    ...overrides
  }) as TPkiSignerCertificateIssuanceJobs;

const digicertJob = (digicert: Record<string, unknown>, overrides: Partial<TPkiSignerCertificateIssuanceJobs> = {}) =>
  buildJob({ caType: CaType.DIGICERT, externalOrderRef: { digicert }, ...overrides });

const buildService = ({
  signerStatus = SignerStatus.Active,
  job = buildJob(),
  claimed = { ...job, attempts: job.attempts + 1, lastAttemptAt: new Date() },
  pendingJobs = [job],
  signerOwningCertificate
}: {
  signerStatus?: SignerStatus;
  job?: TPkiSignerCertificateIssuanceJobs;
  claimed?: TPkiSignerCertificateIssuanceJobs | null;
  pendingJobs?: TPkiSignerCertificateIssuanceJobs[];
  signerOwningCertificate?: Partial<TPkiSigners>;
} = {}) => {
  const signer = {
    id: SIGNER_ID,
    name: "release-signer",
    projectId: PROJECT_ID,
    certificateId: OLD_CERT_ID,
    status: signerStatus
  } as TPkiSigners;
  const signerIssuanceJobDAL = {
    findById: vi.fn().mockResolvedValue(job),
    claimForAttempt: vi.fn().mockResolvedValue(claimed),
    completeIfPending: vi.fn().mockResolvedValue({ ...job, status: SignerIssuanceJobStatus.Completed }),
    update: vi.fn().mockResolvedValue([{ id: job.id, status: job.status }]),
    updateById: vi.fn().mockResolvedValue(job),
    findPendingForSignerForUpdate: vi.fn().mockResolvedValue(pendingJobs),
    closePending: vi.fn().mockResolvedValue(undefined),
    find: vi.fn().mockResolvedValue(pendingJobs),
    findLatestForSigner: vi.fn().mockResolvedValue(job),
    create: vi.fn(async (data: Partial<TPkiSignerCertificateIssuanceJobs>) => buildJob({ ...data, id: "job-new" })),
    transaction: vi.fn(async (cb: (trx: Knex) => unknown) => cb(tx))
  };
  const signerDAL = {
    findById: vi.fn().mockResolvedValue(signer),
    findByIdForUpdate: vi.fn().mockResolvedValue(signer),
    findOne: vi.fn().mockResolvedValue(signerOwningCertificate),
    updateUnlessRevoked: vi.fn(async (_id: string, data: Partial<TPkiSigners>) => ({ ...signer, ...data })),
    transaction: vi.fn(async (cb: (trx: Knex) => unknown) => cb(tx))
  };
  const certificateDAL = {
    findById: vi.fn(async (id: string) => ({
      id,
      projectId: PROJECT_ID,
      serialNumber: `serial-${id}`,
      status: CertStatus.ACTIVE,
      commonName: "Example Release Signing",
      notBefore: id === OLD_CERT_ID ? new Date(Date.now() - DAY_MS) : new Date(Date.now() + MINUTE_MS),
      createdAt: id === OLD_CERT_ID ? new Date(Date.now() - DAY_MS) : new Date(Date.now() + MINUTE_MS)
    })),
    findByIdForUpdate: vi.fn().mockResolvedValue(undefined),
    updateById: vi.fn()
  };
  const certificateService = {
    revokeOwnedCertificate: vi.fn().mockResolvedValue({ cert: {} }),
    completeOwnedCertificateRevocation: vi.fn().mockResolvedValue({ revokedAt: new Date() })
  };
  const awsPcaFns = { orderCertificate: vi.fn().mockResolvedValue({ certificateId: NEW_CERT_ID }) };
  const digicertFns = {
    cancelReissue: vi.fn().mockResolvedValue(true),
    getCodeSigningOrderStatus: vi
      .fn()
      .mockResolvedValue({ status: CodeSigningOrderStatus.Pending, rawStatus: "pending", certificateId: null }),
    findCodeSigningOrderByReference: vi.fn().mockResolvedValue(null),
    downloadCodeSigningCertificate: vi.fn().mockResolvedValue({ certificateId: NEW_CERT_ID }),
    orderCodeSigningCertificate: vi.fn().mockResolvedValue({ orderId: 9999, certificateId: null }),
    reissueCodeSigningCertificate: vi.fn().mockResolvedValue({ orderId: 9999, certificateId: null }),
    revokeCertificate: vi.fn().mockResolvedValue(undefined),
    getRevocationRequestStatus: vi.fn().mockResolvedValue(DigiCertRevocationRequestStatus.Pending)
  };
  const deps = {
    signerIssuanceJobDAL,
    signerDAL,
    certificateDAL,
    certificateService,
    certificateAuthorityDAL: {
      findByIdWithAssociatedCa: vi.fn().mockResolvedValue({
        id: CA_ID,
        projectId: PROJECT_ID,
        status: CaStatus.ACTIVE,
        externalCa: { type: CaType.AWS_PCA }
      })
    },
    projectDAL: { findOne: vi.fn().mockResolvedValue({ id: PROJECT_ID, orgId: ORG_ID }) },
    kmsService: {
      encryptWithKmsKey: vi.fn().mockResolvedValue(async ({ plainText }: { plainText: Buffer }) => ({
        cipherTextBlob: plainText
      })),
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

const closeCalls = (closePending: ReturnType<typeof vi.fn>) =>
  closePending.mock.calls.map(([args]) => args as { jobIds: string[]; status: string; cancelReason: string });

const cancelledUpdate = (update: ReturnType<typeof vi.fn>) =>
  update.mock.calls.find(
    ([filter, data]) =>
      (filter as { status?: string }).status === SignerIssuanceJobStatus.Cancelling &&
      (data as { status?: string }).status === SignerIssuanceJobStatus.Cancelled
  );

const requestInput = {
  signerId: SIGNER_ID,
  projectId: PROJECT_ID,
  caId: CA_ID,
  commonName: "Example Release Signing",
  certificateTtlDays: 365,
  keyAlgorithm: CertKeyAlgorithm.ECDSA_P256
};

describe("signerIssuanceService.requestIssuance", () => {
  it.each([SignerStatus.RevocationPending, SignerStatus.Revoked])(
    "refuses a %s signer under its row lock and creates no job",
    async (signerStatus) => {
      const { service, deps } = buildService({ signerStatus });

      await expect(service.requestIssuance(requestInput)).rejects.toThrow(BadRequestError);
      expect(deps.signerDAL.findByIdForUpdate).toHaveBeenCalledWith(SIGNER_ID, tx);
      expect(deps.signerIssuanceJobDAL.create).not.toHaveBeenCalled();
    }
  );

  it("moves an earlier pending request to cancelling before creating the new job", async () => {
    const { service, deps } = buildService({ claimed: null });

    await service.requestIssuance(requestInput);

    expect(closeCalls(deps.signerIssuanceJobDAL.closePending)).toContainEqual(
      expect.objectContaining({
        jobIds: [JOB_ID],
        status: SignerIssuanceJobStatus.Cancelling,
        cancelReason: SignerIssuanceJobCancelReason.Superseded
      })
    );
    expect(deps.signerIssuanceJobDAL.create).toHaveBeenCalledWith(
      expect.objectContaining({ signerId: SIGNER_ID, status: SignerIssuanceJobStatus.Pending }),
      tx
    );
  });
});

describe("signerIssuanceService.cancelOpenRequests", () => {
  it("closes the job on the kept order at once and hands the others to the wind-down", async () => {
    const reissueJob = digicertJob(
      { orderId: ORDER_ID, lifecycle: { mode: DigiCertLifecycleMode.Reissue, previousOrderId: ORDER_ID } },
      { id: "job-reissue" }
    );
    const otherJob = buildJob({ id: "job-other" });
    const { service, deps } = buildService({ pendingJobs: [reissueJob, otherJob] });

    await service.cancelOpenRequests(
      SIGNER_ID,
      SignerIssuanceJobCancelReason.Superseded,
      { keepOrderId: ORDER_ID },
      tx
    );

    expect(closeCalls(deps.signerIssuanceJobDAL.closePending)).toEqual([
      expect.objectContaining({ jobIds: ["job-reissue"], status: SignerIssuanceJobStatus.Cancelled }),
      expect.objectContaining({ jobIds: ["job-other"], status: SignerIssuanceJobStatus.Cancelling })
    ]);
    expect(deps.signerDAL.findByIdForUpdate).toHaveBeenCalledWith(SIGNER_ID, tx);
  });

  it("refuses a reissue while a DigiCert order is being placed, but never refuses a revoke", async () => {
    const placingJob = digicertJob(
      { lifecycle: { mode: DigiCertLifecycleMode.Reissue, previousOrderId: ORDER_ID } },
      { lastAttemptAt: new Date() }
    );
    const { service, deps } = buildService({ pendingJobs: [placingJob] });

    await expect(
      service.cancelOpenRequests(SIGNER_ID, SignerIssuanceJobCancelReason.Superseded, { keepOrderId: ORDER_ID }, tx)
    ).rejects.toThrow(ConflictError);
    expect(deps.signerIssuanceJobDAL.closePending).not.toHaveBeenCalled();

    await service.cancelOpenRequests(SIGNER_ID, SignerIssuanceJobCancelReason.Revoked, {}, tx);
    expect(closeCalls(deps.signerIssuanceJobDAL.closePending)).toContainEqual(
      expect.objectContaining({ jobIds: [JOB_ID], status: SignerIssuanceJobStatus.Cancelling })
    );
  });
});

describe("signerIssuanceService.cancelPendingDigiCertReissue", () => {
  const placedReissue = digicertJob({
    orderId: ORDER_ID,
    lifecycle: { mode: DigiCertLifecycleMode.Reissue, previousOrderId: ORDER_ID }
  });

  it("cancels a placed DigiCert reissue and returns its order", async () => {
    const { service, deps } = buildService({ pendingJobs: [placedReissue] });

    await expect(service.cancelPendingDigiCertReissue(SIGNER_ID)).resolves.toBe(ORDER_ID);
    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID })
    );
  });

  it("refuses with the order number when DigiCert won't cancel the reissue", async () => {
    const { service, deps } = buildService({ pendingJobs: [placedReissue] });
    deps.certificateIssuanceQueue.digicertFns.cancelReissue.mockResolvedValue(false);

    await expect(service.cancelPendingDigiCertReissue(SIGNER_ID)).rejects.toThrow(`#${ORDER_ID}`);
  });

  it("does nothing for renewals and unplaced reissues", async () => {
    const { service, deps } = buildService({
      pendingJobs: [
        digicertJob({ orderId: 77, lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: ORDER_ID } }),
        digicertJob({ lifecycle: { mode: DigiCertLifecycleMode.Reissue, previousOrderId: ORDER_ID } })
      ]
    });

    await expect(service.cancelPendingDigiCertReissue(SIGNER_ID)).resolves.toBeUndefined();
    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).not.toHaveBeenCalled();
  });
});

describe("signerIssuanceService attaching an issued certificate", () => {
  it("attaches only to a pending job and keeps a Disabled signer disabled", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Disabled });

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.completeIfPending).toHaveBeenCalledWith(JOB_ID, NEW_CERT_ID, tx);
    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      expect.objectContaining({ certificateId: NEW_CERT_ID, status: SignerStatus.Disabled, nextAutoRenewalAt: null }),
      tx
    );
  });

  it("records the certificate on a job that started cancelling meanwhile and leaves its revoke to the wind-down", async () => {
    const { service, deps } = buildService();
    deps.signerIssuanceJobDAL.completeIfPending.mockResolvedValue(null);
    deps.signerIssuanceJobDAL.update.mockResolvedValue([{ id: JOB_ID, status: SignerIssuanceJobStatus.Cancelling }]);

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Cancelling },
      { certificateId: NEW_CERT_ID },
      tx
    );
    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
    expect(deps.signerDAL.updateUnlessRevoked).not.toHaveBeenCalled();
  });

  it("revokes the certificate of a closed job at once unless a signer owns it", async () => {
    const closed = buildService();
    closed.deps.signerIssuanceJobDAL.completeIfPending.mockResolvedValue(null);
    closed.deps.signerIssuanceJobDAL.update.mockResolvedValue([]);
    await closed.service.processJob(JOB_ID);
    expect(closed.deps.certificateService.revokeOwnedCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: NEW_CERT_ID, orgId: ORG_ID })
    );

    const owned = buildService({ signerOwningCertificate: { id: "signer-2" } });
    owned.deps.signerIssuanceJobDAL.completeIfPending.mockResolvedValue(null);
    owned.deps.signerIssuanceJobDAL.update.mockResolvedValue([]);
    await owned.service.processJob(JOB_ID);
    expect(owned.deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
  });
});

describe("signerIssuanceService failing a job", () => {
  it("fails only a pending job and retries only a pending job", async () => {
    const { service, deps } = buildService();
    deps.certificateIssuanceQueue.awsPcaFns.orderCertificate.mockRejectedValue(new Error("upstream timeout"));

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      expect.objectContaining({ failureReason: "upstream timeout" }),
      tx
    );
    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      { certificateFailureReason: "upstream timeout" },
      tx
    );
  });

  it("marks a pending job past its window Failed", async () => {
    const old = buildJob({ createdAt: new Date(Date.now() - 2 * DAY_MS) });
    const { service, deps } = buildService({ job: old });

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      expect.objectContaining({ status: SignerIssuanceJobStatus.Failed }),
      tx
    );
    expect(deps.signerIssuanceJobDAL.claimForAttempt).not.toHaveBeenCalled();
  });
});

describe("signerIssuanceService winding down a cancelling job", () => {
  const cancelling = (overrides: Partial<TPkiSignerCertificateIssuanceJobs> = {}) =>
    buildJob({ status: SignerIssuanceJobStatus.Cancelling, ...overrides });

  it("revokes the job's certificate, then closes it as cancelled", async () => {
    const { service, deps } = buildService({ job: cancelling({ certificateId: NEW_CERT_ID }) });

    await service.processJob(JOB_ID);

    expect(deps.certificateService.revokeOwnedCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: NEW_CERT_ID })
    );
    expect(cancelledUpdate(deps.signerIssuanceJobDAL.update)).toBeDefined();
  });

  it("keeps a certificate a signer owns and closes the job", async () => {
    const { service, deps } = buildService({
      job: cancelling({ certificateId: NEW_CERT_ID }),
      signerOwningCertificate: { id: SIGNER_ID }
    });

    await service.processJob(JOB_ID);

    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
    expect(cancelledUpdate(deps.signerIssuanceJobDAL.update)).toBeDefined();
  });

  it("cancels a pending DigiCert order", async () => {
    const { service, deps } = buildService({
      job: cancelling({ caType: CaType.DIGICERT, externalOrderRef: { digicert: { orderId: ORDER_ID } } })
    });

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID })
    );
    expect(cancelledUpdate(deps.signerIssuanceJobDAL.update)).toBeDefined();
  });

  it("downloads and revokes the certificate of an issued DigiCert order", async () => {
    const { service, deps } = buildService({
      job: cancelling({ caType: CaType.DIGICERT, externalOrderRef: { digicert: { orderId: ORDER_ID } } })
    });
    deps.certificateIssuanceQueue.digicertFns.getCodeSigningOrderStatus.mockResolvedValue({
      status: CodeSigningOrderStatus.Issued,
      certificateId: 555
    });

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.downloadCodeSigningCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID, digicertCertificateId: 555 })
    );
    expect(deps.certificateService.revokeOwnedCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: NEW_CERT_ID })
    );
    expect(cancelledUpdate(deps.signerIssuanceJobDAL.update)).toBeDefined();
  });

  it("leaves a closed DigiCert order alone", async () => {
    const { service, deps } = buildService({
      job: cancelling({ caType: CaType.DIGICERT, externalOrderRef: { digicert: { orderId: ORDER_ID } } })
    });
    deps.certificateIssuanceQueue.digicertFns.getCodeSigningOrderStatus.mockResolvedValue({
      status: CodeSigningOrderStatus.Canceled,
      certificateId: null
    });

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).not.toHaveBeenCalled();
    expect(cancelledUpdate(deps.signerIssuanceJobDAL.update)).toBeDefined();
  });

  it("closes an unplaced DigiCert job that was never attempted without calling DigiCert", async () => {
    const { service, deps } = buildService({ job: cancelling({ caType: CaType.DIGICERT }) });

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.findCodeSigningOrderByReference).not.toHaveBeenCalled();
    expect(cancelledUpdate(deps.signerIssuanceJobDAL.update)).toBeDefined();
  });

  it("waits while an unplaced DigiCert order may still be in flight", async () => {
    const { service, deps } = buildService({ job: cancelling({ caType: CaType.DIGICERT, lastAttemptAt: new Date() }) });

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.claimForAttempt).not.toHaveBeenCalled();
  });

  it("recovers an unplaced DigiCert order by its reference and cancels it", async () => {
    const { service, deps } = buildService({
      job: cancelling({ caType: CaType.DIGICERT, lastAttemptAt: new Date(Date.now() - 30 * MINUTE_MS) })
    });
    deps.certificateIssuanceQueue.digicertFns.findCodeSigningOrderByReference.mockResolvedValue({
      orderId: ORDER_ID,
      certificateId: null
    });

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.findCodeSigningOrderByReference).toHaveBeenCalledWith(
      CA_ID,
      `infisical-signer-job-${JOB_ID}`
    );
    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID })
    );
    expect(cancelledUpdate(deps.signerIssuanceJobDAL.update)).toBeDefined();
  });

  it("keeps retrying a failed cleanup, then closes the job naming the order at the attempt limit", async () => {
    const job = cancelling({ caType: CaType.DIGICERT, externalOrderRef: { digicert: { orderId: ORDER_ID } } });
    const retrying = buildService({ job });
    retrying.deps.certificateIssuanceQueue.digicertFns.cancelReissue.mockResolvedValue(false);
    await retrying.service.processJob(JOB_ID);
    expect(cancelledUpdate(retrying.deps.signerIssuanceJobDAL.update)).toBeUndefined();

    const exhausted = buildService({ job, claimed: { ...job, attempts: job.maxAttempts + 1 } });
    exhausted.deps.certificateIssuanceQueue.digicertFns.cancelReissue.mockResolvedValue(false);
    await exhausted.service.processJob(JOB_ID);
    const closed = cancelledUpdate(exhausted.deps.signerIssuanceJobDAL.update)?.[1] as {
      status: string;
      failureReason: string;
    };
    expect(closed.status).toBe(SignerIssuanceJobStatus.Cancelled);
    expect(closed.failureReason).toContain(`DigiCert order #${ORDER_ID}`);
  });
});

const callOrder = (fn: ReturnType<typeof vi.fn>) => fn.mock.invocationCallOrder[0];

describe("signerIssuanceService lock order", () => {
  it("locks the signer row before the job row when attaching, failing, or retrying", async () => {
    const attaching = buildService();
    await attaching.service.processJob(JOB_ID);
    expect(callOrder(attaching.deps.signerDAL.findByIdForUpdate)).toBeLessThan(
      callOrder(attaching.deps.signerIssuanceJobDAL.completeIfPending)
    );

    const failing = buildService({ job: buildJob({ createdAt: new Date(Date.now() - 2 * DAY_MS) }) });
    await failing.service.processJob(JOB_ID);
    expect(callOrder(failing.deps.signerDAL.findByIdForUpdate)).toBeLessThan(
      callOrder(failing.deps.signerIssuanceJobDAL.update)
    );

    const retrying = buildService();
    retrying.deps.certificateIssuanceQueue.awsPcaFns.orderCertificate.mockRejectedValue(new Error("upstream timeout"));
    await retrying.service.processJob(JOB_ID);
    expect(callOrder(retrying.deps.signerDAL.findByIdForUpdate)).toBeLessThan(
      callOrder(retrying.deps.signerIssuanceJobDAL.update)
    );
  });
});

describe("signerIssuanceService DigiCert order that still holds the earlier certificate", () => {
  const issuedWithOldCertificate = (deps: ReturnType<typeof buildService>["deps"]) => {
    deps.certificateIssuanceQueue.digicertFns.getCodeSigningOrderStatus.mockResolvedValue({
      status: CodeSigningOrderStatus.Issued,
      certificateId: 555
    });
    deps.certificateIssuanceQueue.digicertFns.downloadCodeSigningCertificate.mockResolvedValue({
      certificateId: OLD_CERT_ID
    });
  };
  const reissueRef = {
    orderId: ORDER_ID,
    lifecycle: { mode: DigiCertLifecycleMode.Reissue, previousOrderId: ORDER_ID }
  };

  it("doesn't revoke the earlier certificate when winding down a canceled reissue", async () => {
    const { service, deps } = buildService({
      job: digicertJob(reissueRef, { status: SignerIssuanceJobStatus.Cancelling })
    });
    issuedWithOldCertificate(deps);

    await service.processJob(JOB_ID);

    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
    expect(cancelledUpdate(deps.signerIssuanceJobDAL.update)).toBeDefined();
  });

  it("fails the reissue instead of attaching the earlier certificate or overwriting its key details", async () => {
    const { service, deps } = buildService({ job: digicertJob(reissueRef, { keySource: CertKeySource.Hsm }) });
    issuedWithOldCertificate(deps);

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.completeIfPending).not.toHaveBeenCalled();
    expect(deps.certificateDAL.updateById).not.toHaveBeenCalled();
    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      expect.objectContaining({ status: SignerIssuanceJobStatus.Failed }),
      tx
    );
  });
});

describe("signerIssuanceService DigiCert request that runs out of time", () => {
  const expiredOrderJob = () => digicertJob({ orderId: ORDER_ID }, { createdAt: new Date(Date.now() - 6 * DAY_MS) });

  it("fails the job, cancels its open order, and records the failure on the signer", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Pending, job: expiredOrderJob() });

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID })
    );
    const [, failed] = deps.signerIssuanceJobDAL.update.mock.calls[0] as [
      unknown,
      { status: string; failureReason: string }
    ];
    expect(failed.status).toBe(SignerIssuanceJobStatus.Failed);
    expect(failed.failureReason).not.toContain("CertCentral");
    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      expect.objectContaining({ status: SignerStatus.Failed }),
      tx
    );
  });

  it("names the order in the failure reason when DigiCert won't cancel it", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Pending, job: expiredOrderJob() });
    deps.certificateIssuanceQueue.digicertFns.cancelReissue.mockResolvedValue(false);

    await service.processJob(JOB_ID);

    const [, failed] = deps.signerIssuanceJobDAL.update.mock.calls[0] as [
      unknown,
      { status: string; failureReason: string }
    ];
    expect(failed.status).toBe(SignerIssuanceJobStatus.Failed);
    expect(failed.failureReason).toContain(`Cancel DigiCert order #${ORDER_ID} in CertCentral`);
  });
});

describe("signerIssuanceService.cleanUpRequestsBeforeDelete", () => {
  it("cancels open DigiCert orders and revokes held certificates a signer doesn't own", async () => {
    const orderJob = digicertJob({ orderId: ORDER_ID }, { id: "job-order" });
    const certificateJob = buildJob({
      id: "job-certificate",
      status: SignerIssuanceJobStatus.Cancelling,
      certificateId: NEW_CERT_ID
    });
    const { service, deps } = buildService({ pendingJobs: [orderJob, certificateJob] });

    await service.cleanUpRequestsBeforeDelete(SIGNER_ID);

    expect(deps.signerDAL.findByIdForUpdate).toHaveBeenCalledWith(SIGNER_ID, tx);
    expect(closeCalls(deps.signerIssuanceJobDAL.closePending)).toContainEqual(
      expect.objectContaining({ jobIds: ["job-order", "job-certificate"], status: SignerIssuanceJobStatus.Cancelling })
    );
    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID })
    );
    expect(deps.certificateService.revokeOwnedCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: NEW_CERT_ID })
    );
  });

  it("refuses with the order number when DigiCert won't cancel the order", async () => {
    const { service, deps } = buildService({ pendingJobs: [digicertJob({ orderId: ORDER_ID })] });
    deps.certificateIssuanceQueue.digicertFns.cancelReissue.mockResolvedValue(false);

    await expect(service.cleanUpRequestsBeforeDelete(SIGNER_ID)).rejects.toThrow(
      `DigiCert order #${ORDER_ID} for this signer couldn't be canceled. Cancel it in CertCentral, then delete the signer again.`
    );
  });

  it("refuses while a DigiCert order is being placed", async () => {
    const { service, deps } = buildService({
      pendingJobs: [
        digicertJob(
          { lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: ORDER_ID } },
          { lastAttemptAt: new Date() }
        )
      ]
    });

    await expect(service.cleanUpRequestsBeforeDelete(SIGNER_ID)).rejects.toThrow("placing a DigiCert order right now");
    expect(deps.certificateIssuanceQueue.digicertFns.findCodeSigningOrderByReference).not.toHaveBeenCalled();
  });
});

describe("signerIssuanceService keeping the reissued order's job until its replacement exists", () => {
  const keptJob = digicertJob(
    { orderId: ORDER_ID, lifecycle: { mode: DigiCertLifecycleMode.Reissue, previousOrderId: ORDER_ID } },
    { id: "job-kept" }
  );

  it("leaves the kept job pending when asked, and closes the rest", async () => {
    const otherJob = buildJob({ id: "job-other" });
    const { service, deps } = buildService({ pendingJobs: [keptJob, otherJob] });

    await service.cancelOpenRequests(
      SIGNER_ID,
      SignerIssuanceJobCancelReason.Superseded,
      { keepOrderId: ORDER_ID, leaveKeptJobPending: true },
      tx
    );

    expect(closeCalls(deps.signerIssuanceJobDAL.closePending)).toEqual([
      expect.objectContaining({ jobIds: ["job-other"], status: SignerIssuanceJobStatus.Cancelling })
    ]);
  });

  it("closes the kept job in the transaction that creates its replacement", async () => {
    const { service, deps } = buildService({ pendingJobs: [keptJob], claimed: null });

    await service.requestIssuance({ ...requestInput, keepOrderId: ORDER_ID });

    expect(closeCalls(deps.signerIssuanceJobDAL.closePending)).toContainEqual(
      expect.objectContaining({ jobIds: ["job-kept"], status: SignerIssuanceJobStatus.Cancelled })
    );
    expect(deps.signerIssuanceJobDAL.create).toHaveBeenCalled();
  });

  it("leaves the kept job pending when the replacement can't be created", async () => {
    const { service, deps } = buildService({ pendingJobs: [keptJob] });
    deps.kmsService.encryptWithKmsKey.mockRejectedValue(new Error("KMS unavailable"));

    await expect(service.requestIssuance({ ...requestInput, keepOrderId: ORDER_ID })).rejects.toThrow(
      "KMS unavailable"
    );

    expect(deps.signerIssuanceJobDAL.closePending).not.toHaveBeenCalled();
    expect(deps.signerIssuanceJobDAL.create).not.toHaveBeenCalled();
  });
});

describe("signerIssuanceService certificate of a closed job that can't be revoked", () => {
  it("names the certificate on the closed job", async () => {
    const { service, deps } = buildService();
    deps.signerIssuanceJobDAL.completeIfPending.mockResolvedValue(null);
    deps.signerIssuanceJobDAL.update.mockResolvedValue([]);
    deps.certificateService.revokeOwnedCertificate.mockRejectedValue(new Error("CA unreachable"));

    await service.processJob(JOB_ID);

    const leftoverWrite = deps.signerIssuanceJobDAL.update.mock.calls.find(
      ([filter, data]) =>
        (filter as { id: string; status?: string }).id === JOB_ID &&
        !(filter as { status?: string }).status &&
        typeof (data as { failureReason?: string }).failureReason === "string"
    );
    expect(leftoverWrite).toBeDefined();
    expect((leftoverWrite as unknown[])[1] as { failureReason: string }).toHaveProperty("failureReason");
    expect(((leftoverWrite as unknown[])[1] as { failureReason: string }).failureReason).toContain(
      `serial number serial-${NEW_CERT_ID} couldn't be revoked`
    );
  });
});

describe("signerIssuanceService revoking a DigiCert certificate a canceled request left behind", () => {
  const digicertCertificateJob = () =>
    buildJob({ status: SignerIssuanceJobStatus.Cancelling, certificateId: NEW_CERT_ID });
  const useDigiCertCa = (deps: ReturnType<typeof buildService>["deps"]) => {
    deps.certificateDAL.findById.mockImplementation(async (id: string) => ({
      id,
      caId: CA_ID,
      projectId: PROJECT_ID,
      serialNumber: `serial-${id}`,
      status: CertStatus.ACTIVE,
      commonName: "Example Release Signing",
      notBefore: new Date(),
      createdAt: new Date()
    }));
    deps.certificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue({
      id: CA_ID,
      projectId: PROJECT_ID,
      status: CaStatus.ACTIVE,
      externalCa: { type: CaType.DIGICERT }
    });
  };

  it("keeps the job open while DigiCert waits for approval, and stores the request to poll later", async () => {
    const { service, deps } = buildService({ job: digicertCertificateJob() });
    useDigiCertCa(deps);
    deps.certificateIssuanceQueue.digicertFns.revokeCertificate.mockResolvedValue(77);

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Cancelling },
      { externalOrderRef: { digicert: { revocationRequestId: 77 } } }
    );
    expect(deps.certificateIssuanceQueue.digicertFns.revokeCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ allowPendingApproval: true })
    );
    expect(deps.certificateService.completeOwnedCertificateRevocation).not.toHaveBeenCalled();
    expect(cancelledUpdate(deps.signerIssuanceJobDAL.update)).toBeUndefined();
  });

  it("records the revocation and closes the job when DigiCert approves it right away", async () => {
    const { service, deps } = buildService({ job: digicertCertificateJob() });
    useDigiCertCa(deps);

    await service.processJob(JOB_ID);

    expect(deps.certificateService.completeOwnedCertificateRevocation).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: NEW_CERT_ID })
    );
    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
    expect(cancelledUpdate(deps.signerIssuanceJobDAL.update)).toBeDefined();
  });
});

describe("signerIssuanceService polling a queued DigiCert revocation of a left-behind certificate", () => {
  const queuedJob = (overrides: Partial<TPkiSignerCertificateIssuanceJobs> = {}) =>
    buildJob({
      caType: CaType.DIGICERT,
      status: SignerIssuanceJobStatus.Cancelling,
      certificateId: NEW_CERT_ID,
      externalOrderRef: { digicert: { orderId: ORDER_ID, revocationRequestId: 77 } },
      ...overrides
    });

  it("records the revocation and closes the job once DigiCert approves", async () => {
    const { service, deps } = buildService({ job: queuedJob() });
    deps.certificateIssuanceQueue.digicertFns.getRevocationRequestStatus.mockResolvedValue(
      DigiCertRevocationRequestStatus.Approved
    );

    await service.processJob(JOB_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.revokeCertificate).not.toHaveBeenCalled();
    expect(deps.certificateService.completeOwnedCertificateRevocation).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: NEW_CERT_ID })
    );
    expect(cancelledUpdate(deps.signerIssuanceJobDAL.update)?.[1]).toEqual({
      status: SignerIssuanceJobStatus.Cancelled
    });
  });

  it("closes the job at once naming the request when DigiCert rejects it", async () => {
    const { service, deps } = buildService({ job: queuedJob() });
    deps.certificateIssuanceQueue.digicertFns.getRevocationRequestStatus.mockResolvedValue(
      DigiCertRevocationRequestStatus.Rejected
    );

    await service.processJob(JOB_ID);

    const closed = cancelledUpdate(deps.signerIssuanceJobDAL.update)?.[1] as { failureReason: string };
    expect(closed.failureReason).toContain("DigiCert rejected revocation request #77");
    expect(deps.certificateService.completeOwnedCertificateRevocation).not.toHaveBeenCalled();
  });

  it("keeps waiting while the request is pending, then closes naming it at the attempt limit", async () => {
    const waiting = buildService({ job: queuedJob() });
    await waiting.service.processJob(JOB_ID);
    expect(cancelledUpdate(waiting.deps.signerIssuanceJobDAL.update)).toBeUndefined();
    expect(waiting.deps.certificateIssuanceQueue.digicertFns.revokeCertificate).not.toHaveBeenCalled();

    const job = queuedJob();
    const exhausted = buildService({ job, claimed: { ...job, attempts: job.maxAttempts + 1 } });
    await exhausted.service.processJob(JOB_ID);
    const closed = cancelledUpdate(exhausted.deps.signerIssuanceJobDAL.update)?.[1] as { failureReason: string };
    expect(closed.failureReason).toContain("DigiCert revocation request #77");
  });
});

describe("signerIssuanceService deleting a signer with open requests", () => {
  it("cancels pending requests as deleted and still refuses a DigiCert placement in flight", async () => {
    const pendingJob = buildJob({ id: "job-pending" });
    const { service, deps } = buildService({ pendingJobs: [pendingJob] });

    await service.cleanUpRequestsBeforeDelete(SIGNER_ID);
    expect(closeCalls(deps.signerIssuanceJobDAL.closePending)).toContainEqual(
      expect.objectContaining({ cancelReason: SignerIssuanceJobCancelReason.Deleted })
    );

    await expect(
      service.cancelOpenRequests(SIGNER_ID, SignerIssuanceJobCancelReason.Deleted, {}, tx)
    ).resolves.toBeDefined();
    const placing = buildService({
      pendingJobs: [
        digicertJob(
          { lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: ORDER_ID } },
          { lastAttemptAt: new Date() }
        )
      ]
    });
    await expect(
      placing.service.cancelOpenRequests(SIGNER_ID, SignerIssuanceJobCancelReason.Deleted, {}, tx)
    ).rejects.toThrow(ConflictError);
  });

  it("marks a Pending signer Failed with the reason when the delete is refused", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Pending,
      pendingJobs: [digicertJob({ orderId: ORDER_ID })]
    });
    deps.certificateIssuanceQueue.digicertFns.cancelReissue.mockResolvedValue(false);

    await expect(service.cleanUpRequestsBeforeDelete(SIGNER_ID)).rejects.toThrow(`#${ORDER_ID}`);
    const [, failedPatch] = deps.signerDAL.updateUnlessRevoked.mock.calls[0] as [
      string,
      { status: string; certificateFailureReason: string }
    ];
    expect(failedPatch.status).toBe(SignerStatus.Failed);
    expect(failedPatch.certificateFailureReason).toContain(`DigiCert order #${ORDER_ID}`);
  });
});
