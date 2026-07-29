import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { METERED_DIMENSION_KEYS } from "./usage-counters";

export type TUsageMeteringServiceFactory = ReturnType<typeof usageMeteringServiceFactory>;

type TUsageMeteringServiceFactoryDep = {
  queueService: Pick<TQueueServiceFactory, "queue">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">;
  envConfig: Pick<TEnvConfig, "LICENSE_SERVER_V2_MODE">;
};

const DEBOUNCE_MS = 5000;

export const usageMeteringServiceFactory = ({
  queueService,
  projectDAL,
  keyStore,
  envConfig
}: TUsageMeteringServiceFactoryDep) => {
  const enqueue = async (orgId: string, dimensionKey: string) => {
    await queueService.queue(
      QueueName.UsageEvent,
      QueueJobs.UsageEvent,
      { orgId, dimensionKey },
      {
        delay: DEBOUNCE_MS,
        removeOnComplete: true,
        removeOnFail: true,
        deduplication: {
          id: `usage-event-${orgId}-${dimensionKey}`,
          keepLastIfActive: true,
          replace: true
        }
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
        `usage-metering: failed to enqueue usage event [orgId=${orgId}] [dimensionKey=${dimensionKey}]`
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
        `usage-metering: failed to enqueue usage event [projectId=${projectId}] [dimensionKey=${dimensionKey}]`
      );
    });
  };

  // Demand-driven reconciliation: re-emit every metered dimension for an org so a missed/dropped event
  // or an expired lastReported converges. Fired fire-and-forget from getPlan for billable orgs; the NX
  // marker throttles it to once per org per interval (and coalesces concurrent callers). The emits reuse
  // the normal pipeline, so the slug gate and lastReported dedup still apply downstream.
  const reconcile = (orgId: string) => {
    if (envConfig.LICENSE_SERVER_V2_MODE === "off") {
      return;
    }

    void (async () => {
      const acquired = await keyStore.setItemWithExpiryNX(
        KeyStorePrefixes.LicenseUsageReconcileMarker(orgId),
        KeyStoreTtls.LicenseUsageReconcileIntervalInSeconds,
        "1"
      );
      if (acquired !== "OK") {
        return;
      }
      METERED_DIMENSION_KEYS.forEach((dimensionKey) => emit(orgId, dimensionKey));
    })().catch((error) => {
      logger.error(error, `usage-metering: failed to reconcile org usage [orgId=${orgId}]`);
    });
  };

  return { emit, emitForProject, reconcile };
};
