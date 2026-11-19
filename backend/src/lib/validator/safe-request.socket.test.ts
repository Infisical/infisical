/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LookupAllOptions } from "node:dns";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { buildSsrfSafeAgent } from "./safe-request";

// This suite is deliberately not mocking `node:dns` or the axios client the way
// `safe-request.test.ts` does. It opens a real loopback HTTP server and drives
// real sockets through the agent produced by `buildSsrfSafeAgent`, so it proves
// the connect-time behavior (that Node actually honors the pinned lookup) rather
// than the request-shaping logic. It runs in the fast unit step, no DB, Redis,
// or Docker, and never opens a socket to anything other than 127.0.0.1 (the
// control test does a single DNS lookup of an RFC 6761 `.invalid` name, which
// resolves nowhere and contacts no real external host).
const { configState, validationAnswer } = vi.hoisted(() => ({
  validationAnswer: { address: "127.0.0.1" },
  configState: {
    isDevelopmentMode: false,
    // Allow the loopback address to pass validation so we can pin to it.
    ALLOW_INTERNAL_IP_CONNECTIONS: true,
    SAFE_REQUEST_FORCE_DIRECT_EGRESS: false,
    SITE_URL: "https://infisical.example",
    REDIS_URL: "redis://internal-redis:6379",
    DB_HOST: "internal-db"
  }
}));

vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  const lookup = (hostname: string, options: LookupAllOptions) =>
    hostname === "pinned-rebind.invalid"
      ? Promise.resolve([{ address: validationAnswer.address, family: 4 }])
      : actual.lookup(hostname, options);
  return { ...actual, lookup, default: { ...actual, lookup } };
});

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => configState
}));

// Don't let the internal-infra guard reject our loopback test server.
vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: vi.fn(async () => undefined)
}));

vi.mock("@app/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const httpGet = (opts: http.RequestOptions) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.get(opts, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
  });

describe("safe-request real-socket pinning", () => {
  let server: http.Server;
  let port: number;
  const receivedPaths: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      receivedPaths.push(req.url ?? "");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("routes a real request through the pinned agent to the validated loopback IP", async () => {
    // keepAlive:false so the socket closes after the response and doesn't hold
    // the server open at teardown.
    const agent = await buildSsrfSafeAgent(`http://127.0.0.1:${port}`, { keepAlive: false });
    expect(agent).toBeDefined();

    const res = await httpGet({ hostname: "127.0.0.1", port, path: "/positive", agent });

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(receivedPaths).toContain("/positive");
  });

  it("control: an unresolvable hostname fails with ENOTFOUND without the pinned agent", async () => {
    // Establishes that `pinned-rebind.invalid` genuinely has no DNS record, so
    // the success in the next test can only come from the agent's pinned lookup.
    await expect(httpGet({ hostname: "pinned-rebind.invalid", port, path: "/control" })).rejects.toMatchObject({
      code: "ENOTFOUND"
    });
  });

  it("pins the connection to the validated IP when connect-time DNS for the same hostname differs (anti-rebinding)", async () => {
    validationAnswer.address = "127.0.0.1";
    const agent = await buildSsrfSafeAgent(`http://pinned-rebind.invalid:${port}`, { keepAlive: false });

    const res = await httpGet({ hostname: "pinned-rebind.invalid", port, path: "/rebind", agent });

    expect(res.status).toBe(200);
    expect(receivedPaths).toContain("/rebind");
  });

  it("resolves hostnames other than the validated one normally, so a forward proxy is reached at its own address", async () => {
    validationAnswer.address = "192.0.2.1";
    const agent = await buildSsrfSafeAgent(`http://pinned-rebind.invalid:${port}`, { keepAlive: false });

    const res = await httpGet({ hostname: "localhost", port, path: "/proxy-host", agent });

    expect(res.status).toBe(200);
    expect(receivedPaths).toContain("/proxy-host");
  });
});
