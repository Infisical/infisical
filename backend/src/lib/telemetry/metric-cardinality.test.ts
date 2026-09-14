import opentelemetry from "@opentelemetry/api";
import {
  AggregationTemporality,
  createAllowListAttributesProcessor,
  type DataPoint,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader
} from "@opentelemetry/sdk-metrics";

import { INFISICAL_CORE_METER_ATTRIBUTES, METER_AGGREGATION_CARDINALITY_LIMIT } from "./telemetry-attributes";

const OVERFLOW_ATTRIBUTE = "otel.metric.overflow";

// The cardinality ceiling is what bounds an InfisicalCore instrument on the Prometheus path, where series
// are retained for the life of the process. These tests pin the behaviour an operator's alarm depends on:
// that breaching the ceiling is visible, that it costs attribution rather than counts, and that the signal
// survives the allowlist. A low limit stands in for 2000 so the test stays fast; the fold is the same.
const collectWithLimit = async (limit: number, distinctRoutes: number) => {
  opentelemetry.metrics.disable();
  const reader = new PeriodicExportingMetricReader({
    exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
    exportIntervalMillis: 60_000
  });
  const meterProvider = new MeterProvider({
    readers: [reader],
    views: [
      {
        meterName: "InfisicalCore",
        aggregationCardinalityLimit: limit,
        attributesProcessors: [createAllowListAttributesProcessor(INFISICAL_CORE_METER_ATTRIBUTES)]
      }
    ]
  });
  opentelemetry.metrics.setGlobalMeterProvider(meterProvider);

  const counter = meterProvider.getMeter("InfisicalCore").createCounter("infisical.core.http.request.count");
  for (let i = 0; i < distinctRoutes; i += 1) {
    counter.add(1, {
      "http.request.method": "GET",
      "http.route": `/api/v1/route-${i}`,
      "http.response.status_code": 200,
      // Not on the allowlist. Present to prove the ceiling counts what survives the filter, not what the
      // call site passed, which is the difference between a bounded instrument and an unbounded one.
      "infisical.user.email": `user-${i}@example.com`
    });
  }

  const { resourceMetrics } = await reader.collect();
  const points = resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .filter((metric) => metric.descriptor.name === "infisical.core.http.request.count")
    .flatMap((metric) => metric.dataPoints as DataPoint<number>[]);
  return points;
};

describe("aggregation cardinality ceiling", () => {
  afterEach(() => {
    opentelemetry.metrics.disable();
  });

  test("holds the instrument at the configured ceiling", async () => {
    const points = await collectWithLimit(10, 50);
    expect(points).toHaveLength(10);
  });

  test("folds the excess onto a single overflow point that outlives the allowlist", async () => {
    const points = await collectWithLimit(10, 50);

    // The SDK injects this after the attributes processor has run, so an alarm can see it even though it
    // is not on INFISICAL_CORE_METER_ATTRIBUTES. Adding it to the allowlist would not help and is not why
    // it survives.
    const overflow = points.find((point) => point.attributes[OVERFLOW_ATTRIBUTE] === true);
    expect(overflow).toBeDefined();
    expect(INFISICAL_CORE_METER_ATTRIBUTES).not.toContain(OVERFLOW_ATTRIBUTE);
  });

  test("loses attribution but never counts", async () => {
    const points = await collectWithLimit(10, 50);

    // 50 increments in, 50 increments out. A breach costs the per-route breakdown, not the total, which is
    // why the alarm is a data-quality signal rather than a liveness one.
    const total = points.reduce((sum, point) => sum + point.value, 0);
    expect(total).toBe(50);
  });

  test("counts attribute sets after the allowlist, not before", async () => {
    // Every call site above passed a distinct infisical.user.email. If cardinality were counted before the
    // filter, nine distinct routes could not fit under a ceiling of ten.
    const points = await collectWithLimit(10, 9);
    expect(points.some((point) => point.attributes[OVERFLOW_ATTRIBUTE] === true)).toBe(false);
    expect(points).toHaveLength(9);
  });

  // This repo registers on the order of 1,500 routes, and infisical.core.http.request.count is keyed by
  // method, route and status. One status code per route fits; a second one does not. So the ceiling is not
  // theoretical headroom for this instrument, it is roughly where a fully exercised deployment sits, and on
  // Prometheus the cumulative retention means a long-lived process trends toward the whole surface. That is
  // the trade the ceiling buys: a bounded scrape, paid for with the tail of the route map.
  test("is reached by the route surface this repo registers once a second status code appears", async () => {
    const withinCeiling = await collectWithLimit(METER_AGGREGATION_CARDINALITY_LIMIT, 1500);
    expect(withinCeiling.some((point) => point.attributes[OVERFLOW_ATTRIBUTE] === true)).toBe(false);

    const beyondCeiling = await collectWithLimit(METER_AGGREGATION_CARDINALITY_LIMIT, 3000);
    expect(beyondCeiling.some((point) => point.attributes[OVERFLOW_ATTRIBUTE] === true)).toBe(true);
    expect(beyondCeiling).toHaveLength(METER_AGGREGATION_CARDINALITY_LIMIT);
  });
});
