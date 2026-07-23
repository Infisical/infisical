import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueName, TQueueServiceFactory } from "@app/queue";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TMeteredFeature } from "./usage-counters";
import { TUsageMeteringServiceFactory } from "./usage-metering-service";
import { TUsageReporter, UsageReportError } from "./usage-reporter";

type TUsageEventQueueFactoryDep = {
  queueService: Pick<TQueueServiceFactory, "start">;
  cronJob: TCronJobFactory;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
  orgDAL: Pick<TOrgDALFactory, "find">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emit">;
  meteredFeatures: TMeteredFeature[];
  usageReporter: TUsageReporter | null;
  source: string;
};

export const usageEventQueueFactory = ({
  queueService,
  cronJob,
  keyStore,
  orgDAL,
  usageMeteringService,
  meteredFeatures,
  usageReporter,
  source
}: TUsageEventQueueFactoryDep) => {
  const featureByKey = new Map(meteredFeatures.map((m) => [m.feature.key, m]));

  // Counts the meter and reports it to the License Server only when the value changed since the last
  // report. No-ops when the reporter is null (v2 disabled), so queued events drain harmlessly.
  const handleUsageEvent = async (orgId: string, dimensionKey: string, observedAt: Date) => {
    if (!usageReporter) {
      return;
    }
    try {
      const metered = featureByKey.get(dimensionKey);
      if (!metered) {
        logger.warn(`usage-metering: unknown metered feature, dropping event [dimensionKey=${dimensionKey}]`);
        return;
      }

      const value = await metered.count(orgId);

      const lastReportedKey = KeyStorePrefixes.LicenseUsageLastReported(orgId, dimensionKey);
      const lastReported = await keyStore.getItem(lastReportedKey);
      if (lastReported !== null && Number(lastReported) === value) {
        return;
      }

      // Send the snapshot and let the license server decide whether the dimension is billable. A 422
      // "not priced by any active product on this license" means the org's plan doesn't carry this
      // dimension, so swallow it (no retry, don't record it as reported). Any other failure rethrows to
      // the outer handler so the job retries.
      try {
        await usageReporter.reportSnapshots(orgId, [
          {
            dimension_key: dimensionKey,
            value,
            observed_at: observedAt.toISOString(),
            idempotency_key: `${source}:${orgId}:${dimensionKey}:${observedAt.getTime()}`,
            source
          }
        ]);
      } catch (error) {
        if (error instanceof UsageReportError) {
          if (error.status === 404 && error.serverMessage.includes("license not found")) {
            logger.info(
              `usage-event-queue: license not found, skipping [orgId=${orgId}] [dimensionKey=${dimensionKey}]`
            );
            return;
          }
          if (
            error.status === 422 &&
            error.serverMessage.includes("not priced by any active product on this license")
          ) {
            logger.info(
              `usage-event-queue: dimension not priced on this license, skipping [orgId=${orgId}] [dimensionKey=${dimensionKey}]`
            );
            return;
          }
        }
        throw error;
      }

      logger.info(
        `usage-event-queue: reported usage event [orgId=${orgId}] [dimensionKey=${dimensionKey}] [value=${value}]`
      );
      await keyStore.setItemWithExpiry(lastReportedKey, KeyStoreTtls.LicenseUsageLastReportedInSeconds, String(value));
    } catch (error) {
      logger.error(
        error,
        `usage-event-queue: failed to handle usage event [orgId=${orgId}] [dimensionKey=${dimensionKey}]`
      );
      throw error;
    }
  };

  // Self-hosted true-up: online instances also report event-driven, so this is a periodic backstop
  // for cap visibility and renewal. Cloud is event-driven only.
  const flushAllOrgs = async () => {
    if (!usageReporter) {
      return;
    }

    // Page through orgs so a large self-hosted deployment doesn't materialize the whole table.
    const batchSize = 500;
    let offset = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const orgs = await orgDAL.find({}, { limit: batchSize, offset });
      for (const org of orgs) {
        for (const metered of meteredFeatures) {
          usageMeteringService.emit(org.id, metered.feature.key);
        }
      }
      if (orgs.length < batchSize) {
        break;
      }
      offset += batchSize;
    }
  };

  const startWorker = () => {
    // Counts are DB-heavy, so concurrency + limiter rate-shape a backlog instead of bursting the read replica.
    queueService.start(
      QueueName.UsageEvent,
      (job) => handleUsageEvent(job.data.orgId, job.data.dimensionKey, new Date(job.timestamp)),
      {
        concurrency: 5,
        limiter: { max: 50, duration: 1000 }
      }
    );
  };

  const init = () => {
    startWorker();

    const appCfg = getConfig();
    cronJob.register({
      name: CronJobName.LicenseUsageFlush,
      pattern: "*/30 * * * *",
      runHashTtlS: 60 * 60,
      enabled: !appCfg.isCloud,
      handler: flushAllOrgs
    });
  };

  return { init, handleUsageEvent, flushAllOrgs };
};
