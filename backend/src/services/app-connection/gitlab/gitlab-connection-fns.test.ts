import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TActorContext } from "@app/domains/lib/actor-context";
import { FakeInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/testing/fake-instance-config-service";
import { RateLimitError } from "@app/lib/errors";

import { GitLabAccessTokenType, GitLabConnectionMethod } from "./gitlab-connection-enums";
import { gitlabConnectionService } from "./gitlab-connection-service";
import { TGitLabConnection } from "./gitlab-connection-types";

const { safeRequestGetMock } = vi.hoisted(() => ({ safeRequestGetMock: vi.fn() }));

vi.mock("@app/lib/validator", () => ({
  blockLocalAndPrivateIpAddresses: vi.fn(),
  safeRequest: { get: safeRequestGetMock }
}));
vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConfig: () => ({})
}));
vi.mock("@app/lib/config/request", () => ({ request: {} }));
vi.mock("@app/lib/fn", () => ({ removeTrailingSlash: (url: string) => url.replace(/\/$/, "") }));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  encryptAppConnectionCredentials: vi.fn()
}));

describe("GitLab list retry handling", () => {
  const connection = {
    method: GitLabConnectionMethod.AccessToken,
    credentials: {
      accessToken: "test-token",
      accessTokenType: GitLabAccessTokenType.Personal,
      instanceUrl: "https://gitlab.example.com"
    }
  } as TGitLabConnection;
  const fetchMock = vi.fn<typeof fetch>();
  const service = gitlabConnectionService(
    vi.fn().mockResolvedValue(connection),
    { updateById: vi.fn() },
    {
      createCipherPairWithDataKey: vi.fn()
    } as never,
    new FakeInstanceConfigService()
  );

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe.each([
    ["groups", service.listGroups],
    ["projects", service.listProjects]
  ] as const)("%s", (resource, list) => {
    it("propagates persistent HTTP 429s through the SDK and service as a rate-limit error", async () => {
      fetchMock.mockImplementation(async () => new Response(null, { status: 429 }));

      const result = list("connection-id", {} as TActorContext);
      const assertion = expect(result).rejects.toMatchObject({
        name: new RateLimitError({}).name,
        message: `GitLab rate limit reached while loading ${resource}. Wait a moment and try again.`
      });
      await vi.runAllTimersAsync();
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(10);
    });

    it("does not classify exhausted HTTP 502 retries as rate limiting", async () => {
      fetchMock.mockImplementation(async () => new Response(null, { status: 502 }));

      const result = list("connection-id", {} as TActorContext);
      await vi.runAllTimersAsync();
      await expect(result).resolves.toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(10);
    });

    it("returns results when a retry recovers", async () => {
      const response =
        resource === "groups"
          ? { id: 1, name: "Example", full_name: "Example", full_path: "example" }
          : { id: 1, path_with_namespace: "example/project" };
      fetchMock
        .mockImplementationOnce(async () => new Response(null, { status: 429 }))
        .mockImplementation(async () => Response.json([response]));

      const result = list("connection-id", {} as TActorContext);
      await vi.runAllTimersAsync();
      await expect(result).resolves.toEqual([
        resource === "groups"
          ? { id: "1", name: "Example", fullName: "Example", fullPath: "example" }
          : { id: "1", name: "example/project" }
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("preserves genuinely empty lists", async () => {
      fetchMock.mockImplementation(async () => Response.json([]));

      const result = list("connection-id", {} as TActorContext);
      await vi.runAllTimersAsync();
      await expect(result).resolves.toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe("GitLab group service account listing", () => {
  const connection = {
    method: GitLabConnectionMethod.AccessToken,
    credentials: {
      accessToken: "test-token",
      accessTokenType: GitLabAccessTokenType.Personal,
      instanceUrl: "https://gitlab.example.com"
    }
  } as TGitLabConnection;
  const service = gitlabConnectionService(
    vi.fn().mockResolvedValue(connection),
    { updateById: vi.fn() },
    { createCipherPairWithDataKey: vi.fn() } as never,
    {} as never
  );

  afterEach(() => {
    safeRequestGetMock.mockReset();
  });

  it("leaves out the service account the connection authenticates as", async () => {
    safeRequestGetMock.mockImplementation(async (url: string) =>
      url.endsWith("/user")
        ? { data: { id: 13 } }
        : {
            data: [
              { id: 12, username: "service_account_group_34_ci", name: "CI deployer" },
              { id: 13, username: "service_account_group_34_infisical", name: "Infisical" }
            ],
            headers: { "x-next-page": "" }
          }
    );

    const serviceAccounts = await service.listGroupServiceAccounts("connection-id", "34", {} as TActorContext);

    expect(safeRequestGetMock).toHaveBeenCalledWith("https://gitlab.example.com/api/v4/user", {
      headers: { "PRIVATE-TOKEN": "test-token" }
    });
    expect(serviceAccounts).toEqual([{ id: "12", username: "service_account_group_34_ci", name: "CI deployer" }]);
  });

  it("follows GitLab's next-page header instead of the page size", async () => {
    safeRequestGetMock.mockImplementation(async (url: string, options: { params?: { page: number } }) => {
      if (url.endsWith("/user")) return { data: { id: 99 } };
      return options.params?.page === 1
        ? { data: [{ id: 12, username: "ci", name: "CI" }], headers: { "x-next-page": "2" } }
        : { data: [{ id: 14, username: "deploy", name: "Deploy" }], headers: { "x-next-page": "" } };
    });

    const serviceAccounts = await service.listGroupServiceAccounts("connection-id", "34", {} as TActorContext);

    expect(serviceAccounts.map(({ id }) => id)).toEqual(["12", "14"]);
    expect(safeRequestGetMock).toHaveBeenCalledTimes(3);
  });
});
