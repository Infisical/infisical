import opentelemetry, { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { Resource } from "@opentelemetry/resources";
import { AggregationTemporality, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import tracer from "dd-trace";
import dotenv from "dotenv";

import { initEnvConfig } from "../config/env";

dotenv.config();

const initTelemetryInstrumentation = ({
  exportType,
  otlpURL,
  otlpUser,
  otlpPassword,
  otlpPushInterval
}: {
  exportType?: string;
  otlpURL?: string;
  otlpUser?: string;
  otlpPassword?: string;
  otlpPushInterval?: number;
}) => {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

  const resource = Resource.default().merge(
    new Resource({
      [ATTR_SERVICE_NAME]: "infisical-core",
      [ATTR_SERVICE_VERSION]: "0.1.0"
    })
  );

  const metricReaders = [];
  switch (exportType) {
    case "prometheus": {
      const promExporter = new PrometheusExporter();
      metricReaders.push(promExporter);
      break;
    }
    case "otlp": {
      const otlpExporter = new OTLPMetricExporter({
        url: `${otlpURL}/v1/metrics`,
        headers: {
          Authorization: `Basic ${btoa(`${otlpUser}:${otlpPassword}`)}`
        },
        temporalityPreference: AggregationTemporality.DELTA
      });
      metricReaders.push(
        new PeriodicExportingMetricReader({
          exporter: otlpExporter,
          exportIntervalMillis: otlpPushInterval
        })
      );
      break;
    }
    default:
      throw new Error("Invalid OTEL export type");
  }

  const meterProvider = new MeterProvider({
    resource,
    readers: metricReaders
  });

  opentelemetry.metrics.setGlobalMeterProvider(meterProvider);

  registerInstrumentations({
    instrumentations: [new HttpInstrumentation()]
  });
};

const setupTelemetry = () => {
  const appCfg = initEnvConfig();

  if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
    console.log("Initializing telemetry instrumentation");
    initTelemetryInstrumentation({
      otlpURL: appCfg.OTEL_EXPORT_OTLP_ENDPOINT,
      otlpUser: appCfg.OTEL_COLLECTOR_BASIC_AUTH_USERNAME,
      otlpPassword: appCfg.OTEL_COLLECTOR_BASIC_AUTH_PASSWORD,
      otlpPushInterval: appCfg.OTEL_OTLP_PUSH_INTERVAL,
      exportType: appCfg.OTEL_EXPORT_TYPE
    });
  }

  if (appCfg.SHOULD_USE_DATADOG_TRACER) {
    console.log("Initializing Datadog tracer");
    tracer.init({
      profiling: appCfg.DATADOG_PROFILING_ENABLED,
      version: appCfg.INFISICAL_PLATFORM_VERSION,
      env: appCfg.DATADOG_ENV,
      service: appCfg.DATADOG_SERVICE,
      hostname: appCfg.DATADOG_HOSTNAME
    });
  }
};

void setupTelemetry();
