import opentelemetry from "@opentelemetry/api";
import {
  AggregationTemporality,
  createAllowListAttributesProcessor,
  type DataPoint,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader
} from "@opentelemetry/sdk-metrics";
import type { Knex } from "knex";

import { BadRequestError } from "@app/lib/errors";

import {
  highCardinalityMeter,
  LocalRefreshOutcome,
  normalizeHttpMethod,
  recordLocalRefreshRunMetric,
  registerInfrastructureMetrics,
  shouldRecordHighCardinalityMetrics
} from "./metrics";
import { INFISICAL_CORE_METER_ATTRIBUTES } from "./telemetry-attributes";

const mockConfig = {
  OTEL_TELEMETRY_COLLECTION_ENABLED: true,
  OTEL_DROP_HIGH_CARDINALITY_METERS: false
};

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => mockConfig
}));

// resolveMeter() memoizes per meter name, so each test uses a fresh name to observe the first resolution.
let meterNameSeq = 0;
const uniqueMeterName = () => {
  meterNameSeq += 1;
  return `TestMeter${meterNameSeq}`;
};

describe("shouldRecordHighCardinalityMetrics", () => {
  beforeEach(() => {
    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = true;
    mockConfig.OTEL_DROP_HIGH_CARDINALITY_METERS = false;
  });

  test("records only when telemetry is enabled and the meters are not dropped", () => {
    expect(shouldRecordHighCardinalityMetrics()).toBe(true);

    mockConfig.OTEL_DROP_HIGH_CARDINALITY_METERS = true;
    expect(shouldRecordHighCardinalityMetrics()).toBe(false);

    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = false;
    expect(shouldRecordHighCardinalityMetrics()).toBe(false);

    mockConfig.OTEL_DROP_HIGH_CARDINALITY_METERS = false;
    expect(shouldRecordHighCardinalityMetrics()).toBe(false);
  });
});

describe("highCardinalityMeter", () => {
  beforeEach(() => {
    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = true;
    mockConfig.OTEL_DROP_HIGH_CARDINALITY_METERS = false;
    vi.restoreAllMocks();
  });

  // The DROP view suppresses the aggregated value but not the attribute key, which the SDK retains for
  // the lifetime of the process under cumulative temporality. Bounding that memory requires the SDK to
  // never see the measurement at all, so assert nothing reaches it rather than that nothing is exported.
  test("does not touch the SDK at all when the meters are dropped", () => {
    mockConfig.OTEL_DROP_HIGH_CARDINALITY_METERS = true;
    const getMeter = vi.spyOn(opentelemetry.metrics, "getMeter");
    const meter = highCardinalityMeter(uniqueMeterName());

    meter.createCounter("test.counter").add(1, { "client.address": "10.0.0.1" });
    meter.createHistogram("test.histogram").record(1, { "client.address": "10.0.0.1" });

    expect(getMeter).not.toHaveBeenCalled();
  });

  test("resolves the meter and records when the meters are enabled", () => {
    const getMeter = vi.spyOn(opentelemetry.metrics, "getMeter");
    const meterName = uniqueMeterName();
    const meter = highCardinalityMeter(meterName);

    meter.createCounter("test.counter").add(1);
    meter.createHistogram("test.histogram").record(1);

    expect(getMeter).toHaveBeenCalledWith(meterName);
  });

  // Every record helper in the module funnels through this wrapper, so a broken exporter or a bad
  // instrument name can never surface as an exception in the code being measured.
  test("does not throw into the call site when the SDK does", () => {
    const broken = () => {
      throw new Error("exporter broken");
    };
    vi.spyOn(opentelemetry.metrics, "getMeter").mockReturnValue({
      createCounter: broken,
      createHistogram: broken
    } as never);
    const meter = highCardinalityMeter(uniqueMeterName());

    expect(() => meter.createCounter("test.counter").add(1)).not.toThrow();
    expect(() => meter.createHistogram("test.histogram").record(1)).not.toThrow();
  });

  test("stays a no-op while telemetry is disabled, then records once it is enabled", () => {
    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = false;
    const getMeter = vi.spyOn(opentelemetry.metrics, "getMeter");
    const meterName = uniqueMeterName();
    const counter = highCardinalityMeter(meterName).createCounter("test.counter");

    counter.add(1);
    expect(getMeter).not.toHaveBeenCalled();

    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = true;
    counter.add(1);
    expect(getMeter).toHaveBeenCalledWith(meterName);
  });
});

