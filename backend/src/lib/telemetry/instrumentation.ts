import opentelemetry from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { Resource } from "@opentelemetry/resources";
import { AggregationTemporality, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

export const initTelemetry = async ({ otlpURL }: { otlpURL?: string }) => {
  const resource = Resource.default().merge(
    new Resource({
      [SEMRESATTRS_SERVICE_NAME]: "infisical-server",
      [SEMRESATTRS_SERVICE_VERSION]: "0.1.0"
    })
  );

  const metricReaders = [];
  if (otlpURL) {
    const otlpExporter = new OTLPMetricExporter({
      url: `${otlpURL}/v1/metrics`,
      temporalityPreference: AggregationTemporality.DELTA
    });

    metricReaders.push(
      new PeriodicExportingMetricReader({
        exporter: otlpExporter,
        exportIntervalMillis: 30000
      })
    );
  } else {
    const promExporter = new PrometheusExporter();
    metricReaders.push(promExporter);
  }

  const meterProvider = new MeterProvider({
    resource,
    readers: metricReaders
  });

  opentelemetry.metrics.setGlobalMeterProvider(meterProvider);

  registerInstrumentations({
    instrumentations: [getNodeAutoInstrumentations()]
  });
};
