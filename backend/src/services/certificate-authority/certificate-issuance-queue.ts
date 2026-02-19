import acme from "acme-client";

import { crypto } from "@app/lib/crypto/cryptography";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/services/certificate/certificate-types";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { TAppConnectionServiceFactory } from "../app-connection/app-connection-service";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { CertKeyAlgorithm } from "../certificate-common/certificate-constants";
import { TCertificateRequestServiceFactory } from "../certificate-request/certificate-request-service";
import { CertificateRequestStatus } from "../certificate-request/certificate-request-types";
import { TPkiSubscriberDALFactory } from "../pki-subscriber/pki-subscriber-dal";
import { TPkiSyncDALFactory } from "../pki-sync/pki-sync-dal";
import { TPkiSyncQueueFactory } from "../pki-sync/pki-sync-queue";
import { AcmeCertificateAuthorityFns } from "./acme/acme-certificate-authority-fns";
import { AwsPcaCertificateAuthorityFns } from "./aws-pca/aws-pca-certificate-authority-fns";
import { AzureAdCsCertificateAuthorityFns } from "./azure-ad-cs/azure-ad-cs-certificate-authority-fns";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import { CaType } from "./certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "./certificate-authority-fns";
import { TExternalCertificateAuthorityDALFactory } from "./external-certificate-authority-dal";

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
  profileId: string;
  caId: string;
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
};

type TCertificateIssuanceQueueFactoryDep = {
  certificateAuthorityDAL: TCertificateAuthorityDALFactory;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "create" | "update">;
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
  certificateProfileDAL?: Pick<TCertificateProfileDALFactory, "findById">;
  certificateRequestService?: Pick<
    TCertificateRequestServiceFactory,
    "attachCertificateToRequest" | "updateCertificateRequestStatus"
  >;
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
  certificateProfileDAL,
  certificateRequestService
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

  /**
   * Queue a certificate issuance job using pgBoss
   */
  const queueCertificateIssuance = async ({
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
  }: TIssueCertificateFromProfileJobData) => {
    const jobData: TIssueCertificateFromProfileJobData = {
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
    };

    await queueService.queue(QueueName.CertificateIssuance, QueueJobs.CaIssueCertificateFromProfile, jobData, {
      jobId: `certificate-issuance-${certificateId}`,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000
      }
    });
  };

  /**
   * Process certificate issuance jobs
   */
  const processCertificateIssuanceJobs = async (data: TIssueCertificateFromProfileJobData) => {
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

    try {
      logger.info(`Processing certificate issuance job for [certificateId=${certificateId}] [caId=${caId}]`);

      if (!caId) {
        throw new NotFoundError({
          message: `Certificate authority ID is required for external CA certificate issuance`
        });
      }

      const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);

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

        const acmeResult = await acmeFns.orderCertificateFromProfile({
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
          originalCertificateId
        });

        if (certificateRequestId && certificateRequestService && acmeResult?.id) {
          try {
            await certificateRequestService.attachCertificateToRequest({
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
        let template: string | undefined;
        if (certificateProfileDAL) {
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
          ...(csr && { csr })
        };

        const azureResult = await azureAdCsFns.orderCertificateFromProfile(azureParams);

        if (certificateRequestId && certificateRequestService && azureResult?.certificateId) {
          try {
            await certificateRequestService.attachCertificateToRequest({
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
      } else if (ca.externalCa?.type === CaType.AWS_PCA) {
        const awsPcaParams = {
          caId,
          profileId,
          commonName: commonName || "",
          altNames: altNames || [],
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
          locality
        };

        const awsPcaResult = await awsPcaFns.orderCertificateFromProfile(awsPcaParams);

        if (certificateRequestId && certificateRequestService && awsPcaResult?.certificateId) {
          try {
            await certificateRequestService.attachCertificateToRequest({
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
      }

      logger.info(
        `Successfully processed certificate issuance job with [certificateId=${certificateId}] [caId=${caId}]`
      );
    } catch (error: unknown) {
      logger.error(error, `Certificate issuance job failed for [certificateId=${certificateId}] [caId=${caId}]`);

      if (certificateRequestId && certificateRequestService) {
        try {
          await certificateRequestService.updateCertificateRequestStatus({
            certificateRequestId,
            status: CertificateRequestStatus.FAILED,
            errorMessage: `Certificate issuance failed: ${error instanceof Error ? error.message : String(error)}`
          });
          logger.info(`Updated certificate request ${certificateRequestId} status to failed due to issuance error`);
        } catch (statusUpdateError) {
          logger.error(
            statusUpdateError,
            `Failed to update certificate request status [certificateRequestId=${certificateRequestId}]`
          );
        }
      }

      throw error;
    }
  };

  queueService.start(QueueName.CertificateIssuance, async (job) => {
    await processCertificateIssuanceJobs(job.data);
  });

  return {
    queueCertificateIssuance,
    processCertificateIssuanceJobs
  };
};
