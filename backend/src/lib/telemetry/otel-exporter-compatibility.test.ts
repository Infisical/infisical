import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

import { resolveOtlpMetricsEndpoint } from "./otlp-endpoint";

const closeServer = (server: ReturnType<typeof createServer>) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

describe("OTLP metrics exporter compatibility", () => {
  test("exports protobuf metrics once to the normalized authenticated endpoint", async () => {
    type RequestDetails = {
      authorization?: string;
      body: Buffer;
      contentType?: string;
      method?: string;
      url?: string;
    };
    let resolveRequest!: (requestDetails: RequestDetails) => void;
    const request = new Promise<RequestDetails>((resolve) => {
      resolveRequest = resolve;
    });
    const server = createServer((incoming, response) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => {
        resolveRequest({
          authorization: incoming.headers.authorization,
          body: Buffer.concat(chunks),
          contentType: incoming.headers["content-type"],
          method: incoming.method,
          url: incoming.url
        });
        response.writeHead(200);
        response.end();
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    const { port } = server.address() as AddressInfo;
    const exporter = new OTLPMetricExporter({
      headers: { Authorization: `Basic ${btoa("infisical:secret")}` },
      url: resolveOtlpMetricsEndpoint(`http://127.0.0.1:${port}`)
    });
    const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
    const provider = new MeterProvider({ readers: [reader] });

    try {
      provider.getMeter("compatibility").createCounter("infisical.compatibility.count").add(1);
      await provider.forceFlush();

      const received = await request;
      expect(received).toMatchObject({
        authorization: `Basic ${btoa("infisical:secret")}`,
        contentType: "application/x-protobuf",
        method: "POST",
        url: "/v1/metrics"
      });
      expect(received.body.byteLength).toBeGreaterThan(0);
    } finally {
      await provider.shutdown();
      await closeServer(server);
    }
  });
});
