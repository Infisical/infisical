/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above imports — the spies they reference must come from `vi.hoisted`.
const { safeRequestGetMock, requestGetMock, blockMock, warnMock } = vi.hoisted(() => ({
  safeRequestGetMock: vi.fn(),
  requestGetMock: vi.fn(),
  blockMock: vi.fn(),
  warnMock: vi.fn()
}));

// safeRequest validates the host and pins the connection to the IPs that passed validation; its
// behaviour is covered by safe-request.test.ts. Here we only assert that the paged, token-bearing
// requests go through it rather than through the raw client.
vi.mock("@app/lib/validator", () => ({
  blockLocalAndPrivateIpAddresses: (...args: unknown[]) => (blockMock as any)(...args),
  safeRequest: { get: (...args: unknown[]) => (safeRequestGetMock as any)(...args) }
}));
vi.mock("@app/lib/config/request", () => ({
  request: { get: (...args: unknown[]) => (requestGetMock as any)(...args) }
}));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: (...args: unknown[]) => (warnMock as any)(...args) },
  // Stands in for the real redaction so the test can assert the warning goes through it at all.
  sanitizeUrlForLog: (url: string) => `sanitized(${url})`
}));

// eslint-disable-next-line import/first
import { listOktaApps } from "./okta-connection-fns";

const INSTANCE_URL = "https://example.okta.com";

const connection = {
  credentials: { instanceUrl: INSTANCE_URL, apiToken: "test-token" }
} as any;

const oidcApp = (id: string) => ({ id, label: `app-${id}`, status: "ACTIVE", name: "oidc_client" });

// Okta signals more results with a `next` link and omits it on the final page.
const pageWithNext = (apps: unknown[], nextUrl: string) => ({
  data: apps,
  headers: { link: `<${INSTANCE_URL}/api/v1/apps?limit=200>; rel="self", <${nextUrl}>; rel="next"` }
});

const lastPage = (apps: unknown[]) => ({
  data: apps,
  headers: { link: `<${INSTANCE_URL}/api/v1/apps?limit=200>; rel="self"` }
});

describe("listOktaApps", () => {
  beforeEach(() => {
    safeRequestGetMock.mockReset();
    requestGetMock.mockReset();
    blockMock.mockReset();
    warnMock.mockReset();
  });

  it("follows the next link so apps past the first page are still returned", async () => {
    const nextUrl = `${INSTANCE_URL}/api/v1/apps?after=cursor-1&limit=200`;
    safeRequestGetMock
      .mockResolvedValueOnce(pageWithNext([oidcApp("a")], nextUrl))
      .mockResolvedValueOnce(lastPage([oidcApp("b")]));

    const apps = await listOktaApps(connection);

    expect(safeRequestGetMock).toHaveBeenCalledTimes(2);
    expect(safeRequestGetMock.mock.calls[1][0]).toBe(nextUrl);
    expect(apps.map((app) => app.id)).toEqual(["a", "b"]);
  });

  it("requests Okta's maximum page size so the common case stays one round trip", async () => {
    safeRequestGetMock.mockResolvedValueOnce(lastPage([oidcApp("a")]));

    await listOktaApps(connection);

    expect(safeRequestGetMock).toHaveBeenCalledTimes(1);
    expect(safeRequestGetMock.mock.calls[0][0]).toBe(`${INSTANCE_URL}/api/v1/apps?limit=200`);
  });

  it("finds OIDC apps that sort behind non-matching apps instead of returning an empty list", async () => {
    const nextUrl = `${INSTANCE_URL}/api/v1/apps?after=cursor-1&limit=200`;
    // A first page holding only SAML and deactivated apps is what made the picker come back empty:
    // the status/name filter ran after the response was already truncated.
    safeRequestGetMock
      .mockResolvedValueOnce(
        pageWithNext(
          [
            { id: "saml", label: "saml app", status: "ACTIVE", name: "template_saml_2_0" },
            { id: "inactive", label: "old app", status: "INACTIVE", name: "oidc_client" }
          ],
          nextUrl
        )
      )
      .mockResolvedValueOnce(lastPage([oidcApp("wanted")]));

    const apps = await listOktaApps(connection);

    expect(apps.map((app) => app.id)).toEqual(["wanted"]);
  });

  it("fetches every page through safeRequest, never the un-pinned client", async () => {
    safeRequestGetMock
      .mockResolvedValueOnce(pageWithNext([oidcApp("a")], `${INSTANCE_URL}/api/v1/apps?after=cursor-1&limit=200`))
      .mockResolvedValueOnce(lastPage([oidcApp("b")]));

    await listOktaApps(connection);

    // Each page carries the API token, so every hop has to be validated and IP-pinned, not just the
    // instance URL checked once up front.
    expect(safeRequestGetMock).toHaveBeenCalledTimes(2);
    expect(requestGetMock).not.toHaveBeenCalled();
  });

  it("ignores a next link pointing off the configured Okta instance", async () => {
    safeRequestGetMock.mockResolvedValueOnce(
      pageWithNext([oidcApp("a")], "https://example.okta.com.attacker.test/api/v1/apps?after=cursor-1")
    );

    const apps = await listOktaApps(connection);

    expect(safeRequestGetMock).toHaveBeenCalledTimes(1);
    expect(apps.map((app) => app.id)).toEqual(["a"]);
  });

  it.each([
    ["an uppercase host", "https://EXAMPLE.okta.com"],
    ["an explicit default port", "https://example.okta.com:443"]
  ])("still follows the next link when the connection spells the origin with %s", async (_label, configuredUrl) => {
    // Okta echoes its canonical host in the Link header, so a raw string prefix check would drop the
    // link here and quietly reinstate the truncation this change is meant to remove.
    const nextUrl = `${INSTANCE_URL}/api/v1/apps?after=cursor-1&limit=200`;
    safeRequestGetMock
      .mockResolvedValueOnce(pageWithNext([oidcApp("a")], nextUrl))
      .mockResolvedValueOnce(lastPage([oidcApp("b")]));

    const apps = await listOktaApps({ credentials: { instanceUrl: configuredUrl, apiToken: "test-token" } } as any);

    expect(safeRequestGetMock).toHaveBeenCalledTimes(2);
    expect(apps.map((app) => app.id)).toEqual(["a", "b"]);
  });

  it("ignores a malformed next link instead of throwing", async () => {
    safeRequestGetMock.mockResolvedValueOnce(pageWithNext([oidcApp("a")], "not-a-url"));

    const apps = await listOktaApps(connection);

    expect(safeRequestGetMock).toHaveBeenCalledTimes(1);
    expect(apps.map((app) => app.id)).toEqual(["a"]);
  });

  it("stops at the page cap and logs rather than looping forever or truncating silently", async () => {
    // An Okta instance that always advertises another page would otherwise loop without end.
    safeRequestGetMock.mockResolvedValue(
      pageWithNext([oidcApp("a")], `${INSTANCE_URL}/api/v1/apps?after=cursor-next&limit=200`)
    );

    const apps = await listOktaApps(connection);

    expect(safeRequestGetMock).toHaveBeenCalledTimes(100);
    expect(apps).toHaveLength(100);
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining("page cap reached"));
    // The instance URL is user-supplied and can carry userinfo or a query string, so it must be
    // redacted rather than interpolated raw into a log line.
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining(`sanitized(${INSTANCE_URL})`));
  });
});
