/* eslint-disable no-await-in-loop, @typescript-eslint/no-use-before-define, @typescript-eslint/no-unsafe-argument */
import * as x509 from "@peculiar/x509";
import { Knex } from "knex";

import { TCertificates, TPkiSignerCertificateIssuanceJobs } from "@app/db/schemas";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { crypto } from "@app/lib/crypto/cryptography";
import { buildCsrWithExternalSigner } from "@app/lib/csr/build-csr-with-external-signer";
import { BadRequestError, ConflictError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority/certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "../certificate-authority/certificate-authority-fns";
import { TCertificateIssuanceQueueFactory } from "../certificate-authority/certificate-issuance-queue";
import { DIGICERT_BOUNDED_REQUEST_TIMEOUT_MS } from "../certificate-authority/digicert/digicert-api-client";
import {
  CodeSigningOrderStatus,
  DigiCertRevocationRequestStatus
} from "../certificate-authority/digicert/digicert-certificate-authority-enums";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { TCertificateServiceFactory } from "../certificate/certificate-service";
import {
  CertExtendedKeyUsage,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertSignatureAlgorithm,
  CertStatus,
  CrlReason
} from "../certificate/certificate-types";
import { THsmConnectorServiceFactory } from "../hsm-connector/hsm-connector-service";
import { THsmConnectorServiceActor } from "../hsm-connector/hsm-connector-types";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TProjectDALFactory } from "../project/project-dal";
import { getProjectKmsCertificateKeyId } from "../project/project-fns";
import { TSignerDALFactory } from "./signer-dal";
import {
  CertKeySource,
  DigiCertLifecycleMode,
  HsmKeyAlgorithm,
  isSignerRevokedOrRevoking,
  POLLED_SIGNER_ISSUANCE_JOB_STATUSES,
  SignerIssuanceJobCancelReason,
  SignerIssuanceJobStatus,
  SignerStatus,
  TSignerCertificateRequestStatus
} from "./signer-enums";
import { formatSignerIssuanceErrorReason, isTerminalIssuanceError } from "./signer-issuance-errors";
import {
  assertDigiCertCodeSigningKey,
  buildAttachedCertificatePatch,
  getJobDigiCertRef,
  getSignerJobDigiCertOrderId,
  hsmKeyAlgorithmToCertKeyAlgorithm,
  isDigiCertPlacementInFlight,
  TDigiCertExternalOrderRef,
  verifyCodeSigningEku
} from "./signer-issuance-fns";
import { TSignerIssuanceJobDALFactory } from "./signer-issuance-job-dal";
import { SignerExternalCaConfigSchema } from "./signer-types";

const POLL_INTERVAL_PATTERN = "*/15 * * * *"; // every 15 minutes
const POLL_BATCH = 25;
const RETRY_BACKOFF_MS = 15 * 60_000;

const DIGICERT_CLOSED_ORDER_OUTCOMES: Partial<Record<CodeSigningOrderStatus, string>> = {
  [CodeSigningOrderStatus.Rejected]: "was rejected",
  [CodeSigningOrderStatus.Canceled]: "was canceled",
  [CodeSigningOrderStatus.Expired]: "expired",
  [CodeSigningOrderStatus.Revoked]: "was revoked"
};

const JOB_CANCEL_REASON_MESSAGES: Record<SignerIssuanceJobCancelReason, string> = {
  [SignerIssuanceJobCancelReason.Superseded]: "Replaced by a newer certificate request.",
  [SignerIssuanceJobCancelReason.Revoked]: "Canceled because the signer's certificate was revoked.",
  [SignerIssuanceJobCancelReason.Deleted]: "Canceled because the signer was being deleted."
};

enum IssuedCertificateOutcome {
  Attached = "attached",
  HandedToWindDown = "handed-to-wind-down",
  OwnedBySigner = "owned-by-signer",
  Unattached = "unattached"
}

// DigiCert CS orders can sit pending for up to 3 business days while DigiCert validates the org and
// waits for the verified-contact email click, so they get a longer window than synchronous CAs.
const DEFAULT_ISSUANCE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DIGICERT_ISSUANCE_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

const maxIssuanceWindowMs = (caType: string): number =>
  caType === CaType.DIGICERT ? DIGICERT_ISSUANCE_WINDOW_MS : DEFAULT_ISSUANCE_WINDOW_MS;

const maxIssuanceAttempts = (caType: string): number => Math.ceil(maxIssuanceWindowMs(caType) / RETRY_BACKOFF_MS) + 10;

const deriveDigicertSignatureParams = (
  keyAlgorithm: string
): { signatureHash: "sha256" | "sha384" | "sha512"; signatureAlgorithm: CertSignatureAlgorithm } => {
  switch (keyAlgorithm) {
    case CertKeyAlgorithm.ECDSA_P256:
      return { signatureHash: "sha256", signatureAlgorithm: CertSignatureAlgorithm.ECDSA_SHA256 };
    case CertKeyAlgorithm.ECDSA_P384:
      return { signatureHash: "sha384", signatureAlgorithm: CertSignatureAlgorithm.ECDSA_SHA384 };
    case CertKeyAlgorithm.ECDSA_P521:
      return { signatureHash: "sha512", signatureAlgorithm: CertSignatureAlgorithm.ECDSA_SHA512 };
    default:
      return { signatureHash: "sha256", signatureAlgorithm: CertSignatureAlgorithm.RSA_SHA256 };
  }
};

const DIGICERT_INSUFFICIENT_SUBSCRIPTION = "insufficient_subscription";

const buildDigiCertOrderRef = (
  orderId: number,
  certificateId: number | null,
  lifecycle: NonNullable<TDigiCertExternalOrderRef["digicert"]>["lifecycle"],
  lastStatus: string = CodeSigningOrderStatus.Pending
): TDigiCertExternalOrderRef => ({
  digicert: { orderId, certificateId, lastStatus, lastCheckedAt: new Date().toISOString(), lifecycle }
});

export type TSignerIssuanceServiceFactory = ReturnType<typeof signerIssuanceServiceFactory>;

