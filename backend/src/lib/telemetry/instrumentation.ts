import opentelemetry, { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { Resource } from "@opentelemetry/resources";
import {
  Aggregation,
  AggregationTemporality,
  MeterProvider,
  PeriodicExportingMetricReader,
  View
} from "@opentelemetry/sdk-metrics";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import tracer from "dd-trace";
import dotenv from "dotenv";

import { getTelemetryConfig } from "../config/env";

dotenv.config();

// Strict allowlist of attribute keys that may appear on metrics emitted by the "InfisicalCore" meter.
// Any attribute passed at a call site that's not in this list is silently dropped by the SDK View.
// Cardinality control is centralized here. Call sites stay simple and a contributor adding an
// unbounded label by mistake is caught automatically.
//
// If you need per-actor breakdowns, query the audit log table. It carries actorId, actorType, ip, userAgent and full event detail.
// Legacy meters ("Infisical", "API") have no View — their existing labels flow through unchanged for
// self-hosted backwards compatibility.
const INFISICAL_CORE_METER_ATTRIBUTES = [
  // HTTP semantics
  "http.request.method",
  "http.route",
  "http.response.status_code",
  // Tenant scope — bounded by org/project count
  "infisical.organization.id",
  "infisical.project.id",
  "infisical.environment",
  // Bounded enums
  "infisical.auth.method",
  "infisical.auth.result",
  "queue.name",
  "queue.state",
  "job.name",
  "error.type",
  "outcome",
  "attempts.exhausted",
  "audit_log.event_type",
  "audit_log.actor_type",
  "audit_log.backend",
  "audit_log.drop_reason",
  "audit_log_stream.provider",
  "kms.operation",
  "kms.key_type",
  "scim.operation",
  "sso.provider",
  "sso.action",
  "db.pool.state",
  "cache.result",
  "rate_limit.bucket",
  // Build info gauge labels — single-value per deploy, no cardinality concern
  "service.version",
  "git.commit.sha",
  "node.version"
];

const initTelemetryInstrumentation = ({
  exportType,
  otlpURL,
  otlpUser,
  otlpPassword,
  otlpPushInterval,
  dropLegacyMeters
}: {
  exportType?: string;
  otlpURL?: string;
  otlpUser?: string;
  otlpPassword?: string;
  otlpPushInterval?: number;
  dropLegacyMeters?: boolean;
}) => {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

  const serviceVersion = process.env.INFISICAL_PLATFORM_VERSION || "unknown";

  const resource = Resource.default().merge(
    new Resource({
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

  const views: View[] = [
    new View({
      meterName: "InfisicalCore",
      attributeKeys: INFISICAL_CORE_METER_ATTRIBUTES
    })
  ];

  if (dropLegacyMeters) {
    views.push(
      new View({ meterName: "Infisical", aggregation: Aggregation.Drop() }),
      new View({ meterName: "API", aggregation: Aggregation.Drop() })
    );
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
      dropLegacyMeters: Boolean(appCfg.dropLegacyMeters)
    });
  }

  if (appCfg.useDataDogTracer) {
    // eslint-disable-next-line no-console
    console.log("Initializing Datadog tracer");
    tracer.init({ ...appCfg.TRACER });
  }
};

void setupTelemetry();
