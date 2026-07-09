import { beforeAll, describe, expect, test, vi } from "vitest";

import { crypto } from "@app/lib/crypto";

import { PamAccessMethod, PamAccountType, PamSessionStatus } from "../pam/pam-enums";
import {
  assertWebResourceSessionCanProxy,
  buildUpstreamHeaders,
  buildUpstreamPath,
  createWebResourceSessionToken,
  filterResponseHeaders,
  getWebResourceProxyPrefix,
  rewriteProxyHtml,
  type TWebResourceProxyContext,
  verifyWebResourceSessionToken
} from "./pam-web-resource-proxy-fns";

const AUTH_SECRET = "test-web-resource-token-secret";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const context: TWebResourceProxyContext = {
  url: "https://example.com:8443/app",
  scheme: "https",
  host: "example.com",
  port: 8443,
  basePath: "/app",
  proxyPrefix: "/api/v1/pam/accounts/account-id/web-resource-sessions/session-id"
};

beforeAll(async () => {
  process.env.FIPS_ENABLED = "false";
  await crypto.initialize({} as never, {} as never, {} as never);
});

describe("web resource proxy helpers", () => {
  test("rewrites proxy paths through the configured base path and strips request token query", () => {
    expect(buildUpstreamPath(context, "", { t: "secret", q: "one" })).toBe("/app/?q=one");
    expect(buildUpstreamPath(context, "/reports", { page: 2 })).toBe("/app/reports?page=2");
  });

  test("strips sensitive upstream request headers", () => {
    const headers = buildUpstreamHeaders(
      {
        authorization: "Bearer user-token",
        cookie: "infisical-auth=true",
        "accept-encoding": "gzip",
        "x-infisical-test": "secret",
        "x-custom": "kept"
      },
      context,
      Buffer.from("body")
    );

    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
    expect(headers["accept-encoding"]).toBeUndefined();
    expect(headers["x-infisical-test"]).toBeUndefined();
    expect(headers["x-custom"]).toBe("kept");
    expect(headers.host).toBe("example.com:8443");
    expect(headers["content-length"]).toBe(4);
  });

  test("rewrites same-target redirects and adds hardened response headers", () => {
    const headers = filterResponseHeaders(
      {
        location: "https://example.com:8443/app/login?next=1",
        "set-cookie": ["target=secret"],
        "x-frame-options": "DENY",
        "content-type": "text/html"
      },
      context
    );

    expect(headers.location).toBe(`${context.proxyPrefix}/login?next=1`);
    expect(headers["set-cookie"]).toBeUndefined();
    expect(headers["x-frame-options"]).toBeUndefined();
    expect(headers["content-security-policy"]).toContain("sandbox allow-forms allow-scripts");
    expect(headers["content-security-policy"]).not.toContain("allow-same-origin");
  });

  test("rewrites absolute HTML form and asset paths through the proxy", () => {
    const rewritten = rewriteProxyHtml(
      Buffer.from('<form action="/app/login"><script src="/static/app.js"></script></form>'),
      { "content-type": "text/html" },
      context
    ).toString("utf-8");

    expect(rewritten).toContain(`action="${context.proxyPrefix}/login"`);
    expect(rewritten).toContain(`src="${context.proxyPrefix}/static/app.js"`);
  });

  test("validates durable signed iframe tokens without process-local state", () => {
    const token = createWebResourceSessionToken({
      authSecret: AUTH_SECRET,
      sessionId: "session-id",
      accountId: "account-id",
      projectId: "project-id",
      userId: "user-id",
      expiresAt: new Date(Date.now() + 60_000)
    });

    expect(
      verifyWebResourceSessionToken({
        authSecret: AUTH_SECRET,
        token,
        sessionId: "session-id",
        accountId: "account-id"
      })
    ).toMatchObject({ userId: "user-id", projectId: "project-id" });

    expect(() =>
      verifyWebResourceSessionToken({
        authSecret: AUTH_SECRET,
        token,
        sessionId: "session-id",
        accountId: "other-account"
      })
    ).toThrow(/Invalid web resource session token/);
  });

  test("distinguishes active, expired, and ended web resource sessions", () => {
    const activeSession = {
      id: "session-id",
      accountId: "account-id",
      userId: "user-id",
      accountType: PamAccountType.WebResource,
      accessMethod: PamAccessMethod.Web,
      status: PamSessionStatus.Active,
      expiresAt: new Date("2030-01-01T00:00:00.000Z")
    };

    expect(
      assertWebResourceSessionCanProxy({
        session: activeSession,
        accountId: "account-id",
        sessionId: "session-id",
        userId: "user-id",
        now: new Date("2029-01-01T00:00:00.000Z")
      })
    ).toBe(true);

    expect(
      assertWebResourceSessionCanProxy({
        session: activeSession,
        accountId: "account-id",
        sessionId: "session-id",
        userId: "user-id",
        now: new Date("2031-01-01T00:00:00.000Z")
      })
    ).toBe(false);

    expect(() =>
      assertWebResourceSessionCanProxy({
        session: { ...activeSession, status: PamSessionStatus.Ended },
        accountId: "account-id",
        sessionId: "session-id",
        userId: "user-id"
      })
    ).toThrow(/not active/);
  });

  test("builds stable proxy prefixes", () => {
    expect(getWebResourceProxyPrefix("account-id", "session-id")).toBe(
      "/api/v1/pam/accounts/account-id/web-resource-sessions/session-id"
    );
  });
});
