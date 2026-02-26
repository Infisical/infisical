import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue/queue-service";
import { ActorType } from "@app/services/auth/auth-type";

import { TNhiScanDALFactory, TNhiSourceDALFactory } from "./nhi-dal";
import { NhiScanStatus } from "./nhi-enums";
import { TNhiServiceFactory } from "./nhi-service";

type TNhiScanQueueFactoryDep = {
  nhiSourceDAL: TNhiSourceDALFactory;
  nhiScanDAL: TNhiScanDALFactory;
  nhiService: Pick<TNhiServiceFactory, "performScan">;
  queueService: TQueueServiceFactory;
};

export type TNhiScanQueueFactory = ReturnType<typeof nhiScanQueueFactory>;

export const nhiScanQueueFactory = ({
  nhiSourceDAL,
  nhiScanDAL,
  nhiService,
  queueService
}: TNhiScanQueueFactoryDep) => {
  const startNhiScanQueue = () => {
    queueService.start(QueueName.NhiScheduledScan, async (job) => {
      try {
        if (job.name === QueueJobs.NhiScheduledScanCheck) {
          const dueSources = await nhiSourceDAL.findDueForScan();
          logger.info({ count: dueSources.length }, "NHI scheduled scan check: found sources due for scan");

          for (const source of dueSources) {
            // eslint-disable-next-line no-await-in-loop
            await queueService.queue(
              QueueName.NhiScheduledScan,
              QueueJobs.NhiRunScan,
              { sourceId: source.id },
              { jobId: `nhi-scan-${source.id}` }
            );
          }
        } else if (job.name === QueueJobs.NhiRunScan) {
          const { sourceId } = job.data as { sourceId: string };

          const source = await nhiSourceDAL.findById(sourceId);
          if (!source || !source.orgId) {
            logger.warn({ sourceId }, "NHI scheduled scan: source not found or missing orgId");
            return;
          }

          // Create scan record
          const scan = await nhiScanDAL.create({
            sourceId,
            projectId: source.projectId,
            status: NhiScanStatus.Scanning
          });

          await nhiSourceDAL.updateById(sourceId, { lastScanStatus: NhiScanStatus.Scanning });

          // Build OrgServiceActor from stored orgId/createdByUserId
          const orgActor = {
            type: ActorType.USER as const,
            id: source.createdByUserId || source.orgId,
            authMethod: null,
            orgId: source.orgId,
            rootOrgId: source.orgId,
            parentOrgId: source.orgId
          };

          await nhiService.performScan(sourceId, scan.id, orgActor);

          // Update lastScheduledScanAt
          await nhiSourceDAL.updateById(sourceId, { lastScheduledScanAt: new Date() });
        }
      } catch (error) {
        logger.error({ error, jobName: job.name, jobId: job.id }, "NHI scan queue job failed");
        throw error;
      }
    });

    // Schedule hourly check
    void queueService
      .queue(QueueName.NhiScheduledScan, QueueJobs.NhiScheduledScanCheck, undefined, {
        repeat: {
          pattern: "0 * * * *",
          utc: true,
          key: "nhi-scheduled-scan-check"
        },
        jobId: "nhi-scheduled-scan-check-cron"
      })
      .catch((err) => logger.error(err, "Failed to schedule NHI scan cron"));
  };

  return {
    startNhiScanQueue
  };
};
