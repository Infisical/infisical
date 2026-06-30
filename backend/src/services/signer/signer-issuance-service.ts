/* eslint-disable no-await-in-loop, @typescript-eslint/no-use-before-define, @typescript-eslint/no-unsafe-argument */
import * as x509 from "@peculiar/x509";

import { TPkiSignerCertificateIssuanceJobs } from "@app/db/schemas";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { crypto } from "@app/lib/crypto/cryptography";
import { buildCsrWithExternalSigner } from "@app/lib/csr/build-csr-with-external-signer";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertSignatureAlgorithm
} from "../certificate/certificate-types";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority/certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "../certificate-authority/certificate-authority-fns";
import { TCertificateIssuanceQueueFactory } from "../certificate-authority/certificate-issuance-queue";
import { CodeSigningOrderStatus } from "../certificate-authority/digicert/digicert-certificate-authority-enums";
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

const POLL_INTERVAL_PATTERN = "*/15 * * * *"; // every 15 minutes
const POLL_BATCH = 25;
const RETRY_BACKOFF_MS = 15 * 60_000;

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
    lifecycle?: { mode: "renew" | "reissue"; previousOrderId: number };
  };
};

export type TSignerIssuanceServiceFactory = ReturnType<typeof signerIssuanceServiceFactory>;

