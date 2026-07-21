import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueName, TQueueServiceFactory } from "@app/queue";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TLicenseClientFactory } from "../license-client";
import { TMeteredFeature } from "./usage-counters";
import { TUsageMeteringServiceFactory } from "./usage-metering-service";
import { TUsageReporter } from "./usage-reporter";

type TUsageEventQueueFactoryDep = {
  queueService: Pick<TQueueServiceFactory, "start">;
  cronJob: TCronJobFactory;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
  orgDAL: Pick<TOrgDALFactory, "find">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emit">;
  meteredFeatures: TMeteredFeature[];
  usageReporter: TUsageReporter | null;
  // Resolves the org's plan so we only report dimensions the plan actually includes. Cached.
  licenseClient: Pick<TLicenseClientFactory, "getEntitlements">;
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
  licenseClient,
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

      // Only report a dimension the org's plan actually includes. Metered features are entitlement
      // features (each meter resolves its cap from entitlements.features[key]), so a dimension the plan
      // doesn't grant is absent here. Works for cloud (per-org entitlements) and self-hosted
      // (instance-wide entitlements; the backend ignores the org id). Entitlements are cached, so this
      // check is cheap and also spares the DB count below.
      const entitlements = await licenseClient.getEntitlements({ id: orgId });
      if (!entitlements || !(dimensionKey in entitlements.features)) {
        logger.info(
          `usage-event-queue: dimension not in org plan, skipping [orgId=${orgId}] [dimensionKey=${dimensionKey}]`
        );
        return;
      }

      const value = await metered.count(orgId);

      const lastReportedKey = KeyStorePrefixes.LicenseUsageLastReported(orgId, dimensionKey);
      const lastReported = await keyStore.getItem(lastReportedKey);
      if (lastReported !== null && Number(lastReported) === value) {
        return;
      }

      await usageReporter.reportSnapshots(orgId, [
        {
          dimension_key: dimensionKey,
          value,
          observed_at: observedAt.toISOString(),
          idempotency_key: `${source}:${orgId}:${dimensionKey}:${observedAt.getTime()}`,
          source
        }
      ]);

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
