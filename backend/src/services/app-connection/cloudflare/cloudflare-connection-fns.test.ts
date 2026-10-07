import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { CloudflareConnectionMethod } from "./cloudflare-connection-enum";
import {
  getCloudflareErrorMessage,
  listCloudflarePagesProjects,
  listCloudflarePermissionGroups,
  listCloudflareWorkersScripts,
  listCloudflareZones
} from "./cloudflare-connection-fns";
import { TCloudflareConnection } from "./cloudflare-connection-types";

const { loggerMock, safeRequestMock } = vi.hoisted(() => ({
  loggerMock: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  safeRequestMock: {
    get: vi.fn()
  }
}));

vi.mock("@app/lib/validator", () => ({
  safeRequest: safeRequestMock
}));

vi.mock("@app/lib/logger", () => ({
  logger: loggerMock,
  sanitizeUrlForLog: (url: string) => url
}));

describe("cloudflare-connection-fns", () => {
  const mockConnection = {
    id: "conn-123",
    app: AppConnection.Cloudflare,
    method: CloudflareConnectionMethod.APIToken,
    name: "Test Cloudflare",
    orgId: "org-123",
    version: 1,
    isAutoRotationEnabled: false,
    credentials: {
      accountId: "acc-123",
      apiToken: "test-token"
    },
    createdAt: new Date(),
    updatedAt: new Date()
  } as unknown as TCloudflareConnection;

  beforeEach(() => {
    safeRequestMock.get.mockReset();
    loggerMock.warn.mockReset();
  });

  describe("listCloudflarePagesProjects", () => {
    it("fetches single page of pages projects", async () => {
      safeRequestMock.get.mockResolvedValueOnce({
        data: {
          result: [
            { id: "proj-1", name: "project-1" },
            { id: "proj-2", name: "project-2" }
          ],
          result_info: { total_pages: 1 }
        }
      });

      const projects = await listCloudflarePagesProjects(mockConnection);

      expect(safeRequestMock.get).toHaveBeenCalledTimes(1);
      expect(safeRequestMock.get).toHaveBeenCalledWith(
        "https://api.cloudflare.com/client/v4/accounts/acc-123/pages/projects",
        {
          headers: {
            Authorization: "Bearer test-token",
            Accept: "application/json"
          },
          params: { page: 1, per_page: 50 }
        }
      );
      expect(projects).toEqual([
        { id: "proj-1", name: "project-1" },
        { id: "proj-2", name: "project-2" }
      ]);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    });

    it("paginates across multiple pages of pages projects", async () => {
      safeRequestMock.get
        .mockResolvedValueOnce({
          data: {
            result: [{ id: "proj-1", name: "project-1" }],
            result_info: { total_pages: 2 }
          }
        })
        .mockResolvedValueOnce({
          data: {
            result: [{ id: "proj-2", name: "project-2" }],
            result_info: { total_pages: 2 }
          }
        });

      const projects = await listCloudflarePagesProjects(mockConnection);

      expect(safeRequestMock.get).toHaveBeenCalledTimes(2);
      expect(safeRequestMock.get).toHaveBeenNthCalledWith(
        1,
        "https://api.cloudflare.com/client/v4/accounts/acc-123/pages/projects",
        {
          headers: {
            Authorization: "Bearer test-token",
            Accept: "application/json"
          },
          params: { page: 1, per_page: 50 }
        }
      );
      expect(safeRequestMock.get).toHaveBeenNthCalledWith(
        2,
        "https://api.cloudflare.com/client/v4/accounts/acc-123/pages/projects",
        {
          headers: {
            Authorization: "Bearer test-token",
            Accept: "application/json"
          },
          params: { page: 2, per_page: 50 }
        }
      );
      expect(projects).toEqual([
        { id: "proj-1", name: "project-1" },
        { id: "proj-2", name: "project-2" }
      ]);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    });

    it("terminates pagination at max pages cap and logs a warning when total_pages exceeds limit", async () => {
      safeRequestMock.get.mockResolvedValue({
        data: {
          result: [{ id: "proj-1", name: "project-1" }],
          result_info: { total_pages: 150 }
        }
      });

      const projects = await listCloudflarePagesProjects(mockConnection);

      expect(safeRequestMock.get).toHaveBeenCalledTimes(100);
      expect(projects).toHaveLength(100);
      expect(loggerMock.warn).toHaveBeenCalledTimes(1);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        "Stopped listing Cloudflare resources from https://api.cloudflare.com/client/v4/accounts/acc-123/pages/projects after 100 pages; some results were not returned"
      );
    });
  });

  describe("listCloudflareWorkersScripts", () => {
    it("fetches single page of workers scripts", async () => {
      safeRequestMock.get.mockResolvedValueOnce({
        data: {
          result: [{ id: "script-1" }, { id: "script-2" }],
          result_info: { total_pages: 1 }
        }
      });

      const scripts = await listCloudflareWorkersScripts(mockConnection);

      expect(safeRequestMock.get).toHaveBeenCalledTimes(1);
      expect(safeRequestMock.get).toHaveBeenCalledWith(
        "https://api.cloudflare.com/client/v4/accounts/acc-123/workers/scripts-search",
        {
          headers: {
            Authorization: "Bearer test-token",
            Accept: "application/json"
          },
          params: { page: 1, per_page: 50 }
        }
      );
      expect(scripts).toEqual([{ id: "script-1" }, { id: "script-2" }]);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    });

    it("paginates across multiple pages of workers scripts", async () => {
      safeRequestMock.get
        .mockResolvedValueOnce({
          data: {
            result: [{ id: "script-1" }],
            result_info: { total_pages: 2 }
          }
        })
        .mockResolvedValueOnce({
          data: {
            result: [{ id: "script-2" }],
            result_info: { total_pages: 2 }
          }
        });

      const scripts = await listCloudflareWorkersScripts(mockConnection);

      expect(safeRequestMock.get).toHaveBeenCalledTimes(2);
      expect(safeRequestMock.get).toHaveBeenNthCalledWith(
        1,
        "https://api.cloudflare.com/client/v4/accounts/acc-123/workers/scripts-search",
        {
          headers: {
            Authorization: "Bearer test-token",
            Accept: "application/json"
          },
          params: { page: 1, per_page: 50 }
        }
      );
      expect(safeRequestMock.get).toHaveBeenNthCalledWith(
        2,
        "https://api.cloudflare.com/client/v4/accounts/acc-123/workers/scripts-search",
        {
          headers: {
            Authorization: "Bearer test-token",
            Accept: "application/json"
          },
          params: { page: 2, per_page: 50 }
        }
      );
      expect(scripts).toEqual([{ id: "script-1" }, { id: "script-2" }]);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    });
  });

  describe("listCloudflareZones", () => {
    it("paginates across multiple pages of zones", async () => {
      safeRequestMock.get
        .mockResolvedValueOnce({
          data: {
            result: [{ id: "zone-1", name: "example.com" }],
            result_info: { total_pages: 2 }
          }
        })
        .mockResolvedValueOnce({
          data: {
            result: [{ id: "zone-2", name: "test.com" }],
            result_info: { total_pages: 2 }
          }
        });

      const zones = await listCloudflareZones(mockConnection);

      expect(safeRequestMock.get).toHaveBeenCalledTimes(2);
      expect(zones).toEqual([
        { id: "zone-1", name: "example.com" },
        { id: "zone-2", name: "test.com" }
      ]);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    });
  });

  describe("listCloudflarePermissionGroups", () => {
    it("returns permission groups in a single call", async () => {
      safeRequestMock.get.mockResolvedValueOnce({
        data: {
          result: [
            { id: "group-1", name: "Group 1", scopes: ["com.cloudflare.api.account.zone"] },
            { id: "group-2", name: "Group 2" }
          ]
        }
      });

      const groups = await listCloudflarePermissionGroups(mockConnection);

      expect(safeRequestMock.get).toHaveBeenCalledTimes(1);
      expect(groups).toEqual([
        { id: "group-1", name: "Group 1", scopes: ["com.cloudflare.api.account.zone"] },
        { id: "group-2", name: "Group 2", scopes: [] }
      ]);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    });
  });

  describe("getCloudflareErrorMessage", () => {
    it("extracts error message from AxiosError with Cloudflare error response", () => {
      const axiosError = new AxiosError("Request failed with status code 400");
      axiosError.response = {
        data: {
          errors: [{ message: "Invalid token" }]
        },
        status: 400,
        statusText: "Bad Request",
        headers: {},
        config: {} as never
      };

      expect(getCloudflareErrorMessage(axiosError)).toBe("Invalid token");
    });

    it("falls back to error message from standard Error", () => {
      const error = new Error("Network failure");
      expect(getCloudflareErrorMessage(error)).toBe("Network failure");
    });

    it("returns Unknown error for non-error types", () => {
      expect(getCloudflareErrorMessage("string error")).toBe("Unknown error");
    });
  });
});
