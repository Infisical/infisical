import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueName, TQueueServiceFactory } from "@app/queue";

import { ActiveCerts, InternalCas } from "../features";
import { TMeteredFeature } from "./usage-counters";
import { TUsageMeteringServiceFactory } from "./usage-metering-service";
import { TUsageReporter, UsageReportError } from "./usage-reporter";

// Temporarily not reporting the internal-CA and certificate meters; events for these drain harmlessly.
const SKIPPED_DIMENSION_KEYS = new Set<string>([InternalCas.key, ActiveCerts.key]);

// Self-hosted is a single license covering the whole database, so usage is reported once at this
// instance identity ("full database" level) rather than per organization. Mirrors
// SELF_HOSTED_LICENSE_ORG_ID in ee/license-service; inlined to avoid a services -> ee import.
const SELF_HOSTED_LICENSE_ORG_ID = "self-hosted";

type TUsageEventQueueFactoryDep = {
  queueService: Pick<TQueueServiceFactory, "start">;
  cronJob: TCronJobFactory;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emit">;
  meteredFeatures: TMeteredFeature[];
  usageReporter: TUsageReporter | null;
  isCloud: boolean;
  // Offline (air-gapped) licenses can't reach the license server, so the true-up cron stays disabled.
  isOffline: boolean;
  source: string;
};

export const usageEventQueueFactory = ({
  queueService,
  cronJob,
  keyStore,
  licenseService,
  usageMeteringService,
  meteredFeatures,
  usageReporter,
  isCloud,
  isOffline,
  source
}: TUsageEventQueueFactoryDep) => {
  const featureByKey = new Map(meteredFeatures.map((m) => [m.feature.key, m]));

  // Counts the meter and reports it to the License Server only when the value changed since the last
  // report. No-ops when the reporter is null (v2 disabled), so queued events drain harmlessly.
  const handleUsageEvent = async (orgId: string, dimensionKey: string, observedAt: Date) => {
    if (SKIPPED_DIMENSION_KEYS.has(dimensionKey)) {
      return;
    }
    if (!usageReporter) {
      return;
    }
    // On cloud, an org with no active paid plan (null slug) has no license on the server, so a report
    // would just 404 "license not found". Skip the round-trip. Self-hosted is a single licensed
    // instance, so this gate doesn't apply there.
    if (isCloud) {
      const plan = await licenseService.getPlan(orgId);
      if (!plan.slug) {
        return;
      }
    }

    // Self-hosted is one license over the whole database: report (and dedup) once at the instance
    // identity, not per triggering org. The metered counts already span the whole instance in that
    // mode, so the org that triggered the event is irrelevant here.
    const reportOrgId = isCloud ? orgId : SELF_HOSTED_LICENSE_ORG_ID;

    try {
      const metered = featureByKey.get(dimensionKey);
      if (!metered) {
        logger.warn(`usage-metering: unknown metered feature, dropping event [dimensionKey=${dimensionKey}]`);
        return;
      }

      const value = await metered.count(reportOrgId);

      const lastReportedKey = KeyStorePrefixes.LicenseUsageLastReported(reportOrgId, dimensionKey);
      const lastReported = await keyStore.getItem(lastReportedKey);
      if (lastReported !== null && Number(lastReported) === value) {
        return;
      }

      // Send the snapshot and let the license server decide whether the dimension is billable. A 422
      // "not priced by any active product on this license" means the org's plan doesn't carry this
      // dimension, so swallow it (no retry, don't record it as reported). Any other failure rethrows to
      // the outer handler so the job retries.
      try {
        await usageReporter.reportSnapshots(reportOrgId, [
          {
            dimension_key: dimensionKey,
            value,
            observed_at: observedAt.toISOString(),
            idempotency_key: `${source}:${reportOrgId}:${dimensionKey}:${observedAt.getTime()}`,
            source
          }
        ]);
      } catch (error) {
        if (error instanceof UsageReportError) {
          if (error.status === 404 && error.serverMessage.includes("license not found")) {
            logger.info(
              `usage-event-queue: license not found, skipping [orgId=${reportOrgId}] [dimensionKey=${dimensionKey}]`
            );
            return;
          }
          if (
            error.status === 422 &&
            error.serverMessage.includes("not priced by any active product on this license")
          ) {
            logger.info(
              `usage-event-queue: dimension not priced on this license, skipping [orgId=${reportOrgId}] [dimensionKey=${dimensionKey}]`
            );
            return;
          }
        }
        throw error;
      }

      logger.info(
        `usage-event-queue: reported usage event [orgId=${reportOrgId}] [dimensionKey=${dimensionKey}] [value=${value}]`
      );
      await keyStore.setItemWithExpiry(lastReportedKey, KeyStoreTtls.LicenseUsageLastReportedInSeconds, String(value));
    } catch (error) {
      logger.error(
        error,
        `usage-event-queue: failed to handle usage event [orgId=${reportOrgId}] [dimensionKey=${dimensionKey}]`
      );
      throw error;
    }
  };

  // Self-hosted true-up: a daily backstop for cap visibility and renewal on top of event-driven
  // reporting. Self-hosted usage is metered and reported once at the instance identity, so this just
  // re-emits each meter once (no per-org fan-out); handleUsageEvent counts instance-wide and dedups.
  // Cloud is event-driven only.
  const flushInstanceUsage = async () => {
    if (!usageReporter) {
      return;
    }

    for (const metered of meteredFeatures) {
      usageMeteringService.emit(SELF_HOSTED_LICENSE_ORG_ID, metered.feature.key);
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

    cronJob.register({
      name: CronJobName.LicenseUsageFlush,
      pattern: "0 0 * * *", // daily at midnight UTC
      runHashTtlS: 60 * 60,
      enabled: !isCloud && !isOffline,
      handler: flushInstanceUsage
    });
  };

  return { init, handleUsageEvent, flushInstanceUsage };
};
