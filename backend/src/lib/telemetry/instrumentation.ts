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

dotenv.config();

// Strict allowlist of attribute keys that may appear on metrics emitted by the "InfisicalCore" meter.
// Any attribute passed at a call site that's not in this list is silently dropped by the SDK View.
// Cardinality control is centralized here. Call sites stay simple and a contributor adding an
// unbounded label by mistake is caught automatically.
//
// If you need per-actor breakdowns, query the audit log table. It carries actorId, actorType, ip, userAgent and full event detail.
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
  "audit_log_stream.id",
  "scim.operation",
  "sso.provider",
  "sso.action",
  "db.pool.state",
  "cache.result",
  "rate_limit.bucket",
  // License Server v2 dual-read comparison (bounded: feature key set + a small set of diff kinds)
  "license.feature",
  "license.dual_read.kind",
  // Build info gauge labels — single-value per deploy, no cardinality concern
  "service.version",
  "git.commit.sha",
  "node.version"
];

// Every meter that predates the InfisicalCore allowlist. None have a View, so their per-actor / unbounded
// labels (user.email, client.address, syncId, ...) flow through unchanged unless dropped wholesale via
// OTEL_DROP_HIGH_CARDINALITY_METERS. Kept on by default for self-hosted; dropped in multi-tenant/cloud.
const HIGH_CARDINALITY_METER_NAMES = ["Infisical", "API", "SecretSyncs", "PkiSyncs", "Integrations"];

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
