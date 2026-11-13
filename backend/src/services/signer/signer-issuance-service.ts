/* eslint-disable no-await-in-loop, @typescript-eslint/no-use-before-define, @typescript-eslint/no-unsafe-argument */
import * as x509 from "@peculiar/x509";
import { Knex } from "knex";

import { TPkiSignerCertificateIssuanceJobs } from "@app/db/schemas";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { crypto } from "@app/lib/crypto/cryptography";
import { buildCsrWithExternalSigner } from "@app/lib/csr/build-csr-with-external-signer";
import { BadRequestError, ConflictError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority/certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "../certificate-authority/certificate-authority-fns";
import { TCertificateIssuanceQueueFactory } from "../certificate-authority/certificate-issuance-queue";
import { DIGICERT_REVOCATION_REQUEST_TIMEOUT_MS } from "../certificate-authority/digicert/digicert-api-client";
import {
  CodeSigningOrderStatus,
  DigiCertLifecycleMode
} from "../certificate-authority/digicert/digicert-certificate-authority-enums";
import { DigiCertExternalMetadataSchema } from "../certificate-common/external-metadata-schemas";
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
import { CertKeySource, HsmKeyAlgorithm, SignerIssuanceJobStatus, SignerStatus } from "./signer-enums";
import { formatSignerIssuanceErrorReason, isTerminalIssuanceError } from "./signer-issuance-errors";
import { hsmKeyAlgorithmToCertKeyAlgorithm, verifyCodeSigningEku } from "./signer-issuance-fns";
import { TSignerIssuanceJobDALFactory } from "./signer-issuance-job-dal";
import { SignerExternalCaConfigSchema } from "./signer-types";

const POLL_INTERVAL_PATTERN = "*/15 * * * *"; // every 15 minutes
const POLL_BATCH = 25;
const RETRY_BACKOFF_MS = 15 * 60_000;
const IN_FLIGHT_ATTEMPT_MS = 5 * 60_000;

const DIGICERT_CLOSED_ORDER_OUTCOMES: Partial<Record<CodeSigningOrderStatus, string>> = {
  [CodeSigningOrderStatus.Rejected]: "was rejected",
  [CodeSigningOrderStatus.Canceled]: "was canceled",
  [CodeSigningOrderStatus.Expired]: "expired",
  [CodeSigningOrderStatus.Revoked]: "was revoked"
};

const REVOKED_SIGNER_JOB_CANCEL_REASON = "Cancelled because the signer was revoked.";

enum UnattachedRevokeOutcome {
  Revoked = "revoked",
  Kept = "kept",
  Refused = "refused",
  Retryable = "retryable"
}

enum SignerRevokeState {
  NotRevoked = "not-revoked",
  RevokeInProgress = "revoke-in-progress",
  Revoked = "revoked"
}

const isAttemptInFlight = (lastAttemptAt: Date | null | undefined, now: number) =>
  Boolean(lastAttemptAt) && now - new Date(lastAttemptAt as Date).getTime() < IN_FLIGHT_ATTEMPT_MS;

const isDigiCertPlacementInFlight = (job: TPkiSignerCertificateIssuanceJobs, now: number) =>
  job.caType === CaType.DIGICERT &&
  !(job.externalOrderRef as TDigiCertExternalOrderRef | null)?.digicert?.orderId &&
  isAttemptInFlight(job.lastAttemptAt, now);

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

type TDigiCertExternalOrderRef = {
  digicert?: {
    orderId?: number;
    certificateId?: number | null;
    lastStatus?: string;
    lastCheckedAt?: string;
    lifecycle?: { mode: DigiCertLifecycleMode; previousOrderId: number };
  };
};

const buildDigiCertOrderRef = (
  orderId: number,
  certificateId: number | null,
  lifecycle: NonNullable<TDigiCertExternalOrderRef["digicert"]>["lifecycle"],
  lastStatus: string = CodeSigningOrderStatus.Pending
): TDigiCertExternalOrderRef => ({
  digicert: { orderId, certificateId, lastStatus, lastCheckedAt: new Date().toISOString(), lifecycle }
});

export type TSignerIssuanceServiceFactory = ReturnType<typeof signerIssuanceServiceFactory>;

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
  certificateService: Pick<TCertificateServiceFactory, "revokeOwnedCertificate">;
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

  const assertNoHeldCertificate = async (signerId: string, tx: Knex) => {
    const openJobs = await signerIssuanceJobDAL.findPendingForSignerForUpdate(signerId, tx);
    if (openJobs.some((job) => job.certificateId)) {
      throw new ConflictError({
        message:
          "A certificate issued while this signer was being revoked is still being processed. Try again in a few minutes."
      });
    }
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

    if (caType === CaType.DIGICERT && !input.hsm) {
      throw new BadRequestError({
        message:
          "DigiCert code signing requires an HSM-backed key. Industry rules require code signing private keys to be generated and stored on certified hardware. Choose an HSM key source for this signer."
      });
    }

    if (caType === CaType.DIGICERT) {
      const effectiveKeyAlgorithm = input.hsm
        ? hsmKeyAlgorithmToCertKeyAlgorithm(input.hsm.hsmKeyAlgorithm)
        : (input.keyAlgorithm ?? CertKeyAlgorithm.RSA_2048);
      if (effectiveKeyAlgorithm.startsWith("RSA_") && Number(effectiveKeyAlgorithm.slice(4)) < 3072) {
        throw new BadRequestError({
          message:
            "DigiCert code signing requires an RSA key of at least 3072 bits. Choose RSA-4096 or an ECDSA algorithm."
        });
      }
    }

    const digicertExternalOrderRef = input.digicertLifecycle
      ? { digicert: { lifecycle: input.digicertLifecycle } }
      : undefined;

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
      const encryptedCsrHsm = await encryptForProject(input.projectId, Buffer.from(built.csrPem));
      const hsmCertKeyAlgorithm = hsmKeyAlgorithmToCertKeyAlgorithm(input.hsm.hsmKeyAlgorithm);

      const hsmJob = await signerIssuanceJobDAL.transaction(async (tx) => {
        await assertNoHeldCertificate(input.signerId, tx);
        await signerIssuanceJobDAL.cancelOpenForSigner(input.signerId, "Superseded by a newer issuance request.", tx);
        return signerIssuanceJobDAL.create(
          {
            signerId: input.signerId,
            caId: input.caId,
            caType,
            status: SignerIssuanceJobStatus.Pending,
            commonName: input.commonName,
            certificateTtlDays: input.certificateTtlDays,
            keyAlgorithm: hsmCertKeyAlgorithm,
            encryptedCsr: encryptedCsrHsm,
            encryptedPrivateKey: null,
            keySource: CertKeySource.Hsm,
            hsmConnectorId: input.hsm!.hsmConnectorId,
            hsmKeyLabel: keyLabel,
            hsmKeyId: keyId,
            hsmPublicKeySpki: publicKeySpkiDer,
            externalOrderRef: digicertExternalOrderRef,
            nextPollAt: new Date()
          },
          tx
        );
      });

      void (async () => {
        try {
          await processJob(hsmJob.id);
        } catch (err) {
          logger.warn(
            err,
            `signer issuance: first-attempt HSM-backed job failed, cron will retry [jobId=${hsmJob.id}] [signerId=${input.signerId}]`
          );
        }
      })();
      return hsmJob;
    }

    const keyAlgorithm: CertKeyAlgorithm = input.keyAlgorithm ?? CertKeyAlgorithm.RSA_2048;
    const { csrPem, privateKeyPem } = await buildCsrForSigner(input.commonName, keyAlgorithm);

    const encryptedCsr = await encryptForProject(input.projectId, Buffer.from(csrPem));
    const encryptedPrivateKey = await encryptForProject(input.projectId, Buffer.from(privateKeyPem));

    const job = await signerIssuanceJobDAL.transaction(async (tx) => {
      await assertNoHeldCertificate(input.signerId, tx);
      await signerIssuanceJobDAL.cancelOpenForSigner(input.signerId, "Superseded by a newer issuance request.", tx);
      return signerIssuanceJobDAL.create(
        {
          signerId: input.signerId,
          caId: input.caId,
          caType,
          status: SignerIssuanceJobStatus.Pending,
          commonName: input.commonName,
          certificateTtlDays: input.certificateTtlDays,
          keyAlgorithm,
          encryptedCsr,
          encryptedPrivateKey,
          maxAttempts: maxIssuanceAttempts(caType),
          nextPollAt: new Date()
        },
        tx
      );
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

    const windowMs = maxIssuanceWindowMs(snapshot.caType);
    const ageMs = now.getTime() - new Date(snapshot.createdAt).getTime();
    if (ageMs > windowMs && !snapshot.certificateId) {
      const hours = Math.round(windowMs / (60 * 60 * 1000));
      await markJobFailed(
        snapshot,
        `Signer issuance was pending for more than ${hours} hours. The upstream Certificate Authority never finished issuing the certificate; abandoning.`
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

    if (job.certificateId) {
      if (job.attempts > job.maxAttempts) {
        await markJobFailed(
          job,
          `A certificate was issued for this signer but couldn't be attached or revoked after ${job.maxAttempts} attempts. Revoke it from the certificate authority.`
        );
        return;
      }
      const signer = await signerDAL.transaction((tx) => signerDAL.findById(job.signerId, tx));
      if (signer) await attachIssuedCertToSigner(job, job.certificateId, signer.projectId);
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
        const rows = await signerIssuanceJobDAL.update(
          { id: job.id, status: SignerIssuanceJobStatus.Pending },
          {
            nextPollAt: new Date(Date.now() + RETRY_BACKOFF_MS),
            failureReason: reason
          },
          tx
        );
        if (rows.length > 0) await $recordSignerIssuanceFailure(job.signerId, SignerStatus.Pending, reason, tx);
      });
      logger.error(
        err,
        `signer issuance: attempt failed, will retry [jobId=${job.id}] [signerId=${job.signerId}] [attempts=${job.attempts}/${job.maxAttempts}]`
      );
    }
  };

  const $recordSignerIssuanceFailure = async (
    signerId: string,
    status: SignerStatus.Pending | SignerStatus.Failed,
    reason: string,
    tx: Knex
  ) => {
    const lockedSigner = await signerDAL.findByIdForUpdate(signerId, tx);
    const isAwaitingCertificate =
      lockedSigner?.status === SignerStatus.Pending || lockedSigner?.status === SignerStatus.Failed;
    await signerDAL.updateUnlessRevoked(
      signerId,
      isAwaitingCertificate ? { status, certificateFailureReason: reason } : { certificateFailureReason: reason },
      tx
    );
  };

  const markJobFailed = async (job: TPkiSignerCertificateIssuanceJobs, reason: string) => {
    const trimmed = reason.slice(0, 1000);
    const markedFailed = await signerDAL.transaction(async (tx) => {
      const rows = await signerIssuanceJobDAL.update(
        { id: job.id, status: SignerIssuanceJobStatus.Pending },
        { status: SignerIssuanceJobStatus.Failed, failureReason: trimmed },
        tx
      );
      if (rows.length === 0) return false;
      await $recordSignerIssuanceFailure(job.signerId, SignerStatus.Failed, trimmed, tx);
      return true;
    });
    if (!markedFailed) return;
    logger.info(
      `signer issuance: job marked Failed [jobId=${job.id}] [signerId=${job.signerId}] [reason=${trimmed.slice(0, 200)}]`
    );
  };

  const $tryRevokeUnattachedCertificate = async (certificateId: string, projectId: string) => {
    try {
      const project = await projectDAL.findOne({ id: projectId });
      await certificateService.revokeOwnedCertificate({
        certificateId,
        revocationReason: CrlReason.CESSATION_OF_OPERATION,
        orgId: project.orgId
      });
      return { outcome: UnattachedRevokeOutcome.Revoked };
    } catch (err) {
      const cert = await certificateDAL.findById(certificateId);
      if (cert?.status === CertStatus.REVOKED) return { outcome: UnattachedRevokeOutcome.Revoked };
      logger.error(err, `signer issuance: failed to revoke unattached certificate [certificateId=${certificateId}]`);
      return err instanceof BadRequestError
        ? { outcome: UnattachedRevokeOutcome.Refused, refusal: err.message }
        : { outcome: UnattachedRevokeOutcome.Retryable };
    }
  };

  const revokeUnattachedCertificate = async (certificateId: string, projectId: string) =>
    (await $tryRevokeUnattachedCertificate(certificateId, projectId)).outcome === UnattachedRevokeOutcome.Revoked;

  const $revokeOrKeepUnattachedCertificate = async (
    job: TPkiSignerCertificateIssuanceJobs,
    certificateId: string,
    projectId: string,
    { isJobOpen }: { isJobOpen: boolean }
  ) => {
    const result = await $tryRevokeUnattachedCertificate(certificateId, projectId);
    if (result.outcome !== UnattachedRevokeOutcome.Retryable) return result;
    const keepData = { status: SignerIssuanceJobStatus.Pending, certificateId };
    let [keptJob] = isJobOpen
      ? await signerIssuanceJobDAL.update({ id: job.id, status: SignerIssuanceJobStatus.Pending }, keepData)
      : [];
    if (!keptJob) {
      const keepOn = await $keepOnJobClosedByRevoke(job);
      if (keepOn) [keptJob] = await signerIssuanceJobDAL.update(keepOn, keepData);
    }
    if (!keptJob) return result;
    logger.warn(
      `signer issuance: keeping the unattached certificate on its job to retry the revoke on the next poll [jobId=${job.id}] [signerId=${job.signerId}] [certificateId=${certificateId}]`
    );
    return { outcome: UnattachedRevokeOutcome.Kept };
  };

  const $keepOnJobClosedByRevoke = async (job: TPkiSignerCertificateIssuanceJobs) =>
    (await $getSignerRevokeState(job.signerId)) === SignerRevokeState.Revoked
      ? { id: job.id, status: SignerIssuanceJobStatus.Failed, failureReason: REVOKED_SIGNER_JOB_CANCEL_REASON }
      : null;

  const $getSignerRevokeState = async (signerId: string) => {
    const signer = await signerDAL.transaction((tx) => signerDAL.findById(signerId, tx));
    if (!signer) return SignerRevokeState.Revoked;
    if (signer.status !== SignerStatus.Revoked) return SignerRevokeState.NotRevoked;
    const currentCert = signer.certificateId
      ? await signerDAL.transaction((tx) => certificateDAL.findById(signer.certificateId as string, tx))
      : null;
    return currentCert && currentCert.status !== CertStatus.REVOKED
      ? SignerRevokeState.RevokeInProgress
      : SignerRevokeState.Revoked;
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
    let isSuperseded = false;
    let isSupersededByRevokeOrDelete = false;
    let isRefusedForRevokedSigner = false;
    let isRevokeInProgress = false;
    try {
      await signerDAL.transaction(async (tx) => {
        const completedJob = await signerIssuanceJobDAL.completeIfPending(job.id, certificateId, tx);
        if (!completedJob) {
          isSuperseded = true;
          const currentSigner = await signerDAL.findById(job.signerId, tx);
          await certificateDAL.findByIdForUpdate(certificateId, tx);
          const signerOwningCertificate = await signerDAL.findOne({ certificateId }, tx);
          isSupersededByRevokeOrDelete =
            !signerOwningCertificate && (!currentSigner || currentSigner.status === SignerStatus.Revoked);
          return;
        }
        const lockedSigner = await signerDAL.findByIdForUpdate(job.signerId, tx);
        await certificateDAL.findByIdForUpdate(certificateId, tx);
        const signerUsingCertificate = await signerDAL.findOne({ certificateId }, tx);
        if (signerUsingCertificate && signerUsingCertificate.id !== job.signerId) {
          throw new ConflictError({
            message: `The issued certificate is already used by signer '${signerUsingCertificate.name}'.`
          });
        }
        const currentCert = lockedSigner?.certificateId
          ? await certificateDAL.findById(lockedSigner.certificateId, tx)
          : null;
        const lifecycle = (job.externalOrderRef as TDigiCertExternalOrderRef | null)?.digicert?.lifecycle;
        const currentOrder = DigiCertExternalMetadataSchema.safeParse(currentCert?.externalMetadata);
        const isRevokedByThisReissue =
          lifecycle?.mode === DigiCertLifecycleMode.Reissue &&
          currentOrder.success &&
          currentOrder.data.orderId === lifecycle.previousOrderId;
        if (lockedSigner?.status === SignerStatus.Revoked && currentCert && currentCert.status !== CertStatus.REVOKED) {
          isRevokeInProgress = true;
          throw new BadRequestError({ message: "The signer is being revoked." });
        }
        if (
          lockedSigner?.status === SignerStatus.Revoked ||
          (currentCert?.status === CertStatus.REVOKED && !isRevokedByThisReissue)
        ) {
          isRefusedForRevokedSigner = true;
          throw new BadRequestError({
            message:
              "The signer was revoked before its new certificate was issued, so the new certificate was revoked too. Create a new signer to keep signing."
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
        await signerDAL.updateUnlessRevoked(
          job.signerId,
          {
            certificateId,
            status: lockedSigner?.status === SignerStatus.Disabled ? SignerStatus.Disabled : SignerStatus.Active,
            certificateFailureReason: null,
            ...(issuedCert?.commonName ? { commonName: issuedCert.commonName } : {})
          },
          tx
        );
      });
    } catch (txErr) {
      if (isRevokeInProgress) {
        const [heldJob] = await signerIssuanceJobDAL.update(
          { id: job.id, status: SignerIssuanceJobStatus.Pending },
          { certificateId }
        );
        if (!heldJob) {
          await $revokeOrKeepUnattachedCertificate(job, certificateId, projectId, { isJobOpen: false });
        }
        logger.info(
          `signer issuance: signer is being revoked, keeping the issued certificate on its job until the revoke settles [jobId=${job.id}] [signerId=${job.signerId}] [certificateId=${certificateId}]`
        );
        return;
      }
      const reason = formatSignerIssuanceErrorReason(
        txErr,
        isHsmJob
          ? "Failed to atomically record HSM coordinates and attach the certificate to the signer"
          : "Failed to attach the issued certificate to the signer"
      );
      if (isRefusedForRevokedSigner) {
        const { outcome, refusal } = await $revokeOrKeepUnattachedCertificate(job, certificateId, projectId, {
          isJobOpen: true
        });
        if (outcome === UnattachedRevokeOutcome.Kept) return;
        if (outcome !== UnattachedRevokeOutcome.Revoked) {
          await markJobFailed(
            job,
            `The signer was revoked before its new certificate was issued, and revoking the new certificate failed${refusal ? `: ${refusal}` : "."}`
          );
          return;
        }
      }
      await markJobFailed(job, reason);
      return;
    }
    if (isSuperseded) {
      if (isSupersededByRevokeOrDelete) {
        await $revokeOrKeepUnattachedCertificate(job, certificateId, projectId, { isJobOpen: false });
      }
      logger.info(
        `signer issuance: job was superseded before completion, certificate not attached [jobId=${job.id}] [signerId=${job.signerId}] [certificateId=${certificateId}]`
      );
      return;
    }
    logger.info(
      `signer issuance: signer attached [jobId=${job.id}] [signerId=${job.signerId}] [certificateId=${certificateId}]`
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

  const $cancelDigiCertOrderForRevokedSigner = async (job: TPkiSignerCertificateIssuanceJobs, orderId: number) => {
    const isCanceled = await digicertFns.cancelReissue({
      caId: job.caId,
      orderId,
      requestTimeoutMs: DIGICERT_REVOCATION_REQUEST_TIMEOUT_MS
    });
    if (!isCanceled) {
      logger.warn(
        `signer issuance: DigiCert order ${orderId} could not be canceled, keeping its job open so a late certificate is revoked [jobId=${job.id}] [signerId=${job.signerId}]`
      );
    }
    return isCanceled;
  };

  const $trackDigiCertOrder = async (
    jobFilter: { id: string; status: SignerIssuanceJobStatus; failureReason?: string },
    orderId: number,
    certificateId: number | null,
    lifecycle: NonNullable<TDigiCertExternalOrderRef["digicert"]>["lifecycle"]
  ) =>
    signerIssuanceJobDAL.update(jobFilter, {
      status: SignerIssuanceJobStatus.Pending,
      externalOrderRef: buildDigiCertOrderRef(orderId, certificateId, lifecycle)
    });

  const $closeUnplacedDigiCertJobForRevokedSigner = async (
    job: TPkiSignerCertificateIssuanceJobs,
    lifecycle: NonNullable<TDigiCertExternalOrderRef["digicert"]>["lifecycle"]
  ) => {
    if (lifecycle?.mode === DigiCertLifecycleMode.Reissue) {
      if (!(await $cancelDigiCertOrderForRevokedSigner(job, lifecycle.previousOrderId))) {
        await $trackDigiCertOrder(
          { id: job.id, status: SignerIssuanceJobStatus.Pending },
          lifecycle.previousOrderId,
          null,
          lifecycle
        );
        return;
      }
    } else {
      const recovered = await digicertFns.findCodeSigningOrderByReference(job.caId, `infisical-signer-job-${job.id}`);
      if (recovered && !(await $cancelDigiCertOrderForRevokedSigner(job, recovered.orderId))) {
        await $trackDigiCertOrder(
          { id: job.id, status: SignerIssuanceJobStatus.Pending },
          recovered.orderId,
          recovered.certificateId,
          lifecycle
        );
        return;
      }
    }
    await signerIssuanceJobDAL.cancelPendingByIds([job.id], REVOKED_SIGNER_JOB_CANCEL_REASON);
  };

  const stepSyncWithDigiCert = async (job: TPkiSignerCertificateIssuanceJobs) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(job.caId);
    if (!ca) {
      await markJobFailed(job, "Certificate authority is no longer available.");
      return;
    }
    const { projectId } = ca;

    const ref = (job.externalOrderRef ?? {}) as TDigiCertExternalOrderRef;
    const existingOrderId = ref.digicert?.orderId;
    const lifecycle = ref.digicert?.lifecycle;

    const persistPlacedOrder = async (
      orderId: number,
      certificateId: number | null,
      placedLifecycle: typeof lifecycle = lifecycle
    ) => {
      const [savedJob] = await signerIssuanceJobDAL.update(
        { id: job.id, status: SignerIssuanceJobStatus.Pending },
        { externalOrderRef: buildDigiCertOrderRef(orderId, certificateId, placedLifecycle) }
      );
      if (!savedJob) {
        if (await $isDigiCertOrderOwnedByOpenJob(job, orderId)) return;
        logger.info(
          `signer issuance: job was closed while its DigiCert order was being placed, canceling the order [jobId=${job.id}] [signerId=${job.signerId}] [orderId=${orderId}]`
        );
        if (!(await $cancelDigiCertOrderForRevokedSigner(job, orderId))) {
          const keepOn = await $keepOnJobClosedByRevoke(job);
          if (keepOn) {
            await $trackDigiCertOrder(keepOn, orderId, certificateId, placedLifecycle);
          } else {
            await signerIssuanceJobDAL.update(
              { id: job.id, status: SignerIssuanceJobStatus.Failed },
              {
                externalOrderRef: buildDigiCertOrderRef(orderId, certificateId, placedLifecycle),
                failureReason: `This request was replaced while DigiCert order #${orderId} was being placed, and the order couldn't be canceled. Cancel it in CertCentral.`
              }
            );
            logger.warn(
              `signer issuance: DigiCert order placed for a superseded job could not be canceled, recorded on the closed job [jobId=${job.id}] [signerId=${job.signerId}] [orderId=${orderId}]`
            );
          }
        }
        return;
      }
      logger.info(
        `signer issuance: DigiCert order placed [jobId=${job.id}] [signerId=${job.signerId}] [orderId=${orderId}]`
      );
    };

    if (!existingOrderId) {
      const revokeState = await $getSignerRevokeState(job.signerId);
      if (revokeState === SignerRevokeState.RevokeInProgress) return;
      if (revokeState === SignerRevokeState.Revoked) {
        await $closeUnplacedDigiCertJobForRevokedSigner(job, lifecycle);
        return;
      }
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

    if (info.status !== CodeSigningOrderStatus.Issued && !DIGICERT_CLOSED_ORDER_OUTCOMES[info.status]) {
      const revokeState = await $getSignerRevokeState(job.signerId);
      if (revokeState === SignerRevokeState.RevokeInProgress) return;
      if (
        revokeState === SignerRevokeState.Revoked &&
        (await $cancelDigiCertOrderForRevokedSigner(job, existingOrderId))
      ) {
        await signerIssuanceJobDAL.cancelPendingByIds([job.id], REVOKED_SIGNER_JOB_CANCEL_REASON);
        return;
      }
    }

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

  // Recovers key config from the last job when retrying a signer that never produced a certificate.
  const getLatestIssuanceKeyConfig = async (signerId: string) => {
    const job = await signerIssuanceJobDAL.findLatestForSigner(signerId);
    if (!job) return null;
    const digicert = (job.externalOrderRef as TDigiCertExternalOrderRef | null)?.digicert;
    return {
      keySource: job.keySource as CertKeySource,
      keyAlgorithm: job.keyAlgorithm as CertKeyAlgorithm,
      hsmConnectorId: job.hsmConnectorId ?? null,
      hsmKeyLabel: job.hsmKeyLabel ?? null,
      hsmKeyId: job.hsmKeyId ?? null,
      hsmPublicKeySpki: job.hsmPublicKeySpki ?? null,
      isOpen: job.status === SignerIssuanceJobStatus.Pending,
      externalOrder:
        digicert?.orderId != null
          ? { provider: CaType.DIGICERT, orderId: digicert.orderId, status: digicert.lastStatus ?? null }
          : null
    };
  };

  const getLatestFailedRequestAt = async (signerId: string) => {
    const job = await signerIssuanceJobDAL.findLatestForSigner(signerId);
    return job?.status === SignerIssuanceJobStatus.Failed ? new Date(job.updatedAt) : null;
  };

  const cancelOpenJobs = async (signerId: string, orderId: number, tx: Knex) => {
    const openJobs = await signerIssuanceJobDAL.findPendingForSignerForUpdate(signerId, tx);
    await assertNoHeldCertificate(signerId, tx);
    const now = Date.now();
    const reissueInProgress = openJobs.some((job) => {
      const digicert = (job.externalOrderRef as TDigiCertExternalOrderRef | null)?.digicert;
      if (digicert?.orderId === orderId) return true;
      if (digicert?.lifecycle?.previousOrderId !== orderId) return false;
      if (digicert.orderId) return digicert.lifecycle.mode === DigiCertLifecycleMode.Reissue;
      return isAttemptInFlight(job.lastAttemptAt, now);
    });
    if (reissueInProgress) {
      throw new ConflictError({
        message: `A certificate request into DigiCert order ${orderId} is already in progress for this signer, and it would revoke the order's current certificate. Wait for it to finish, then try again.`
      });
    }
    await signerIssuanceJobDAL.cancelOpenForSigner(
      signerId,
      "Superseded by an existing DigiCert certificate attached to the signer.",
      tx
    );
  };

  const runPendingJobNow = async (signerId: string): Promise<void> => {
    const job = await signerIssuanceJobDAL.transaction((tx) => signerIssuanceJobDAL.findLatestForSigner(signerId, tx));
    if (!job || job.status !== SignerIssuanceJobStatus.Pending) return;
    await processJob(job.id);
  };

  const $isDigiCertOrderOwnedByOpenJob = async (job: TPkiSignerCertificateIssuanceJobs, orderId: number) => {
    const openJobs = await signerIssuanceJobDAL.transaction((tx) =>
      signerIssuanceJobDAL.find({ signerId: job.signerId, status: SignerIssuanceJobStatus.Pending }, { tx })
    );
    return openJobs.some((openJob) => {
      const digicert = (openJob.externalOrderRef as TDigiCertExternalOrderRef | null)?.digicert;
      return openJob.id !== job.id && (digicert?.orderId ?? digicert?.lifecycle?.previousOrderId) === orderId;
    });
  };

  const cancelOpenJobsForRevokedSigner = async (
    signerId: string,
    { digicertReissuesOnly = false }: { digicertReissuesOnly?: boolean } = {}
  ) => {
    const openJobs = await signerIssuanceJobDAL.transaction((tx) =>
      signerIssuanceJobDAL.find({ signerId, status: SignerIssuanceJobStatus.Pending }, { tx })
    );
    const signer = openJobs.some((job) => job.certificateId)
      ? await signerDAL.transaction((tx) => signerDAL.findById(signerId, tx))
      : null;
    const jobIdsToCancel: string[] = [];
    const uncancelledDigicertOrderIds: number[] = [];
    for (const job of openJobs) {
      const digicert = (job.externalOrderRef as TDigiCertExternalOrderRef | null)?.digicert;
      const digicertOrderId = digicert?.orderId;
      if (digicertReissuesOnly && (digicert?.lifecycle?.mode !== DigiCertLifecycleMode.Reissue || job.certificateId)) {
        continue;
      }
      if (job.certificateId) {
        if (signer && (await revokeUnattachedCertificate(job.certificateId, signer.projectId))) {
          await signerIssuanceJobDAL.update(
            { id: job.id, status: SignerIssuanceJobStatus.Pending },
            { status: SignerIssuanceJobStatus.Failed, failureReason: REVOKED_SIGNER_JOB_CANCEL_REASON }
          );
        }
      } else if (job.caType === CaType.DIGICERT && !digicertOrderId && job.lastAttemptAt) {
        logger.info(
          `signer issuance: DigiCert placement outcome unknown, keeping its job open so the poller recovers and cancels any order [jobId=${job.id}] [signerId=${signerId}]`
        );
      } else if (job.caType !== CaType.DIGICERT || !digicertOrderId) {
        jobIdsToCancel.push(job.id);
      } else if (await $cancelDigiCertOrderForRevokedSigner(job, digicertOrderId)) {
        jobIdsToCancel.push(job.id);
      } else {
        uncancelledDigicertOrderIds.push(digicertOrderId);
      }
    }
    await signerIssuanceJobDAL.cancelPendingByIds(jobIdsToCancel, REVOKED_SIGNER_JOB_CANCEL_REASON);
    return { uncancelledDigicertOrderIds, cancelledJobCount: jobIdsToCancel.length };
  };

  const hasOpenJobs = async (signerId: string, tx: Knex) => {
    const openJobs = await signerIssuanceJobDAL.findPendingForSignerForUpdate(signerId, tx);
    return openJobs.length > 0;
  };

  return {
    requestIssuance,
    processJob,
    runPendingJobNow,
    cancelOpenJobs,
    cancelOpenJobsForRevokedSigner,
    hasOpenJobs,
    assertNoHeldCertificate,
    revokeUnattachedCertificate,
    getLatestIssuanceKeyConfig,
    getLatestFailedRequestAt,
    start
  };
};
