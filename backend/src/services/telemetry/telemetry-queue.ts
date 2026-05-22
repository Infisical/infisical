import { PostHog } from "posthog-node";

import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";

import { getServerCfg } from "../super-admin/super-admin-service";
import { TTelemetryDALFactory } from "./telemetry-dal";
import {
  TELEMETRY_SECRET_OPERATIONS_KEY,
  TELEMETRY_SECRET_PROCESSED_KEY,
  TTelemetryServiceFactory
} from "./telemetry-service";
import { PostHogEventTypes } from "./telemetry-types";

type TTelemetryQueueServiceFactoryDep = {
  cronJob: TCronJobFactory;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "deleteItem">;
  telemetryDAL: TTelemetryDALFactory;
  telemetryService: TTelemetryServiceFactory;
};

export type TTelemetryQueueServiceFactory = ReturnType<typeof telemetryQueueServiceFactory>;

export const telemetryQueueServiceFactory = ({
  cronJob,
  keyStore,
  telemetryDAL,
  telemetryService
}: TTelemetryQueueServiceFactoryDep) => {
  const appCfg = getConfig();
  const postHog =
    appCfg.isProductionMode && appCfg.TELEMETRY_ENABLED
      ? new PostHog(appCfg.POSTHOG_PROJECT_API_KEY, { host: appCfg.POSTHOG_HOST, flushAt: 1, flushInterval: 0 })
      : undefined;

  // every day at midnight a telemetry job executes on self-hosted instances
  const startTelemetryCheck = () => {
    // cloud instances skip telemetry stats
    if (appCfg.INFISICAL_CLOUD || !postHog) return;

    cronJob.register({
      name: CronJobName.TelemetryInstanceStats,
      pattern: "0 0 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handler: async () => {
        const { instanceId } = await getServerCfg();
        const telemetryStats = await telemetryDAL.getTelemetryInstanceStats();
        const numberOfSecretOperationsMade = parseInt(
          (await keyStore.getItem(TELEMETRY_SECRET_OPERATIONS_KEY)) || "0",
          10
        );
        const numberOfSecretProcessed = parseInt((await keyStore.getItem(TELEMETRY_SECRET_PROCESSED_KEY)) || "0", 10);
        const stats = { ...telemetryStats, numberOfSecretProcessed, numberOfSecretOperationsMade };

        postHog.capture({
          event: PostHogEventTypes.TelemetryInstanceStats,
          distinctId: instanceId,
          properties: stats
        });
        await keyStore.deleteItem(TELEMETRY_SECRET_PROCESSED_KEY);
        await keyStore.deleteItem(TELEMETRY_SECRET_OPERATIONS_KEY);
      }
    });
  };

  const startAggregatedEventsJob = () => {
    if (!postHog) return;

    cronJob.register({
      name: CronJobName.TelemetryAggregatedEvents,
      pattern: "*/5 * * * *",
      runHashTtlS: 60 * 60,
      handler: async () => {
        await telemetryService.processAggregatedEvents();
      }
    });
  };

  logger.info("telemetry queue service initialized");

  return {
    startTelemetryCheck,
    startAggregatedEventsJob
  };
};
