import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue/queue-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import { TPamAccountDependenciesDALFactory } from "./pam-account-dependencies-dal";
import { PamDiscoveryRunTrigger, PamDiscoveryType } from "./pam-discovery-enums";
import { PAM_DISCOVERY_FACTORY_MAP } from "./pam-discovery-factory";
import { decryptDiscoveryCredentials } from "./pam-discovery-fns";
import { TPamDiscoveryRunDALFactory } from "./pam-discovery-run-dal";
import { TPamDiscoverySourceAccountsDALFactory } from "./pam-discovery-source-accounts-dal";
import { TPamDiscoverySourceDALFactory } from "./pam-discovery-source-dal";
import { TPamDiscoverySourceDependenciesDALFactory } from "./pam-discovery-source-dependencies-dal";
import { TPamDiscoverySourceResourcesDALFactory } from "./pam-discovery-source-resources-dal";
import { TPamDiscoveryConfiguration } from "./pam-discovery-types";

type TPamDiscoveryQueueFactoryDep = {
  pamDiscoverySourceDAL: Pick<TPamDiscoverySourceDALFactory, "findById" | "updateById" | "findDueForScan">;
  pamDiscoveryRunDAL: Pick<TPamDiscoveryRunDALFactory, "create" | "updateById">;
  pamDiscoverySourceResourcesDAL: Pick<TPamDiscoverySourceResourcesDALFactory, "upsertJunction" | "markStaleForRun">;
  pamDiscoverySourceAccountsDAL: Pick<TPamDiscoverySourceAccountsDALFactory, "upsertJunction" | "markStaleForRun">;
  pamDiscoverySourceDependenciesDAL: Pick<
    TPamDiscoverySourceDependenciesDALFactory,
    "upsertJunction" | "markStaleForRun"
  >;
  pamAccountDependenciesDAL: Pick<TPamAccountDependenciesDALFactory, "upsertDependency">;
  pamResourceDAL: Pick<TPamResourceDALFactory, "create" | "find" | "findById">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "create" | "find">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  queueService: TQueueServiceFactory;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findById">;
};

export type TPamDiscoveryQueueFactory = ReturnType<typeof pamDiscoveryQueueFactory>;

export const pamDiscoveryQueueFactory = ({
  pamDiscoverySourceDAL,
  pamDiscoveryRunDAL,
  pamDiscoverySourceResourcesDAL,
  pamDiscoverySourceAccountsDAL,
  pamDiscoverySourceDependenciesDAL,
  pamAccountDependenciesDAL,
  pamResourceDAL,
  pamAccountDAL,
  kmsService,
  queueService,
  gatewayV2Service,
  gatewayV2DAL
}: TPamDiscoveryQueueFactoryDep) => {
  const startPamDiscoveryQueue = () => {
    queueService.start(QueueName.PamDiscoveryScan, async (job) => {
      try {
        if (job.name === QueueJobs.PamDiscoveryRunScan) {
          const { discoverySourceId, triggeredBy } = job.data as {
            discoverySourceId: string;
            triggeredBy: PamDiscoveryRunTrigger;
          };

          const discoverySource = await pamDiscoverySourceDAL.findById(discoverySourceId);
          if (!discoverySource) {
            logger.error({ discoverySourceId, triggeredBy }, "PAM Discovery Source not found, skipping scan");
            return;
          }

          if (!discoverySource.gatewayId) {
            logger.error(
              { discoverySourceId, triggeredBy },
              "PAM Discovery Source has no gateway configured, skipping scan"
            );
            return;
          }

          const discoveryType = discoverySource.discoveryType as PamDiscoveryType;

          const credentials = await decryptDiscoveryCredentials({
            projectId: discoverySource.projectId,
            encryptedCredentials: discoverySource.encryptedDiscoveryCredentials,
            kmsService
          });

          const configuration = discoverySource.discoveryConfiguration as TPamDiscoveryConfiguration;

          const factory = PAM_DISCOVERY_FACTORY_MAP[discoveryType](
            discoveryType,
            configuration,
            credentials,
            discoverySource.gatewayId,
            discoverySource.projectId,
            gatewayV2Service
          );

          const scanDeps = {
            pamDiscoverySourceDAL,
            pamDiscoveryRunDAL,
            pamDiscoverySourceResourcesDAL,
            pamDiscoverySourceAccountsDAL,
            pamDiscoverySourceDependenciesDAL,
            pamAccountDependenciesDAL,
            pamResourceDAL,
            pamAccountDAL,
            kmsService,
            gatewayV2Service,
            gatewayV2DAL
          };

          await factory.scan(discoverySourceId, triggeredBy, scanDeps);
        } else if (job.name === QueueJobs.PamDiscoveryScheduledScan) {
          const dueSources = await pamDiscoverySourceDAL.findDueForScan();

          for await (const src of dueSources) {
            await queueService.queue(
              QueueName.PamDiscoveryScan,
              QueueJobs.PamDiscoveryRunScan,
              { discoverySourceId: src.id, triggeredBy: PamDiscoveryRunTrigger.Schedule },
              { jobId: `pam-discovery-scan-${src.id}` }
            );
          }
        }
      } catch (error) {
        logger.error({ error, jobName: job.name, jobId: job.id }, "PAM Discovery queue job failed");
        throw error;
      }
    });

    void queueService
      .queue(QueueName.PamDiscoveryScan, QueueJobs.PamDiscoveryScheduledScan, undefined, {
        repeat: {
          // runs every day at 3:00 AM
          pattern: "0 3 * * *",
          utc: true,
          key: "pam-discovery-scheduled-scan"
        },
        jobId: "pam-discovery-scheduled-scan-cron"
      })
      .catch((err) => logger.error(err, "Failed to schedule PAM Discovery cron"));
  };

  const queuePamDiscoveryScan = async (discoverySourceId: string) => {
    const jobId = `pam-discovery-scan-${discoverySourceId}-${Date.now()}`;
    await queueService.queue(
      QueueName.PamDiscoveryScan,
      QueueJobs.PamDiscoveryRunScan,
      { discoverySourceId, triggeredBy: PamDiscoveryRunTrigger.Manual },
      {
        jobId,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  };

  return {
    startPamDiscoveryQueue,
    queuePamDiscoveryScan
  };
};
