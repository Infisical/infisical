import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { responsePolicyHeaders } from "./response-policy-headers";

const ROUTE_POLICY = "default-src 'none'; style-src 'unsafe-inline'";
const API_POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const DEVICE_POLICY =
  "accelerometer=(), bluetooth=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), " +
  "magnetometer=(), microphone=(), midi=(), serial=(), usb=(), xr-spatial-tracking=()";

const app = Fastify();

beforeAll(async () => {
  await app.register(responsePolicyHeaders);
  app.get("/json", async () => ({ ok: true }));
  app.get("/page", async (_req, res) => res.type("text/html").send("<!doctype html>"));
  app.get("/own-policy", async (_req, res) => res.header("Content-Security-Policy", ROUTE_POLICY).send("ok"));
});

afterAll(() => app.close());

describe("responsePolicyHeaders", () => {
  test("sends a deny-all policy on non-HTML responses", async () => {
    const res = await app.inject({ url: "/json" });
    expect(res.headers["content-security-policy"]).toBe(API_POLICY);
  });

  test("sends only frame-ancestors, base-uri and object-src on HTML responses", async () => {
    const res = await app.inject({ url: "/page" });
    expect(res.headers["content-security-policy"]).toBe("frame-ancestors 'self'; base-uri 'self'; object-src 'none'");
  });

  test("keeps a policy the route set itself", async () => {
    const res = await app.inject({ url: "/own-policy" });
    expect(res.headers["content-security-policy"]).toBe(ROUTE_POLICY);
  });

  test("turns off device features on every response", async () => {
    const [page, json] = await Promise.all([app.inject({ url: "/page" }), app.inject({ url: "/json" })]);
    expect(page.headers["permissions-policy"]).toBe(DEVICE_POLICY);
    expect(json.headers["permissions-policy"]).toBe(DEVICE_POLICY);
  });
});
