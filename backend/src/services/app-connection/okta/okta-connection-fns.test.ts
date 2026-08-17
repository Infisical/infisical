/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above imports — the spies they reference must come from `vi.hoisted`.
const { requestGetMock, blockMock } = vi.hoisted(() => ({
  requestGetMock: vi.fn(),
  blockMock: vi.fn()
}));

vi.mock("@app/lib/config/request", () => ({
  request: { get: (...args: unknown[]) => (requestGetMock as any)(...args) }
}));
vi.mock("@app/lib/validator", () => ({
  blockLocalAndPrivateIpAddresses: (...args: unknown[]) => (blockMock as any)(...args)
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
    requestGetMock.mockReset();
    blockMock.mockReset();
  });

  it("follows the next link so apps past the first page are still returned", async () => {
    const nextUrl = `${INSTANCE_URL}/api/v1/apps?after=cursor-1&limit=200`;
    requestGetMock
      .mockResolvedValueOnce(pageWithNext([oidcApp("a")], nextUrl))
      .mockResolvedValueOnce(lastPage([oidcApp("b")]));

    const apps = await listOktaApps(connection);

    expect(requestGetMock).toHaveBeenCalledTimes(2);
    expect(requestGetMock.mock.calls[1][0]).toBe(nextUrl);
    expect(apps.map((app) => app.id)).toEqual(["a", "b"]);
  });

  it("requests Okta's maximum page size so the common case stays one round trip", async () => {
    requestGetMock.mockResolvedValueOnce(lastPage([oidcApp("a")]));

    await listOktaApps(connection);

    expect(requestGetMock).toHaveBeenCalledTimes(1);
    expect(requestGetMock.mock.calls[0][0]).toBe(`${INSTANCE_URL}/api/v1/apps?limit=200`);
  });

  it("finds OIDC apps that sort behind non-matching apps instead of returning an empty list", async () => {
    const nextUrl = `${INSTANCE_URL}/api/v1/apps?after=cursor-1&limit=200`;
    // A first page holding only SAML and deactivated apps is what made the picker come back empty:
    // the status/name filter ran after the response was already truncated.
    requestGetMock
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

  it("ignores a next link pointing off the configured Okta instance", async () => {
    requestGetMock.mockResolvedValueOnce(
      pageWithNext([oidcApp("a")], "https://example.okta.com.attacker.test/api/v1/apps?after=cursor-1")
    );

    const apps = await listOktaApps(connection);

    expect(requestGetMock).toHaveBeenCalledTimes(1);
    expect(apps.map((app) => app.id)).toEqual(["a"]);
  });
});
