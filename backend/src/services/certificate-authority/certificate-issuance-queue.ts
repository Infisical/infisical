import acme from "acme-client";

import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, TQueueServiceFactory } from "@app/queue";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "@app/services/certificate/certificate-types";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { TAppConnectionServiceFactory } from "../app-connection/app-connection-service";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { TCertificateRequestServiceFactory } from "../certificate-request/certificate-request-service";
import { CertificateRequestStatus } from "../certificate-request/certificate-request-types";
import { TPkiSubscriberDALFactory } from "../pki-subscriber/pki-subscriber-dal";
import { TPkiSyncDALFactory } from "../pki-sync/pki-sync-dal";
import { TPkiSyncQueueFactory } from "../pki-sync/pki-sync-queue";
import { AcmeCertificateAuthorityFns } from "./acme/acme-certificate-authority-fns";
import { AzureAdCsCertificateAuthorityFns } from "./azure-ad-cs/azure-ad-cs-certificate-authority-fns";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import { CaType } from "./certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "./certificate-authority-fns";
import { TExternalCertificateAuthorityDALFactory } from "./external-certificate-authority-dal";

export type TIssueCertificateFromProfileJobData = {
  certificateId: string;
  profileId: string;
  caId: string;
  commonName?: string;
  altNames?: string[];
  ttl: string;
  signatureAlgorithm: string;
  keyAlgorithm: string;
  keyUsages?: string[];
  extendedKeyUsages?: string[];
  isRenewal?: boolean;
  originalCertificateId?: string;
  certificateRequestId?: string;
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
  const validateKeyUsages = (keyUsages: unknown): CertKeyUsage[] => {
    if (!keyUsages) return [];
    const validKeyUsages = Object.values(CertKeyUsage);

    if (Array.isArray(keyUsages)) {
      return keyUsages.filter(
        (usage): usage is CertKeyUsage => typeof usage === "string" && validKeyUsages.includes(usage as CertKeyUsage)
      );
    }

    return [];
  };

  const validateExtendedKeyUsages = (extendedKeyUsages: unknown): CertExtendedKeyUsage[] => {
    if (!extendedKeyUsages) return [];
    const validExtendedKeyUsages = Object.values(CertExtendedKeyUsage);

    if (Array.isArray(extendedKeyUsages)) {
      return extendedKeyUsages.filter(
        (usage): usage is CertExtendedKeyUsage =>
          typeof usage === "string" && validExtendedKeyUsages.includes(usage as CertExtendedKeyUsage)
      );
    }

    return [];
  };

  const validateKeyAlgorithm = (keyAlgorithm: unknown): CertKeyAlgorithm | undefined => {
    if (typeof keyAlgorithm !== "string") return undefined;
    const validKeyAlgorithms = Object.values(CertKeyAlgorithm);
    return validKeyAlgorithms.includes(keyAlgorithm as CertKeyAlgorithm)
      ? (keyAlgorithm as CertKeyAlgorithm)
      : undefined;
  };
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
    certificateRequestId
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
      certificateRequestId
    };

    await queueService.queuePg(QueueJobs.CaIssueCertificateFromProfile, jobData, {
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true
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
      certificateRequestId
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
        const validatedKeyAlgorithm = validateKeyAlgorithm(keyAlgorithm);
        if (!validatedKeyAlgorithm) {
          throw new BadRequestError({ message: `Invalid key algorithm: ${keyAlgorithm}` });
        }
        const keyAlg = keyAlgorithmToAlgCfg(validatedKeyAlgorithm);
        const leafKeys = await crypto.nativeCrypto.subtle.generateKey(keyAlg, true, ["sign", "verify"]);
        const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
        const skLeaf = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

        const [, certificateCsr] = await acme.crypto.createCsr(
          {
            altNames: altNames || [],
            commonName: commonName || ""
          },
          skLeaf
        );

        const acmeResult = await acmeFns.orderCertificateFromProfile({
          caId,
          profileId,
          commonName: commonName || "",
          altNames: altNames || [],
          csr: certificateCsr,
          csrPrivateKey: skLeaf,
          keyUsages: validateKeyUsages(keyUsages),
          extendedKeyUsages: validateExtendedKeyUsages(extendedKeyUsages),
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

        const validatedKeyAlgorithm = validateKeyAlgorithm(keyAlgorithm);
        if (!validatedKeyAlgorithm) {
          throw new BadRequestError({ message: `Invalid key algorithm: ${keyAlgorithm}` });
        }

        const azureParams = {
          caId,
          profileId,
          commonName: commonName || "",
          altNames: altNames || [],
          keyUsages: validateKeyUsages(keyUsages),
          extendedKeyUsages: validateExtendedKeyUsages(extendedKeyUsages),
          validity: { ttl },
          signatureAlgorithm,
          keyAlgorithm: validatedKeyAlgorithm,
          isRenewal,
          originalCertificateId,
          template
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

  const initializeCertificateIssuanceQueue = async () => {
    const appCfg = getConfig();

    await queueService.startPg(
      QueueJobs.CaIssueCertificateFromProfile,
      async ([job]) => {
        const data = job.data as TIssueCertificateFromProfileJobData;
        await processCertificateIssuanceJobs(data);
      },
      {
        workerCount: appCfg.NODE_ENV === "production" ? 3 : 1,
        batchSize: 1
      }
    );

    logger.info("Certificate issuance queue worker initialized successfully");
  };

  return {
    queueCertificateIssuance,
    initializeCertificateIssuanceQueue,
    processCertificateIssuanceJobs
  };
};
