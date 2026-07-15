import opentelemetry, { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import {
  AggregationTemporality,
  AggregationType,
  createAllowListAttributesProcessor,
  MeterProvider,
  PeriodicExportingMetricReader,
  type ViewOptions
} from "@opentelemetry/sdk-metrics";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import tracer from "dd-trace";
import dotenv from "dotenv";

import { getTelemetryConfig } from "../config/env";
import { HIGH_CARDINALITY_METER_NAMES, INFISICAL_CORE_METER_ATTRIBUTES } from "./telemetry-attributes";

dotenv.config();

const initTelemetryInstrumentation = ({
  exportType,
  otlpURL,
  otlpUser,
  otlpPassword,
  otlpPushInterval,
  dropHighCardinalityMeters
}: {
  exportType?: string;
  otlpURL?: string;
  otlpUser?: string;
  otlpPassword?: string;
  otlpPushInterval?: number;
  dropHighCardinalityMeters?: boolean;
}) => {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

  const serviceVersion = process.env.INFISICAL_PLATFORM_VERSION || "unknown";

  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "infisical-core",
      [ATTR_SERVICE_VERSION]: serviceVersion,
      "git.commit.sha": process.env.DD_GIT_COMMIT_SHA || "unknown"
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

  const views: ViewOptions[] = [
    {
      meterName: "InfisicalCore",
      attributesProcessors: [createAllowListAttributesProcessor(INFISICAL_CORE_METER_ATTRIBUTES)]
    }
  ];

  if (dropHighCardinalityMeters) {
    HIGH_CARDINALITY_METER_NAMES.forEach((meterName) => {
      views.push({ meterName, aggregation: { type: AggregationType.DROP } });
    });
  }

  const meterProvider = new MeterProvider({
    resource,
    readers: metricReaders,
    views
  });

  opentelemetry.metrics.setGlobalMeterProvider(meterProvider);

  registerInstrumentations({
    instrumentations: [new HttpInstrumentation(), new RuntimeNodeInstrumentation()]
  });
};

const setupTelemetry = () => {
  const appCfg = getTelemetryConfig();

  if (appCfg.useOtel) {
    // eslint-disable-next-line no-console
    console.log("Initializing telemetry instrumentation");
    initTelemetryInstrumentation({
      ...appCfg.OTEL,
      dropHighCardinalityMeters: Boolean(appCfg.dropHighCardinalityMeters)
    });
  }

  if (appCfg.useDataDogTracer) {
    // eslint-disable-next-line no-console
    console.log("Initializing Datadog tracer");
    tracer.init({ ...appCfg.TRACER });
  }
};

void setupTelemetry();
