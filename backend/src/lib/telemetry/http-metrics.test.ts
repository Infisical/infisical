import opentelemetry from "@opentelemetry/api";
import {
  AggregationType,
  createAllowListAttributesProcessor,
  type DataPoint,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type ViewOptions
} from "@opentelemetry/sdk-metrics";
import Fastify, { type FastifyInstance } from "fastify";

import {
  HIGH_CARDINALITY_METER_NAMES,
  HTTP_INSTRUMENTATION_METER_ATTRIBUTES,
  HTTP_INSTRUMENTATION_METER_NAME,
  INFISICAL_CORE_METER_ATTRIBUTES
} from "./telemetry-attributes";

const mockConfig = {
  OTEL_TELEMETRY_COLLECTION_ENABLED: true,
  OTEL_DROP_HIGH_CARDINALITY_METERS: false
};

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => mockConfig
}));

const CORE_REQUEST_COUNT = "infisical.core.http.request.count";
const LEGACY_REQUEST_COUNT = "infisical.http.server.request.count";

let reader: PeriodicExportingMetricReader;

// Mirrors initTelemetryInstrumentation() in instrumentation.ts. The Views are the thing under test as
// much as the plugin is: an attribute added at a call site is only bounded because the allowlist drops it.
//
// Two things make a per-test provider necessary, and both fail silently rather than erroring:
// the OpenTelemetry API ignores a second setGlobalMeterProvider() unless the global is disabled first,
// and metrics.ts memoizes each meter and instrument on first use, so an instrument created against an
// earlier provider keeps recording into it. Without disable() + resetModules() only the first test in
// the file observes anything and the rest pass or fail for the wrong reason.
const installMeterProvider = () => {
  opentelemetry.metrics.disable();
  const views: ViewOptions[] = [
    {
      meterName: "InfisicalCore",
      attributesProcessors: [createAllowListAttributesProcessor(INFISICAL_CORE_METER_ATTRIBUTES)]
    },
    {
      meterName: HTTP_INSTRUMENTATION_METER_NAME,
      attributesProcessors: [createAllowListAttributesProcessor(HTTP_INSTRUMENTATION_METER_ATTRIBUTES)]
    }
  ];
  if (mockConfig.OTEL_DROP_HIGH_CARDINALITY_METERS) {
    HIGH_CARDINALITY_METER_NAMES.forEach((meterName) => {
      views.push({
        meterName,
        aggregation: { type: AggregationType.DROP },
        attributesProcessors: [createAllowListAttributesProcessor([])]
      });
    });
  }
  vi.resetModules();
  reader = new PeriodicExportingMetricReader({
    exporter: new InMemoryMetricExporter(0),
    exportIntervalMillis: 60_000
  });
  opentelemetry.metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader], views }));
};

const buildApp = async (): Promise<FastifyInstance> => {
  // Imported after the provider is installed so the plugin binds its instruments to this test's reader.
  const { apiMetrics } = await import("@app/server/plugins/api-metrics");
  const app = Fastify();
  await app.register(apiMetrics);
  app.get("/api/v1/workspace/:workspaceId", async () => ({ ok: true }));
  app.get("/api/v1/boom", async () => {
    throw new Error("boom");
  });
  await app.ready();
  return app;
};

// Returns every data point recorded for a metric, across all attribute sets.
const collect = async (metricName: string): Promise<DataPoint<number>[]> => {
  const { resourceMetrics } = await reader.collect();
  return resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .filter((metric) => metric.descriptor.name === metricName)
    .flatMap((metric) => metric.dataPoints as DataPoint<number>[]);
};

describe("api-metrics plugin", () => {
  beforeEach(() => {
    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = true;
    mockConfig.OTEL_DROP_HIGH_CARDINALITY_METERS = false;
  });

  afterEach(() => {
    opentelemetry.metrics.disable();
  });

  test("records a successful response with the bounded label set", async () => {
    installMeterProvider();
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/api/v1/workspace/abc-123" });

    const points = await collect(CORE_REQUEST_COUNT);
    expect(points).toHaveLength(1);
    expect(points[0].attributes).toStrictEqual({
      "http.request.method": "GET",
      "http.route": "/api/v1/workspace/:workspaceId",
      "http.response.status_code": 200
    });
    await app.close();
  });

  test("records an error response, and keeps the route template", async () => {
    installMeterProvider();
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/api/v1/boom" });

    const points = await collect(CORE_REQUEST_COUNT);
    expect(points).toHaveLength(1);
    expect(points[0].attributes["http.response.status_code"]).toBe(500);
    expect(points[0].attributes["http.route"]).toBe("/api/v1/boom");
    await app.close();
  });

  test("normalizes a method outside the semconv set to _OTHER", async () => {
    installMeterProvider();
    const app = await buildApp();
    // PROPFIND is one of the 35 methods Node's parser accepts but semconv does not name.
    await app.inject({ method: "PROPFIND" as "GET", url: "/api/v1/no-such-route" });

    const points = await collect(CORE_REQUEST_COUNT);
    expect(points).toHaveLength(1);
    expect(points[0].attributes["http.request.method"]).toBe("_OTHER");
    await app.close();
  });

  test("collapses distinct path parameters onto one series", async () => {
    installMeterProvider();
    const app = await buildApp();
    for (const id of ["a", "b", "c", "d", "e"]) {
      // eslint-disable-next-line no-await-in-loop
      await app.inject({ method: "GET", url: `/api/v1/workspace/${id}` });
    }

    const points = await collect(CORE_REQUEST_COUNT);
    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(5);
    await app.close();
  });

  test("collapses unmatched paths onto http.route=unknown, never the raw path", async () => {
    installMeterProvider();
    const app = await buildApp();
    for (const suffix of ["one", "two", "three"]) {
      // eslint-disable-next-line no-await-in-loop
      await app.inject({ method: "GET", url: `/api/v1/missing-${suffix}` });
    }

    const points = await collect(CORE_REQUEST_COUNT);
    expect(points).toHaveLength(1);
    expect(points[0].attributes["http.route"]).toBe("unknown");
    expect(points[0].value).toBe(3);
    await app.close();
  });

  test("keeps recording the core counter when the high-cardinality meters are dropped", async () => {
    mockConfig.OTEL_DROP_HIGH_CARDINALITY_METERS = true;
    installMeterProvider();
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/api/v1/workspace/abc-123" });

    // The denominator has to survive the kill switch; that is the whole point of the split.
    const core = await collect(CORE_REQUEST_COUNT);
    expect(core).toHaveLength(1);
    expect(core[0].value).toBe(1);

    const legacy = await collect(LEGACY_REQUEST_COUNT);
    expect(legacy).toHaveLength(0);
    await app.close();
  });

  test("records nothing at all when telemetry is disabled", async () => {
    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = false;
    installMeterProvider();
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/api/v1/workspace/abc-123" });

    expect(await collect(CORE_REQUEST_COUNT)).toHaveLength(0);
    await app.close();
  });
});
