import fastify, { FastifyInstance } from "fastify";
import http from "http";
import jwt from "jsonwebtoken";
import { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthTokenType } from "@app/services/auth/auth-type";

import { forwardToGoSidecar, shouldForward, splitList, TGoForwardingSettings } from "./go-sidecar-forwarding";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const fallbackAdd = vi.hoisted(() => vi.fn());
vi.mock("@app/lib/telemetry/metrics", () => ({
  goSidecarFallbackCounter: { add: fallbackAdd }
}));

const FOLDERS = "GET:/api/v2/folders";

const settings = (overrides: Partial<TGoForwardingSettings> = {}): TGoForwardingSettings => ({
  enabled: true,
  enabledRoutes: new Set([FOLDERS]),
  orgIds: new Set(),
  percent: 100,
  ...overrides
});

const jwtFor = (claims: Record<string, unknown>) => `Bearer ${jwt.sign(claims, "any-secret")}`;

const accessClaims = { authTokenType: AuthTokenType.ACCESS_TOKEN, userId: "u1", organizationId: "org-1" };
const identityClaims = { authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN, identityId: "i1", orgId: "org-2" };

describe("shouldForward", () => {
  test.each([
    ["JWT", { authorization: jwtFor(accessClaims) }],
    ["identity access token", { authorization: jwtFor(identityClaims) }],
    ["service token", { authorization: "Bearer st.abc123.secret.tail" }]
  ])("forwards %s requests", (_name, headers) => {
    expect(shouldForward("GET", "/api/v2/folders", headers, settings())).toBe(true);
  });

  test.each([
    ["OAuth token", { authorization: jwtFor({ ...accessClaims, oauthClientId: "client" }) }],
    ["API key header", { "x-api-key": "k", authorization: jwtFor(accessClaims) }],
    ["API key token", { authorization: jwtFor({ authTokenType: AuthTokenType.API_KEY }) }],
    ["SCIM token", { authorization: jwtFor({ authTokenType: AuthTokenType.SCIM_TOKEN, orgId: "o" }) }],
    ["unknown token type", { authorization: jwtFor({ authTokenType: "mystery", orgId: "o" }) }],
    ["garbage bearer", { authorization: "Bearer not-a-jwt" }],
    ["no credential", {}]
  ])("keeps %s requests on Node", (_name, headers) => {
    expect(shouldForward("GET", "/api/v2/folders", headers, settings())).toBe(false);
  });

  test("keeps everything on Node when the off switch is set", () => {
    expect(
      shouldForward(
        "GET",
        "/api/v2/folders",
        { authorization: jwtFor(accessClaims) },
        settings({ enabled: false })
      )
    ).toBe(false);
  });

  test("keeps v4 secrets routes on Node unless they are named in the enabled routes", () => {
    const headers = { authorization: jwtFor(accessClaims) };
    expect(shouldForward("GET", "/api/v4/secrets", headers, settings())).toBe(false);
    expect(shouldForward("GET", "/api/v4/secrets/:secretName", headers, settings())).toBe(false);
    expect(
      shouldForward("GET", "/api/v4/secrets", headers, settings({ enabledRoutes: new Set(["GET:/api/v4/secrets"]) }))
    ).toBe(true);
  });

  test("splitList trims entries and drops empty ones", () => {
    expect(splitList(" a , ,b,")).toEqual(new Set(["a", "b"]));
    expect(splitList(undefined)).toEqual(new Set());
  });

  test("keeps a route that is not enabled on Node", () => {
    expect(
      shouldForward(
        "GET",
        "/api/v2/folders",
        { authorization: jwtFor(accessClaims) },
        settings({ enabledRoutes: new Set() })
      )
    ).toBe(false);
  });

  test("never forwards non-GET requests", () => {
    expect(
      shouldForward("POST", "/api/v2/folders", { authorization: jwtFor(accessClaims) }, settings())
    ).toBe(false);
  });

  test("an allowlisted org is forwarded at 0 percent and others are not", () => {
    const s = settings({ percent: 0, orgIds: new Set(["org-1"]) });
    expect(shouldForward("GET", "/api/v2/folders", { authorization: jwtFor(accessClaims) }, s)).toBe(true);
    expect(shouldForward("GET", "/api/v2/folders", { authorization: jwtFor(identityClaims) }, s)).toBe(false);
  });

  test("percentage is deterministic per org and roughly proportional", () => {
    const s = settings({ percent: 30 });
    const decide = (org: string) =>
      shouldForward(
        "GET",
        "/api/v2/folders",
        { authorization: jwtFor({ ...accessClaims, organizationId: org }) },
        s
      );
    const orgs = Array.from({ length: 500 }, (_, i) => `org-${i}`);
    const first = orgs.map(decide);
    expect(orgs.map(decide)).toEqual(first);
    const share = first.filter(Boolean).length / orgs.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.4);
  });

  test("a larger percentage never drops an org a smaller one included", () => {
    const decide = (org: string, percent: number) =>
      shouldForward(
        "GET",
        "/api/v2/folders",
        { authorization: jwtFor({ ...accessClaims, organizationId: org }) },
        settings({ percent })
      );
    for (let i = 0; i < 200; i += 1) {
      if (decide(`org-${i}`, 10)) expect(decide(`org-${i}`, 50)).toBe(true);
    }
  });
});

