import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueName, TQueueServiceFactory } from "@app/queue";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TMeteredFeature } from "./usage-counters";
import { TUsageMeteringServiceFactory } from "./usage-metering-service";
import { TUsageReporter } from "./usage-reporter";

type TUsageEventQueueFactoryDep = {
  queueService: Pick<TQueueServiceFactory, "start">;
  cronJob: TCronJobFactory;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItem">;
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
  const handleUsageEvent = async (orgId: string, featureKey: string) => {
    if (!usageReporter) {
      return;
    }

    const metered = featureByKey.get(featureKey);
    if (!metered) {
      logger.warn(`usage-metering: unknown metered feature, dropping event [featureKey=${featureKey}]`);
      return;
    }

    const value = await metered.count(orgId);

    const lastReportedKey = KeyStorePrefixes.UsageLastReported(orgId, featureKey);
    const lastReported = await keyStore.getItem(lastReportedKey);
    if (lastReported !== null && Number(lastReported) === value) {
      return;
    }

    const observedAt = new Date();
    const minuteBucketSeconds = Math.floor(observedAt.getTime() / 60_000) * 60;
    await usageReporter.reportSnapshots([
      {
        org_id: orgId,
        feature_key: featureKey,
        value,
        observed_at: observedAt.toISOString(),
        idempotency_key: `${source}:${orgId}:${featureKey}:${minuteBucketSeconds}`,
        source
      }
    ]);

    await keyStore.setItem(lastReportedKey, String(value));
  };

  // Self-hosted true-up: online instances also report event-driven, so this is a periodic backstop
  // for cap visibility and renewal. Cloud is event-driven only.
  const flushAllOrgs = async () => {
    if (!usageReporter) {
      return;
    }

    const orgs = await orgDAL.find({});
    for (const org of orgs) {
      for (const metered of meteredFeatures) {
        usageMeteringService.emit(org.id, metered.feature.key);
      }
    }
  };

  const startWorker = () => {
    // Counts are DB-heavy, so concurrency + limiter rate-shape a backlog instead of bursting the read replica.
    queueService.start(QueueName.UsageEvent, (job) => handleUsageEvent(job.data.orgId, job.data.featureKey), {
      concurrency: 5,
      limiter: { max: 50, duration: 1000 }
    });
  };

  const init = () => {
    startWorker();

    const appCfg = getConfig();
    cronJob.register({
      name: CronJobName.UsageFlush,
      pattern: "*/30 * * * *",
      runHashTtlS: 60 * 60,
      enabled: !appCfg.isCloud,
      handler: flushAllOrgs
    });
  };

  return { init, handleUsageEvent, flushAllOrgs };
};
