/* eslint-disable no-continue, no-await-in-loop */
import RE2 from "re2";

import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { JOB_SCHEDULER_PREFIX, QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { decryptAppConnectionCredentials } from "../app-connection/app-connection-fns";
import { getAzureADCSConnectionCredentials } from "../app-connection/azure-adcs/azure-adcs-connection-fns";
import { TVenafiConnection } from "../app-connection/venafi/venafi-connection-types";
import { TKmsServiceFactory } from "../kms/kms-service";
import { submitCsrToAdcs } from "./ca-signing-config/adcs-signing-fns";
import { TCaSigningConfigDALFactory } from "./ca-signing-config/ca-signing-config-dal";
import { CaSigningConfigType } from "./ca-signing-config/ca-signing-config-enums";
import {
  AzureAdCsDestinationConfigSchema,
  VenafiDestinationConfigSchema
} from "./ca-signing-config/ca-signing-config-types";
import {
  downloadVenafiCertificate,
  pollVenafiCertificateIssuance,
  renewVenafiCertificate,
  submitCsrToVenafi
} from "./ca-signing-config/venafi-signing-fns";
import { CaRenewalStatus } from "./certificate-authority-enums";
import { TInternalCertificateAuthorityDALFactory } from "./internal/internal-certificate-authority-dal";
import { TInternalCertificateAuthorityServiceFactory } from "./internal/internal-certificate-authority-service";

type TCaAutoRenewalQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  internalCertificateAuthorityDAL: Pick<TInternalCertificateAuthorityDALFactory, "find" | "findOne" | "updateById">;
  caSigningConfigDAL: Pick<TCaSigningConfigDALFactory, "findByCaId" | "updateById">;
  internalCertificateAuthorityService: Pick<
    TInternalCertificateAuthorityServiceFactory,
    "getCaCsr" | "importCertToCa" | "renewCaCert"
  >;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TCaAutoRenewalQueueFactory = ReturnType<typeof caAutoRenewalQueueFactory>;

const BATCH_SIZE = 100;
const MAX_RENEWAL_MESSAGE_LENGTH = 1024;
const PEM_CERT_REGEX = new RE2("-----BEGIN CERTIFICATE-----[\\s\\S]*?-----END CERTIFICATE-----", "g");

export const caAutoRenewalQueueFactory = ({
  queueService,
  internalCertificateAuthorityDAL,
  caSigningConfigDAL,
  internalCertificateAuthorityService,
  appConnectionDAL,
  kmsService
}: TCaAutoRenewalQueueFactoryDep) => {
  /**
   * Shared helper that handles the full Venafi certificate issuance flow:
   * get signing config, get CSR, submit to Venafi, poll, download, import.
   */
  const processVenafiCertificateIssuance = async ({
    caId,
    internalCaId,
    maxPathLength
  }: {
    caId: string;
    internalCaId: string;
    maxPathLength?: number;
  }) => {
    const signingConfig = await caSigningConfigDAL.findByCaId(internalCaId);
    if (!signingConfig) {
      throw new Error("No signing config found");
    }

    if (signingConfig.type !== CaSigningConfigType.Venafi) {
      throw new Error(`Signing config type '${signingConfig.type}' is not Venafi`);
    }

    if (!signingConfig.appConnectionId) {
      throw new Error("Venafi signing config is missing app connection");
    }

    const parseResult = VenafiDestinationConfigSchema.safeParse(signingConfig.destinationConfig);
    if (!parseResult.success) {
      throw new Error("Venafi signing config has invalid or missing destination configuration");
    }
    const destinationConfig = parseResult.data;

    const { csr } = await internalCertificateAuthorityService.getCaCsr({
      isInternal: true,
      caId,
      ...(maxPathLength !== undefined && { maxPathLength })
    });

    const appConnection = await appConnectionDAL.findById(signingConfig.appConnectionId);
    if (!appConnection) {
      throw new Error(`Venafi app connection ${signingConfig.appConnectionId} not found`);
    }

    const credentials = (await decryptAppConnectionCredentials({
      orgId: appConnection.orgId,
      encryptedCredentials: appConnection.encryptedCredentials,
      kmsService,
      projectId: appConnection.projectId
    })) as TVenafiConnection["credentials"];

    const { apiKey, region } = credentials;

    let requestId: string;
    if (signingConfig.lastExternalCertificateId) {
      requestId = await renewVenafiCertificate({
        apiKey,
        region,
        existingCertificateId: signingConfig.lastExternalCertificateId,
        csr,
        destinationConfig
      });
    } else {
      requestId = await submitCsrToVenafi({
        apiKey,
        region,
        csr,
        destinationConfig
      });
    }

    const { certificateId } = await pollVenafiCertificateIssuance({
      apiKey,
      region,
      requestId
    });

    const pemBundle = await downloadVenafiCertificate({
      apiKey,
      region,
      certificateId
    });

    const pemCerts = PEM_CERT_REGEX.match(pemBundle);
    if (!pemCerts || pemCerts.length === 0) {
      throw new Error("Failed to parse certificate from Venafi response");
    }

    const certificate = pemCerts[0];
    const certificateChain = pemCerts.slice(1).join("\n");

    await internalCertificateAuthorityService.importCertToCa({
      isInternal: true,
      caId,
      certificate,
      certificateChain
    });

    await caSigningConfigDAL.updateById(signingConfig.id, {
      lastExternalCertificateId: certificateId
    });

    await internalCertificateAuthorityDAL.updateById(internalCaId, {
      lastRenewalStatus: CaRenewalStatus.SUCCESS,
      lastRenewalMessage: null,
      lastRenewalAt: new Date()
    });
  };

  const processInternalCaRenewal = async ({
    caId,
    internalCaId,
    notBefore,
    notAfter
  }: {
    caId: string;
    internalCaId: string;
    notBefore: Date;
    notAfter: Date;
  }) => {
    const currentDurationMs = notAfter.getTime() - notBefore.getTime();
    if (currentDurationMs <= 0) {
      throw new Error("Cannot determine certificate validity duration for auto-renewal");
    }

    const newNotAfter = new Date(Date.now() + currentDurationMs);

    await internalCertificateAuthorityService.renewCaCert({
      isInternal: true,
      caId,
      notAfter: newNotAfter.toISOString()
    });

    await internalCertificateAuthorityDAL.updateById(internalCaId, {
      lastRenewalStatus: CaRenewalStatus.SUCCESS,
      lastRenewalMessage: null,
      lastRenewalAt: new Date()
    });
  };

  const processAdcsCertificateIssuance = async ({
    caId,
    internalCaId,
    maxPathLength
  }: {
    caId: string;
    internalCaId: string;
    maxPathLength?: number;
  }) => {
    const signingConfig = await caSigningConfigDAL.findByCaId(internalCaId);
    if (!signingConfig) {
      throw new Error("No signing config found");
    }

    if (signingConfig.type !== CaSigningConfigType.AzureAdCs) {
      throw new Error(`Signing config type '${signingConfig.type}' is not Azure AD CS`);
    }

    if (!signingConfig.appConnectionId) {
      throw new Error("Azure AD CS signing config is missing app connection");
    }

    const parseResult = AzureAdCsDestinationConfigSchema.safeParse(signingConfig.destinationConfig);
    if (!parseResult.success) {
      throw new Error("Azure AD CS signing config has invalid or missing destination configuration");
    }
    const destinationConfig = parseResult.data;

    const { csr } = await internalCertificateAuthorityService.getCaCsr({
      isInternal: true,
      caId,
      ...(maxPathLength !== undefined && { maxPathLength })
    });

    const credentials = await getAzureADCSConnectionCredentials(
      signingConfig.appConnectionId,
      appConnectionDAL,
      kmsService
    );

    const { certificate, certificateChain } = await submitCsrToAdcs({
      credentials: {
        username: credentials.username,
        password: credentials.password,
        sslRejectUnauthorized: credentials.sslRejectUnauthorized,
        sslCertificate: credentials.sslCertificate
      },
      adcsUrl: credentials.adcsUrl,
      csr,
      template: destinationConfig.template,
      validityPeriod: destinationConfig.validityPeriod
    });

    await internalCertificateAuthorityService.importCertToCa({
      isInternal: true,
      caId,
      certificate,
      certificateChain
    });

    await internalCertificateAuthorityDAL.updateById(internalCaId, {
      lastRenewalStatus: CaRenewalStatus.SUCCESS,
      lastRenewalMessage: null,
      lastRenewalAt: new Date()
    });
  };

  queueService.start(QueueName.CaAutoRenewal, async (job) => {
    if (job.name === QueueJobs.CaVenafiInstall) {
      const { caId, maxPathLength } = job.data as { caId: string; maxPathLength?: number };

      logger.info({ caId }, `${QueueJobs.CaVenafiInstall}: processing Venafi install`);

      const internalCa = await internalCertificateAuthorityDAL.findOne({ caId });
      if (!internalCa) {
        logger.error({ caId }, `${QueueJobs.CaVenafiInstall}: internal CA not found`);
        return;
      }

      try {
        await processVenafiCertificateIssuance({
          caId,
          internalCaId: internalCa.id,
          maxPathLength
        });

        logger.info({ caId }, `${QueueJobs.CaVenafiInstall}: successfully installed certificate via Venafi`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error(error, `${QueueJobs.CaVenafiInstall}: CA ${caId} Venafi install failed`);

        await internalCertificateAuthorityDAL.updateById(internalCa.id, {
          lastRenewalStatus: CaRenewalStatus.FAILED,
          lastRenewalMessage: errorMessage.substring(0, MAX_RENEWAL_MESSAGE_LENGTH)
        });
      }

      return;
    }

    if (job.name === QueueJobs.CaAdcsInstall) {
      const { caId, maxPathLength } = job.data as { caId: string; maxPathLength?: number };

      logger.info({ caId }, `${QueueJobs.CaAdcsInstall}: processing ADCS install`);

      const internalCa = await internalCertificateAuthorityDAL.findOne({ caId });
      if (!internalCa) {
        logger.error({ caId }, `${QueueJobs.CaAdcsInstall}: internal CA not found`);
        return;
      }

      try {
        await processAdcsCertificateIssuance({
          caId,
          internalCaId: internalCa.id,
          maxPathLength
        });

        logger.info({ caId }, `${QueueJobs.CaAdcsInstall}: successfully installed certificate via ADCS`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error(error, `${QueueJobs.CaAdcsInstall}: CA ${caId} ADCS install failed`);

        await internalCertificateAuthorityDAL.updateById(internalCa.id, {
          lastRenewalStatus: CaRenewalStatus.FAILED,
          lastRenewalMessage: errorMessage.substring(0, MAX_RENEWAL_MESSAGE_LENGTH)
        });
      }

      return;
    }

    if (job.name !== QueueJobs.CaDailyAutoRenewal) return;

    logger.info(`${QueueJobs.CaDailyAutoRenewal}: queue task started`);

    const now = new Date();
    let offset = 0;
    let totalProcessed = 0;
    let totalRenewed = 0;
    let totalFailed = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const internalCas = await internalCertificateAuthorityDAL.find(
        { autoRenewalEnabled: true },
        { limit: BATCH_SIZE, offset }
      );

      if (internalCas.length === 0) break;

      for (const internalCa of internalCas) {
        totalProcessed += 1;

        try {
          if (!internalCa.notAfter || !internalCa.autoRenewalDaysBeforeExpiry) {
            continue;
          }

          const expiryDate = new Date(internalCa.notAfter);
          const renewalThreshold = new Date(expiryDate);
          renewalThreshold.setDate(renewalThreshold.getDate() - internalCa.autoRenewalDaysBeforeExpiry);

          if (now < renewalThreshold) {
            continue;
          }

          if (internalCa.type === "root") {
            if (!internalCa.notBefore) {
              throw new Error("Cannot auto-renew: certificate has no notBefore date");
            }
            await processInternalCaRenewal({
              caId: internalCa.caId,
              internalCaId: internalCa.id,
              notBefore: new Date(internalCa.notBefore),
              notAfter: expiryDate
            });
          } else {
            const signingConfig = await caSigningConfigDAL.findByCaId(internalCa.id);
            if (!signingConfig) {
              logger.warn(`CA ${internalCa.caId}: no signing config found, skipping auto-renewal`);
              continue;
            }

            if (signingConfig.type === CaSigningConfigType.Manual) {
              logger.warn(`CA ${internalCa.caId}: manual signing config does not support auto-renewal`);
              await internalCertificateAuthorityDAL.updateById(internalCa.id, {
                autoRenewalEnabled: false,
                lastRenewalStatus: CaRenewalStatus.FAILED,
                lastRenewalMessage: "Auto-renewal is not supported for manual signing configuration"
              });
              continue;
            }

            if (signingConfig.type === CaSigningConfigType.Internal) {
              if (!internalCa.notBefore) {
                throw new Error("Cannot auto-renew: certificate has no notBefore date");
              }
              await processInternalCaRenewal({
                caId: internalCa.caId,
                internalCaId: internalCa.id,
                notBefore: new Date(internalCa.notBefore),
                notAfter: expiryDate
              });
            } else if (signingConfig.type === CaSigningConfigType.Venafi) {
              await processVenafiCertificateIssuance({
                caId: internalCa.caId,
                internalCaId: internalCa.id
              });
            } else if (signingConfig.type === CaSigningConfigType.AzureAdCs) {
              await processAdcsCertificateIssuance({
                caId: internalCa.caId,
                internalCaId: internalCa.id
              });
            }
          }

          totalRenewed += 1;
          logger.info(`CA ${internalCa.caId}: successfully auto-renewed`);
        } catch (error) {
          totalFailed += 1;
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          logger.error(error, `CA ${internalCa.caId}: auto-renewal failed`);

          await internalCertificateAuthorityDAL.updateById(internalCa.id, {
            autoRenewalEnabled: false,
            lastRenewalStatus: CaRenewalStatus.FAILED,
            lastRenewalMessage: errorMessage.substring(0, MAX_RENEWAL_MESSAGE_LENGTH)
          });
        }
      }

      offset += BATCH_SIZE;
    }

    logger.info(
      `${QueueJobs.CaDailyAutoRenewal}: completed. Processed: ${totalProcessed}, Renewed: ${totalRenewed}, Failed: ${totalFailed}`
    );
  });

  const startDailyAutoRenewalJob = async () => {
    await queueService.upsertJobScheduler(
      QueueName.CaAutoRenewal,
      `${JOB_SCHEDULER_PREFIX}:${QueueJobs.CaDailyAutoRenewal}`,
      { pattern: "0 0 * * *" },
      { name: QueueJobs.CaDailyAutoRenewal }
    );
  };

  const queueVenafiInstall = async (caId: string, maxPathLength?: number) => {
    const internalCa = await internalCertificateAuthorityDAL.findOne({ caId });
    if (!internalCa) {
      throw new NotFoundError({ message: `Internal CA with caId ${caId} not found` });
    }

    if (internalCa.lastRenewalStatus === CaRenewalStatus.PENDING) {
      throw new BadRequestError({ message: "A certificate installation is already in progress for this CA" });
    }

    await internalCertificateAuthorityDAL.updateById(internalCa.id, {
      lastRenewalStatus: CaRenewalStatus.PENDING,
      lastRenewalMessage: null
    });

    await queueService.queue(
      QueueName.CaAutoRenewal,
      QueueJobs.CaVenafiInstall,
      { caId, maxPathLength },
      {
        jobId: `venafi-install-${caId}-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  };

  const queueAdcsInstall = async (caId: string, maxPathLength?: number) => {
    const internalCa = await internalCertificateAuthorityDAL.findOne({ caId });
    if (!internalCa) {
      throw new NotFoundError({ message: `Internal CA with caId ${caId} not found` });
    }

    if (internalCa.lastRenewalStatus === CaRenewalStatus.PENDING) {
      throw new BadRequestError({ message: "A certificate installation is already in progress for this CA" });
    }

    await internalCertificateAuthorityDAL.updateById(internalCa.id, {
      lastRenewalStatus: CaRenewalStatus.PENDING,
      lastRenewalMessage: null
    });

    await queueService.queue(
      QueueName.CaAutoRenewal,
      QueueJobs.CaAdcsInstall,
      { caId, maxPathLength },
      {
        jobId: `adcs-install-${caId}-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  };

  queueService.listen(QueueName.CaAutoRenewal, "failed", (_, err) => {
    logger.error(err, `${QueueName.CaAutoRenewal}: job failed`);
  });

  return { startDailyAutoRenewalJob, queueVenafiInstall, queueAdcsInstall };
};