type TCleanupOutcome = { leftover: string; canRetry: boolean } | null;

type TSignerIssuanceServiceDeps = {
  signerIssuanceJobDAL: TSignerIssuanceJobDALFactory;
  signerDAL: Pick<
    TSignerDALFactory,
    "updateUnlessRevoked" | "transaction" | "findById" | "findOne" | "findByIdForUpdate"
  >;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne" | "create" | "updateById">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithKmsKey" | "decryptWithKmsKey" | "generateKmsKey">;
  certificateIssuanceQueue: Pick<
    TCertificateIssuanceQueueFactory,
    "awsPcaFns" | "azureAdCsFns" | "adcsFns" | "digicertFns"
  >;
  cronJob: TCronJobFactory;
  hsmConnectorService: Pick<THsmConnectorServiceFactory, "generateKeyPair" | "sign" | "assertAttachPermission">;
  certificateDAL: Pick<TCertificateDALFactory, "updateById" | "findById" | "findByIdForUpdate">;
  certificateService: Pick<TCertificateServiceFactory, "revokeOwnedCertificate" | "completeOwnedCertificateRevocation">;
};

type TRequestIssuanceInput = {
  signerId: string;
  projectId: string;
  caId: string;
  commonName: string;
  certificateTtlDays: number;
  keyAlgorithm?: CertKeyAlgorithm;
  hsm?: {
    hsmConnectorId: string;
    hsmKeyAlgorithm: HsmKeyAlgorithm;
    hsmKeyLabel?: string;
    hsmKeyId?: string | null;
    hsmPublicKeySpki?: Buffer;
    actor?: Pick<THsmConnectorServiceActor, "type" | "id" | "authMethod" | "orgId">;
  };
  // DigiCert code signing only; absent means a fresh order.
  digicertLifecycle?: { mode: DigiCertLifecycleMode; previousOrderId: number };
  keepOrderId?: number;
};

