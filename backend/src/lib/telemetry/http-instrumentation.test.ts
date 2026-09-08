import { createRequire } from "node:module";

import opentelemetry from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import {
  AggregationTemporality,
  createAllowListAttributesProcessor,
  InMemoryMetricExporter,
  MeterProvider,
  type MetricData,
  PeriodicExportingMetricReader,
  type ResourceMetrics
} from "@opentelemetry/sdk-metrics";

import {
  HTTP_INSTRUMENTATION_METER_ATTRIBUTES,
  HTTP_INSTRUMENTATION_METER_NAME,
  resolveHttpSemconvOptIn
} from "./telemetry-attributes";

describe("resolveHttpSemconvOptIn", () => {
  test("forces the http token when nothing is set", () => {
    expect(resolveHttpSemconvOptIn(undefined)).toBe("http");
    expect(resolveHttpSemconvOptIn("")).toBe("http");
  });

  test("preserves tokens for other namespaces", () => {
    expect(resolveHttpSemconvOptIn("database,messaging")).toBe("database,messaging,http");
  });

  // http/dup is the OTel migration path: it emits the old metric names alongside the stable ones so an
  // operator can cut dashboards over before the old names go away. An explicit opt-in is theirs to make.
  test("honours an explicitly set http/dup", () => {
    expect(resolveHttpSemconvOptIn("http/dup")).toBe("http/dup");
    expect(resolveHttpSemconvOptIn("database,HTTP/DUP")).toBe("database,HTTP/DUP");
    // http/dup takes precedence in the SDK's own parser, so both tokens together still mean duplicate.
    expect(resolveHttpSemconvOptIn("http,http/dup")).toBe("http,http/dup");
  });

  test("does not duplicate an http token that is already present", () => {
    expect(resolveHttpSemconvOptIn("http")).toBe("http");
  });
});

// The instrumentation reads OTEL_SEMCONV_STABILITY_OPT_IN in its constructor and patches node:http on
// require, and neither is undone reliably by unregistering. So the pipeline is built once per file, and
// the opposite configuration lives in http-semconv-baseline.test.ts, where Vitest's file isolation gives
// it a fresh module registry. Both files together are the regression test: this one asserts the
// production configuration is bounded, that one asserts it would not be bounded without the opt-in.
const getWithHost = (http: typeof import("node:http"), port: number, host: string) =>
  new Promise<void>((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: "/probe", headers: { Host: host } }, (res) => {
        res.resume();
        res.on("end", resolve);
      })
      .on("error", reject);
  });

describe("HttpInstrumentation under the production configuration", () => {
  let snapshot: ResourceMetrics;
  let server: import("node:http").Server;
  let http: typeof import("node:http");
  let port: number;

  beforeAll(async () => {
    process.env.OTEL_SEMCONV_STABILITY_OPT_IN = resolveHttpSemconvOptIn(process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
    // Collected once into a snapshot below: the reader is delta, so the first collect() drains the
    // points and every later one comes back empty.
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

    http = createRequire(`${process.cwd()}/`)("http") as typeof import("node:http");
    server = http.createServer((_req, res) => {
      res.statusCode = 200;
      res.end("ok");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    port = (server.address() as { port: number }).port;

    // Three requests, three different Host headers. Under the old conventions this is three series.
    for (const host of ["probe-a.invalid", "probe-b.invalid", "probe-c.invalid"]) {
      // eslint-disable-next-line no-await-in-loop
      await getWithHost(http, port, host);
    }

    snapshot = (await reader.collect()).resourceMetrics;
  });

  afterAll(async () => {
    opentelemetry.metrics.disable();
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
  });

  const metric = (name: string): MetricData | undefined =>
    snapshot.scopeMetrics.flatMap((scope) => scope.metrics).find((m) => m.descriptor.name === name);
  const labelKeys = (name: string) =>
    new Set(metric(name)?.dataPoints.flatMap((point) => Object.keys(point.attributes)) ?? []);

  test("exports the stable metric and not the old one", () => {
    expect(metric("http.server.request.duration")).toBeDefined();
    expect(metric("http.server.duration")).toBeUndefined();
  });

  test("never carries net.host.name, and distinct Host headers collapse onto one series", () => {
    const keys = labelKeys("http.server.request.duration");
    expect(keys.has("net.host.name")).toBe(false);
    expect(metric("http.server.request.duration")?.dataPoints).toHaveLength(1);
  });

  test("the View strips the constants stable semconv still carries", () => {
    const keys = labelKeys("http.server.request.duration");
    expect(keys.has("url.scheme")).toBe(false);
    expect(keys.has("network.protocol.version")).toBe(false);
    expect([...keys].every((key) => HTTP_INSTRUMENTATION_METER_ATTRIBUTES.includes(key))).toBe(true);
  });

  // Stable semconv drops the host from the SERVER metric but keeps server.address on the CLIENT metric,
  // which is every outbound hostname the instance calls: webhooks, sync destinations, IdPs. The allowlist
  // is the only thing bounding that, so this is the case that must not regress.
  test("the View strips server.address from the client metric", () => {
    const keys = labelKeys("http.client.request.duration");
    expect(keys.size).toBeGreaterThan(0);
    expect(keys.has("server.address")).toBe(false);
    expect(keys.has("server.port")).toBe(false);
  });
});
