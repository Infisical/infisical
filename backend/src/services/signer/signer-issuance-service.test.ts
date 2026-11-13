import { Knex } from "knex";
import { describe, expect, it, vi } from "vitest";

import { TPkiSignerCertificateIssuanceJobs, TPkiSigners } from "@app/db/schemas";

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
    findPendingForSignerForUpdate: vi.fn().mockResolvedValue([job]),
    cancelOpenForSigner: vi.fn().mockResolvedValue(undefined),
    find: vi.fn().mockResolvedValue([job]),
    cancelPendingByIds: vi.fn().mockResolvedValue(undefined),
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
  const digicertFns = { cancelReissue: vi.fn().mockResolvedValue(true) };
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

  it("revokes a certificate that comes back after a revoke already cancelled its job", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked });
    deps.signerIssuanceJobDAL.completeIfPending.mockResolvedValue(null);

    await service.processJob(JOB_ID);

    expect(deps.signerDAL.updateUnlessRevoked).not.toHaveBeenCalledWith(
      SIGNER_ID,
      expect.objectContaining({ certificateId: NEW_CERT_ID }),
      expect.anything()
    );
    expect(deps.certificateService.revokeOwnedCertificate).toHaveBeenCalledWith({
      certificateId: NEW_CERT_ID,
      revocationReason: CrlReason.CESSATION_OF_OPERATION,
      orgId: ORG_ID
    });
  });

  it("revokes a certificate that comes back after its signer was deleted", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Active });
    deps.signerIssuanceJobDAL.completeIfPending.mockResolvedValue(null);
    const signer = (await deps.signerDAL.findById(SIGNER_ID)) as TPkiSigners;
    deps.signerDAL.findById.mockImplementation(async (_id: string, trx?: Knex) => (trx ? undefined : signer));

    await service.processJob(JOB_ID);

    expect(deps.certificateService.revokeOwnedCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ certificateId: NEW_CERT_ID })
    );
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

  it("attaches the certificate and makes a renewing signer Active when it is not revoked", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Active });

    await service.processJob(JOB_ID);

    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      expect.objectContaining({
        certificateId: NEW_CERT_ID,
        status: SignerStatus.Active,
        certificateFailureReason: null
      }),
      tx
    );
    expect(deps.signerIssuanceJobDAL.update).not.toHaveBeenCalled();
    expect(deps.certificateService.revokeOwnedCertificate).not.toHaveBeenCalled();
  });

  it("attaches the certificate but keeps a signer that was disabled during its renewal Disabled", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Disabled });

    await service.processJob(JOB_ID);

    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      expect.objectContaining({ certificateId: NEW_CERT_ID, status: SignerStatus.Disabled }),
      tx
    );
    expect(statusesWritten(deps.signerDAL.updateUnlessRevoked)).not.toContain(SignerStatus.Active);
  });
});

describe("signerIssuanceService failing a job", () => {
  it("keeps an Active signer Active and only records the failure reason", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Active,
      job: buildJob({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
    });

    await service.processJob(JOB_ID);

    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      expect.objectContaining({ status: SignerIssuanceJobStatus.Failed }),
      tx
    );
    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledTimes(1);
    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      { certificateFailureReason: expect.stringContaining("pending for more than 24 hours") as string },
      tx
    );
    expect(statusesWritten(deps.signerDAL.updateUnlessRevoked)).toEqual([]);
  });

  it("keeps a Disabled signer Disabled when its renewal fails", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Disabled,
      job: buildJob({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
    });

    await service.processJob(JOB_ID);

    expect(statusesWritten(deps.signerDAL.updateUnlessRevoked)).toEqual([]);
    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      { certificateFailureReason: expect.stringContaining("pending for more than 24 hours") as string },
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

  it("marks a signer that is still waiting for its first certificate Failed", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Pending,
      job: buildJob({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
    });

    await service.processJob(JOB_ID);

    expect(deps.signerDAL.updateUnlessRevoked).toHaveBeenCalledWith(
      SIGNER_ID,
      {
        status: SignerStatus.Failed,
        certificateFailureReason: expect.stringContaining("pending for more than 24 hours") as string
      },
      tx
    );
  });

  it("cancels open jobs for a revoked signer with a readable reason", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Revoked });

    await service.cancelOpenJobsForRevokedSigner(SIGNER_ID);

    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith(
      [JOB_ID],
      "Cancelled because the signer was revoked."
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
    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith([JOB_ID], expect.any(String));
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
    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith([], expect.any(String));
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
      uncancelledDigicertOrderIds: [9960]
    });

    expect(deps.signerIssuanceJobDAL.cancelPendingByIds).toHaveBeenCalledWith([], expect.any(String));
  });
});