export const signerIssuanceServiceFactory = ({
  signerIssuanceJobDAL,
  signerDAL,
  certificateAuthorityDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  projectDAL,
  kmsService,
  certificateIssuanceQueue,
  cronJob,
  hsmConnectorService,
  certificateDAL,
  certificateService
}: TSignerIssuanceServiceDeps) => {
  const { awsPcaFns, azureAdCsFns, adcsFns, digicertFns } = certificateIssuanceQueue;

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

  const cancelOpenRequests = async (
    signerId: string,
    cancelReason: SignerIssuanceJobCancelReason,
    { keepOrderId, leaveKeptJobPending = false }: { keepOrderId?: number; leaveKeptJobPending?: boolean },
    tx: Knex
  ) => {
    await signerDAL.findByIdForUpdate(signerId, tx);
    const pendingJobs = await signerIssuanceJobDAL.findPendingForSignerForUpdate(signerId, tx);
    const now = Date.now();
    if (
      cancelReason !== SignerIssuanceJobCancelReason.Revoked &&
      pendingJobs.some((job) => isDigiCertPlacementInFlight(job, now))
    ) {
      throw new ConflictError({
        message: "The open certificate request is placing its DigiCert order right now. Try again in a few minutes."
      });
    }
    const keptJobIds = pendingJobs
      .filter((job) => keepOrderId !== undefined && getSignerJobDigiCertOrderId(job) === keepOrderId)
      .map((job) => job.id);
    const reason = JOB_CANCEL_REASON_MESSAGES[cancelReason];
    if (!leaveKeptJobPending) {
      await signerIssuanceJobDAL.closePending(
        { jobIds: keptJobIds, status: SignerIssuanceJobStatus.Cancelled, cancelReason, reason },
        tx
      );
    }
    await signerIssuanceJobDAL.closePending(
      {
        jobIds: pendingJobs.map((job) => job.id).filter((jobId) => !keptJobIds.includes(jobId)),
        status: SignerIssuanceJobStatus.Cancelling,
        cancelReason,
        reason
      },
      tx
    );
    return pendingJobs;
  };

  const $startJob = (job: TPkiSignerCertificateIssuanceJobs) => {
    void (async () => {
      try {
        await processJob(job.id);
      } catch (err) {
        logger.warn(
          err,
          `signer issuance: first attempt failed, cron will retry [jobId=${job.id}] [signerId=${job.signerId}]`
        );
      }
    })();
    return job;
  };

  const $createPendingJob = async (
    input: TRequestIssuanceInput,
    caType: string,
    job: Omit<
      Parameters<typeof signerIssuanceJobDAL.create>[0],
      "signerId" | "caId" | "caType" | "status" | "commonName" | "certificateTtlDays" | "nextPollAt"
    >
  ) => {
    const created = await signerIssuanceJobDAL.transaction(async (tx) => {
      const lockedSigner = await signerDAL.findByIdForUpdate(input.signerId, tx);
      if (!lockedSigner) throw new NotFoundError({ message: `Signer with ID '${input.signerId}' not found` });
      if (isSignerRevokedOrRevoking(lockedSigner.status)) {
        throw new BadRequestError({
          message: `Signer '${lockedSigner.name}' is revoked or being revoked, so it can't request a new certificate. Reissue it once the revoke finishes.`
        });
      }
      await cancelOpenRequests(
        input.signerId,
        SignerIssuanceJobCancelReason.Superseded,
        { keepOrderId: input.keepOrderId },
        tx
      );
      return signerIssuanceJobDAL.create(
        {
          signerId: input.signerId,
          caId: input.caId,
          caType,
          status: SignerIssuanceJobStatus.Pending,
          commonName: input.commonName,
          certificateTtlDays: input.certificateTtlDays,
          nextPollAt: new Date(),
          ...job
        },
        tx
      );
    });
    return $startJob(created);
  };

  const requestIssuance = async (input: TRequestIssuanceInput): Promise<TPkiSignerCertificateIssuanceJobs> => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(input.caId);
    if (!ca || ca.projectId !== input.projectId) {
      throw new BadRequestError({
        message: `Certificate authority '${input.caId}' is not in this organization.`
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

    if (caType === CaType.DIGICERT) {
      assertDigiCertCodeSigningKey({
        isHsm: Boolean(input.hsm),
        keyAlgorithm: input.hsm
          ? hsmKeyAlgorithmToCertKeyAlgorithm(input.hsm.hsmKeyAlgorithm)
          : (input.keyAlgorithm ?? CertKeyAlgorithm.RSA_2048)
      });
    }

    if (input.hsm) {
      if (input.hsm.actor) {
        await hsmConnectorService.assertAttachPermission(input.hsm.actor, input.hsm.hsmConnectorId, input.projectId);
      }
      const reuseExistingKey = Boolean(input.hsm.hsmKeyLabel && input.hsm.hsmPublicKeySpki);
      let keyLabel: string;
      let keyId: string | null;
      let publicKeySpkiDer: Buffer;
      if (reuseExistingKey) {
        keyLabel = input.hsm.hsmKeyLabel as string;
        keyId = input.hsm.hsmKeyId ?? null;
        publicKeySpkiDer = Buffer.from(input.hsm.hsmPublicKeySpki as Buffer);
      } else {
        const keyLabelSuffix = `signer-${crypto.nativeCrypto.randomUUID()}`;
        const generated = await hsmConnectorService.generateKeyPair({
          connectorId: input.hsm.hsmConnectorId,
          projectId: input.projectId,
          keyLabel: keyLabelSuffix,
          keyAlgorithm: input.hsm.hsmKeyAlgorithm
        });
        keyLabel = generated.keyLabel;
        keyId = generated.keyId;
        publicKeySpkiDer = generated.publicKeySpkiDer;
      }
      const built = await buildCsrWithExternalSigner({
        publicKeySpkiDer,
        keyAlgorithm: input.hsm.hsmKeyAlgorithm,
        subjectCommonName: input.commonName,
        signCallback: async (tbs, mech, isDigest) =>
          hsmConnectorService.sign({
            connectorId: input.hsm!.hsmConnectorId,
            projectId: input.projectId,
            keyLabel,
            keyId,
            publicKeySpki: publicKeySpkiDer,
            mechanism: mech,
            data: tbs,
            isDigest
          })
      });

      return $createPendingJob(input, caType, {
        keyAlgorithm: hsmKeyAlgorithmToCertKeyAlgorithm(input.hsm.hsmKeyAlgorithm),
        encryptedCsr: await encryptForProject(input.projectId, Buffer.from(built.csrPem)),
        encryptedPrivateKey: null,
        keySource: CertKeySource.Hsm,
        hsmConnectorId: input.hsm.hsmConnectorId,
        hsmKeyLabel: keyLabel,
        hsmKeyId: keyId,
        hsmPublicKeySpki: publicKeySpkiDer,
        externalOrderRef: input.digicertLifecycle ? { digicert: { lifecycle: input.digicertLifecycle } } : undefined
      });
    }

    const keyAlgorithm: CertKeyAlgorithm = input.keyAlgorithm ?? CertKeyAlgorithm.RSA_2048;
    const { csrPem, privateKeyPem } = await buildCsrForSigner(input.commonName, keyAlgorithm);

    return $createPendingJob(input, caType, {
      keyAlgorithm,
      encryptedCsr: await encryptForProject(input.projectId, Buffer.from(csrPem)),
      encryptedPrivateKey: await encryptForProject(input.projectId, Buffer.from(privateKeyPem)),
      maxAttempts: maxIssuanceAttempts(caType)
    });
  };

  const processJob = async (jobId: string): Promise<void> => {
    const snapshot = await signerIssuanceJobDAL.findById(jobId);
    if (!snapshot) {
      logger.warn(`signer issuance: job ${jobId} not found, skipping`);
      return;
    }
    if (!POLLED_SIGNER_ISSUANCE_JOB_STATUSES.includes(snapshot.status as SignerIssuanceJobStatus)) return;

    const now = new Date();

    const windowMs = maxIssuanceWindowMs(snapshot.caType);
    const ageMs = now.getTime() - new Date(snapshot.createdAt).getTime();
    if (snapshot.status === SignerIssuanceJobStatus.Pending && ageMs > windowMs) {
      const hours = Math.round(windowMs / (60 * 60 * 1000));
      await markJobFailed(
        snapshot,
        `Signer issuance was pending for more than ${hours} hours. The upstream Certificate Authority never finished issuing the certificate; abandoning.`,
        { cancelOpenOrder: true }
      );
      return;
    }

    if (isDigiCertPlacementInFlight(snapshot, now.getTime())) {
      logger.info(
        `signer issuance: DigiCert order placement already in flight, skipping [jobId=${snapshot.id}] [signerId=${snapshot.signerId}]`
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

    if (job.status === SignerIssuanceJobStatus.Cancelling) {
      await $windDownCancellingJob(job, { wasAttempted: Boolean(snapshot.lastAttemptAt) });
      return;
    }

    if (job.attempts > job.maxAttempts) {
      await markJobFailed(
        job,
        `Signer issuance exhausted after ${job.maxAttempts} attempts. Last attempt at ${now.toISOString()}.`,
        { cancelOpenOrder: true }
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
        case CaType.AZURE_AD_CS:
          await stepSyncWithCsr(job, CaType.AZURE_AD_CS);
          break;
        case CaType.ADCS:
          await stepSyncWithCsr(job, CaType.ADCS);
          break;
        case CaType.AWS_PCA:
          await stepSyncWithCsr(job, CaType.AWS_PCA);
          break;
        case CaType.DIGICERT:
          await stepSyncWithDigiCert(job);
          break;
        default:
          await markJobFailed(
            job,
            `CA type '${job.caType}' is not supported for code signing. Choose Internal CA, AWS Private CA, Azure AD CS, Active Directory Certificate Service, or DigiCert.`
          );
      }
    } catch (err) {
      const reason = formatSignerIssuanceErrorReason(
        err,
        "External Certificate Authority refused to issue the signer certificate"
      );
      if (isTerminalIssuanceError(err)) {
        await markJobFailed(job, reason);
        logger.error(
          err,
          `signer issuance: terminal failure, not retrying [jobId=${job.id}] [signerId=${job.signerId}]`
        );
        return;
      }
      await signerDAL.transaction(async (tx) => {
        const lockedSigner = await signerDAL.findByIdForUpdate(job.signerId, tx);
        const rows = await signerIssuanceJobDAL.update(
          { id: job.id, status: SignerIssuanceJobStatus.Pending },
          {
            nextPollAt: new Date(Date.now() + RETRY_BACKOFF_MS),
            failureReason: reason
          },
          tx
        );
        if (rows.length > 0) {
          await $recordSignerIssuanceFailure(lockedSigner, SignerStatus.Pending, reason, tx);
        }
      });
      logger.error(
        err,
        `signer issuance: attempt failed, will retry [jobId=${job.id}] [signerId=${job.signerId}] [attempts=${job.attempts}/${job.maxAttempts}]`
      );
    }
  };

  const $recordSignerIssuanceFailure = async (
    lockedSigner: Awaited<ReturnType<typeof signerDAL.findByIdForUpdate>>,
    status: SignerStatus.Pending | SignerStatus.Failed,
    reason: string,
    tx: Knex
  ) => {
    if (!lockedSigner) return;
    const isAwaitingCertificate =
      lockedSigner.status === SignerStatus.Pending || lockedSigner.status === SignerStatus.Failed;
    await signerDAL.updateUnlessRevoked(
      lockedSigner.id,
      isAwaitingCertificate ? { status, certificateFailureReason: reason } : { certificateFailureReason: reason },
      tx
    );
  };

  const markJobFailed = async (
    job: TPkiSignerCertificateIssuanceJobs,
    reason: string,
    { cancelOpenOrder = false }: { cancelOpenOrder?: boolean } = {}
  ) => {
    const openOrderId = cancelOpenOrder && job.caType === CaType.DIGICERT ? getJobDigiCertRef(job)?.orderId : undefined;
    const isOrderLeftOpen = Boolean(openOrderId) && !(await $cancelDigiCertOrder(job, openOrderId as number));
    const trimmed = (
      isOrderLeftOpen
        ? `${reason} Cancel DigiCert order #${openOrderId} in CertCentral so it isn't issued later.`
        : reason
    ).slice(0, 1000);
    const markedFailed = await signerDAL.transaction(async (tx) => {
      const lockedSigner = await signerDAL.findByIdForUpdate(job.signerId, tx);
      const rows = await signerIssuanceJobDAL.update(
        { id: job.id, status: SignerIssuanceJobStatus.Pending },
        { status: SignerIssuanceJobStatus.Failed, failureReason: trimmed },
        tx
      );
      if (rows.length === 0) return false;
      await $recordSignerIssuanceFailure(lockedSigner, SignerStatus.Failed, trimmed, tx);
      return true;
    });
    if (!markedFailed) return;
    logger.info(
      `signer issuance: job marked Failed [jobId=${job.id}] [signerId=${job.signerId}] [reason=${trimmed.slice(0, 200)}]`
    );
  };

  const revokeAtCa = async (
    certificate: Pick<TCertificates, "id" | "caId" | "serialNumber">,
    revocationReason: CrlReason,
    orgId: string
  ): Promise<{ caRequestId?: number; crlWarning?: string }> => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(certificate.caId as string);
    if (ca?.externalCa?.type === CaType.DIGICERT) {
      const caRequestId = await digicertFns.revokeCertificate({
        caId: ca.id,
        serialNumber: certificate.serialNumber,
        reason: revocationReason,
        allowPendingApproval: true
      });
      if (caRequestId) return { caRequestId };
      await certificateService.completeOwnedCertificateRevocation({
        certificateId: certificate.id,
        revocationReason,
        orgId
      });
      return {};
    }
    const { crlWarning } = await certificateService.revokeOwnedCertificate({
      certificateId: certificate.id,
      revocationReason,
      orgId
    });
    return { crlWarning };
  };

  const $pendingRevocationLeftover = (requestId: number, serialNumber: string) =>
    `DigiCert revocation request #${requestId} for the certificate with serial number ${serialNumber} is waiting for approval. Approve it in CertCentral`;

  const $submitOrphanedCertificateRevocation = async (certificateId: string) => {
    const cert = await certificateDAL.findById(certificateId);
    if (!cert || cert.status === CertStatus.REVOKED) return null;
    try {
      const project = await projectDAL.findOne({ id: cert.projectId });
      const { caRequestId } = await revokeAtCa(cert, CrlReason.CESSATION_OF_OPERATION, project.orgId);
      return caRequestId ? { caRequestId, leftover: $pendingRevocationLeftover(caRequestId, cert.serialNumber) } : null;
    } catch (err) {
      const recheckedCert = await certificateDAL.findById(certificateId);
      if (recheckedCert?.status === CertStatus.REVOKED) return null;
      logger.error(err, `signer issuance: failed to revoke unattached certificate [certificateId=${certificateId}]`);
      return {
        caRequestId: undefined,
        leftover: `the certificate with serial number ${cert.serialNumber} couldn't be revoked. Revoke it with the certificate authority`
      };
    }
  };

  const revokeUnattachedCertificate = async (certificateId: string) =>
    (await $submitOrphanedCertificateRevocation(certificateId))?.leftover ?? null;

  const $isOwnedBySigner = async (certificateId: string) =>
    Boolean(await signerDAL.transaction((tx) => signerDAL.findOne({ certificateId }, tx)));

  const $revokeUnlessOwned = async (certificateId: string) =>
    (await $isOwnedBySigner(certificateId)) ? null : revokeUnattachedCertificate(certificateId);

  const $windDownJobCertificate = async (
    job: TPkiSignerCertificateIssuanceJobs,
    certificateId: string
  ): Promise<TCleanupOutcome> => {
    if (await $isOwnedBySigner(certificateId)) return null;
    const digicertRef = getJobDigiCertRef(job);
    const requestId = digicertRef?.revocationRequestId;
    if (!requestId) {
      const submitted = await $submitOrphanedCertificateRevocation(certificateId);
      if (submitted?.caRequestId) {
        await signerIssuanceJobDAL.update(
          { id: job.id, status: SignerIssuanceJobStatus.Cancelling },
          { externalOrderRef: { digicert: { ...digicertRef, revocationRequestId: submitted.caRequestId } } }
        );
      }
      return submitted ? { leftover: submitted.leftover, canRetry: true } : null;
    }
    const cert = await certificateDAL.findById(certificateId);
    if (!cert || cert.status === CertStatus.REVOKED) return null;
    const requestStatus = await digicertFns.getRevocationRequestStatus({ caId: cert.caId as string, requestId });
    if (requestStatus === DigiCertRevocationRequestStatus.Approved) {
      const project = await projectDAL.findOne({ id: cert.projectId });
      await certificateService.completeOwnedCertificateRevocation({
        certificateId,
        revocationReason: CrlReason.CESSATION_OF_OPERATION,
        orgId: project.orgId
      });
      return null;
    }
    if (requestStatus === DigiCertRevocationRequestStatus.Rejected) {
      return {
        leftover: `DigiCert rejected revocation request #${requestId} for the certificate with serial number ${cert.serialNumber}. Revoke it in CertCentral`,
        canRetry: false
      };
    }
    return { leftover: $pendingRevocationLeftover(requestId, cert.serialNumber), canRetry: true };
  };

  const $isIssuedForJob = async (certificateId: string, job: TPkiSignerCertificateIssuanceJobs) => {
    const cert = await certificateDAL.findById(certificateId);
    const jobCreatedAt = new Date(job.createdAt).getTime();
    return (
      Boolean(cert) &&
      (new Date(cert.notBefore).getTime() >= jobCreatedAt || new Date(cert.createdAt).getTime() >= jobCreatedAt)
    );
  };

  const $digiCertOrderLeftover = (orderId: number): TCleanupOutcome => ({
    leftover: `DigiCert order #${orderId} for this signer couldn't be canceled. Cancel it in CertCentral`,
    canRetry: true
  });

  const $cleanUpCancellingJob = async (
    job: TPkiSignerCertificateIssuanceJobs,
    wasAttempted: boolean
  ): Promise<TCleanupOutcome> => {
    if (job.certificateId) return $windDownJobCertificate(job, job.certificateId);
    if (job.caType !== CaType.DIGICERT) return null;

    const digicert = getJobDigiCertRef(job);
    const orderId = digicert?.orderId;
    if (!orderId) {
      if (!wasAttempted) return null;
      const uncancelledOrder = await $cancelUnplacedDigiCertOrder(job, digicert?.lifecycle);
      return uncancelledOrder ? $digiCertOrderLeftover(uncancelledOrder.orderId) : null;
    }

    const info = await digicertFns.getCodeSigningOrderStatus(job.caId, orderId);
    if (DIGICERT_CLOSED_ORDER_OUTCOMES[info.status]) return null;
    if (info.status !== CodeSigningOrderStatus.Issued) {
      return (await $cancelDigiCertOrder(job, orderId)) ? null : $digiCertOrderLeftover(orderId);
    }
    if (!info.certificateId) return $digiCertOrderLeftover(orderId);

    const { certificateId } = await digicertFns.downloadCodeSigningCertificate({
      caId: job.caId,
      orderId,
      digicertCertificateId: info.certificateId,
      keyAlgorithm: job.keyAlgorithm,
      signatureAlgorithm: deriveDigicertSignatureParams(job.keyAlgorithm).signatureAlgorithm
    });
    if (!(await $isIssuedForJob(certificateId, job))) return null;
    await signerIssuanceJobDAL.update({ id: job.id, status: SignerIssuanceJobStatus.Cancelling }, { certificateId });
    return $windDownJobCertificate(job, certificateId);
  };

  const $windDownCancellingJob = async (
    job: TPkiSignerCertificateIssuanceJobs,
    { wasAttempted }: { wasAttempted: boolean }
  ) => {
    let outcome: TCleanupOutcome;
    try {
      outcome = await $cleanUpCancellingJob(job, wasAttempted);
    } catch (err) {
      logger.error(
        err,
        `signer issuance: cleaning up a canceled request failed [jobId=${job.id}] [signerId=${job.signerId}]`
      );
      const orderId = getSignerJobDigiCertOrderId(job);
      outcome = orderId
        ? $digiCertOrderLeftover(orderId)
        : {
            leftover:
              "the certificate authority couldn't be reached to clean it up. Check the certificate authority for a certificate issued for this signer",
            canRetry: true
          };
    }
    if (outcome?.canRetry && job.attempts <= job.maxAttempts) return;
    const leftover = outcome?.leftover;
    await signerIssuanceJobDAL.update(
      { id: job.id, status: SignerIssuanceJobStatus.Cancelling },
      {
        status: SignerIssuanceJobStatus.Cancelled,
        ...(leftover ? { failureReason: `This request was canceled, but ${leftover}.`.slice(0, 1000) } : {})
      }
    );
    logger.info(
      `signer issuance: canceled request closed [jobId=${job.id}] [signerId=${job.signerId}] [leftover=${leftover ?? "none"}]`
    );
  };

  const attachIssuedCertToSigner = async (
    job: TPkiSignerCertificateIssuanceJobs,
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

    const isHsmJob = job.keySource === CertKeySource.Hsm && job.hsmConnectorId && job.hsmKeyLabel;
    // The signer may carry a placeholder CN (reissuing into a DigiCert order whose subject DigiCert
    // owns), so the issued cert is the source of truth for the common name.
    const issuedCert = await certificateDAL.findById(certificateId);
    let outcome: IssuedCertificateOutcome;
    try {
      outcome = await signerDAL.transaction(async (tx) => {
        const lockedSigner = await signerDAL.findByIdForUpdate(job.signerId, tx);
        const completedJob = await signerIssuanceJobDAL.completeIfPending(job.id, certificateId, tx);
        if (!completedJob) {
          const [handedOver] = await signerIssuanceJobDAL.update(
            { id: job.id, status: SignerIssuanceJobStatus.Cancelling },
            { certificateId },
            tx
          );
          if (handedOver) return IssuedCertificateOutcome.HandedToWindDown;
          await certificateDAL.findByIdForUpdate(certificateId, tx);
          return (await signerDAL.findOne({ certificateId }, tx))
            ? IssuedCertificateOutcome.OwnedBySigner
            : IssuedCertificateOutcome.Unattached;
        }
        await certificateDAL.findByIdForUpdate(certificateId, tx);
        const signerUsingCertificate = await signerDAL.findOne({ certificateId }, tx);
        if (signerUsingCertificate && signerUsingCertificate.id !== job.signerId) {
          throw new ConflictError({
            message: `The issued certificate is already used by signer '${signerUsingCertificate.name}'.`
          });
        }
        if (isHsmJob) {
          const certAlg = job.keyAlgorithm as CertKeyAlgorithm;
          await certificateDAL.updateById(
            certificateId,
            {
              keySource: CertKeySource.Hsm,
              hsmConnectorId: job.hsmConnectorId,
              hsmKeyLabel: job.hsmKeyLabel,
              hsmKeyId: job.hsmKeyId ?? null,
              hsmPublicKeySpki: job.hsmPublicKeySpki ?? null,
              keyAlgorithm: certAlg
            },
            tx
          );
        }
        const attached = await signerDAL.updateUnlessRevoked(
          job.signerId,
          {
            ...buildAttachedCertificatePatch(lockedSigner?.status, certificateId),
            ...(issuedCert?.commonName ? { commonName: issuedCert.commonName } : {})
          },
          tx
        );
        if (!attached)
          throw new BadRequestError({
            message: "The signer was revoked or deleted before its certificate was issued."
          });
        return IssuedCertificateOutcome.Attached;
      });
    } catch (txErr) {
      const reason = formatSignerIssuanceErrorReason(
        txErr,
        isHsmJob
          ? "Failed to atomically record HSM coordinates and attach the certificate to the signer"
          : "Failed to attach the issued certificate to the signer"
      );
      await markJobFailed(job, reason);
      return;
    }
    if (outcome === IssuedCertificateOutcome.Unattached) {
      const leftover = await $revokeUnlessOwned(certificateId);
      if (leftover) {
        await signerIssuanceJobDAL.update(
          { id: job.id },
          { failureReason: `This request was closed, but ${leftover}.`.slice(0, 1000) }
        );
      }
    }
    logger.info(
      `signer issuance: issued certificate handled [outcome=${outcome}] [jobId=${job.id}] [signerId=${job.signerId}] [certificateId=${certificateId}]`
    );
  };

  const stepSyncWithCsr = async (
    job: TPkiSignerCertificateIssuanceJobs,
    kind: CaType.AZURE_AD_CS | CaType.ADCS | CaType.AWS_PCA
  ) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(job.caId);
    if (!ca) {
      await markJobFailed(job, "Certificate authority is no longer available.");
      return;
    }
    const { projectId } = ca;
    const csr = (await decryptForProject(projectId, Buffer.from(job.encryptedCsr as Buffer))).toString();

    let certificateId: string;

    if (kind === CaType.AZURE_AD_CS) {
      if (job.keySource === CertKeySource.Hsm) {
        throw new BadRequestError({
          message:
            "HSM-backed signers are not supported with Azure AD CS yet. Use AWS Private CA, or switch the signer's key source to Infisical."
        });
      }
      const azureResult = await azureAdCsFns.orderCertificate({
        caId: job.caId,
        commonName: job.commonName,
        altNames: [],
        keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT],
        extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
        validity: { ttl: `${job.certificateTtlDays}d` },
        keyAlgorithm: job.keyAlgorithm as CertKeyAlgorithm,
        csr,
        isRenewal: false,
        isCancelled: async () => false
      });
      if (!azureResult?.certificateId) {
        throw new BadRequestError({ message: "Azure AD CS order returned without a certificate id." });
      }
      certificateId = azureResult.certificateId;
    } else if (kind === CaType.ADCS) {
      if (job.keySource === CertKeySource.Hsm) {
        throw new BadRequestError({
          message:
            "HSM-backed signers are not supported with Active Directory Certificate Service yet. Use AWS Private CA, or switch the signer's key source to Infisical."
        });
      }
      const signer = await signerDAL.transaction((tx) => signerDAL.findById(job.signerId, tx));
      const externalCaConfig = SignerExternalCaConfigSchema.safeParse(signer?.externalCaConfig);
      const adcsTemplate =
        externalCaConfig.success && externalCaConfig.data.caType === CaType.ADCS
          ? externalCaConfig.data.template
          : undefined;
      const adcsResult = await adcsFns.orderCertificate({
        caId: job.caId,
        commonName: job.commonName,
        altNames: [],
        keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT],
        extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
        validity: { ttl: `${job.certificateTtlDays}d` },
        keyAlgorithm: job.keyAlgorithm as CertKeyAlgorithm,
        template: adcsTemplate,
        csr,
        isRenewal: false,
        isCancelled: async () => false
      });
      if (!adcsResult?.certificateId) {
        throw new BadRequestError({
          message: "Active Directory Certificate Service order returned without a certificate id."
        });
      }
      certificateId = adcsResult.certificateId;
    } else {
      const awsResult = await awsPcaFns.orderCertificate({
        caId: job.caId,
        idempotencyKey: job.id,
        commonName: job.commonName,
        altNames: [],
        keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT],
        extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING],
        validity: { ttl: `${job.certificateTtlDays}d` },
        keyAlgorithm: job.keyAlgorithm as CertKeyAlgorithm,
        isRenewal: false,
        csr,
        isCancelled: async () => false
      });
      if (!awsResult?.certificateId) {
        throw new BadRequestError({ message: "AWS PCA order returned without a certificate id." });
      }
      certificateId = awsResult.certificateId;
    }

    await persistCertificatePrivateKey(certificateId, projectId, job);
    await attachIssuedCertToSigner(job, certificateId, projectId);
  };

  const $cancelDigiCertOrder = async (job: TPkiSignerCertificateIssuanceJobs, orderId: number) => {
    const isCancelled = await digicertFns.cancelReissue({
      caId: job.caId,
      orderId,
      requestTimeoutMs: DIGICERT_BOUNDED_REQUEST_TIMEOUT_MS
    });
    if (!isCancelled) {
      logger.warn(
        `signer issuance: DigiCert order ${orderId} could not be canceled [jobId=${job.id}] [signerId=${job.signerId}]`
      );
    }
    return isCancelled;
  };

  const $cancelUnplacedDigiCertOrder = async (
    job: TPkiSignerCertificateIssuanceJobs,
    lifecycle: NonNullable<TDigiCertExternalOrderRef["digicert"]>["lifecycle"]
  ) => {
    if (lifecycle?.mode === DigiCertLifecycleMode.Reissue) {
      return (await $cancelDigiCertOrder(job, lifecycle.previousOrderId))
        ? null
        : { orderId: lifecycle.previousOrderId, certificateId: null };
    }
    const recovered = await digicertFns.findCodeSigningOrderByReference(job.caId, `infisical-signer-job-${job.id}`);
    if (recovered && !(await $cancelDigiCertOrder(job, recovered.orderId))) return recovered;
    return null;
  };

  const stepSyncWithDigiCert = async (job: TPkiSignerCertificateIssuanceJobs) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(job.caId);
    if (!ca) {
      await markJobFailed(job, "Certificate authority is no longer available.");
      return;
    }
    const { projectId } = ca;

    const digicertRef = getJobDigiCertRef(job);
    const existingOrderId = digicertRef?.orderId;
    const lifecycle = digicertRef?.lifecycle;

    const persistPlacedOrder = async (
      orderId: number,
      certificateId: number | null,
      placedLifecycle: typeof lifecycle = lifecycle
    ) => {
      const externalOrderRef = buildDigiCertOrderRef(orderId, certificateId, placedLifecycle);
      const [savedJob] = await signerIssuanceJobDAL.update(
        { id: job.id, $in: { status: POLLED_SIGNER_ISSUANCE_JOB_STATUSES } },
        { externalOrderRef }
      );
      if (savedJob) {
        logger.info(
          `signer issuance: DigiCert order placed [jobId=${job.id}] [signerId=${job.signerId}] [orderId=${orderId}] [jobStatus=${savedJob.status}]`
        );
        return;
      }
      if (await $cancelDigiCertOrder(job, orderId)) return;
      await signerIssuanceJobDAL.updateById(job.id, {
        externalOrderRef,
        failureReason: `This request was closed while DigiCert order #${orderId} was being placed, and the order couldn't be canceled. Cancel it in CertCentral.`
      });
      logger.warn(
        `signer issuance: DigiCert order placed for a closed job could not be canceled, recorded on the job [jobId=${job.id}] [signerId=${job.signerId}] [orderId=${orderId}]`
      );
    };

    if (!existingOrderId) {
      const csr = (await decryptForProject(projectId, Buffer.from(job.encryptedCsr as Buffer))).toString();
      const comments = `Issued via Infisical signer ${job.signerId}`;
      const { signatureHash } = deriveDigicertSignatureParams(job.keyAlgorithm);

      if (lifecycle?.mode === DigiCertLifecycleMode.Reissue) {
        const placed = await digicertFns.reissueCodeSigningCertificate({
          caId: job.caId,
          previousOrderId: lifecycle.previousOrderId,
          csr,
          signatureHash,
          comments
        });
        await persistPlacedOrder(placed.orderId, placed.certificateId);
        return;
      }

      // The alternative_order_id is deterministic per job, so placement is idempotent: if a prior
      // tick placed the order but crashed before persisting it, recover it instead of placing a
      // second (billable) order.
      const placementRef = `infisical-signer-job-${job.id}`;
      const recovered = await digicertFns.findCodeSigningOrderByReference(job.caId, placementRef);
      if (recovered) {
        logger.info(
          `signer issuance: recovered previously-placed DigiCert order [jobId=${job.id}] [orderId=${recovered.orderId}]`
        );
        await persistPlacedOrder(recovered.orderId, recovered.certificateId);
        return;
      }

      let placed: { orderId: number; certificateId: number | null };
      let placedLifecycle = lifecycle;
      if (lifecycle?.mode === DigiCertLifecycleMode.Renew) {
        try {
          placed = await digicertFns.orderCodeSigningCertificate({
            caId: job.caId,
            csr,
            commonName: job.commonName,
            signatureHash,
            ttlDays: job.certificateTtlDays,
            renewalOfOrderId: lifecycle.previousOrderId,
            alternativeOrderId: placementRef,
            comments
          });
        } catch (err) {
          if (!(err as Error)?.message?.includes(DIGICERT_INSUFFICIENT_SUBSCRIPTION)) throw err;
          logger.info(
            `signer issuance: DigiCert renewal had no free subscription slot; reissuing into prior order [jobId=${job.id}] [orderId=${lifecycle.previousOrderId}]`
          );
          placed = await digicertFns.reissueCodeSigningCertificate({
            caId: job.caId,
            previousOrderId: lifecycle.previousOrderId,
            csr,
            signatureHash,
            comments
          });
          placedLifecycle = { mode: DigiCertLifecycleMode.Reissue, previousOrderId: lifecycle.previousOrderId };
        }
      } else {
        placed = await digicertFns.orderCodeSigningCertificate({
          caId: job.caId,
          csr,
          commonName: job.commonName,
          signatureHash,
          ttlDays: job.certificateTtlDays,
          alternativeOrderId: placementRef,
          comments
        });
      }
      await persistPlacedOrder(placed.orderId, placed.certificateId, placedLifecycle);
      return;
    }

    const info = await digicertFns.getCodeSigningOrderStatus(job.caId, existingOrderId);
    await signerIssuanceJobDAL.updateById(job.id, {
      externalOrderRef: buildDigiCertOrderRef(existingOrderId, info.certificateId, lifecycle, info.status)
    });

    const closedOrderOutcome = DIGICERT_CLOSED_ORDER_OUTCOMES[info.status];
    if (closedOrderOutcome) {
      await markJobFailed(
        job,
        `DigiCert order #${existingOrderId} ${closedOrderOutcome}, so no certificate was issued.`
      );
      return;
    }

    if (info.status !== CodeSigningOrderStatus.Issued) {
      logger.info(
        `signer issuance: DigiCert order still pending [jobId=${job.id}] [signerId=${job.signerId}] [orderId=${existingOrderId}] [status=${info.status}]`
      );
      return;
    }

    if (!info.certificateId) {
      logger.warn(
        `signer issuance: DigiCert reports issued but no certificate id yet — will retry [jobId=${job.id}] [orderId=${existingOrderId}]`
      );
      return;
    }

    const { signatureAlgorithm } = deriveDigicertSignatureParams(job.keyAlgorithm);
    const { certificateId } = await digicertFns.downloadCodeSigningCertificate({
      caId: job.caId,
      orderId: existingOrderId,
      digicertCertificateId: info.certificateId,
      keyAlgorithm: job.keyAlgorithm,
      signatureAlgorithm
    });
    if (!(await $isIssuedForJob(certificateId, job))) {
      await markJobFailed(
        job,
        `DigiCert order #${existingOrderId} still holds its earlier certificate, so the reissue was canceled or rejected in CertCentral. Request the certificate again.`
      );
      return;
    }

    await persistCertificatePrivateKey(certificateId, projectId, job);
    await attachIssuedCertToSigner(job, certificateId, projectId);
  };

  const persistCertificatePrivateKey = async (
    certificateId: string,
    projectId: string,
    job: TPkiSignerCertificateIssuanceJobs
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
        const due = await signerIssuanceJobDAL.findDuePolled(new Date(), POLL_BATCH);
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

  const getLatestIssuanceRequest = async (signerId: string, tx?: Knex) => {
    const job = await signerIssuanceJobDAL.findLatestForSigner(signerId, tx);
    if (!job) return null;
    const digicert = getJobDigiCertRef(job);
    return {
      keySource: job.keySource as CertKeySource,
      keyAlgorithm: job.keyAlgorithm as CertKeyAlgorithm,
      hsmConnectorId: job.hsmConnectorId ?? null,
      hsmKeyLabel: job.hsmKeyLabel ?? null,
      hsmKeyId: job.hsmKeyId ?? null,
      hsmPublicKeySpki: job.hsmPublicKeySpki ?? null,
      status:
        job.status === SignerIssuanceJobStatus.Cancelling
          ? SignerIssuanceJobStatus.Cancelled
          : (job.status as TSignerCertificateRequestStatus),
      failureReason: job.failureReason ?? null,
      externalOrder:
        digicert?.orderId != null
          ? { provider: CaType.DIGICERT, orderId: digicert.orderId, status: digicert.lastStatus ?? null }
          : null
    };
  };

  const cancelPendingDigiCertReissue = async (signerId: string): Promise<number | undefined> => {
    const pendingJobs = await signerIssuanceJobDAL.transaction((tx) =>
      signerIssuanceJobDAL.find({ signerId, status: SignerIssuanceJobStatus.Pending }, { tx })
    );
    const reissueJob = pendingJobs.find((job) => {
      const digicert = getJobDigiCertRef(job);
      return (
        job.caType === CaType.DIGICERT &&
        digicert?.orderId &&
        digicert.lifecycle?.mode === DigiCertLifecycleMode.Reissue
      );
    });
    const orderId = reissueJob ? getSignerJobDigiCertOrderId(reissueJob) : undefined;
    if (!reissueJob || !orderId) return undefined;
    if (!(await $cancelDigiCertOrder(reissueJob, orderId))) {
      throw new BadRequestError({
        message: `DigiCert can't revoke this certificate while a reissue is pending on order #${orderId}, and the reissue couldn't be canceled. Cancel it in CertCentral, then revoke again.`
      });
    }
    return orderId;
  };

  const cleanUpRequestsBeforeDelete = async (signerId: string) => {
    const { unfinishedJobs, signerStatus } = await signerIssuanceJobDAL.transaction(async (tx) => {
      const lockedSigner = await signerDAL.findByIdForUpdate(signerId, tx);
      const jobs = await signerIssuanceJobDAL.find(
        { signerId, $in: { status: POLLED_SIGNER_ISSUANCE_JOB_STATUSES } },
        { tx }
      );
      const now = Date.now();
      if (jobs.some((job) => isDigiCertPlacementInFlight(job, now))) {
        throw new BadRequestError({
          message:
            "A certificate request for this signer is placing a DigiCert order right now. Try again in a few minutes."
        });
      }
      await cancelOpenRequests(signerId, SignerIssuanceJobCancelReason.Deleted, {}, tx);
      return { unfinishedJobs: jobs, signerStatus: lockedSigner?.status };
    });
    for (const job of unfinishedJobs) {
      const outcome = await $cleanUpCancellingJob(job, Boolean(job.lastAttemptAt));
      if (outcome) {
        const message = `${outcome.leftover.charAt(0).toUpperCase()}${outcome.leftover.slice(1)}, then delete the signer again.`;
        if (signerStatus === SignerStatus.Pending) {
          await signerDAL.updateUnlessRevoked(signerId, {
            status: SignerStatus.Failed,
            certificateFailureReason: message
          });
        }
        throw new BadRequestError({ message });
      }
    }
  };

  const runPendingJobNow = async (signerId: string): Promise<void> => {
    const job = await signerIssuanceJobDAL.transaction((tx) => signerIssuanceJobDAL.findLatestForSigner(signerId, tx));
    if (!job || job.status !== SignerIssuanceJobStatus.Pending) return;
    await processJob(job.id);
  };

  return {
    requestIssuance,
    processJob,
    runPendingJobNow,
    cancelOpenRequests,
    cancelPendingDigiCertReissue,
    revokeUnattachedCertificate,
    revokeAtCa,
    cleanUpRequestsBeforeDelete,
    getLatestIssuanceRequest,
    start
  };
};