type TSignerIssuanceServiceDeps = {
  signerIssuanceJobDAL: TSignerIssuanceJobDALFactory;
  signerDAL: Pick<TSignerDALFactory, "updateById" | "transaction">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne" | "create" | "updateById">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithKmsKey" | "decryptWithKmsKey" | "generateKmsKey">;
  certificateIssuanceQueue: Pick<TCertificateIssuanceQueueFactory, "awsPcaFns" | "azureAdCsFns" | "digicertFns">;
  cronJob: TCronJobFactory;
  hsmConnectorService: Pick<THsmConnectorServiceFactory, "generateKeyPair" | "sign" | "assertAttachPermission">;
  certificateDAL: Pick<TCertificateDALFactory, "updateById" | "findById">;
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
    hsmPublicKeySpki?: Buffer;
    actor?: Pick<THsmConnectorServiceActor, "type" | "id" | "authMethod" | "orgId">;
  };
  // DigiCert code signing only; absent means a fresh order.
  digicertLifecycle?: { mode: "renew" | "reissue"; previousOrderId: number };
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
  certificateDAL
}: TSignerIssuanceServiceDeps) => {
  const { awsPcaFns, azureAdCsFns, digicertFns } = certificateIssuanceQueue;

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

  const requestIssuance = async (input: TRequestIssuanceInput): Promise<TPkiSignerCertificateIssuanceJobs> => {
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
      let publicKeySpkiDer: Buffer;
      if (reuseExistingKey) {
        keyLabel = input.hsm.hsmKeyLabel as string;
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
            mechanism: mech,
            data: tbs,
            isDigest
          })
      });
      const encryptedCsrHsm = await encryptForProject(input.projectId, Buffer.from(built.csrPem));
      const hsmCertKeyAlgorithm = hsmKeyAlgorithmToCertKeyAlgorithm(input.hsm.hsmKeyAlgorithm);

      const hsmJob = await signerIssuanceJobDAL.transaction(async (tx) => {
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
    if (ageMs > windowMs) {
      const hours = Math.round(windowMs / (60 * 60 * 1000));
      await markJobFailedIfStillPending(
        snapshot,
        `Signer issuance was pending for more than ${hours} hours. The upstream Certificate Authority never finished issuing the certificate; abandoning.`
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
        case CaType.AZURE_AD_CS:
          await stepSyncWithCsr(job, CaType.AZURE_AD_CS);
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
            `CA type '${job.caType}' is not supported for code signing. Choose Internal CA, AWS Private CA, Azure AD CS, or DigiCert.`
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
          certificateFailureReason: reason
        });
      }
      logger.error(
        err,
        `signer issuance: attempt failed, will retry [jobId=${job.id}] [signerId=${job.signerId}] [attempts=${job.attempts}/${job.maxAttempts}]`
      );
    }
  };

  const markJobFailed = async (job: TPkiSignerCertificateIssuanceJobs, reason: string) => {
    await signerIssuanceJobDAL.updateById(job.id, {
      status: SignerIssuanceJobStatus.Failed,
      failureReason: reason.slice(0, 1000)
    });
    await signerDAL.updateById(job.signerId, {
      status: SignerStatus.Failed,
      certificateFailureReason: reason.slice(0, 1000)
    });
    logger.info(
      `signer issuance: job marked Failed [jobId=${job.id}] [signerId=${job.signerId}] [reason=${reason.slice(0, 200)}]`
    );
  };

  const markJobFailedIfStillPending = async (job: TPkiSignerCertificateIssuanceJobs, reason: string) => {
    const trimmed = reason.slice(0, 1000);
    const rows = await signerIssuanceJobDAL.update(
      { id: job.id, status: SignerIssuanceJobStatus.Pending },
      { status: SignerIssuanceJobStatus.Failed, failureReason: trimmed }
    );
    if (rows.length === 0) return;
    await signerDAL.updateById(job.signerId, {
      status: SignerStatus.Failed,
      certificateFailureReason: trimmed
    });
    logger.info(
      `signer issuance: job marked Failed [jobId=${job.id}] [signerId=${job.signerId}] [reason=${trimmed.slice(0, 200)}]`
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
    try {
      await signerDAL.transaction(async (tx) => {
        if (isHsmJob) {
          const certAlg = job.keyAlgorithm as CertKeyAlgorithm;
          await certificateDAL.updateById(
            certificateId,
            {
              keySource: CertKeySource.Hsm,
              hsmConnectorId: job.hsmConnectorId,
              hsmKeyLabel: job.hsmKeyLabel,
              hsmPublicKeySpki: job.hsmPublicKeySpki ?? null,
              keyAlgorithm: certAlg
            },
            tx
          );
        }
        await signerDAL.updateById(
          job.signerId,
          {
            certificateId,
            status: SignerStatus.Active,
            certificateFailureReason: null,
            ...(issuedCert?.commonName ? { commonName: issuedCert.commonName } : {})
          },
          tx
        );
        await signerIssuanceJobDAL.updateById(
          job.id,
          {
            status: SignerIssuanceJobStatus.Completed,
            certificateId,
            failureReason: null
          },
          tx
        );
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
    logger.info(
      `signer issuance: signer attached [jobId=${job.id}] [signerId=${job.signerId}] [certificateId=${certificateId}]`
    );
  };

  const stepSyncWithCsr = async (job: TPkiSignerCertificateIssuanceJobs, kind: CaType.AZURE_AD_CS | CaType.AWS_PCA) => {
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
        isRenewal: false,
        isCancelled: async () => false
      });
      if (!azureResult?.certificateId) {
        throw new BadRequestError({ message: "Azure AD CS order returned without a certificate id." });
      }
      certificateId = azureResult.certificateId;
    } else {
      const awsResult = await awsPcaFns.orderCertificate({
        caId: job.caId,
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

    const persistPlacedOrder = async (orderId: number, certificateId: number | null) => {
      await signerIssuanceJobDAL.updateById(job.id, {
        externalOrderRef: {
          digicert: {
            orderId,
            certificateId,
            lastStatus: CodeSigningOrderStatus.Pending,
            lastCheckedAt: new Date().toISOString()
          }
        }
      });
      logger.info(
        `signer issuance: DigiCert order placed [jobId=${job.id}] [signerId=${job.signerId}] [orderId=${orderId}]`
      );
    };

    if (!existingOrderId) {
      const csr = (await decryptForProject(projectId, Buffer.from(job.encryptedCsr as Buffer))).toString();
      const comments = `Issued via Infisical signer ${job.signerId}`;
      const { signatureHash } = deriveDigicertSignatureParams(job.keyAlgorithm);

      if (lifecycle?.mode === "reissue") {
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
      if (lifecycle?.mode === "renew") {
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
      await persistPlacedOrder(placed.orderId, placed.certificateId);
      return;
    }

    const info = await digicertFns.getCodeSigningOrderStatus(job.caId, existingOrderId);
    await signerIssuanceJobDAL.updateById(job.id, {
      externalOrderRef: {
        digicert: {
          orderId: existingOrderId,
          certificateId: info.certificateId,
          lastStatus: info.status,
          lastCheckedAt: new Date().toISOString()
        }
      }
    });

    if (
      info.status === CodeSigningOrderStatus.Rejected ||
      info.status === CodeSigningOrderStatus.Canceled ||
      info.status === CodeSigningOrderStatus.Expired ||
      info.status === CodeSigningOrderStatus.Revoked
    ) {
      await markJobFailed(
        job,
        `DigiCert order ${info.status} (raw status: ${info.rawStatus}). Order id ${existingOrderId}.`
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
    return {
      keySource: job.keySource as CertKeySource,
      keyAlgorithm: job.keyAlgorithm as CertKeyAlgorithm,
      hsmConnectorId: job.hsmConnectorId ?? null,
      hsmKeyLabel: job.hsmKeyLabel ?? null,
      hsmPublicKeySpki: job.hsmPublicKeySpki ?? null
    };
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
    getLatestIssuanceKeyConfig,
    start
  };
};
