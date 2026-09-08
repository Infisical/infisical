import { AxiosError, HttpStatusCode } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { BitbucketConnectionMethod } from "./bitbucket-connection-enums";
import {
  createAuthHeader,
  getBitbucketConnectionListItem,
  getBitbucketUser,
  listBitbucketEnvironments,
  listBitbucketRepositories,
  listBitbucketWorkspaces,
  validateBitbucketConnectionCredentials
} from "./bitbucket-connection-fns";
import { TBitbucketConnection } from "./bitbucket-connection-types";

const { loggerMock, requestMock } = vi.hoisted(() => ({
  loggerMock: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  requestMock: {
    get: vi.fn()
  }
}));

vi.mock("@app/lib/config/request", () => ({
  request: requestMock
}));

vi.mock("@app/lib/logger", () => ({
  logger: loggerMock,
  sanitizeUrlForLog: (url: string) => url
}));

describe("bitbucket-connection-fns", () => {
  const mockConnection = {
    id: "conn-123",
    app: AppConnection.Bitbucket,
    method: BitbucketConnectionMethod.ApiToken,
    name: "Test Bitbucket",
    orgId: "org-123",
    version: 1,
    isAutoRotationEnabled: false,
    credentials: {
      email: "user@example.com",
      apiToken: "test-api-token"
    },
    createdAt: new Date(),
    updatedAt: new Date()
  } as unknown as TBitbucketConnection;

  const expectedAuthHeader = `Basic ${Buffer.from("user@example.com:test-api-token").toString("base64")}`;
  const expectedHeaders = {
    Authorization: expectedAuthHeader,
    Accept: "application/json"
  };

  beforeEach(() => {
    requestMock.get.mockReset();
    loggerMock.warn.mockReset();
  });

  describe("getBitbucketConnectionListItem", () => {
    it("returns correct metadata", () => {
      expect(getBitbucketConnectionListItem()).toEqual({
        name: "Bitbucket",
        app: AppConnection.Bitbucket,
        methods: [BitbucketConnectionMethod.ApiToken]
      });
    });
  });

  describe("createAuthHeader", () => {
    it("encodes email and api token as basic auth", () => {
      expect(createAuthHeader("user@example.com", "token123")).toBe(
        `Basic ${Buffer.from("user@example.com:token123").toString("base64")}`
      );
    });
  });

  describe("getBitbucketUser", () => {
    it("returns user data on successful call", async () => {
      requestMock.get.mockResolvedValueOnce({ data: { username: "octocat" } });

      const result = await getBitbucketUser({ email: "user@example.com", apiToken: "test-api-token" });

      expect(requestMock.get).toHaveBeenCalledWith("https://api.bitbucket.org/2.0/user", {
        headers: expectedHeaders
      });
      expect(result).toEqual({ username: "octocat" });
    });

    it("throws BadRequestError on AxiosError", async () => {
      const axiosError = new AxiosError("Unauthorized");
      requestMock.get.mockRejectedValueOnce(axiosError);

      await expect(getBitbucketUser({ email: "user@example.com", apiToken: "test-api-token" })).rejects.toThrow(
        BadRequestError
      );
    });

    it("throws BadRequestError on generic error", async () => {
      requestMock.get.mockRejectedValueOnce(new Error("Network failed"));

      await expect(getBitbucketUser({ email: "user@example.com", apiToken: "test-api-token" })).rejects.toThrow(
        "Unable to validate connection: verify credentials"
      );
    });
  });

  describe("validateBitbucketConnectionCredentials", () => {
    it("validates and returns credentials", async () => {
      requestMock.get.mockResolvedValueOnce({ data: { username: "octocat" } });

      const creds = await validateBitbucketConnectionCredentials({
        app: AppConnection.Bitbucket,
        method: BitbucketConnectionMethod.ApiToken,
        orgId: "org-123",
        credentials: { email: "user@example.com", apiToken: "test-api-token" }
      });

      expect(creds).toEqual({ email: "user@example.com", apiToken: "test-api-token" });
    });
  });

  describe("listBitbucketWorkspaces", () => {
    it("fetches single page of workspaces", async () => {
      requestMock.get.mockResolvedValueOnce({
        data: {
          values: [{ workspace: { slug: "workspace-1" } }, { workspace: { slug: "workspace-2" } }]
        }
      });

      const workspaces = await listBitbucketWorkspaces(mockConnection);

      expect(requestMock.get).toHaveBeenCalledTimes(1);
      expect(requestMock.get).toHaveBeenCalledWith("https://api.bitbucket.org/2.0/user/workspaces?pagelen=100", {
        headers: expectedHeaders
      });
      expect(workspaces).toEqual([{ slug: "workspace-1" }, { slug: "workspace-2" }]);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    });

    it("paginates across multiple pages when next is present", async () => {
      requestMock.get
        .mockResolvedValueOnce({
          data: {
            values: [{ workspace: { slug: "workspace-1" } }],
            next: "https://api.bitbucket.org/2.0/user/workspaces?page=2&pagelen=100"
          }
        })
        .mockResolvedValueOnce({
          data: {
            values: [{ workspace: { slug: "workspace-2" } }]
          }
        });

      const workspaces = await listBitbucketWorkspaces(mockConnection);

      expect(requestMock.get).toHaveBeenCalledTimes(2);
      expect(requestMock.get).toHaveBeenNthCalledWith(1, "https://api.bitbucket.org/2.0/user/workspaces?pagelen=100", {
        headers: expectedHeaders
      });
      expect(requestMock.get).toHaveBeenNthCalledWith(
        2,
        "https://api.bitbucket.org/2.0/user/workspaces?page=2&pagelen=100",
        { headers: expectedHeaders }
      );
      expect(workspaces).toEqual([{ slug: "workspace-1" }, { slug: "workspace-2" }]);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    });

    it("applies search query parameter formatted as slug ~ search", async () => {
      requestMock.get.mockResolvedValueOnce({
        data: {
          values: [{ workspace: { slug: "team-infra" } }]
        }
      });

      const workspaces = await listBitbucketWorkspaces(mockConnection, 'infra"test');

      expect(requestMock.get).toHaveBeenCalledWith(
        "https://api.bitbucket.org/2.0/user/workspaces?pagelen=100&q=slug+%7E+%22infratest%22",
        { headers: expectedHeaders }
      );
      expect(workspaces).toEqual([{ slug: "team-infra" }]);
    });
  });

  describe("listBitbucketRepositories", () => {
    it("fetches single page of repositories", async () => {
      requestMock.get.mockResolvedValueOnce({
        data: {
          values: [
            { uuid: "{repo-1}", full_name: "ws/repo-1", slug: "repo-1" },
            { uuid: "{repo-2}", full_name: "ws/repo-2", slug: "repo-2" }
          ]
        }
      });

      const repos = await listBitbucketRepositories(mockConnection, "my-ws");

      expect(requestMock.get).toHaveBeenCalledTimes(1);
      expect(requestMock.get).toHaveBeenCalledWith(
        "https://api.bitbucket.org/2.0/repositories/my-ws?pagelen=100&sort=slug",
        { headers: expectedHeaders }
      );
      expect(repos).toEqual([
        { uuid: "{repo-1}", full_name: "ws/repo-1", slug: "repo-1" },
        { uuid: "{repo-2}", full_name: "ws/repo-2", slug: "repo-2" }
      ]);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    });

    it("paginates across multiple pages when next is present", async () => {
      requestMock.get
        .mockResolvedValueOnce({
          data: {
            values: [{ uuid: "{repo-1}", full_name: "ws/repo-1", slug: "repo-1" }],
            next: "https://api.bitbucket.org/2.0/repositories/my-ws?page=2&pagelen=100"
          }
        })
        .mockResolvedValueOnce({
          data: {
            values: [{ uuid: "{repo-2}", full_name: "ws/repo-2", slug: "repo-2" }]
          }
        });

      const repos = await listBitbucketRepositories(mockConnection, "my-ws");

      expect(requestMock.get).toHaveBeenCalledTimes(2);
      expect(requestMock.get).toHaveBeenNthCalledWith(
        1,
        "https://api.bitbucket.org/2.0/repositories/my-ws?pagelen=100&sort=slug",
        { headers: expectedHeaders }
      );
      expect(requestMock.get).toHaveBeenNthCalledWith(
        2,
        "https://api.bitbucket.org/2.0/repositories/my-ws?page=2&pagelen=100",
        { headers: expectedHeaders }
      );
      expect(repos).toEqual([
        { uuid: "{repo-1}", full_name: "ws/repo-1", slug: "repo-1" },
        { uuid: "{repo-2}", full_name: "ws/repo-2", slug: "repo-2" }
      ]);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    });

    it("applies search query parameter formatted as name ~ search", async () => {
      requestMock.get.mockResolvedValueOnce({
        data: {
          values: [{ uuid: "{repo-1}", full_name: "ws/api-service", slug: "api-service" }]
        }
      });

      const repos = await listBitbucketRepositories(mockConnection, "my-ws", 'api"service');

      expect(requestMock.get).toHaveBeenCalledWith(
        "https://api.bitbucket.org/2.0/repositories/my-ws?pagelen=100&sort=slug&q=name+%7E+%22apiservice%22",
        { headers: expectedHeaders }
      );
      expect(repos).toEqual([{ uuid: "{repo-1}", full_name: "ws/api-service", slug: "api-service" }]);
    });
  });

  describe("listBitbucketEnvironments", () => {
    it("paginates across multiple pages of environments", async () => {
      requestMock.get
        .mockResolvedValueOnce({
          data: {
            values: [{ uuid: "{env-1}", name: "Production", slug: "production" }],
            next: "https://api.bitbucket.org/2.0/repositories/my-ws/my-repo/environments?page=2"
          }
        })
        .mockResolvedValueOnce({
          data: {
            values: [{ uuid: "{env-2}", name: "Staging", slug: "staging" }]
          }
        });

      const envs = await listBitbucketEnvironments(mockConnection, "my-ws", "my-repo");

      expect(requestMock.get).toHaveBeenCalledTimes(2);
      expect(envs).toEqual([
        { uuid: "{env-1}", name: "Production", slug: "production" },
        { uuid: "{env-2}", name: "Staging", slug: "staging" }
      ]);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    });
  });

  describe("pagination limits and error handling", () => {
    it("terminates pagination at BITBUCKET_MAX_PAGES cap (10 pages) and logs warning when next continues indefinitely", async () => {
      requestMock.get.mockResolvedValue({
        data: {
          values: [{ uuid: "{repo}", full_name: "ws/repo", slug: "repo" }],
          next: "https://api.bitbucket.org/2.0/repositories/my-ws?page=next"
        }
      });

      const repos = await listBitbucketRepositories(mockConnection, "my-ws");

      expect(requestMock.get).toHaveBeenCalledTimes(10);
      expect(repos).toHaveLength(10);
      expect(loggerMock.warn).toHaveBeenCalledTimes(1);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        "Stopped listing Bitbucket resources from https://api.bitbucket.org/2.0/repositories/my-ws?pagelen=100&sort=slug after 10 pages; some results were not returned"
      );
    });

    it("converts 429 TooManyRequests error to BadRequestError", async () => {
      const axiosError = new AxiosError("Too Many Requests");
      axiosError.response = {
        status: HttpStatusCode.TooManyRequests,
        statusText: "Too Many Requests",
        data: {},
        headers: {},
        config: {} as never
      };
      requestMock.get.mockRejectedValueOnce(axiosError);

      await expect(listBitbucketRepositories(mockConnection, "my-ws")).rejects.toThrow(
        "Request to Bitbucket was blocked due to rate limiting. Bitbucket's rate limit window is 1 hour. Please try again later."
      );
    });

    it("rethrows non-429 Axios errors", async () => {
      const axiosError = new AxiosError("Unauthorized");
      axiosError.response = {
        status: HttpStatusCode.Unauthorized,
        statusText: "Unauthorized",
        data: {},
        headers: {},
        config: {} as never
      };
      requestMock.get.mockRejectedValueOnce(axiosError);

      await expect(listBitbucketRepositories(mockConnection, "my-ws")).rejects.toThrow(axiosError);
    });
  });
});
