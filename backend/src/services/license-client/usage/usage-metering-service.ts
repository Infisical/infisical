import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";

export type TUsageMeteringServiceFactory = ReturnType<typeof usageMeteringServiceFactory>;

type TUsageMeteringServiceFactoryDep = {
  queueService: Pick<TQueueServiceFactory, "queue">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  envConfig: Pick<TEnvConfig, "LICENSE_SERVER_V2_MODE">;
};

// Debounce window: bursts for the same {org, feature} collapse to one count because the delayed job
// shares a deterministic jobId.
const DEBOUNCE_MS = 60_000;

export const usageMeteringServiceFactory = ({
  queueService,
  projectDAL,
  envConfig
}: TUsageMeteringServiceFactoryDep) => {
  const enqueue = async (orgId: string, dimensionKey: string) => {
    await queueService.queue(
      QueueName.UsageEvent,
      QueueJobs.UsageEvent,
      { orgId, dimensionKey },
      {
        jobId: `usage-event:${orgId}:${dimensionKey}`,
        delay: process.env.NODE_ENV === "development" ? 5000 : DEBOUNCE_MS,
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  };

  // Fire-and-forget signal from a metered create/delete on an org-scoped meter. Never awaited and
  // never throws into the request path; inert until the v2 license server is enabled.
  const emit = (orgId: string, dimensionKey: string) => {
    if (envConfig.LICENSE_SERVER_V2_MODE === "off") {
      return;
    }

    void enqueue(orgId, dimensionKey).catch((error) => {
      logger.error(
        error,
        `usage-metering: failed to enqueue usage event [orgId=${orgId}] [dimensionKey
  =${dimensionKey}]`
      );
    });
  };

  // Project-scoped meters sum across an org's projects, so the event is keyed by org. The org is
  // resolved in the background to keep the request path free of an extra read.
  const emitForProject = (projectId: string, dimensionKey: string) => {
    if (envConfig.LICENSE_SERVER_V2_MODE === "off") {
      return;
    }

    void (async () => {
      const project = await projectDAL.findById(projectId);
      if (!project) {
        return;
      }

      await enqueue(project.orgId, dimensionKey);
    })().catch((error) => {
      logger.error(
        error,
        `usage-metering: failed to enqueue usage event [projectId=${projectId}] [dimensionKey
  =${dimensionKey}]`
      );
    });
  };

  return { emit, emitForProject };
};
