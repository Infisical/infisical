import acme from "acme-client";
import { UnrecoverableError } from "bullmq";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { crypto } from "@app/lib/crypto/cryptography";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import {
  CertExtendedKeyUsage,
  CertKeyUsage,
  CertSubjectAlternativeNameType
} from "@app/services/certificate/certificate-types";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { TAppConnectionServiceFactory } from "../app-connection/app-connection-service";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { CertKeyAlgorithm } from "../certificate-common/certificate-constants";
import {
  calculateFinalRenewBeforeDays,
  resolveEffectiveApiConfig
} from "../certificate-common/certificate-issuance-utils";
import { CertificateRequestCancelledError } from "../certificate-common/certificate-request-errors";
import {
  DigiCertExternalMetadataSchema,
  GoDaddyExternalMetadataSchema
} from "../certificate-common/external-metadata-schemas";
import { TCertificateRequestDALFactory } from "../certificate-request/certificate-request-dal";
import { TCertificateRequestServiceFactory } from "../certificate-request/certificate-request-service";
import { CertificateRequestStatus } from "../certificate-request/certificate-request-types";
import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { TApiEnrollmentConfigDALFactory } from "../enrollment-config/api-enrollment-config-dal";
import { TPkiAlertV2QueueServiceFactory } from "../pki-alert-v2/pki-alert-v2-queue";
import { PkiAlertEventType } from "../pki-alert-v2/pki-alert-v2-types";
import { TPkiApplicationProfileDALFactory } from "../pki-application/pki-application-profile-dal";
import { TPkiSubscriberDALFactory } from "../pki-subscriber/pki-subscriber-dal";
import { TPkiSyncDALFactory } from "../pki-sync/pki-sync-dal";
import { TPkiSyncQueueFactory } from "../pki-sync/pki-sync-queue";
import { addRenewedCertificateToSyncs, triggerAutoSyncForCertificate } from "../pki-sync/pki-sync-utils";
import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";
import { copyMetadataFromRequestToCertificate } from "../resource-metadata/resource-metadata-fns";
import { runWithAcmeCancellation } from "./acme/acme-cancellation";
import {
  ACME_ORDER_TIMEOUT_MS,
  AcmeOrderTimeoutError,
  AcmeRateLimitError,
  isAcmeRateLimitError,
  runWithAcmeOrderTimeout
} from "./acme/acme-certificate-authority-errors";
import { AcmeCertificateAuthorityFns } from "./acme/acme-certificate-authority-fns";
import { AcmPendingError } from "./aws-acm-public-ca/aws-acm-public-ca-certificate-authority-errors";
import { AwsAcmPublicCaCertificateAuthorityFns } from "./aws-acm-public-ca/aws-acm-public-ca-certificate-authority-fns";
import { AwsPcaCertificateAuthorityFns } from "./aws-pca/aws-pca-certificate-authority-fns";
import { AzureAdCsCertificateAuthorityFns } from "./azure-ad-cs/azure-ad-cs-certificate-authority-fns";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import { CaType } from "./certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "./certificate-authority-fns";
import { DigiCertCertificateAuthorityFns } from "./digicert/digicert-certificate-authority-fns";
import { TExternalCertificateAuthorityDALFactory } from "./external-certificate-authority-dal";
import { GoDaddyCertificateAuthorityFns } from "./godaddy/godaddy-certificate-authority-fns";
import { VenafiTppCertificateAuthorityFns } from "./venafi-tpp/venafi-tpp-certificate-authority-fns";

const base64UrlToBase64 = (base64url: string): string => {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");

  const padding = base64.length % 4;
  if (padding === 2) {
    base64 += "==";
  } else if (padding === 3) {
    base64 += "=";
  }

  return base64;
};

const ensureCsrPemFormat = (csr: string): string => {
  const trimmedCsr = csr.trim();

  if (
    trimmedCsr.includes("-----BEGIN CERTIFICATE REQUEST-----") ||
    trimmedCsr.includes("-----BEGIN NEW CERTIFICATE REQUEST-----")
  ) {
    return trimmedCsr;
  }

  const standardBase64 = base64UrlToBase64(trimmedCsr);

  const base64Lines = standardBase64.match(/.{1,64}/g) || [standardBase64];
  return `-----BEGIN CERTIFICATE REQUEST-----\n${base64Lines.join("\n")}\n-----END CERTIFICATE REQUEST-----`;
};

export type TIssueCertificateFromProfileJobData = {
  certificateId: string;
  profileId?: string;
  caId: string;
  caType?: CaType;
  commonName?: string;
  altNames?: Array<{ type: string; value: string }>;
  ttl: string;
  signatureAlgorithm: string;
  keyAlgorithm: string;
  keyUsages?: string[];
  extendedKeyUsages?: string[];
  isRenewal?: boolean;
  originalCertificateId?: string;
  certificateRequestId?: string;
  csr?: string;
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  state?: string;
  locality?: string;
  applicationId?: string;
};

