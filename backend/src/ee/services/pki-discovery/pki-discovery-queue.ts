import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue/queue-service";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TPkiCertificateInstallationCertDALFactory } from "./pki-certificate-installation-cert-dal";
import { TPkiCertificateInstallationDALFactory } from "./pki-certificate-installation-dal";
import { TPkiDiscoveryConfigDALFactory } from "./pki-discovery-config-dal";
import { TPkiDiscoveryInstallationDALFactory } from "./pki-discovery-installation-dal";
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
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithKmsKey" | "generateKmsKey">;
  queueService: TQueueServiceFactory;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findById">;
};

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
  queueService,
  gatewayV2Service,
  gatewayV2DAL
}: TPkiDiscoveryQueueFactoryDep) => {
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

          const scanDeps = {
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
            gatewayV2DAL
          };

          switch (discoveryType) {
            case PkiDiscoveryType.Network:
              await executeScan(discoveryId, scanDeps);
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

    void queueService
      .queue(QueueName.PkiDiscoveryScan, QueueJobs.PkiDiscoveryScheduledScan, undefined, {
        repeat: {
          pattern: "0 2 * * *",
          utc: true
        },
        jobId: "pki-discovery-scheduled-scan-cron"
      })
      .catch((err) => logger.error(err, "Failed to schedule PKI discovery cron"));
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
    queuePkiDiscoveryScan
  };
};
