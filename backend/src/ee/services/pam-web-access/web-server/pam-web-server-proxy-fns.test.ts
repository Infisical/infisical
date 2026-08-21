import { describe, expect, test } from "vitest";

import {
  buildBasicAuthorization,
  buildUpstreamRequestHeaders,
  rewriteHtmlForProxy,
  rewriteLocationForProxy,
  serializeCookieJar,
  updateCookieJar
} from "./pam-web-server-proxy-fns";

describe("PAM Web Server proxy helpers", () => {
  test("builds an HTTP Basic Authentication header", () => {
    expect(buildBasicAuthorization("admin", "secret")).toBe("Basic YWRtaW46c2VjcmV0");
  });

  test("builds upstream headers without leaking Infisical credentials", () => {
    expect(
      buildUpstreamRequestHeaders({
        requestHeaders: {
          accept: "text/html",
          authorization: "Bearer infisical-token",
          connection: "keep-alive",
          cookie: "jid=infisical-session",
          host: "app.infisical.test",
          "user-agent": "Browser"
        },
        targetHost: "internal.example.com",
        authorization: "Basic dXNlcjpwYXNz",
        upstreamCookie: "theme=dark"
      })
    ).toEqual({
      accept: "text/html",
      authorization: "Basic dXNlcjpwYXNz",
      cookie: "theme=dark",
      host: "internal.example.com",
      "user-agent": "Browser"
    });
  });

  test("stores upstream cookies without forwarding cookie attributes", () => {
    const cookieJar = new Map<string, string>();
    updateCookieJar(cookieJar, ["session=abc; Path=/; HttpOnly", "theme=dark; Max-Age=3600"]);

    expect(serializeCookieJar(cookieJar)).toBe("session=abc; theme=dark");
  });

  test("rewrites same-origin redirects and rejects cross-origin redirects", () => {
    expect(
      rewriteLocationForProxy({
        location: "https://internal.example.com/dashboard?tab=1",
        targetOrigin: "https://internal.example.com",
        proxyBasePath: "/api/v1/pam/accounts/account-id/browser-access/session-id"
      })
    ).toBe("/api/v1/pam/accounts/account-id/browser-access/session-id/dashboard?tab=1");

    expect(
      rewriteLocationForProxy({
        location: "https://external.example.com/login",
        targetOrigin: "https://internal.example.com",
        proxyBasePath: "/api/v1/pam/accounts/account-id/browser-access/session-id"
      })
    ).toBeNull();
  });

  test("rewrites common root-relative HTML attributes", () => {
    expect(
      rewriteHtmlForProxy(
        '<a href="/dashboard">Home</a><img src="/assets/logo.png"><form action="/logout"></form>',
        "/api/v1/pam/accounts/account-id/browser-access/session-id"
      )
    ).toBe(
      '<a href="/api/v1/pam/accounts/account-id/browser-access/session-id/dashboard">Home</a>' +
        '<img src="/api/v1/pam/accounts/account-id/browser-access/session-id/assets/logo.png">' +
        '<form action="/api/v1/pam/accounts/account-id/browser-access/session-id/logout"></form>'
    );
  });
});
