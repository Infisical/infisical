/* eslint-disable no-await-in-loop, @typescript-eslint/no-use-before-define, @typescript-eslint/no-unsafe-argument */
import * as x509 from "@peculiar/x509";

import { TPkiSignerIssuanceJobs } from "@app/db/schemas";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "../certificate/certificate-types";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority/certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "../certificate-authority/certificate-authority-fns";
import { TCertificateIssuanceQueueFactory } from "../certificate-authority/certificate-issuance-queue";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TProjectDALFactory } from "../project/project-dal";
import { getProjectKmsCertificateKeyId } from "../project/project-fns";
import { TSignerDALFactory } from "./signer-dal";
import { SignerIssuanceJobStatus, SignerStatus } from "./signer-enums";
import { formatSignerIssuanceErrorReason } from "./signer-issuance-errors";
import { verifyCodeSigningEku } from "./signer-issuance-fns";
import { TSignerIssuanceJobDALFactory } from "./signer-issuance-job-dal";

const POLL_INTERVAL_PATTERN = "*/15 * * * *"; // every 15 minutes
const POLL_BATCH = 25;
const RETRY_BACKOFF_MS = 15 * 60_000;
const PENDING_VALIDATION_POLL_INTERVAL_MS = 15 * 60_000;
const MAX_ISSUANCE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type TSignerIssuanceServiceFactory = ReturnType<typeof signerIssuanceServiceFactory>;

type TSignerIssuanceServiceDeps = {
  signerIssuanceJobDAL: TSignerIssuanceJobDALFactory;
  signerDAL: Pick<TSignerDALFactory, "updateById">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne" | "create" | "updateById">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithKmsKey" | "decryptWithKmsKey" | "generateKmsKey">;
  certificateIssuanceQueue: Pick<
    TCertificateIssuanceQueueFactory,
    "acmeFns" | "azureAdCsFns" | "awsPcaFns" | "digicertFns" | "venafiTppFns"
  >;
  cronJob: TCronJobFactory;
};

type TRequestIssuanceInput = {
  signerId: string;
  projectId: string;
  caId: string;
  commonName: string;
  certificateTtlDays: number;
  keyAlgorithm?: CertKeyAlgorithm;
};

type TExternalOrderRef =
  | { type: CaType.DIGICERT; orderId: number }
  | { type: CaType.ACME; orderUrl?: string }
  | Record<string, unknown>;

