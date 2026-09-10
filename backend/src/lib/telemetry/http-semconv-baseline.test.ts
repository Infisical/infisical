import { createRequire } from "node:module";

import opentelemetry from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type ResourceMetrics
} from "@opentelemetry/sdk-metrics";

// The negative half of the HttpInstrumentation regression test. Its counterpart,
// http-instrumentation.test.ts, asserts the production configuration is bounded; this one asserts the
// same traffic is UNBOUNDED without the semconv opt-in, so that a change which quietly stops applying
// the opt-in fails here instead of leaving a green suite that proves nothing.
//
// It lives in its own file because the instrumentation reads OTEL_SEMCONV_STABILITY_OPT_IN in its
// constructor and patches node:http on require, neither of which unregistering reliably undoes. Vitest
// isolates by file, so this gets a fresh module registry.
const getWithHost = (http: typeof import("node:http"), port: number, host: string) =>
  new Promise<void>((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: "/probe", headers: { Host: host } }, (res) => {
        res.resume();
        res.on("end", resolve);
      })
      .on("error", reject);
  });

describe("HttpInstrumentation without the semconv opt-in", () => {
  let snapshot: ResourceMetrics;
  let server: import("node:http").Server;

  beforeAll(async () => {
    delete process.env.OTEL_SEMCONV_STABILITY_OPT_IN;

    const reader = new PeriodicExportingMetricReader({
      exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
      exportIntervalMillis: 60_000
    });
    const meterProvider = new MeterProvider({ readers: [reader] });
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
    opentelemetry.metrics.disable();
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
  });

  test("falls back to the old metric name", () => {
    const names = snapshot.scopeMetrics.flatMap((scope) => scope.metrics).map((m) => m.descriptor.name);
    expect(names).toContain("http.server.duration");
    expect(names).not.toContain("http.server.request.duration");
  });

  test("labels the metric with the client-controlled Host header, one series per value", () => {
    const duration = snapshot.scopeMetrics
      .flatMap((scope) => scope.metrics)
      .find((m) => m.descriptor.name === "http.server.duration");

    const keys = new Set(duration?.dataPoints.flatMap((point) => Object.keys(point.attributes)) ?? []);
    expect(keys.has("net.host.name")).toBe(true);

    // Three Host headers, three series. This is the growth that killed the collector.
    expect(duration?.dataPoints).toHaveLength(3);
    const hosts = duration?.dataPoints.map((point) => point.attributes["net.host.name"]);
    expect(new Set(hosts).size).toBe(3);
  });
});
