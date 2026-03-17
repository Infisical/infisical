import { PostHog } from "posthog-node";

import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { getServerCfg } from "../super-admin/super-admin-service";
import { TTelemetryDALFactory } from "./telemetry-dal";
import {
  TELEMETRY_SECRET_OPERATIONS_KEY,
  TELEMETRY_SECRET_PROCESSED_KEY,
  TTelemetryServiceFactory
} from "./telemetry-service";
import { PostHogEventTypes } from "./telemetry-types";

type TTelemetryQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "deleteItem">;
  telemetryDAL: TTelemetryDALFactory;
  telemetryService: TTelemetryServiceFactory;
};

export type TTelemetryQueueServiceFactory = ReturnType<typeof telemetryQueueServiceFactory>;

export const telemetryQueueServiceFactory = ({
  queueService,
  keyStore,
  telemetryDAL,
  telemetryService
}: TTelemetryQueueServiceFactoryDep) => {
  const appCfg = getConfig();
  const postHog =
    appCfg.isProductionMode && appCfg.TELEMETRY_ENABLED
      ? new PostHog(appCfg.POSTHOG_PROJECT_API_KEY, { host: appCfg.POSTHOG_HOST, flushAt: 1, flushInterval: 0 })
      : undefined;

  queueService.start(QueueName.TelemetryInstanceStats, async () => {
    const { instanceId } = await getServerCfg();
    const telemtryStats = await telemetryDAL.getTelemetryInstanceStats();
    // parse the redis values into integer
    const numberOfSecretOperationsMade = parseInt((await keyStore.getItem(TELEMETRY_SECRET_OPERATIONS_KEY)) || "0", 10);
    const numberOfSecretProcessed = parseInt((await keyStore.getItem(TELEMETRY_SECRET_PROCESSED_KEY)) || "0", 10);
    const stats = { ...telemtryStats, numberOfSecretProcessed, numberOfSecretOperationsMade };

    // send to postHog
    postHog?.capture({
      event: PostHogEventTypes.TelemetryInstanceStats,
      distinctId: instanceId,
      properties: stats
    });
    // reset the stats
    await keyStore.deleteItem(TELEMETRY_SECRET_PROCESSED_KEY);
    await keyStore.deleteItem(TELEMETRY_SECRET_OPERATIONS_KEY);
  });

  queueService.start(QueueName.TelemetryAggregatedEvents, async () => {
    await telemetryService.processAggregatedEvents();
  });

  // every day at midnight a telemetry job executes on self-hosted instances
  // this sends some telemetry information like instance id secrets operated etc
  const startTelemetryCheck = async () => {
    // this is a fast way to check its cloud or not
    if (appCfg.INFISICAL_CLOUD) return;

    // Remove legacy repeatable job
    await queueService.stopRepeatableJob(
      QueueName.TelemetryInstanceStats,
      QueueJobs.TelemetryInstanceStats,
      { pattern: "0 0 * * *", utc: true },
      QueueName.TelemetryInstanceStats
    );

    if (postHog) {
      await queueService.upsertJobScheduler(
        QueueName.TelemetryInstanceStats,
        QueueName.TelemetryInstanceStats,
        { pattern: "0 0 * * *" },
        { name: QueueJobs.TelemetryInstanceStats }
      );
    }
  };

  const startAggregatedEventsJob = async () => {
    // Remove legacy repeatable job
    await queueService.stopRepeatableJob(
      QueueName.TelemetryAggregatedEvents,
      QueueJobs.TelemetryAggregatedEvents,
      { pattern: "*/5 * * * *", utc: true },
      QueueName.TelemetryAggregatedEvents
    );

    if (postHog) {
      // Start aggregated events job (runs every five minutes)
      await queueService.upsertJobScheduler(
        QueueName.TelemetryAggregatedEvents,
        QueueName.TelemetryAggregatedEvents,
        { pattern: "*/5 * * * *" },
        { name: QueueJobs.TelemetryAggregatedEvents }
      );
    }
  };

  queueService.listen(QueueName.TelemetryInstanceStats, "failed", (err) => {
    logger.error(err?.failedReason, `${QueueName.TelemetryInstanceStats}: failed`);
  });

  queueService.listen(QueueName.TelemetryAggregatedEvents, "failed", (err) => {
    logger.error(err?.failedReason, `${QueueName.TelemetryAggregatedEvents}: failed`);
  });

  return {
    startTelemetryCheck,
    startAggregatedEventsJob
  };
};
