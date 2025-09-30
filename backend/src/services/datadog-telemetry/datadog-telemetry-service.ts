import { StatsD } from "hot-shots";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

export type TDataDogTelemetryServiceFactory = ReturnType<typeof dataDogTelemetryServiceFactory>;

export enum DataDogMetric {
  SECRET_SYNC_OPERATION_ERRORS = "secret_sync.operation_errors",
  SECRET_SYNC_IMPORT_ERRORS = "secret_sync.import_errors",
  SECRET_SYNC_REMOVAL_ERRORS = "secret_sync.removal_errors"
}

export interface DataDogMetricAttributes {
  service: string;
  env: string;
  version: string;
  destination: string;
  sync_id: string;
  project_id: string;
  error_type: string;
  error_status?: string;
  error_name?: string;
}

export interface SecretSyncErrorAttributes {
  destination: string;
  syncId: string;
  projectId: string;
  errorType: string;
  errorStatus?: number;
  errorName?: string;
}

export const dataDogTelemetryServiceFactory = () => {
  const appCfg = getConfig();
  let isInitialized = false;
  let dogStatsD: StatsD | null = null;

  const initializeDataDog = () => {
    if (!appCfg.DATADOG_ENABLED) {
      return;
    }

    if (isInitialized) {
      return;
    }

    const requiredConfig = {
      serviceName: appCfg.DATADOG_SERVICE_NAME,
      environment: appCfg.DATADOG_TELEMETRY_ENV,
      version: appCfg.DATADOG_SERVICE_VERSION,
      host: appCfg.DATADOG_AGENT_HOST,
      port: appCfg.DATADOG_AGENT_PORT
    };

    if (
      !requiredConfig.serviceName ||
      !requiredConfig.environment ||
      !requiredConfig.version ||
      !requiredConfig.host ||
      !requiredConfig.port
    ) {
      logger.warn("DataDog telemetry configuration incomplete, skipping initialization");
      return;
    }

    try {
      dogStatsD = new StatsD({
        host: requiredConfig.host,
        port: requiredConfig.port,
        prefix: `${requiredConfig.serviceName}.`,
        globalTags: [
          `service:${requiredConfig.serviceName}`,
          `env:${requiredConfig.environment}`,
          `version:${requiredConfig.version}`
        ],
        errorHandler: (error: Error) => {
          logger.error(error, "DogStatsD error");
        }
      });

      isInitialized = true;
      logger.info(
        {
          host: requiredConfig.host,
          port: requiredConfig.port,
          service: requiredConfig.serviceName,
          env: requiredConfig.environment,
          prefix: `${requiredConfig.serviceName}.`
        },
        "DataDog telemetry initialized successfully"
      );
    } catch (error) {
      logger.error(error, "Failed to initialize DataDog telemetry");
      isInitialized = false;
      dogStatsD = null;
    }
  };

  const recordMetric = (metricName: DataDogMetric, value: number, attributes: DataDogMetricAttributes) => {
    if (!appCfg.DATADOG_ENABLED || !isInitialized || !dogStatsD) {
      return;
    }

    try {
      const tags = [
        `destination:${attributes.destination}`,
        `sync_id:${attributes.sync_id}`,
        `project_id:${attributes.project_id}`,
        `error_type:${attributes.error_type}`,
        ...(attributes.error_status ? [`error_status:${attributes.error_status}`] : []),
        ...(attributes.error_name ? [`error_name:${attributes.error_name}`] : [])
      ];

      dogStatsD.increment(metricName, value, tags);
    } catch (error) {
      logger.error(error, `Failed to record metric: ${metricName}`);
    }
  };

  const recordSecretSyncError = (errorType: DataDogMetric, attributes: SecretSyncErrorAttributes) => {
    if (!appCfg.DATADOG_SERVICE_NAME || !appCfg.DATADOG_TELEMETRY_ENV || !appCfg.DATADOG_SERVICE_VERSION) {
      return;
    }

    recordMetric(errorType, 1, {
      service: appCfg.DATADOG_SERVICE_NAME,
      env: appCfg.DATADOG_TELEMETRY_ENV,
      version: appCfg.DATADOG_SERVICE_VERSION,
      destination: attributes.destination,
      sync_id: attributes.syncId,
      project_id: attributes.projectId,
      error_type: attributes.errorType,
      error_status: attributes.errorStatus?.toString(),
      error_name: attributes.errorName
    });
  };

  const shutdown = async () => {
    if (dogStatsD) {
      dogStatsD.close();
      dogStatsD = null;
    }
    isInitialized = false;
    logger.info("DataDog telemetry shutdown completed");
  };

  // Initialize on service creation if enabled
  if (appCfg.DATADOG_ENABLED) {
    initializeDataDog();
  }

  return {
    recordSecretSyncError,
    recordMetric,
    shutdown,
    isInitialized: () => isInitialized
  };
};
