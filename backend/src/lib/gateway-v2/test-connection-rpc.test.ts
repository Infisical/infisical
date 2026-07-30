import http from "node:http";
import { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callTestConnection } from "./test-connection-rpc";

vi.mock("@app/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
}));

// Stands up a throwaway HTTP server that impersonates the gateway's /v1/test-connection endpoint, so
// callTestConnection's response parsing (success, structured error, malformed body) is verified without a gateway.
describe("callTestConnection", () => {
  let server: http.Server;
  let port: number;
  let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  beforeEach(async () => {
    server = http.createServer((req, res) => handler(req, res));
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  const body = { mode: "postgres", username: "postgres", password: "postgres", database: "postgres" };

  it("returns ok on a 200 result response", async () => {
    let receivedBody = "";
    handler = (req, res) => {
      req.on("data", (c) => {
        receivedBody += c;
      });
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ result: { ok: true } }));
      });
    };

    const response = await callTestConnection({ port, body, timeoutMs: 5000 });
    expect(response.ok).toBe(true);

    expect(JSON.parse(receivedBody)).toMatchObject({ ...body, timeoutMs: 5000 });
  });

  it("surfaces the gateway's structured error on a non-2xx response", async () => {
    handler = (_req, res) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "password authentication failed" } }));
    };

    const response = await callTestConnection({ port, body, timeoutMs: 5000 });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.errorMessage).toBe("password authentication failed");
    }
  });

  it("falls back to a generic message when the error body is malformed", async () => {
    handler = (_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("upstream exploded");
    };

    const response = await callTestConnection({ port, body, timeoutMs: 5000 });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.errorMessage).toContain("HTTP 500");
    }
  });
});