describe("forwardToGoSidecar", () => {
  let server: FastifyInstance;
  let go: http.Server;
  let goHandler: http.RequestListener;
  let goHits: number;
  let nodeHits: number;

  const start = async (s: TGoForwardingSettings, timeoutMs = 500, isDisabled?: () => Promise<boolean>) => {
    go = http.createServer((req, res) => {
      goHits += 1;
      goHandler(req, res);
    });
    await new Promise<void>((resolve) => {
      go.listen(0, "127.0.0.1", resolve);
    });
    const { port } = go.address() as AddressInfo;
    server = fastify();
    await server.register(forwardToGoSidecar, {
      sidecarUrl: `http://127.0.0.1:${port}`,
      getSettings: () => s,
      isDisabled,
      timeoutMs
    });
    const nodeRoute = (method: "GET" | "POST") => {
      server.route({
        method,
        url: "/api/v2/folders",
        handler: async () => {
          nodeHits += 1;
          return { from: "node" };
        }
      });
    };
    nodeRoute("GET");
    nodeRoute("POST");
    await server.ready();
  };

  const get = () =>
    server.inject({
      method: "GET",
      url: "/api/v2/folders?projectId=p",
      headers: { authorization: jwtFor(accessClaims) }
    });

  beforeEach(() => {
    goHits = 0;
    nodeHits = 0;
    fallbackAdd.mockClear();
  });

  afterEach(async () => {
    await server.close();
    go.closeAllConnections();
    await new Promise((resolve) => {
      go.close(resolve);
    });
  });

  test("returns Go's answer for an eligible request", async () => {
    goHandler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ from: "go" }));
    };
    await start(settings());
    const res = await get();
    expect(res.json()).toEqual({ from: "go" });
    expect(nodeHits).toBe(0);
  });

  test("passes Go's 4xx through without falling back", async () => {
    goHandler = (_req, res) => {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "nope" }));
    };
    await start(settings());
    const res = await get();
    expect(res.statusCode).toBe(404);
    expect(nodeHits).toBe(0);
    expect(fallbackAdd).not.toHaveBeenCalled();
  });

  test("falls back to Node and counts it when Go answers 5xx", async () => {
    goHandler = (_req, res) => {
      res.writeHead(503);
      res.end();
    };
    await start(settings());
    const res = await get();
    expect(res.json()).toEqual({ from: "node" });
    expect(fallbackAdd).toHaveBeenCalledWith(1, { reason: "5xx" });
  });

  test("falls back to Node when Go times out", async () => {
    goHandler = () => {};
    await start(settings(), 50);
    const res = await get();
    expect(res.json()).toEqual({ from: "node" });
    expect(fallbackAdd).toHaveBeenCalledWith(1, { reason: "timeout" });
  });

  test("falls back to Node when Go is unreachable", async () => {
    goHandler = (_req, res) => res.end();
    await start(settings());
    await new Promise((resolve) => {
      go.close(resolve);
    });
    go = http.createServer();
    const res = await get();
    expect(res.json()).toEqual({ from: "node" });
    expect(fallbackAdd).toHaveBeenCalledWith(1, { reason: "connection" });
  });

  test("never sends mutations to Go", async () => {
    goHandler = (_req, res) => res.end();
    await start(settings());
    await server.inject({ method: "POST", url: "/api/v2/folders", headers: { authorization: jwtFor(accessClaims) } });
    expect(goHits).toBe(0);
    expect(nodeHits).toBe(1);
  });

  test("serves from Node while the off switch is set, and resumes when it is cleared", async () => {
    goHandler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ from: "go" }));
    };
    let disabled = true;
    await start(settings(), 500, async () => disabled);
    expect((await get()).json()).toEqual({ from: "node" });
    expect(goHits).toBe(0);
    disabled = false;
    expect((await get()).json()).toEqual({ from: "go" });
  });

  test("serves from Node when the off switch cannot be read", async () => {
    goHandler = (_req, res) => res.end();
    await start(settings(), 500, async () => {
      throw new Error("redis down");
    });
    expect((await get()).json()).toEqual({ from: "node" });
    expect(goHits).toBe(0);
  });

  test("keeps every set-cookie value from Go", async () => {
    goHandler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json", "set-cookie": ["a=1; Path=/", "b=2; Path=/"] });
      res.end("{}");
    };
    await start(settings());
    expect((await get()).headers["set-cookie"]).toEqual(["a=1; Path=/", "b=2; Path=/"]);
  });

  test("a client that disconnects is neither a fallback nor served by Node", async () => {
    let goReceived: () => void;
    const received = new Promise<void>((resolve) => {
      goReceived = resolve;
    });
    goHandler = () => goReceived();
    await start(settings(), 5000);
    await server.listen({ port: 0, host: "127.0.0.1" });
    const { port } = server.server.address() as AddressInfo;
    const req = http.get({
      port,
      host: "127.0.0.1",
      path: "/api/v2/folders?projectId=p",
      headers: { authorization: jwtFor(accessClaims) }
    });
    req.on("error", () => {});
    await received;
    req.destroy();
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(fallbackAdd).not.toHaveBeenCalled();
    expect(nodeHits).toBe(0);
  });

  test("keeps an ineligible auth mode on Node without contacting Go", async () => {
    goHandler = (_req, res) => res.end();
    await start(settings());
    const res = await server.inject({ method: "GET", url: "/api/v2/folders", headers: { "x-api-key": "k" } });
    expect(res.json()).toEqual({ from: "node" });
    expect(goHits).toBe(0);
  });
});