export const signerIssuanceServiceFactory = ({
  signerIssuanceJobDAL,
  signerDAL,
  certificateAuthorityDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  projectDAL,
  kmsService,
  certificateIssuanceQueue,
  cronJob
}: TSignerIssuanceServiceDeps) => {
  const { acmeFns, azureAdCsFns, awsPcaFns, digicertFns, venafiTppFns } = certificateIssuanceQueue;

  const buildCsrForSigner = async (
    commonName: string,
    keyAlgorithm: CertKeyAlgorithm
  ): Promise<{ csrPem: string; privateKeyPem: string }> => {
    const alg = keyAlgorithmToAlgCfg(keyAlgorithm);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leafKeys = await crypto.nativeCrypto.subtle.generateKey(alg as any, true, ["sign", "verify"]);
    const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
    const privateKeyPem = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

    const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
      name: [{ CN: [commonName] }],
      keys: leafKeys,
      signingAlgorithm: alg,
      extensions: [
        new x509.KeyUsagesExtension(
          // eslint-disable-next-line no-bitwise
          x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment
        ),
        new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.codeSigning], true)
      ]
    });

    return { csrPem: csrObj.toString("pem"), privateKeyPem };
  };

  const encryptForProject = async (projectId: string, plain: Buffer): Promise<Buffer> => {
    const kmsId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
    const encryptor = await kmsService.encryptWithKmsKey({ kmsId });
    const { cipherTextBlob } = await encryptor({ plainText: plain });
    return cipherTextBlob;
  };

  const decryptForProject = async (projectId: string, cipher: Buffer): Promise<Buffer> => {
    const kmsId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
    const decryptor = await kmsService.decryptWithKmsKey({ kmsId });
    return decryptor({ cipherTextBlob: cipher });
  };

  const requestIssuance = async (input: TRequestIssuanceInput): Promise<TPkiSignerIssuanceJobs> => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(input.caId);
    if (!ca || ca.projectId !== input.projectId) {
      throw new BadRequestError({
        message: `Certificate authority '${input.caId}' is not in this project.`
      });
    }
    if (ca.status !== CaStatus.ACTIVE) {
      throw new BadRequestError({ message: "The selected certificate authority is not active." });
    }
    const caType = ca.externalCa?.type;
    if (!caType || caType === CaType.INTERNAL) {
      throw new BadRequestError({
        message: "Internal CAs must be issued synchronously, not through the signer issuance service."
      });
    }

    await signerIssuanceJobDAL.cancelOpenForSigner(input.signerId, "Superseded by a newer issuance request.");

    const keyAlgorithm: CertKeyAlgorithm = input.keyAlgorithm ?? CertKeyAlgorithm.RSA_2048;
    const { csrPem, privateKeyPem } = await buildCsrForSigner(input.commonName, keyAlgorithm);

    const encryptedCsr = await encryptForProject(input.projectId, Buffer.from(csrPem));
    const encryptedPrivateKey = await encryptForProject(input.projectId, Buffer.from(privateKeyPem));

    const job = await signerIssuanceJobDAL.create({
      signerId: input.signerId,
      caId: input.caId,
      caType,
      status: SignerIssuanceJobStatus.Pending,
      commonName: input.commonName,
      certificateTtlDays: input.certificateTtlDays,
      keyAlgorithm,
      encryptedCsr,
      encryptedPrivateKey,
      nextPollAt: new Date()
    });

    void (async () => {
      try {
        await processJob(job.id);
      } catch (err) {
        logger.warn(
          err,
          `signer issuance: first-attempt background failed, cron will retry [jobId=${job.id}] [signerId=${input.signerId}]`
        );
      }
    })();

    return job;
  };

  const processJob = async (jobId: string): Promise<void> => {
    const snapshot = await signerIssuanceJobDAL.findById(jobId);
    if (!snapshot) {
      logger.warn(`signer issuance: job ${jobId} not found, skipping`);
      return;
    }
    if (snapshot.status !== SignerIssuanceJobStatus.Pending) return;

    const now = new Date();

    const ageMs = now.getTime() - new Date(snapshot.createdAt).getTime();
    if (ageMs > MAX_ISSUANCE_WINDOW_MS) {
      await markJobFailedIfStillPending(
        snapshot,
        "Signer issuance was pending for more than 24 hours. The upstream Certificate Authority never finished issuing the certificate; abandoning."
      );
      return;
    }

    const job = await signerIssuanceJobDAL.claimForAttempt(
      snapshot.id,
      snapshot.attempts,
      new Date(now.getTime() + RETRY_BACKOFF_MS),
      now
    );
    if (!job) {
      logger.info(
        `signer issuance: claim missed for [jobId=${snapshot.id}] [signerId=${snapshot.signerId}] (concurrent claim or cancellation)`
      );
      return;
    }

    if (job.attempts > job.maxAttempts) {
      await markJobFailed(
        job,
        `Signer issuance exhausted after ${job.maxAttempts} attempts. Last attempt at ${now.toISOString()}.`
      );
      return;
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(job.caId);
    if (!ca || ca.status !== CaStatus.ACTIVE) {
      await markJobFailed(job, `Certificate authority is no longer available or active.`);
      return;
    }

    try {
      switch (job.caType as CaType) {
        case CaType.DIGICERT:
          await stepDigiCert(job);
          break;
        case CaType.ACME:
          await stepSyncWithCsr(job, "acme");
          break;
        case CaType.AZURE_AD_CS:
          await stepSyncWithCsr(job, "azure");
          break;
        case CaType.AWS_PCA:
          await stepSyncWithCsr(job, "aws-pca");
          break;
        case CaType.VENAFI_TPP:
          await stepSyncWithCsr(job, "venafi");
          break;
        case CaType.AWS_ACM_PUBLIC_CA:
          await markJobFailed(
            job,
            "AWS ACM Public CA does not issue code-signing certificates. Choose a different CA."
          );
          return;
        default:
          await markJobFailed(job, `CA type '${job.caType}' is not supported for signer issuance.`);
      }
    } catch (err) {
      const reason = formatSignerIssuanceErrorReason(
        err,
        "External Certificate Authority refused to issue the signer certificate"
      );
      const rows = await signerIssuanceJobDAL.update(
        { id: job.id, status: SignerIssuanceJobStatus.Pending },
        {
          nextPollAt: new Date(Date.now() + RETRY_BACKOFF_MS),
          failureReason: reason
        }
      );
      if (rows.length > 0) {
        await signerDAL.updateById(job.signerId, {
          status: SignerStatus.Pending,
          failureReason: reason
        });
      }
      logger.error(
        err,
        `signer issuance: attempt failed, will retry [jobId=${job.id}] [signerId=${job.signerId}] [attempts=${job.attempts}/${job.maxAttempts}]`
      );
    }
  };

  const markJobFailed = async (job: TPkiSignerIssuanceJobs, reason: string) => {
    await signerIssuanceJobDAL.updateById(job.id, {
      status: SignerIssuanceJobStatus.Failed,
      failureReason: reason.slice(0, 1000)
    });
    await signerDAL.updateById(job.signerId, {
      status: SignerStatus.Failed,
      failureReason: reason.slice(0, 1000)
    });
    logger.info(
      `signer issuance: job marked Failed [jobId=${job.id}] [signerId=${job.signerId}] [reason=${reason.slice(0, 200)}]`
    );
  };

  const markJobFailedIfStillPending = async (job: TPkiSignerIssuanceJobs, reason: string) => {
    const trimmed = reason.slice(0, 1000);
    const rows = await signerIssuanceJobDAL.update(
      { id: job.id, status: SignerIssuanceJobStatus.Pending },
      { status: SignerIssuanceJobStatus.Failed, failureReason: trimmed }
    );
    if (rows.length === 0) return;
    await signerDAL.updateById(job.signerId, {
      status: SignerStatus.Failed,
      failureReason: trimmed
    });
    logger.info(
      `signer issuance: job marked Failed [jobId=${job.id}] [signerId=${job.signerId}] [reason=${trimmed.slice(0, 200)}]`
    );
  };

  const attachIssuedCertToSigner = async (
    job: TPkiSignerIssuanceJobs,
    certificateId: string,
    projectId: string
  ): Promise<void> => {
    try {
      await verifyCodeSigningEku({ certificateBodyDAL, projectDAL, kmsService }, { certificateId, projectId });
    } catch (ekuErr) {
      const reason = formatSignerIssuanceErrorReason(ekuErr, "Issued certificate failed code-signing EKU verification");
      await markJobFailed(job, reason);
      return;
    }

    await signerDAL.updateById(job.signerId, {
      certificateId,
      status: SignerStatus.Active,
      failureReason: null
    });
    await signerIssuanceJobDAL.updateById(job.id, {
      status: SignerIssuanceJobStatus.Completed,
      certificateId,
      failureReason: null
    });
    logger.info(
      `signer issuance: signer attached [jobId=${job.id}] [signerId=${job.signerId}] [certificateId=${certificateId}]`
    );
  };

  const stepDigiCert = async (job: TPkiSignerIssuanceJobs) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(job.caId);
    if (!ca) {
      await markJobFailed(job, "Certificate authority is no longer available.");
      return;
    }
    const { projectId } = ca;
    const existingRef = job.externalOrderRef as TExternalOrderRef | null | undefined;

    if (!existingRef || (existingRef as { type?: CaType }).type !== CaType.DIGICERT) {
      const csr = (await decryptForProject(projectId, Buffer.from(job.encryptedCsr as Buffer))).toString();

      const orderResult = await digicertFns.orderCertificateFromProfile({
        caId: job.caId,
        commonName: job.commonName,
        altNames: [],
        signatureAlgorithm: undefined,
        keyAlgorithm: job.keyAlgorithm as CertKeyAlgorithm,
        ttl: `${job.certificateTtlDays}d`,
        csr
      });

      const orderRef: TExternalOrderRef = {
        type: CaType.DIGICERT,
        orderId: orderResult.orderId
      };

      if (orderResult.immediateCertificateId) {
        const { certificateId } = await digicertFns.fetchAndAttachIssuedCertificate({
          caId: job.caId,
          certificateRequest: {
            id: `signer:${job.signerId}`,
            profileId: undefined,
            commonName: job.commonName,
            altNames: null,
            keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT],
            extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
            keyAlgorithm: job.keyAlgorithm,
            signatureAlgorithm: null
          },
          digicertCertificateId: orderResult.immediateCertificateId,
          digicertOrderId: orderResult.orderId
        });

        await persistCertificatePrivateKey(certificateId, projectId, job);
        await attachIssuedCertToSigner(job, certificateId, projectId);
        return;
      }

      await signerIssuanceJobDAL.updateById(job.id, {
        externalOrderRef: orderRef,
        nextPollAt: new Date(Date.now() + PENDING_VALIDATION_POLL_INTERVAL_MS)
      });
      logger.info(
        `signer issuance: DigiCert order ${orderResult.orderId} placed, awaiting validation [jobId=${job.id}]`
      );
      return;
    }

    const ref = existingRef as { type: CaType.DIGICERT; orderId: number };

    const poll = await digicertFns.pollOrderForCertificate({ caId: job.caId, orderId: ref.orderId });
    if (poll.status === "pending") {
      await signerIssuanceJobDAL.updateById(job.id, {
        nextPollAt: new Date(Date.now() + PENDING_VALIDATION_POLL_INTERVAL_MS)
      });
      logger.info(
        `signer issuance: DigiCert order ${ref.orderId} still pending (status=${poll.orderStatus}) [jobId=${job.id}]`
      );
      return;
    }
    if (poll.status === "failed") {
      await markJobFailed(job, poll.reason);
      return;
    }

    const { certificateId } = await digicertFns.fetchAndAttachIssuedCertificate({
      caId: job.caId,
      certificateRequest: {
        id: `signer:${job.signerId}`,
        profileId: undefined,
        commonName: job.commonName,
        altNames: null,
        keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT],
        extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
        keyAlgorithm: job.keyAlgorithm,
        signatureAlgorithm: null
      },
      digicertCertificateId: poll.certificateId,
      digicertOrderId: ref.orderId
    });
    await persistCertificatePrivateKey(certificateId, projectId, job);
    await attachIssuedCertToSigner(job, certificateId, projectId);
  };

  const stepSyncWithCsr = async (job: TPkiSignerIssuanceJobs, kind: "acme" | "azure" | "aws-pca" | "venafi") => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(job.caId);
    if (!ca) {
      await markJobFailed(job, "Certificate authority is no longer available.");
      return;
    }
    const { projectId } = ca;
    const csr = (await decryptForProject(projectId, Buffer.from(job.encryptedCsr as Buffer))).toString();

    let certificateId: string;

    if (kind === "acme") {
      const acmeResult = await acmeFns.orderCertificateFromProfile({
        caId: job.caId,
        profileId: undefined as unknown as string,
        commonName: job.commonName,
        altNames: [],
        csr: Buffer.from(csr),
        csrPrivateKey: (await decryptForProject(projectId, Buffer.from(job.encryptedPrivateKey as Buffer))).toString(),
        keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT],
        extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
        ttl: `${job.certificateTtlDays}d`,
        signatureAlgorithm: undefined,
        keyAlgorithm: job.keyAlgorithm,
        isRenewal: false,
        originalCertificateId: undefined,
        onProgress: async () => {},
        isCancelled: async () => false
      });
      if (!acmeResult?.id) {
        throw new BadRequestError({ message: "ACME order returned without a certificate id." });
      }
      certificateId = acmeResult.id;
    } else if (kind === "azure") {
      const azureResult = await azureAdCsFns.orderCertificateFromProfile({
        caId: job.caId,
        profileId: undefined as unknown as string,
        commonName: job.commonName,
        altNames: [],
        keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT],
        extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
        validity: { ttl: `${job.certificateTtlDays}d` },
        signatureAlgorithm: undefined,
        keyAlgorithm: job.keyAlgorithm as CertKeyAlgorithm,
        isRenewal: false,
        originalCertificateId: undefined,
        csr,
        isCancelled: async () => false
      } as Parameters<typeof azureAdCsFns.orderCertificateFromProfile>[0]);
      if (!azureResult?.certificateId) {
        throw new BadRequestError({ message: "Azure AD CS order returned without a certificate id." });
      }
      certificateId = azureResult.certificateId;
    } else if (kind === "aws-pca") {
      const awsResult = await awsPcaFns.orderCertificateFromProfile({
        caId: job.caId,
        profileId: undefined as unknown as string,
        commonName: job.commonName,
        altNames: [],
        keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT],
        extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
        validity: { ttl: `${job.certificateTtlDays}d` },
        signatureAlgorithm: undefined,
        keyAlgorithm: job.keyAlgorithm as CertKeyAlgorithm,
        isRenewal: false,
        originalCertificateId: undefined,
        csr,
        isCancelled: async () => false
      });
      if (!awsResult?.certificateId) {
        throw new BadRequestError({ message: "AWS PCA order returned without a certificate id." });
      }
      certificateId = awsResult.certificateId;
    } else {
      const venafiResult = await venafiTppFns.orderCertificateFromProfile({
        caId: job.caId,
        profileId: undefined as unknown as string,
        commonName: job.commonName,
        altNames: [],
        keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT],
        extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
        validity: { ttl: `${job.certificateTtlDays}d` },
        signatureAlgorithm: undefined,
        keyAlgorithm: job.keyAlgorithm as CertKeyAlgorithm,
        isRenewal: false,
        originalCertificateId: undefined,
        csr,
        isCancelled: async () => false
      });
      if (!venafiResult?.certificateId) {
        throw new BadRequestError({ message: "Venafi TPP order returned without a certificate id." });
      }
      certificateId = venafiResult.certificateId;
    }

    await persistCertificatePrivateKey(certificateId, projectId, job);
    await attachIssuedCertToSigner(job, certificateId, projectId);
  };

  const persistCertificatePrivateKey = async (
    certificateId: string,
    projectId: string,
    job: TPkiSignerIssuanceJobs
  ) => {
    if (!job.encryptedPrivateKey) return;
    const existing = await certificateSecretDAL.findOne({ certId: certificateId });
    if (existing) {
      try {
        await certificateSecretDAL.updateById(existing.id, {
          encryptedPrivateKey: job.encryptedPrivateKey
        });
      } catch (err) {
        logger.warn(
          err,
          `signer issuance: could not replace cert_secrets private key, leaving the per-CA fn's copy in place [certificateId=${certificateId}]`
        );
      }
      return;
    }
    try {
      await certificateSecretDAL.create({
        certId: certificateId,
        encryptedPrivateKey: job.encryptedPrivateKey
      });
    } catch (err) {
      logger.warn(err, `signer issuance: could not create cert_secrets row [certificateId=${certificateId}]`);
    }
  };

  const start = () => {
    cronJob.register({
      name: CronJobName.SignerIssuancePolling,
      pattern: POLL_INTERVAL_PATTERN,
      runHashTtlS: 15 * 60,
      handler: async () => {
        const due = await signerIssuanceJobDAL.findDuePending(new Date(), POLL_BATCH);
        if (due.length === 0) return;
        logger.info(`signer-issuance-polling: picked up ${due.length} pending jobs`);
        for (const job of due) {
          try {
            await processJob(job.id);
          } catch (err) {
            logger.error(err, `signer-issuance-polling: processing job failed [jobId=${job.id}]`);
          }
        }
      }
    });
  };

  return {
    requestIssuance,
    processJob,
    start,
    _buildCsrForSigner: buildCsrForSigner
  };
};
