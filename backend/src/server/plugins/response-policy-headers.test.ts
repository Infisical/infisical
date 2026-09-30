import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import staticServe from "@fastify/static";
import fastify, { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { responsePolicyHeaders } from "./response-policy-headers";

const SHARED_SECRET_POLICY = "default-src 'none'; style-src 'unsafe-inline'";

let app: FastifyInstance;
let root: string;

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "response-policy-headers-"));
  writeFileSync(path.join(root, "index.html"), "<!doctype html><html></html>");

  app = fastify();
  await app.register(responsePolicyHeaders);
  await app.register(staticServe, { root, wildcard: false });
  app.get("/api/status", async () => ({ ok: true }));
  app.get("/shared", async (_req, res) => {
    void res.header("Content-Security-Policy", SHARED_SECRET_POLICY);
    return res.type("text/html").send("<p>shared</p>");
  });
});

afterAll(async () => {
  await app.close();
  rmSync(root, { recursive: true, force: true });
});

describe("responsePolicyHeaders", () => {
  test("sends the API policy and the Permissions-Policy on a JSON response", async () => {
    const res = await app.inject({ url: "/api/status" });
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["permissions-policy"]).toContain("camera=()");
  });

  test("sends the short document policy on a static HTML file", async () => {
    const res = await app.inject({ url: "/index.html" });
    expect(res.headers["content-security-policy"]).toBe("frame-ancestors 'self'; base-uri 'self'; object-src 'none'");
  });

  test("keeps a policy the route set itself", async () => {
    const res = await app.inject({ url: "/shared" });
    expect(res.headers["content-security-policy"]).toBe(SHARED_SECRET_POLICY);
  });
});
