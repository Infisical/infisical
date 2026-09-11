import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RateLimitError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { GitLabAccessTokenType, GitLabConnectionMethod } from "./gitlab-connection-enums";
import { gitlabConnectionService } from "./gitlab-connection-service";
import { TGitLabConnection } from "./gitlab-connection-types";

vi.mock("@app/lib/validator", () => ({ blockLocalAndPrivateIpAddresses: vi.fn() }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));
vi.mock("@app/lib/config/request", () => ({ request: {} }));
vi.mock("@app/lib/fn", () => ({ removeTrailingSlash: (url: string) => url.replace(/\/$/, "") }));
vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn() } }));
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
    { createCipherPairWithDataKey: vi.fn() }
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

      const result = list("connection-id", {} as OrgServiceActor);
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

      const result = list("connection-id", {} as OrgServiceActor);
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

      const result = list("connection-id", {} as OrgServiceActor);
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

      const result = list("connection-id", {} as OrgServiceActor);
      await vi.runAllTimersAsync();
      await expect(result).resolves.toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
