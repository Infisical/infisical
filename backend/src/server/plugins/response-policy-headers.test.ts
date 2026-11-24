import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { etag } from "./etag";
import { responsePolicyHeaders } from "./response-policy-headers";

const ROUTE_POLICY = "default-src 'none'; style-src 'unsafe-inline'";
const ROUTE_DEVICE_POLICY = "camera=(self)";
const API_POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const DOCUMENT_POLICY = "frame-ancestors 'self'; base-uri 'self'; object-src 'none'";
const SVG_POLICY = `${API_POLICY}; style-src 'unsafe-inline'; sandbox`;
const DEVICE_POLICY =
  "accelerometer=(), bluetooth=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), " +
  "magnetometer=(), microphone=(), midi=(), serial=(), usb=(), xr-spatial-tracking=()";

const app = Fastify();

beforeAll(async () => {
  await app.register(etag);
  await app.register(responsePolicyHeaders);
  app.get("/json", async () => ({ ok: true }));
  app.get("/page", async (_req, res) => res.type("text/html").send("<!doctype html>"));
  app.get("/logo.svg", async (_req, res) => res.type("image/svg+xml").send("<svg/>"));
  app.get("/own-policy", async (_req, res) =>
    res.header("Content-Security-Policy", ROUTE_POLICY).header("Permissions-Policy", ROUTE_DEVICE_POLICY).send("ok")
  );
});

afterAll(() => app.close());

describe("responsePolicyHeaders", () => {
  test("sends a deny-all policy on non-HTML responses", async () => {
    const res = await app.inject({ url: "/json" });
    expect(res.headers["content-security-policy"]).toBe(API_POLICY);
  });

  test("sends only frame-ancestors, base-uri and object-src on HTML responses", async () => {
    const res = await app.inject({ url: "/page" });
    expect(res.headers["content-security-policy"]).toBe(DOCUMENT_POLICY);
  });

  test("lets SVG images use inline styles and sandboxes them", async () => {
    const res = await app.inject({ url: "/logo.svg" });
    expect(res.headers["content-security-policy"]).toBe(SVG_POLICY);
  });

  test("keeps the policies a route set itself", async () => {
    const res = await app.inject({ url: "/own-policy" });
    expect(res.headers["content-security-policy"]).toBe(ROUTE_POLICY);
    expect(res.headers["permissions-policy"]).toBe(ROUTE_DEVICE_POLICY);
  });

  test("turns off device features on every response", async () => {
    const [page, json] = await Promise.all([app.inject({ url: "/page" }), app.inject({ url: "/json" })]);
    expect(page.headers["permissions-policy"]).toBe(DEVICE_POLICY);
    expect(json.headers["permissions-policy"]).toBe(DEVICE_POLICY);
  });

  test("leaves the cached policies in place when a page is revalidated", async () => {
    const first = await app.inject({ url: "/page" });
    const revalidated = await app.inject({ url: "/page", headers: { "if-none-match": first.headers.etag } });

    expect(revalidated.statusCode).toBe(304);
    expect(revalidated.headers["content-security-policy"]).toBeUndefined();
    expect(revalidated.headers["permissions-policy"]).toBeUndefined();
  });

  // inject does not reproduce the double send, so this goes over a real socket.
  test("sends a 304 an async route sends itself only once", async () => {
    const logLines: string[] = [];
    const server = Fastify({ logger: { level: "warn", stream: { write: (line: string) => logLines.push(line) } } });
    await server.register(etag);
    await server.register(responsePolicyHeaders);
    server.setErrorHandler((error: Error, _req, res) => {
      void res.status(500).send({ message: error.message });
    });
    server.get("/secrets", async (_req, reply) => {
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
      void reply.header("ETag", '"stored"');
      return reply.code(304).send();
    });

    try {
      const address = await server.listen({ port: 0, host: "127.0.0.1" });
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => fetch(`${address}/secrets`, { headers: { "if-none-match": '"stored"' } }))
      );

      expect(responses.map((res) => res.status)).toEqual(Array(10).fill(304));
      expect(logLines.filter((line) => line.includes("FST_ERR_REP_ALREADY_SENT"))).toEqual([]);
    } finally {
      await server.close();
    }
  });
});
