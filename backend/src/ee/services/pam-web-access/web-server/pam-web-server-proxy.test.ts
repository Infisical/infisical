import http from "node:http";

import { afterEach, describe, expect, test } from "vitest";

import { proxyPamWebServerRequest } from "./pam-web-server-proxy";
import type { TPamWebServerBrowserSession } from "./pam-web-server-session-manager";

describe("proxyPamWebServerRequest", () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
    });
    server = undefined;
  });

  test("proxies a request with Basic Authentication and rewrites the HTML response", async () => {
    server = http.createServer((request, response) => {
      expect(request.headers.authorization).toBe("Basic dXNlcjpwYXNz");
      expect(request.headers.host).toBe("internal.example.com");
      expect(request.url).toBe("/login?next=%2Fdashboard");
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.setHeader("set-cookie", "session=abc; Path=/; HttpOnly");
      response.end('<a href="/dashboard">Dashboard</a>');
    });
    await new Promise<void>((resolve) => {
      server?.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected the test server to use a TCP port");

    const session: TPamWebServerBrowserSession = {
      id: "browser-session-id",
      accountId: "account-id",
      userId: "user-id",
      pamSessionId: "pam-session-id",
      upstreamUrl: new URL("http://internal.example.com/login"),
      relayPort: address.port,
      authorization: "Basic dXNlcjpwYXNz",
      expiresAt: new Date(Date.now() + 60_000),
      cookieSecret: "cookie-secret",
      cookieJar: new Map()
    };

    const response = await proxyPamWebServerRequest({
      session,
      method: "GET",
      upstreamPath: "/login?next=%2Fdashboard",
      requestHeaders: { accept: "text/html", cookie: "jid=infisical-session" },
      body: undefined,
      proxyBasePath: "/api/v1/pam/accounts/account-id/browser-access/browser-session-id"
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.toString()).toBe(
      '<a href="/api/v1/pam/accounts/account-id/browser-access/browser-session-id/dashboard">Dashboard</a>'
    );
    expect(session.cookieJar.get("session")).toBe("abc");
  });
});