type TCertificateIssuanceQueueFactoryDep = {
  certificateAuthorityDAL: TCertificateAuthorityDALFactory;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "create" | "update" | "findOne">;
  certificateDAL: TCertificateDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction">;
  kmsService: Pick<
    TKmsServiceFactory,
    "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey" | "createCipherPairWithDataKey"
  >;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  queueService: TQueueServiceFactory;
  pkiSubscriberDAL: Pick<TPkiSubscriberDALFactory, "findById" | "updateById">;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    "findPkiSyncIdsByCertificateId" | "addCertificates" | "findByPkiSyncAndCertificate" | "updateSyncMetadata"
  >;
  certificateProfileDAL?: Pick<TCertificateProfileDALFactory, "findById" | "findByIdWithConfigs">;
  certificateRequestService?: Pick<
    TCertificateRequestServiceFactory,
    "attachCertificateToRequest" | "updateCertificateRequestStatus"
  >;
  certificateRequestDAL?: Pick<
    TCertificateRequestDALFactory,
    "updateById" | "findById" | "setPendingMessage" | "transitionToPendingValidation"
  >;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "find" | "insertMany">;
  pkiAlertV2Queue?: Pick<TPkiAlertV2QueueServiceFactory, "queueCertificateEvent">;
  pkiApplicationProfileDAL?: Pick<TPkiApplicationProfileDALFactory, "findOneByApplicationAndProfile">;
  apiEnrollmentConfigDAL?: Pick<TApiEnrollmentConfigDALFactory, "findById">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

export type TCertificateIssuanceQueueFactory = ReturnType<typeof certificateIssuanceQueueFactory>;

export const certificateIssuanceQueueFactory = ({
  certificateAuthorityDAL,
  appConnectionDAL,
  appConnectionService,
  externalCertificateAuthorityDAL,
  certificateDAL,
  projectDAL,
  kmsService,
  queueService,
  certificateBodyDAL,
  certificateSecretDAL,
  pkiSubscriberDAL,
  pkiSyncDAL,
  pkiSyncQueue,
  certificateSyncDAL,
  certificateProfileDAL,
  certificateRequestService,
  certificateRequestDAL,
  resourceMetadataDAL,
  pkiAlertV2Queue,
  pkiApplicationProfileDAL,
  apiEnrollmentConfigDAL,
  gatewayV2Service,
  gatewayPoolService
}: TCertificateIssuanceQueueFactoryDep) => {
  const acmeFns = AcmeCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    pkiSubscriberDAL,
    projectDAL,
    pkiSyncDAL,
    pkiSyncQueue,
    certificateProfileDAL
  });

  const azureAdCsFns = AzureAdCsCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    pkiSubscriberDAL,
    projectDAL,
    pkiSyncDAL,
    pkiSyncQueue,
    certificateProfileDAL
  });

  const awsPcaFns = AwsPcaCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    projectDAL,
    certificateProfileDAL
  });

  const digicertFns = DigiCertCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    projectDAL
  });

  const godaddyFns = GoDaddyCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    projectDAL
  });

  const awsAcmPublicCaFns = AwsAcmPublicCaCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    projectDAL,
    certificateProfileDAL
  });

  const venafiTppFns = VenafiTppCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    projectDAL,
    certificateProfileDAL,
    gatewayV2Service,
    gatewayPoolService
  });

  /**
   * Queue a certificate issuance job.
   */
  const queueCertificateIssuance = async ({
    certificateId,
    profileId,
    caId,
    caType,
    commonName,
    altNames,
    ttl,
    signatureAlgorithm,
    keyAlgorithm,
    keyUsages,
    extendedKeyUsages,
    isRenewal,
    originalCertificateId,
    certificateRequestId,
    csr,
    organization,
    organizationalUnit,
    country,
    state,
    locality,
    applicationId
  }: TIssueCertificateFromProfileJobData) => {
    const jobData: TIssueCertificateFromProfileJobData = {
      certificateId,
      profileId,
      caId,
      caType,
      commonName,
      altNames,
      ttl,
      signatureAlgorithm,
      keyAlgorithm,
      keyUsages,
      extendedKeyUsages,
      isRenewal,
      originalCertificateId,
      certificateRequestId,
      csr,
      organization,
      organizationalUnit,
      country,
      state,
      locality,
      applicationId
    };

    // ACM DNS validation can take 5–30 minutes; the function is fully idempotent via
    // IdempotencyToken, so we poll longer with a fixed backoff instead of exponential.
    const queueOpts =
      caType === CaType.AWS_ACM_PUBLIC_CA
        ? { attempts: 30, backoff: { type: "fixed" as const, delay: 60000 } }
        : { attempts: 3, backoff: { type: "exponential" as const, delay: 5000 } };

    const jobIdSeed = certificateRequestId ?? certificateId;

    if (certificateRequestId && certificateRequestDAL) {
      try {
        await certificateRequestDAL.setPendingMessage(certificateRequestId, "Waiting in the issuance queue");
      } catch (error) {
        logger.warn(error, `Failed to set queued pendingMessage [certificateRequestId=${certificateRequestId}]`);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    await queueService.queue(QueueName.CertificateIssuance, QueueJobs.CaIssueCertificateFromProfile, jobData as any, {
      jobId: `certificate-issuance-${jobIdSeed}`,
      ...queueOpts
    });
  };

  /**
   * Process certificate issuance jobs
   */
  const processCertificateIssuanceJobs = async (data: TIssueCertificateFromProfileJobData, signal?: AbortSignal) => {
    const {
      certificateId,
      profileId,
      caId,
      commonName,
      altNames,
      ttl,
      signatureAlgorithm,
      keyAlgorithm,
      keyUsages,
      extendedKeyUsages,
      isRenewal,
      originalCertificateId,
      certificateRequestId,
      csr,
      organization,
      organizationalUnit,
      country,
      state,
      locality
    } = data;

    const setPending = async (message: string) => {
      if (!certificateRequestId || !certificateRequestDAL) return;
      try {
        await certificateRequestDAL.setPendingMessage(certificateRequestId, message);
      } catch (error) {
        logger.warn(error, `Failed to set pendingMessage [certificateRequestId=${certificateRequestId}]`);
      }
    };

    const isCancelled = async (): Promise<boolean> => {
      if (!certificateRequestId || !certificateRequestDAL) return false;
      const current = await certificateRequestDAL.findById(certificateRequestId);
      if (!current) return false;
      return (
        current.status !== CertificateRequestStatus.PENDING &&
        current.status !== CertificateRequestStatus.PENDING_VALIDATION
      );
    };

    try {
      logger.info(`Processing certificate issuance job for [certificateId=${certificateId}] [caId=${caId}]`);

      if (await isCancelled()) {
        logger.info(
          `Skipping issuance — certificate request is no longer pending [certificateRequestId=${certificateRequestId}]`
        );
        return;
      }

      if (!caId) {
        throw new NotFoundError({
          message: `Certificate authority ID is required for external CA certificate issuance`
        });
      }

      const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);

      await setPending("Starting certificate issuance");

      if (ca.externalCa?.type === CaType.ACME) {
        let certificateCsr: string;
        let skLeaf: string = "";

        if (csr) {
          // Ensure CSR is in proper PEM format (handles raw base64 DER content)
          certificateCsr = ensureCsrPemFormat(csr);
        } else {
          const keyAlg = keyAlgorithmToAlgCfg(keyAlgorithm as CertKeyAlgorithm);
          const leafKeys = await crypto.nativeCrypto.subtle.generateKey(keyAlg, true, ["sign", "verify"]);
          const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
          skLeaf = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

          const [, generatedCsr] = await acme.crypto.createCsr(
            {
              altNames: altNames ? altNames.map((san) => san.value) : [],
              commonName: commonName || ""
            },
            skLeaf
          );
          certificateCsr = generatedCsr.toString();
        }

        if (await isCancelled()) {
          logger.info(`Cancelled before ACME order [certificateRequestId=${certificateRequestId}]`);
          return;
        }

        let acmeResult;
        try {
          acmeResult = await runWithAcmeCancellation(signal, () =>
            runWithAcmeOrderTimeout(
              (timeoutSignal) =>
                acmeFns.orderCertificateFromProfile({
                  caId,
                  profileId,
                  commonName: commonName || "",
                  altNames: altNames?.map((san) => san.value) || [],
                  csr: Buffer.from(certificateCsr),
                  csrPrivateKey: skLeaf,
                  keyUsages: keyUsages as CertKeyUsage[],
                  extendedKeyUsages: extendedKeyUsages as CertExtendedKeyUsage[],
                  ttl,
                  signatureAlgorithm,
                  keyAlgorithm,
                  isRenewal,
                  originalCertificateId,
                  onProgress: setPending,
                  isCancelled,
                  abortSignal: timeoutSignal
                }),
              ACME_ORDER_TIMEOUT_MS
            )
          );
        } catch (acmeError) {
          if (isAcmeRateLimitError(acmeError)) {
            const message = acmeError instanceof Error ? acmeError.message : String(acmeError);
            throw new AcmeRateLimitError(`ACME CA rate-limited the order: ${message}`);
          }
          throw acmeError;
        }

        if (await isCancelled()) {
          logger.info(
            `Cancelled after ACME order — certificate exists at CA but will not be attached [certificateRequestId=${certificateRequestId}]`
          );
          return;
        }

        if (certificateRequestId && certificateRequestService && acmeResult?.id) {
          try {
            await certificateRequestService.attachCertificateToRequest({
              certificateRequestId,
              certificateId: acmeResult.id
            });

            // Copy metadata from cert request to newly issued cert
            await copyMetadataFromRequestToCertificate(resourceMetadataDAL, {
              certificateRequestId,
              certificateId: acmeResult.id
            });

            logger.info(`Certificate attached to request [certificateRequestId=${certificateRequestId}]`);
          } catch (attachError) {
            logger.error(
              attachError,
              `Failed to attach certificate to request [certificateRequestId=${certificateRequestId}]`
            );
            try {
              await certificateRequestService.updateCertificateRequestStatus({
                certificateRequestId,
                status: CertificateRequestStatus.FAILED,
                errorMessage: `Failed to attach certificate: ${attachError instanceof Error ? attachError.message : String(attachError)}`
              });
            } catch (statusUpdateError) {
              logger.error(
                statusUpdateError,
                `Failed to update certificate request status [certificateRequestId=${certificateRequestId}]`
              );
            }
          }
        }
      } else if (ca.externalCa?.type === CaType.AZURE_AD_CS) {
        await setPending("Submitting the request to Azure AD CS");
        let template: string | undefined;
        if (certificateProfileDAL && profileId) {
          try {
            const profile = await certificateProfileDAL.findById(profileId);
            if (
              profile?.externalConfigs &&
              typeof profile.externalConfigs === "object" &&
              profile.externalConfigs !== null
            ) {
              const configs = profile.externalConfigs;
              if (typeof configs.template === "string") {
                template = configs.template;
              }
            }
          } catch (error) {
            logger.warn(
              `Failed to fetch profile ${profileId} for template extraction: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }

        const azureParams = {
          caId,
          profileId,
          commonName: commonName || "",
          altNames: altNames?.map((san) => san.value) || [],
          keyUsages: keyUsages as CertKeyUsage[],
          extendedKeyUsages: extendedKeyUsages as CertExtendedKeyUsage[],
          validity: { ttl },
          signatureAlgorithm,
          keyAlgorithm: keyAlgorithm as CertKeyAlgorithm,
          isRenewal,
          originalCertificateId,
          template,
          ...(csr && { csr }),
          isCancelled
        };

        if (await isCancelled()) {
          logger.info(`Cancelled before Azure AD CS order [certificateRequestId=${certificateRequestId}]`);
          return;
        }

        const azureResult = await azureAdCsFns.orderCertificateFromProfile(
          azureParams as Parameters<typeof azureAdCsFns.orderCertificateFromProfile>[0]
        );

        if (await isCancelled()) {
          logger.info(`Cancelled after Azure AD CS order [certificateRequestId=${certificateRequestId}]`);
          return;
        }

        if (certificateRequestId && certificateRequestService && azureResult?.certificateId) {
          try {
            await certificateRequestService.attachCertificateToRequest({
              certificateRequestId,
              certificateId: azureResult.certificateId
            });

            await copyMetadataFromRequestToCertificate(resourceMetadataDAL, {
              certificateRequestId,
              certificateId: azureResult.certificateId
            });

            logger.info(`Certificate attached to request [certificateRequestId=${certificateRequestId}]`);
          } catch (attachError) {
            logger.error(
              attachError,
              `Failed to attach certificate to request [certificateRequestId=${certificateRequestId}]`
            );
            try {
              await certificateRequestService.updateCertificateRequestStatus({
                certificateRequestId,
                status: CertificateRequestStatus.FAILED,
                errorMessage: `Failed to attach certificate: ${attachError instanceof Error ? attachError.message : String(attachError)}`
              });
            } catch (statusUpdateError) {
              logger.error(
                statusUpdateError,
                `Failed to update certificate request status [certificateRequestId=${certificateRequestId}]`
              );
            }
          }
        }
      } else if (ca.externalCa?.type === CaType.AWS_ACM_PUBLIC_CA) {
        await setPending("Submitting the request to AWS ACM Public CA");
        const acmParams = {
          caId,
          profileId,
          certificateId,
          commonName: commonName || "",
          altNames: (altNames || []) as Array<{ type: CertSubjectAlternativeNameType; value: string }>,
          keyUsages,
          extendedKeyUsages,
          validity: { ttl },
          signatureAlgorithm,
          keyAlgorithm: keyAlgorithm as CertKeyAlgorithm,
          isRenewal,
          originalCertificateId,
          ...(csr && { csr }),
          organization,
          organizationalUnit,
          country,
          state,
          locality,
          isCancelled
        };

        if (await isCancelled()) {
          logger.info(`Cancelled before AWS ACM Public CA order [certificateRequestId=${certificateRequestId}]`);
          return;
        }

        const acmResult = await awsAcmPublicCaFns.orderCertificateFromProfile(
          acmParams as Parameters<typeof awsAcmPublicCaFns.orderCertificateFromProfile>[0]
        );

        if (await isCancelled()) {
          logger.info(`Cancelled after AWS ACM Public CA order [certificateRequestId=${certificateRequestId}]`);
          return;
        }

        if (certificateRequestId && certificateRequestService && acmResult?.certificateId) {
          try {
            await certificateRequestService.attachCertificateToRequest({
              certificateRequestId,
              certificateId: acmResult.certificateId
            });

            await copyMetadataFromRequestToCertificate(resourceMetadataDAL, {
              certificateRequestId,
              certificateId: acmResult.certificateId
            });

            logger.info(`Certificate attached to request [certificateRequestId=${certificateRequestId}]`);
          } catch (attachError) {
            logger.error(
              attachError,
              `Failed to attach certificate to request [certificateRequestId=${certificateRequestId}]`
            );
            try {
              await certificateRequestService.updateCertificateRequestStatus({
                certificateRequestId,
                status: CertificateRequestStatus.FAILED,
                errorMessage: `Failed to attach certificate: ${attachError instanceof Error ? attachError.message : String(attachError)}`
              });
            } catch (statusUpdateError) {
              logger.error(
                statusUpdateError,
                `Failed to update certificate request status [certificateRequestId=${certificateRequestId}]`
              );
            }
          }
        }
      } else if (ca.externalCa?.type === CaType.AWS_PCA) {
        await setPending("Submitting the request to AWS Private CA");
        const awsPcaParams = {
          caId,
          profileId,
          commonName: commonName || "",
          altNames: (altNames || []) as Array<{ type: CertSubjectAlternativeNameType; value: string }>,
          keyUsages: keyUsages as CertKeyUsage[],
          extendedKeyUsages: extendedKeyUsages as CertExtendedKeyUsage[],
          validity: { ttl },
          signatureAlgorithm,
          keyAlgorithm: keyAlgorithm as CertKeyAlgorithm,
          isRenewal,
          originalCertificateId,
          ...(csr && { csr }),
          organization,
          organizationalUnit,
          country,
          state,
          locality,
          isCancelled
        };

        if (await isCancelled()) {
          logger.info(`Cancelled before AWS Private CA order [certificateRequestId=${certificateRequestId}]`);
          return;
        }

        const awsPcaResult = await awsPcaFns.orderCertificateFromProfile(
          awsPcaParams as Parameters<typeof awsPcaFns.orderCertificateFromProfile>[0]
        );

        if (await isCancelled()) {
          logger.info(`Cancelled after AWS Private CA order [certificateRequestId=${certificateRequestId}]`);
          return;
        }

        if (certificateRequestId && certificateRequestService && awsPcaResult?.certificateId) {
          try {
            await certificateRequestService.attachCertificateToRequest({
              certificateRequestId,
              certificateId: awsPcaResult.certificateId
            });

            await copyMetadataFromRequestToCertificate(resourceMetadataDAL, {
              certificateRequestId,
              certificateId: awsPcaResult.certificateId
            });

            logger.info(`Certificate attached to request [certificateRequestId=${certificateRequestId}]`);
          } catch (attachError) {
            logger.error(
              attachError,
              `Failed to attach certificate to request [certificateRequestId=${certificateRequestId}]`
            );
            try {
              await certificateRequestService.updateCertificateRequestStatus({
                certificateRequestId,
                status: CertificateRequestStatus.FAILED,
                errorMessage: `Failed to attach certificate: ${attachError instanceof Error ? attachError.message : String(attachError)}`
              });
            } catch (statusUpdateError) {
              logger.error(
                statusUpdateError,
                `Failed to update certificate request status [certificateRequestId=${certificateRequestId}]`
              );
            }
          }
        }
      } else if (ca.externalCa?.type === CaType.DIGICERT) {
        if (!certificateRequestId || !certificateRequestDAL) {
          throw new NotFoundError({
            message: "DigiCert issuance requires a certificate request and request DAL"
          });
        }

        await setPending("Submitting the request to DigiCert");

        let renewalOfOrderId: number | undefined;
        if (isRenewal && originalCertificateId) {
          const originalCert = await certificateDAL.findById(originalCertificateId);
          const parsedMetadata = DigiCertExternalMetadataSchema.safeParse(originalCert?.externalMetadata);
          if (parsedMetadata.success) {
            renewalOfOrderId = parsedMetadata.data.orderId;
          } else {
            logger.warn(
              `DigiCert renewal requested but previous certificate has no DigiCert order reference in externalMetadata — falling back to a new order [originalCertificateId=${originalCertificateId}]`
            );
          }
        }

        if (await isCancelled()) {
          logger.info(`Cancelled before DigiCert order [certificateRequestId=${certificateRequestId}]`);
          return;
        }

        const digicertResult = await digicertFns.orderCertificateFromProfile({
          caId,
          commonName: commonName || "",
          altNames: altNames?.map((san) => san.value) || [],
          signatureAlgorithm,
          keyAlgorithm: keyAlgorithm as CertKeyAlgorithm,
          ttl,
          ...(csr && { csr }),
          ...(renewalOfOrderId !== undefined && { renewalOfOrderId })
        });

        if (await isCancelled()) {
          logger.info(
            `Cancelled after DigiCert order — order placed at CA but will not be tracked locally [certificateRequestId=${certificateRequestId}]`
          );
          return;
        }

        let encryptedPrivateKey: Buffer | undefined;
        if (digicertResult.privateKey) {
          const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
            projectId: ca.projectId,
            projectDAL,
            kmsService
          });
          const kmsEncryptor = await kmsService.encryptWithKmsKey({ kmsId: certificateManagerKmsId });
          const { cipherTextBlob } = await kmsEncryptor({ plainText: Buffer.from(digicertResult.privateKey) });
          encryptedPrivateKey = cipherTextBlob;
        }

        const metadataWithRenewal = {
          ...digicertResult.metadata,
          digicert: {
            ...digicertResult.metadata.digicert,
            ...(isRenewal && originalCertificateId ? { isRenewal: true, originalCertificateId } : {})
          }
        };

        const transitioned = await certificateRequestDAL.transitionToPendingValidation(certificateRequestId, {
          metadata: JSON.stringify(metadataWithRenewal),
          ...(encryptedPrivateKey && { encryptedPrivateKey })
        });

        if (!transitioned) {
          logger.info(
            `Skipping DigiCert validation transition — request is no longer pending [certificateRequestId=${certificateRequestId}]`
          );
          return;
        }

        if (digicertResult.immediateCertificateId) {
          try {
            const { certificateId: attachedCertificateId } = await digicertFns.fetchAndAttachIssuedCertificate({
              caId,
              certificateRequest: {
                id: certificateRequestId,
                profileId,
                commonName: commonName || "",
                altNames: altNames?.map((san) => san.value).join(",") ?? null,
                keyUsages: keyUsages ?? null,
                extendedKeyUsages: extendedKeyUsages ?? null,
                keyAlgorithm,
                signatureAlgorithm
              },
              digicertCertificateId: digicertResult.immediateCertificateId,
              digicertOrderId: digicertResult.orderId,
              encryptedPrivateKey,
              isRenewal,
              originalCertificateId
            });

            if (certificateRequestService) {
              await certificateRequestService.attachCertificateToRequest({
                certificateRequestId,
                certificateId: attachedCertificateId
              });
              await copyMetadataFromRequestToCertificate(resourceMetadataDAL, {
                certificateRequestId,
                certificateId: attachedCertificateId
              });
            }

            logger.info(
              `DigiCert order issued immediately (pre-validated domains), attached certificate [certificateRequestId=${certificateRequestId}] [certificateId=${attachedCertificateId}]`
            );
          } catch (finaliseError) {
            logger.error(
              finaliseError,
              `DigiCert immediate finalisation failed, will be retried by polling queue [certificateRequestId=${certificateRequestId}]`
            );
          }
        } else {
          await setPending(`DigiCert is processing the request — order #${digicertResult.metadata.digicert.orderId}`);
          logger.info(
            `DigiCert order placed, awaiting validation [certificateRequestId=${certificateRequestId}] [orderId=${digicertResult.metadata.digicert.orderId}]`
          );
        }
      } else if (ca.externalCa?.type === CaType.GODADDY) {
        if (!certificateRequestId || !certificateRequestDAL) {
          throw new NotFoundError({
            message: "GoDaddy issuance requires a certificate request and request DAL"
          });
        }

        await setPending("Submitting the request to GoDaddy");

        let renewalOfCertificateId: string | undefined;
        if (isRenewal && originalCertificateId) {
          const originalCert = await certificateDAL.findById(originalCertificateId);
          const parsedMetadata = GoDaddyExternalMetadataSchema.safeParse(originalCert?.externalMetadata);
          if (parsedMetadata.success) {
            renewalOfCertificateId = parsedMetadata.data.certificateId;
          } else {
            logger.warn(
              `GoDaddy renewal requested but previous certificate has no GoDaddy reference in externalMetadata — falling back to a new order [originalCertificateId=${originalCertificateId}]`
            );
          }
        }

        if (await isCancelled()) {
          logger.info(`Cancelled before GoDaddy order [certificateRequestId=${certificateRequestId}]`);
          return;
        }

        const godaddyResult = await godaddyFns.orderCertificateFromProfile({
          caId,
          commonName: commonName || "",
          altNames: altNames?.map((san) => san.value) || [],
          signatureAlgorithm,
          keyAlgorithm: keyAlgorithm as CertKeyAlgorithm,
          ttl,
          ...(csr && { csr }),
          ...(renewalOfCertificateId && { renewalOfCertificateId })
        });

        if (await isCancelled()) {
          logger.info(
            `Cancelled after GoDaddy order — order placed at CA but will not be tracked locally [certificateRequestId=${certificateRequestId}]`
          );
          return;
        }

        let encryptedPrivateKey: Buffer | undefined;
        if (godaddyResult.privateKey) {
          const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
            projectId: ca.projectId,
            projectDAL,
            kmsService
          });
          const kmsEncryptor = await kmsService.encryptWithKmsKey({ kmsId: certificateManagerKmsId });
          const { cipherTextBlob } = await kmsEncryptor({ plainText: Buffer.from(godaddyResult.privateKey) });
          encryptedPrivateKey = cipherTextBlob;
        }

        const metadataWithRenewal = {
          ...godaddyResult.metadata,
          godaddy: {
            ...godaddyResult.metadata.godaddy,
            ...(isRenewal && originalCertificateId ? { isRenewal: true, originalCertificateId } : {})
          }
        };

        const transitioned = await certificateRequestDAL.transitionToPendingValidation(certificateRequestId, {
          metadata: JSON.stringify(metadataWithRenewal),
          ...(encryptedPrivateKey && { encryptedPrivateKey })
        });

        if (!transitioned) {
          logger.info(
            `Skipping GoDaddy validation transition — request is no longer pending [certificateRequestId=${certificateRequestId}]`
          );
          return;
        }

        await setPending(
          `GoDaddy is processing the request — certificate ${godaddyResult.metadata.godaddy.certificateId}`
        );
        logger.info(
          `GoDaddy order placed, awaiting validation [certificateRequestId=${certificateRequestId}] [godaddyCertificateId=${godaddyResult.metadata.godaddy.certificateId}]`
        );
      } else if (ca.externalCa?.type === CaType.VENAFI_TPP) {
        await setPending("Submitting the request to Venafi TPP");
        const venafiTppParams = {
          caId,
          profileId,
          commonName: commonName || "",
          altNames: (altNames || []) as Array<{ type: CertSubjectAlternativeNameType; value: string }>,
          keyUsages: keyUsages as CertKeyUsage[],
          extendedKeyUsages: extendedKeyUsages as CertExtendedKeyUsage[],
          validity: { ttl },
          signatureAlgorithm,
          keyAlgorithm: keyAlgorithm as CertKeyAlgorithm,
          isRenewal,
          originalCertificateId,
          ...(csr && { csr }),
          organization,
          organizationalUnit,
          country,
          state,
          locality,
          isCancelled
        };

        if (await isCancelled()) {
          logger.info(`Cancelled before Venafi TPP order [certificateRequestId=${certificateRequestId}]`);
          return;
        }

        const venafiTppResult = await venafiTppFns.orderCertificateFromProfile(
          venafiTppParams as Parameters<typeof venafiTppFns.orderCertificateFromProfile>[0]
        );

        if (await isCancelled()) {
          logger.info(`Cancelled after Venafi TPP order [certificateRequestId=${certificateRequestId}]`);
          return;
        }

        if (certificateRequestId && certificateRequestService && venafiTppResult?.certificateId) {
          try {
            await certificateRequestService.attachCertificateToRequest({
              certificateRequestId,
              certificateId: venafiTppResult.certificateId
            });

            await copyMetadataFromRequestToCertificate(resourceMetadataDAL, {
              certificateRequestId,
              certificateId: venafiTppResult.certificateId
            });

            logger.info(`Certificate attached to request [certificateRequestId=${certificateRequestId}]`);
          } catch (attachError) {
            logger.error(
              attachError,
              `Failed to attach certificate to request [certificateRequestId=${certificateRequestId}]`
            );
            try {
              await certificateRequestService.updateCertificateRequestStatus({
                certificateRequestId,
                status: CertificateRequestStatus.FAILED,
                errorMessage: `Failed to attach certificate: ${attachError instanceof Error ? attachError.message : String(attachError)}`
              });
            } catch (statusUpdateError) {
              logger.error(
                statusUpdateError,
                `Failed to update certificate request status [certificateRequestId=${certificateRequestId}]`
              );
            }
          }
        }
      }

      logger.info(
        `Successfully processed certificate issuance job with [certificateId=${certificateId}] [caId=${caId}]`
      );

      let scopedApplicationId: string | null = data.applicationId ?? null;
      try {
        if (!scopedApplicationId && isRenewal && originalCertificateId) {
          const orig = await certificateDAL.findById(originalCertificateId);
          scopedApplicationId = orig?.applicationId ?? null;
        }
        if (scopedApplicationId && certificateRequestId && certificateRequestDAL) {
          const req = await certificateRequestDAL.findById(certificateRequestId);
          if (req?.certificateId) {
            await certificateDAL.updateById(req.certificateId, { applicationId: scopedApplicationId });
          }
        }
      } catch (stampErr) {
        logger.warn(
          stampErr,
          `Failed to stamp applicationId on async-issued certificate [certificateRequestId=${certificateRequestId}]`
        );
      }

      try {
        if (scopedApplicationId && profileId && certificateProfileDAL && certificateRequestDAL) {
          const req = await certificateRequestDAL.findById(certificateRequestId!);
          if (req?.certificateId) {
            const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
            if (profile) {
              const effectiveApiConfig = await resolveEffectiveApiConfig({
                applicationId: scopedApplicationId,
                profileId,
                profileApiConfig: profile.apiConfig,
                pkiApplicationProfileDAL,
                apiEnrollmentConfigDAL
              });
              const cert = await certificateDAL.findById(req.certificateId);
              if (cert && !cert.renewBeforeDays) {
                const finalRenewBeforeDays = calculateFinalRenewBeforeDays(
                  { apiConfig: effectiveApiConfig },
                  ttl,
                  new Date(cert.notAfter)
                );
                if (finalRenewBeforeDays !== undefined) {
                  await certificateDAL.updateById(req.certificateId, { renewBeforeDays: finalRenewBeforeDays });
                }
              }
            }
          }
        }
      } catch (renewErr) {
        logger.warn(
          renewErr,
          `Failed to set renewBeforeDays on async-issued certificate [certificateRequestId=${certificateRequestId}]`
        );
      }

      try {
        if (isRenewal && originalCertificateId && certificateRequestId && certificateRequestDAL) {
          const req = await certificateRequestDAL.findById(certificateRequestId);
          if (req?.certificateId) {
            await addRenewedCertificateToSyncs(originalCertificateId, req.certificateId, { certificateSyncDAL });
            await triggerAutoSyncForCertificate(req.certificateId, {
              certificateSyncDAL,
              pkiSyncDAL,
              pkiSyncQueue
            });
          }
        }
      } catch (syncErr) {
        logger.warn(
          syncErr,
          `Failed to link renewed certificate to PKI syncs [originalCertificateId=${originalCertificateId}] [certificateRequestId=${certificateRequestId}]`
        );
      }

      try {
        await pkiAlertV2Queue?.queueCertificateEvent({
          certificateId,
          projectId: ca.projectId,
          eventType: isRenewal ? PkiAlertEventType.RENEWAL : PkiAlertEventType.ISSUANCE,
          applicationId: scopedApplicationId
        });
      } catch {
        logger.debug("Failed to queue PKI alert event for async certificate issuance");
      }
    } catch (error: unknown) {
      if (error instanceof CertificateRequestCancelledError) {
        logger.info(
          `Certificate issuance aborted — request was cancelled before persistence [certificateRequestId=${certificateRequestId}]`
        );
        throw new UnrecoverableError(error.message);
      }

      // AcmPendingError signals that an ACM operation (DNS validation, renewal, export) is still
      // in flight. Don't mark the request as FAILED on every poll — only after the queue exhausts attempts.
      const isRetryable = error instanceof AcmPendingError;
      if (isRetryable) {
        await setPending(`AWS ACM is validating DNS records — ${error.message}`);
        logger.info(
          `Certificate issuance pending ACM operation — will retry [certificateId=${certificateId}] [caId=${caId}]`
        );
        throw error;
      }

      logger.error(error, `Certificate issuance job failed for [certificateId=${certificateId}] [caId=${caId}]`);

      const isAcmeTerminal = error instanceof AcmeOrderTimeoutError || error instanceof AcmeRateLimitError;

      if (certificateRequestId && certificateRequestService) {
        try {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await certificateRequestService.updateCertificateRequestStatus({
            certificateRequestId,
            status: CertificateRequestStatus.FAILED,
            errorMessage: isAcmeTerminal ? errorMessage : `Certificate issuance failed: ${errorMessage}`
          });
          logger.info(`Updated certificate request ${certificateRequestId} status to failed due to issuance error`);
        } catch (statusUpdateError) {
          logger.error(
            statusUpdateError,
            `Failed to update certificate request status [certificateRequestId=${certificateRequestId}]`
          );
        }
      }

      // For ACM's 30-attempt queue, wrap non-retryable errors so BullMQ stops retrying immediately.
      // Other CAs keep default retry behavior (3 attempts is short enough that running through them is fine).
      if (data.caType === CaType.AWS_ACM_PUBLIC_CA || isAcmeTerminal) {
        const message = error instanceof Error ? error.message : String(error);
        const wrapped = new UnrecoverableError(message);
        (wrapped as Error).cause = error;
        throw wrapped;
      }

      throw error;
    }
  };

  queueService.start(QueueName.CertificateIssuance, async (job, _token, signal) => {
    const work = (async () => {
      try {
        await processCertificateIssuanceJobs(job.data, signal);
      } catch (error) {
        // AcmPendingError is rethrown on every retry so BullMQ keeps polling; the in-handler
        // FAILED-update branch never runs for it. On the final attempt we still need to flip the request
        // row to FAILED ourselves — BullMQ will move the job to the failed state but has no hook to
        // update our DB, and no queue-level "failed" listener is wired for CertificateIssuance.
        if (error instanceof AcmPendingError) {
          const attemptsMade = job.attemptsMade ?? 0;
          const maxAttempts = job.opts?.attempts ?? 1;
          const isFinalAttempt = attemptsMade + 1 >= maxAttempts;
          const { certificateRequestId, certificateId, caId } = job.data;
          if (isFinalAttempt && certificateRequestId && certificateRequestService) {
            try {
              await certificateRequestService.updateCertificateRequestStatus({
                certificateRequestId,
                status: CertificateRequestStatus.FAILED,
                errorMessage: `AWS ACM DNS validation did not complete after ${maxAttempts} attempts: ${error.message}`
              });
              logger.info(
                `Marked certificate request FAILED after exhausted ACM validation retries [certificateRequestId=${certificateRequestId}] [certificateId=${certificateId}] [caId=${caId}]`
              );
            } catch (updateError) {
              logger.error(
                updateError,
                `Failed to mark certificate request FAILED after exhausted ACM retries [certificateRequestId=${certificateRequestId}]`
              );
            }
          }
        }
        throw error;
      }
    })();

    if (!signal) {
      await work;
      return;
    }

    if (signal.aborted) {
      // Someone called cancelActiveJob before we even started racing. Detach the orphan
      // and surface the cancellation as a non-retryable failure so BullMQ frees the worker.
      work.catch((err) => logger.warn(err, `Orphaned cert issuance after cancel [jobId=${job.id}]`));
      throw new UnrecoverableError(`Cancelled: ${(signal.reason as string | undefined) ?? "cancelled"}`);
    }

    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error(`Cancelled: ${(signal.reason as string | undefined) ?? "cancelled"}`));
      signal.addEventListener("abort", onAbort, { once: true });
    });

    try {
      await Promise.race([work, aborted]);
    } catch (error) {
      if (signal.aborted) {
        work.catch((err) => logger.warn(err, `Orphaned cert issuance after cancel [jobId=${job.id}]`));
        throw new UnrecoverableError(error instanceof Error ? error.message : String(error));
      }
      throw error;
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  });

  return {
    queueCertificateIssuance,
    processCertificateIssuanceJobs,
    acmeFns,
    azureAdCsFns,
    awsPcaFns,
    awsAcmPublicCaFns,
    digicertFns,
    venafiTppFns
  };
};
