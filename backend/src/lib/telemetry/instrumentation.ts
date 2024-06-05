import opentelemetry from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { Resource } from "@opentelemetry/resources";
import { AggregationTemporality, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

export const initTelemetry = (exportURL: string) => {
  const resource = Resource.default().merge(
    new Resource({
      [SEMRESATTRS_SERVICE_NAME]: "infisical-server",
      [SEMRESATTRS_SERVICE_VERSION]: "0.1.0"
    })
  );

  const metricExporter = new OTLPMetricExporter({
    url: `${exportURL}/v1/metrics`,
    temporalityPreference: AggregationTemporality.DELTA
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 30000
  });

  const myServiceMeterProvider = new MeterProvider({
    resource,
    readers: [metricReader]
  });

  opentelemetry.metrics.setGlobalMeterProvider(myServiceMeterProvider);

  registerInstrumentations({
    instrumentations: [getNodeAutoInstrumentations()]
  });
};
