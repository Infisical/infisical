import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue/queue-service";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";

import { TPkiCertificateInstallationCertDALFactory } from "./pki-certificate-installation-cert-dal";
import { TPkiCertificateInstallationDALFactory } from "./pki-certificate-installation-dal";
import { TPkiDiscoveryConfigDALFactory } from "./pki-discovery-config-dal";
import { executeLinuxServerScan } from "./pki-discovery-host-scan-fns";
import { TPkiDiscoveryInstallationDALFactory } from "./pki-discovery-installation-dal";
import { rescanInstallation } from "./pki-discovery-rescan-fns";
import { executeScan } from "./pki-discovery-scan-fns";
import { TPkiDiscoveryScanHistoryDALFactory } from "./pki-discovery-scan-history-dal";
import { PkiDiscoveryType } from "./pki-discovery-types";

type TPkiDiscoveryQueueFactoryDep = {
  pkiDiscoveryConfigDAL: TPkiDiscoveryConfigDALFactory;
  pkiDiscoveryScanHistoryDAL: TPkiDiscoveryScanHistoryDALFactory;
  pkiCertificateInstallationDAL: TPkiCertificateInstallationDALFactory;
  pkiDiscoveryInstallationDAL: TPkiDiscoveryInstallationDALFactory;
  pkiCertificateInstallationCertDAL: TPkiCertificateInstallationCertDALFactory;
  certificateDAL: TCertificateDALFactory;
  certificateBodyDAL: TCertificateBodyDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "findById" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "find">;
  queueService: TQueueServiceFactory;
  cronJob: TCronJobFactory;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findById">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId" | "selectGatewayFromPool">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
  keyStore: Pick<TKeyStoreFactory, "incrementByAndRefreshExpiryIfUnderLimit" | "decrementByOrDelete">;
};

const RESCAN_WORKER_CONCURRENCY = 3;

export type TPkiDiscoveryQueueFactory = ReturnType<typeof pkiDiscoveryQueueFactory>;

export const pkiDiscoveryQueueFactory = ({
  pkiDiscoveryConfigDAL,
  pkiDiscoveryScanHistoryDAL,
  pkiCertificateInstallationDAL,
  pkiDiscoveryInstallationDAL,
  pkiCertificateInstallationCertDAL,
  certificateDAL,
  certificateBodyDAL,
  projectDAL,
  kmsService,
  appConnectionDAL,
  queueService,
  cronJob,
  gatewayV2Service,
  gatewayV2DAL,
  gatewayPoolService,
  telemetryService,
  keyStore
}: TPkiDiscoveryQueueFactoryDep) => {
  const scanDeps = {
    appConnectionDAL,
    pkiDiscoveryConfigDAL,
    pkiDiscoveryScanHistoryDAL,
    pkiCertificateInstallationDAL,
    pkiDiscoveryInstallationDAL,
    pkiCertificateInstallationCertDAL,
    certificateDAL,
    certificateBodyDAL,
    projectDAL,
    kmsService,
    gatewayV2Service,
    gatewayV2DAL,
    gatewayPoolService,
    telemetryService,
    keyStore
  };

  const startPkiDiscoveryScanQueue = () => {
    queueService.start(QueueName.PkiDiscoveryScan, async (job) => {
      try {
        if (job.name === QueueJobs.PkiDiscoveryRunScan) {
          const { discoveryId } = job.data as { discoveryId: string };

          const discoveryConfig = await pkiDiscoveryConfigDAL.findById(discoveryId);
          if (!discoveryConfig) {
            logger.error({ discoveryId }, "Discovery config not found, skipping scan");
            return;
          }

          const discoveryType = (discoveryConfig.discoveryType as PkiDiscoveryType) || PkiDiscoveryType.Network;

          switch (discoveryType) {
            case PkiDiscoveryType.Network:
              await executeScan(discoveryId, scanDeps);
              break;
            case PkiDiscoveryType.LinuxServer:
              await executeLinuxServerScan(discoveryId, scanDeps);
              break;
            default:
              throw new Error(`Unsupported discovery type: ${discoveryType as string}`);
          }
        } else if (job.name === QueueJobs.PkiDiscoveryScheduledScan) {
          const dueConfigs = await pkiDiscoveryConfigDAL.findDueForScan();

          for (const config of dueConfigs) {
            // eslint-disable-next-line no-await-in-loop
            await queueService.queue(
              QueueName.PkiDiscoveryScan,
              QueueJobs.PkiDiscoveryRunScan,
              { discoveryId: config.id },
              { jobId: `pki-discovery-scan-${config.id}` }
            );
          }
        }
      } catch (error) {
        logger.error({ error, jobName: job.name, jobId: job.id }, "PKI discovery queue job failed");
        throw error;
      }
    });

    queueService.start(
      QueueName.PkiDiscoveryRescan,
      async (job) => {
        try {
          await rescanInstallation(job.data.installationId, scanDeps);
        } catch (error) {
          logger.error({ error, jobName: job.name, jobId: job.id }, "PKI installation rescan job failed");
          throw error;
        }
      },
      { concurrency: RESCAN_WORKER_CONCURRENCY }
    );

    cronJob.register({
      name: CronJobName.PkiDiscoveryScheduledScan,
      pattern: "0 2 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handler: async () => {
        await queueService.queue(QueueName.PkiDiscoveryScan, QueueJobs.PkiDiscoveryScheduledScan, undefined as never, {
          jobId: CronJobName.PkiDiscoveryScheduledScan
        });
      }
    });
  };

  const queueInstallationRescan = async (installationId: string) => {
    await queueService.queue(
      QueueName.PkiDiscoveryRescan,
      QueueJobs.PkiDiscoveryRescanInstallation,
      { installationId },
      {
        jobId: `pki-installation-rescan-${installationId}-${Date.now()}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  };

  const queuePkiDiscoveryScan = async (discoveryId: string) => {
    const jobId = `pki-discovery-scan-${discoveryId}-${Date.now()}`;
    await queueService.queue(
      QueueName.PkiDiscoveryScan,
      QueueJobs.PkiDiscoveryRunScan,
      { discoveryId },
      {
        jobId,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  };

  return {
    startPkiDiscoveryScanQueue,
    queuePkiDiscoveryScan,
    queueInstallationRescan
  };
};
