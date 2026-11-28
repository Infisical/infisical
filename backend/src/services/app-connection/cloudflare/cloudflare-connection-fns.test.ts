/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above imports — the spies they reference must come from `vi.hoisted`.
const { safeRequestGetMock, warnMock } = vi.hoisted(() => ({
  safeRequestGetMock: vi.fn(),
  warnMock: vi.fn()
}));

vi.mock("@app/lib/validator", () => ({
  safeRequest: { get: (...args: unknown[]) => (safeRequestGetMock as any)(...args) }
}));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: (...args: unknown[]) => (warnMock as any)(...args) },
  sanitizeUrlForLog: (url: string) => url
}));
// Stub out the heavier transitive imports so the module loads in isolation.
vi.mock("@app/services/integration-auth/integration-list", () => ({
  IntegrationUrls: { CLOUDFLARE_API_URL: "https://api.cloudflare.com" }
}));

// eslint-disable-next-line import/first
import { listCloudflarePagesProjects, listCloudflareWorkersScripts } from "./cloudflare-connection-fns";

const connection = {
  credentials: { apiToken: "test-token", accountId: "acct-1" }
} as any;

// Cloudflare reports how many pages exist on every paginated list endpoint; a caller that ignores
// it keeps whatever landed in the first response.
const pageOf = <T>(result: T[], totalPages: number) => ({
  data: { result, result_info: { total_pages: totalPages } }
});

describe("listCloudflarePagesProjects", () => {
  beforeEach(() => {
    safeRequestGetMock.mockReset();
    warnMock.mockReset();
  });

  it("returns projects from every page, not just the first", async () => {
    safeRequestGetMock
      .mockResolvedValueOnce(pageOf([{ id: "p1", name: "alpha" }], 3))
      .mockResolvedValueOnce(pageOf([{ id: "p2", name: "beta" }], 3))
      .mockResolvedValueOnce(pageOf([{ id: "p3", name: "gamma" }], 3));

    const projects = await listCloudflarePagesProjects(connection);

    expect(safeRequestGetMock).toHaveBeenCalledTimes(3);
    expect(projects).toEqual([
      { id: "p1", name: "alpha" },
      { id: "p2", name: "beta" },
      { id: "p3", name: "gamma" }
    ]);
  });

  it("walks the pages in order, asking for the account's projects endpoint each time", async () => {
    safeRequestGetMock
      .mockResolvedValueOnce(pageOf([{ id: "p1", name: "alpha" }], 2))
      .mockResolvedValueOnce(pageOf([{ id: "p2", name: "beta" }], 2));

    await listCloudflarePagesProjects(connection);

    const requestedPages = safeRequestGetMock.mock.calls.map(([, config]: any[]) => config.params.page);
    expect(requestedPages).toEqual([1, 2]);

    safeRequestGetMock.mock.calls.forEach(([url]: any[]) => {
      expect(url).toContain("/accounts/acct-1/pages/projects");
    });
  });

  it("stops after one request when the account only has a single page", async () => {
    safeRequestGetMock.mockResolvedValueOnce(pageOf([{ id: "p1", name: "alpha" }], 1));

    const projects = await listCloudflarePagesProjects(connection);

    expect(safeRequestGetMock).toHaveBeenCalledTimes(1);
    expect(projects).toEqual([{ id: "p1", name: "alpha" }]);
  });

  it("stops at the page cap and logs rather than truncating silently", async () => {
    // More pages than the helper will walk: the list comes back short, so it has to say so.
    safeRequestGetMock.mockResolvedValue(pageOf([{ id: "p", name: "alpha" }], 500));

    const projects = await listCloudflarePagesProjects(connection);

    expect(safeRequestGetMock).toHaveBeenCalledTimes(100);
    expect(projects).toHaveLength(100);
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining("page cap reached"));
  });

  it("does not warn when every page was read", async () => {
    safeRequestGetMock
      .mockResolvedValueOnce(pageOf([{ id: "p1", name: "alpha" }], 2))
      .mockResolvedValueOnce(pageOf([{ id: "p2", name: "beta" }], 2));

    await listCloudflarePagesProjects(connection);

    expect(warnMock).not.toHaveBeenCalled();
  });
});

describe("listCloudflareWorkersScripts", () => {
  beforeEach(() => {
    safeRequestGetMock.mockReset();
  });

  it("issues a single request, since workers/scripts is not a paginated endpoint", async () => {
    safeRequestGetMock.mockResolvedValueOnce({ data: { result: [{ id: "worker-a" }, { id: "worker-b" }] } });

    const scripts = await listCloudflareWorkersScripts(connection);

    expect(safeRequestGetMock).toHaveBeenCalledTimes(1);
    expect(scripts).toEqual([{ id: "worker-a" }, { id: "worker-b" }]);
  });
});
