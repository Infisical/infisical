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
    transaction: vi.fn(async (cb: (trx: Knex) => unknown) => cb(tx))
  };
  const signerDAL = {
    findById: vi.fn().mockResolvedValue(signer),
    findByIdForUpdate: vi.fn().mockResolvedValue(signer),
    findOne: vi.fn().mockResolvedValue(undefined),
    updateById: vi.fn(async (_id: string, data: Partial<TPkiSigners>) => ({ ...signer, ...data })),
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
    expect(statusesWritten(deps.signerDAL.updateById)).not.toContain(SignerStatus.Active);
    expect(deps.signerDAL.updateById).not.toHaveBeenCalledWith(
      SIGNER_ID,
      expect.objectContaining({ certificateId: NEW_CERT_ID }),
      expect.anything()
    );
    expect(deps.signerIssuanceJobDAL.update).toHaveBeenCalledWith(
      { id: JOB_ID, status: SignerIssuanceJobStatus.Pending },
      {
        status: SignerIssuanceJobStatus.Failed,
        failureReason: expect.stringContaining("revoked during issuance") as string
      },
      tx
    );
    expect(deps.certificateService.revokeOwnedCertificate).toHaveBeenCalledWith({
      certificateId: NEW_CERT_ID,
      revocationReason: CrlReason.CESSATION_OF_OPERATION,
      orgId: ORG_ID
    });
  });

  it("attaches the certificate and makes a renewing signer Active when it is not revoked", async () => {
    const { service, deps } = buildService({ signerStatus: SignerStatus.Active });

    await service.processJob(JOB_ID);

    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(
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

    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(
      SIGNER_ID,
      expect.objectContaining({ certificateId: NEW_CERT_ID, status: SignerStatus.Disabled }),
      tx
    );
    expect(statusesWritten(deps.signerDAL.updateById)).not.toContain(SignerStatus.Active);
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
    expect(deps.signerDAL.updateById).toHaveBeenCalledTimes(1);
    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(
      SIGNER_ID,
      { certificateFailureReason: expect.stringContaining("pending for more than 24 hours") as string },
      tx
    );
    expect(statusesWritten(deps.signerDAL.updateById)).toEqual([]);
  });

  it("keeps a Disabled signer Disabled when its renewal fails", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Disabled,
      job: buildJob({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
    });

    await service.processJob(JOB_ID);

    expect(statusesWritten(deps.signerDAL.updateById)).toEqual([]);
    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(
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
    expect(statusesWritten(deps.signerDAL.updateById)).toEqual([]);
    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(
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

    expect(deps.signerDAL.updateById).toHaveBeenCalledWith(
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

    expect(deps.signerIssuanceJobDAL.cancelOpenForSigner).toHaveBeenCalledWith(
      SIGNER_ID,
      "Cancelled because the signer's certificate was revoked.",
      tx
    );
    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).not.toHaveBeenCalled();
  });

  it("cancels a DigiCert reissue at DigiCert when revoking cancels it", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Revoked,
      job: buildJob({
        caType: CaType.DIGICERT,
        externalOrderRef: {
          digicert: { orderId: 9550, lifecycle: { mode: DigiCertLifecycleMode.Reissue, previousOrderId: 9550 } }
        }
      })
    });

    await service.cancelOpenJobsForRevokedSigner(SIGNER_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).toHaveBeenCalledWith({
      caId: CA_ID,
      orderId: 9550,
      requestTimeoutMs: DIGICERT_REVOCATION_REQUEST_TIMEOUT_MS
    });
  });

  it("leaves a new DigiCert renewal order alone when revoking cancels the job", async () => {
    const { service, deps } = buildService({
      signerStatus: SignerStatus.Revoked,
      job: buildJob({
        caType: CaType.DIGICERT,
        externalOrderRef: {
          digicert: { orderId: 9960, lifecycle: { mode: DigiCertLifecycleMode.Renew, previousOrderId: 9804 } }
        }
      })
    });

    await service.cancelOpenJobsForRevokedSigner(SIGNER_ID);

    expect(deps.certificateIssuanceQueue.digicertFns.cancelReissue).not.toHaveBeenCalled();
  });
});
