import { v4 as uuidv4 } from "uuid";

import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { applyJitter } from "@app/lib/dates";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueJobTypes, TQueueServiceFactory } from "@app/queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TLicenseClientFactory } from "../license-client";
import { METERED_DIMENSION_KEYS } from "./usage-counters";
import { MAX_USAGE_EVENTS_PER_REQUEST } from "./usage-reporter";

export type TUsageMeteringServiceFactory = ReturnType<typeof usageMeteringServiceFactory>;

type TUsageMeteringServiceFactoryDep = {
  queueService: Pick<TQueueServiceFactory, "queue">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">;
  licenseClient: Pick<TLicenseClientFactory, "isEnabled">;
};

const DEBOUNCE_MS = 5000;

// A metered fact for a sum or count meter. The license server dedups on (eventId, occurredAt), so both
// must be stable for the fact: recording it again with the same pair is a no-op. quantity is required
// because the server reads a missing one as 0; a count meter ignores it, so pass 1.
export type TMeteringEventInput = {
  eventId: string;
  dimensionKey: string;
  quantity: number;
  occurredAt: Date;
};

export const usageMeteringServiceFactory = ({
  queueService,
  projectDAL,
  keyStore,
  licenseClient
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
  // never throws into the request path; inert while no license server is configured.
  const emit = (orgId: string, dimensionKey: string) => {
    if (!licenseClient.isEnabled()) {
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
    if (!licenseClient.isEnabled()) {
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
    if (!licenseClient.isEnabled()) {
      return;
    }

    void (async () => {
      // ±30min jitter so a cold-start burst of first-reconciles doesn't set markers that all expire
      // together and trigger a synchronized reconcile wave an interval later.
      const acquired = await keyStore.setItemWithExpiryNX(
        KeyStorePrefixes.LicenseUsageReconcileMarker(orgId),
        applyJitter(KeyStoreTtls.LicenseUsageReconcileIntervalInSeconds, 1800),
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

  // Fire-and-forget like emit, but every event is a fact to deliver, so jobs are never debounced or
  // replaced. The server accepts or rejects a request whole, so each job (one request) holds a single
  // dimension: a dimension the org's plan does not price is refused without taking other events.
  const recordMeteringEvents = (orgId: string, events: TMeteringEventInput[]) => {
    if (!licenseClient.isEnabled() || !events.length) {
      return;
    }

    const byDimension = new Map<string, TQueueJobTypes[QueueName.MeteringEvent]["payload"]["events"]>();
    events.forEach((e) => {
      const group = byDimension.get(e.dimensionKey) ?? [];
      group.push({
        eventId: e.eventId,
        dimensionKey: e.dimensionKey,
        quantity: e.quantity,
        occurredAt: e.occurredAt.toISOString()
      });
      byDimension.set(e.dimensionKey, group);
    });

    const chunks = [...byDimension.values()].flatMap((group) => {
      const parts = [];
      for (let i = 0; i < group.length; i += MAX_USAGE_EVENTS_PER_REQUEST) {
        parts.push(group.slice(i, i + MAX_USAGE_EVENTS_PER_REQUEST));
      }
      return parts;
    });

    chunks.forEach((chunk) => {
      void queueService
        .queue(
          QueueName.MeteringEvent,
          QueueJobs.MeteringEvent,
          { orgId, events: chunk },
          {
            jobId: uuidv4(),
            attempts: 10,
            backoff: { type: "exponential", delay: 10_000 },
            removeOnComplete: true,
            removeOnFail: { count: 1000 }
          }
        )
        .catch((error) => {
          logger.error(
            error,
            `usage-metering: failed to enqueue metering events [orgId=${orgId}] [dimensionKey=${chunk[0].dimensionKey}] [count=${chunk.length}]`
          );
        });
    });
  };

  return { emit, emitForProject, reconcile, recordMeteringEvents };
};