// KNOWN_HTTP_METHODS is a hand copy of the private KNOWN_METHODS set inside
// @opentelemetry/instrumentation-http. If the library's set changes on an upgrade, the two metrics stop
// agreeing on http.request.method and silently become unjoinable, so pin the whole contract here.
describe("normalizeHttpMethod", () => {
  test.each(["GET", "HEAD", "POST", "PUT", "DELETE", "CONNECT", "OPTIONS", "TRACE", "PATCH", "QUERY"])(
    "keeps the semconv-known method %s",
    (method) => {
      expect(normalizeHttpMethod(method)).toBe(method);
    }
  );

  test("upper-cases a known method given in another case", () => {
    expect(normalizeHttpMethod("get")).toBe("GET");
    expect(normalizeHttpMethod("Patch")).toBe("PATCH");
  });

  // Node's parser accepts 35 methods, so these reach us for real; the semconv vocabulary has 10.
  test.each(["PROPFIND", "MKCOL", "UNLOCK", "M-SEARCH", "PURGE"])("folds %s onto _OTHER", (method) => {
    expect(normalizeHttpMethod(method)).toBe("_OTHER");
  });

  test("defaults to GET when the method is absent, matching the instrumentation", () => {
    expect(normalizeHttpMethod(undefined)).toBe("GET");
    expect(normalizeHttpMethod("")).toBe("GET");
  });
});

describe("local refresh metrics", () => {
  let reader: PeriodicExportingMetricReader;

  // Instruments bind to the provider on first use and never rebind, so the provider is installed once.
  beforeAll(() => {
    opentelemetry.metrics.disable();
    reader = new PeriodicExportingMetricReader({
      exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
      exportIntervalMillis: 60_000
    });
    opentelemetry.metrics.setGlobalMeterProvider(
      new MeterProvider({
        readers: [reader],
        views: [
          {
            meterName: "InfisicalCore",
            attributesProcessors: [createAllowListAttributesProcessor(INFISICAL_CORE_METER_ATTRIBUTES)]
          }
        ]
      })
    );
    registerInfrastructureMetrics({ client: {} } as unknown as Knex);
  });

  afterAll(() => {
    opentelemetry.metrics.disable();
  });

  beforeEach(() => {
    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = true;
  });

  const collectPoints = async (metricName: string) => {
    const { resourceMetrics } = await reader.collect();
    return resourceMetrics.scopeMetrics
      .flatMap((scope) => scope.metrics)
      .filter((metric) => metric.descriptor.name === metricName)
      .flatMap((metric) => metric.dataPoints as DataPoint<number>[]);
  };

  test("labels failed runs with the classified error type and keeps the labels through the allowlist", async () => {
    recordLocalRefreshRunMetric({
      name: "labels",
      outcome: LocalRefreshOutcome.FAILED,
      durationMs: 1500,
      error: new BadRequestError({ message: "bad" }),
      consecutiveFailures: 1
    });
    recordLocalRefreshRunMetric({ name: "labels", outcome: LocalRefreshOutcome.SKIPPED });

    const runs = (await collectPoints("infisical.local_refresh.run.count")).filter(
      (point) => point.attributes["job.name"] === "labels"
    );
    expect(runs.map((point) => point.attributes)).toEqual(
      expect.arrayContaining([
        { "job.name": "labels", outcome: "failed", "error.type": "validation" },
        { "job.name": "labels", outcome: "skipped" }
      ])
    );

    const durations = (await collectPoints("infisical.local_refresh.run.duration")).filter(
      (point) => point.attributes["job.name"] === "labels"
    );
    expect(durations).toHaveLength(1);
    expect((durations[0].value as unknown as { sum: number }).sum).toBe(1.5);
  });

  test("the consecutive failure gauge heals on success", async () => {
    const gaugeValue = async () =>
      (await collectPoints("infisical.local_refresh.consecutive_failures")).find(
        (point) => point.attributes["job.name"] === "gauge"
      )?.value;

    recordLocalRefreshRunMetric({ name: "gauge", outcome: LocalRefreshOutcome.FAILED, consecutiveFailures: 3 });
    expect(await gaugeValue()).toBe(3);

    recordLocalRefreshRunMetric({ name: "gauge", outcome: LocalRefreshOutcome.COMPLETED, consecutiveFailures: 0 });
    expect(await gaugeValue()).toBe(0);
  });

  test("records nothing while telemetry is disabled", async () => {
    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = false;
    recordLocalRefreshRunMetric({ name: "disabled", outcome: LocalRefreshOutcome.FAILED, consecutiveFailures: 1 });
    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = true;

    const runs = (await collectPoints("infisical.local_refresh.run.count")).filter(
      (point) => point.attributes["job.name"] === "disabled"
    );
    expect(runs).toHaveLength(0);
  });
});
