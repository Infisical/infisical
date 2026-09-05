import { createRequire } from "node:module";

import opentelemetry from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import {
  AggregationTemporality,
  createAllowListAttributesProcessor,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type ResourceMetrics
} from "@opentelemetry/sdk-metrics";

import {
  HTTP_INSTRUMENTATION_METER_ATTRIBUTES,
  HTTP_INSTRUMENTATION_METER_NAME,
  resolveHttpSemconvOptIn
} from "./telemetry-attributes";

// The third HttpInstrumentation pipeline file, covering the migration configuration an operator opts into
// with OTEL_SEMCONV_STABILITY_OPT_IN=http/dup. Its own file for the same reason as the other two: the
// instrumentation reads the env var in its constructor and patches node:http on require, and Vitest
// isolates by file. What it guards is that honouring http/dup is worth something — the old metric has to
// come back with labels a dashboard can filter on, without the unbounded ones coming back with it.
const getWithHost = (http: typeof import("node:http"), port: number, host: string) =>
  new Promise<void>((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: "/probe", headers: { Host: host } }, (res) => {
        res.resume();
        res.on("end", resolve);
      })
      .on("error", reject);
  });

const findMetric = (snapshot: ResourceMetrics, name: string) =>
  snapshot.scopeMetrics.flatMap((scope) => scope.metrics).find((metric) => metric.descriptor.name === name);

describe("HttpInstrumentation under an operator's http/dup opt-in", () => {
  let snapshot: ResourceMetrics;
  let server: import("node:http").Server;

  beforeAll(async () => {
    process.env.OTEL_SEMCONV_STABILITY_OPT_IN = resolveHttpSemconvOptIn("http/dup");

    const reader = new PeriodicExportingMetricReader({
      exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
      exportIntervalMillis: 60_000
    });
    const meterProvider = new MeterProvider({
      readers: [reader],
      views: [
        {
          meterName: HTTP_INSTRUMENTATION_METER_NAME,
          attributesProcessors: [createAllowListAttributesProcessor(HTTP_INSTRUMENTATION_METER_ATTRIBUTES)]
        }
      ]
    });
    opentelemetry.metrics.setGlobalMeterProvider(meterProvider);
    registerInstrumentations({ instrumentations: [new HttpInstrumentation()], meterProvider });

    const http = createRequire(`${process.cwd()}/`)("http") as typeof import("node:http");
    server = http.createServer((_req, res) => {
      res.statusCode = 200;
      res.end("ok");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as { port: number };

    for (const host of ["probe-a.invalid", "probe-b.invalid", "probe-c.invalid"]) {
      // eslint-disable-next-line no-await-in-loop
      await getWithHost(http, port, host);
    }

    snapshot = (await reader.collect()).resourceMetrics;
  });

  afterAll(async () => {
    delete process.env.OTEL_SEMCONV_STABILITY_OPT_IN;
    opentelemetry.metrics.disable();
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
  });

  test("emits both the old and the stable metric name", () => {
    const names = snapshot.scopeMetrics.flatMap((scope) => scope.metrics).map((metric) => metric.descriptor.name);
    expect(names).toContain("http.server.duration");
    expect(names).toContain("http.server.request.duration");
  });

  test("keeps the old metric usable: method and status survive the allowlist", () => {
    const duration = findMetric(snapshot, "http.server.duration");
    expect(duration?.descriptor.unit).toBe("ms");

    const keys = new Set(duration?.dataPoints.flatMap((point) => Object.keys(point.attributes)) ?? []);
    // An empty attribute set here would mean the old metric is emitted but no dashboard can read it.
    expect(keys.has("http.method")).toBe(true);
    expect(keys.has("http.status_code")).toBe(true);
  });

  test("does not let the old names smuggle the Host header back in", () => {
    const duration = findMetric(snapshot, "http.server.duration");
    const keys = new Set(duration?.dataPoints.flatMap((point) => Object.keys(point.attributes)) ?? []);
    expect(keys.has("net.host.name")).toBe(false);
    expect(keys.has("net.host.port")).toBe(false);

    // Three distinct Host headers collapse onto one series, which is the whole point of the View.
    expect(duration?.dataPoints).toHaveLength(1);
  });
});
