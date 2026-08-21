import { spawn } from "node:child_process";
import { createServer, IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

type CapturedRequest = {
  body: Buffer;
  headers: IncomingHttpHeaders;
  method?: string;
  url?: string;
};

const listen = (server: ReturnType<typeof createServer>) =>
  new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });

const close = (server: ReturnType<typeof createServer>) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

describe("Datadog tracer compatibility", () => {
  test("initializes from repository config and propagates HTTP trace context", async () => {
    let resolveApplicationRequest!: (request: CapturedRequest) => void;
    const applicationRequest = new Promise<CapturedRequest>((resolve) => {
      resolveApplicationRequest = resolve;
    });
    const applicationServer = createServer((request, response) => {
      resolveApplicationRequest({
        body: Buffer.alloc(0),
        headers: request.headers,
        method: request.method,
        url: request.url
      });
      response.writeHead(204);
      response.end();
    });

    let resolveTraceRequest!: (request: CapturedRequest) => void;
    const traceRequest = new Promise<CapturedRequest>((resolve) => {
      resolveTraceRequest = resolve;
    });
    const agentServer = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        if (request.url?.endsWith("/traces")) {
          resolveTraceRequest({
            body: Buffer.concat(chunks),
            headers: request.headers,
            method: request.method,
            url: request.url
          });
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"rate_by_service":{}}');
      });
    });

    const [applicationPort, agentPort] = await Promise.all([listen(applicationServer), listen(agentServer)]);
    const childScript = `
        await import("./src/lib/telemetry/instrumentation.ts");
        const assert = await import("node:assert/strict");
        const { default: tracer } = await import("dd-trace");
        const http = await import("node:http");

        assert.equal(tracer._tracer._service, "infisical-compatibility");
        assert.equal(tracer._tracer._env, "compatibility");
        assert.equal(tracer._tracer._version, "compatibility-version");
        assert.equal(tracer._tracer._config.hostname, "127.0.0.1");

        await tracer.trace("infisical.compatibility", async () => {
          await new Promise((resolve, reject) => {
            const request = http.get("http://127.0.0.1:${applicationPort}/compatibility", (response) => {
              response.resume();
              response.once("end", resolve);
            });
            request.once("error", reject);
          });
        });

        await new Promise((resolve) => setTimeout(resolve, 500));
      `;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", childScript], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AUTH_SECRET: "compatibility-auth-secret",
        DATADOG_ENV: "compatibility",
        DATADOG_HOSTNAME: "127.0.0.1",
        DATADOG_PROFILING_ENABLED: "false",
        DATADOG_SERVICE: "infisical-compatibility",
        DD_CRASHTRACKING_ENABLED: "false",
        DD_INSTRUMENTATION_TELEMETRY_ENABLED: "false",
        DD_REMOTE_CONFIGURATION_ENABLED: "false",
        DD_TELEMETRY_ENABLED: "false",
        DD_TRACE_AGENT_PORT: String(agentPort),
        DD_TRACE_FLUSH_INTERVAL: "100",
        DD_TRACE_PROPAGATION_STYLE_INJECT: "datadog,tracecontext",
        DD_TRACE_STARTUP_LOGS: "false",
        INFISICAL_PLATFORM_VERSION: "compatibility-version",
        OTEL_TELEMETRY_COLLECTION_ENABLED: "false",
        REDIS_URL: "redis://127.0.0.1:1",
        SHOULD_USE_DATADOG_TRACER: "true"
      }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    try {
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      });
      expect(exitCode, stderr).toBe(0);
      expect(stdout).toContain("Initializing Datadog tracer");

      const receivedApplicationRequest = await applicationRequest;
      expect(receivedApplicationRequest).toMatchObject({ method: "GET", url: "/compatibility" });
      expect(receivedApplicationRequest.headers["x-datadog-trace-id"]).toMatch(/^\d+$/);
      expect(receivedApplicationRequest.headers["x-datadog-parent-id"]).toMatch(/^\d+$/);
      expect(receivedApplicationRequest.headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);

      const receivedTraceRequest = await traceRequest;
      expect(receivedTraceRequest).toMatchObject({ method: "PUT" });
      expect(receivedTraceRequest.url).toMatch(/^\/v0\.[45]\/traces$/);
      expect(receivedTraceRequest.headers["datadog-meta-tracer-version"]).toBe("5.121.0");
      expect(receivedTraceRequest.body.byteLength).toBeGreaterThan(0);
    } finally {
      child.kill("SIGKILL");
      await Promise.all([close(applicationServer), close(agentServer)]);
    }
  }, 15_000);
});
