/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above imports — the spies they reference must come from `vi.hoisted`.
const { requestGetMock, warnMock } = vi.hoisted(() => ({
  requestGetMock: vi.fn(),
  warnMock: vi.fn()
}));

vi.mock("@app/lib/config/request", () => ({
  request: { get: (...args: unknown[]) => (requestGetMock as any)(...args) }
}));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: (...args: unknown[]) => (warnMock as any)(...args) },
  sanitizeUrlForLog: (url: string) => url
}));

// eslint-disable-next-line import/first
import { listProjects, listSecretGroups } from "./northflank-connection-fns";

const connection = {
  credentials: { apiToken: "test-token" }
} as any;

// Northflank nests the array under `data.<key>` and reports more results via `pagination.hasNextPage`
// plus an opaque `pagination.cursor`.
const page = <T>(key: string, items: T[], next?: string) => ({
  data: {
    data: { [key]: items },
    pagination: next
      ? { hasNextPage: true, cursor: next, count: items.length }
      : { hasNextPage: false, count: items.length }
  }
});

describe("listProjects", () => {
  beforeEach(() => {
    requestGetMock.mockReset();
    warnMock.mockReset();
  });

  it("follows the cursor so projects past the first page are still returned", async () => {
    requestGetMock
      .mockResolvedValueOnce(page("projects", [{ id: "p1", name: "alpha" }], "cursor-1"))
      .mockResolvedValueOnce(page("projects", [{ id: "p2", name: "beta" }]));

    const projects = await listProjects(connection);

    expect(requestGetMock).toHaveBeenCalledTimes(2);
    expect(projects).toEqual([
      { id: "p1", name: "alpha" },
      { id: "p2", name: "beta" }
    ]);
  });

  it("sends the cursor returned by the previous page and asks for the maximum page size", async () => {
    requestGetMock
      .mockResolvedValueOnce(page("projects", [{ id: "p1", name: "alpha" }], "cursor-1"))
      .mockResolvedValueOnce(page("projects", [{ id: "p2", name: "beta" }]));

    await listProjects(connection);

    const [firstParams, secondParams] = requestGetMock.mock.calls.map(([, config]: any[]) => config.params);
    expect(firstParams).toEqual({ per_page: 100 });
    expect(secondParams).toEqual({ per_page: 100, cursor: "cursor-1" });
  });

  it("stops after one request when there is no next page", async () => {
    requestGetMock.mockResolvedValueOnce(page("projects", [{ id: "p1", name: "alpha" }]));

    const projects = await listProjects(connection);

    expect(requestGetMock).toHaveBeenCalledTimes(1);
    expect(projects).toEqual([{ id: "p1", name: "alpha" }]);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("stops at the page cap and logs rather than looping forever or truncating silently", async () => {
    // A cursor that never clears would otherwise loop without end.
    requestGetMock.mockResolvedValue(page("projects", [{ id: "p", name: "alpha" }], "cursor-next"));

    const projects = await listProjects(connection);

    expect(requestGetMock).toHaveBeenCalledTimes(100);
    expect(projects).toHaveLength(100);
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining("page cap reached"));
  });

  it("treats hasNextPage without a cursor as the end of the list", async () => {
    // Nothing to advance with, so continuing would refetch page one until the cap.
    requestGetMock.mockResolvedValueOnce({
      data: {
        data: { projects: [{ id: "p1", name: "alpha" }] },
        pagination: { hasNextPage: true, count: 1 }
      }
    });

    const projects = await listProjects(connection);

    expect(requestGetMock).toHaveBeenCalledTimes(1);
    expect(projects).toEqual([{ id: "p1", name: "alpha" }]);
    expect(warnMock).not.toHaveBeenCalled();
  });
});

describe("listSecretGroups", () => {
  beforeEach(() => {
    requestGetMock.mockReset();
    warnMock.mockReset();
  });

  it("follows the cursor so secret groups past the first page are still returned", async () => {
    requestGetMock
      .mockResolvedValueOnce(page("secrets", [{ id: "s1", name: "group-a" }], "cursor-1"))
      .mockResolvedValueOnce(page("secrets", [{ id: "s2", name: "group-b" }]));

    const groups = await listSecretGroups(connection, "project-1");

    expect(requestGetMock).toHaveBeenCalledTimes(2);
    expect(groups).toEqual([
      { id: "s1", name: "group-a" },
      { id: "s2", name: "group-b" }
    ]);
    requestGetMock.mock.calls.forEach(([url]: any[]) => {
      expect(url).toContain("/v1/projects/project-1/secrets");
    });
  });
});
