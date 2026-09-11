import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { DigitalOceanConnectionMethod } from "./digital-ocean-connection-constants";
import { DigitalOceanAppPlatformPublicAPI } from "./digital-ocean-connection-public-client";
import { TDigitalOceanApp, TDigitalOceanConnectionConfig } from "./digital-ocean-connection-types";

const { mockClientGet, mockClientPut, mockLoggerWarn } = vi.hoisted(() => ({
  mockClientGet: vi.fn(),
  mockClientPut: vi.fn(),
  mockLoggerWarn: vi.fn()
}));

vi.mock("@app/lib/config/request", () => ({
  createRequestClient: vi.fn(() => ({
    get: mockClientGet,
    put: mockClientPut
  }))
}));

vi.mock("@app/lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/logger")>();
  return {
    ...actual,
    logger: {
      warn: mockLoggerWarn,
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    }
  };
});

describe("DigitalOceanAppPlatformPublicClient", () => {
  const mockConnection: TDigitalOceanConnectionConfig = {
    orgId: "org-123",
    app: AppConnection.DigitalOcean,
    method: DigitalOceanConnectionMethod.ApiToken,
    credentials: {
      apiToken: "dop_v1_mock_token"
    }
  };

  beforeEach(() => {
    mockClientGet.mockReset();
    mockClientPut.mockReset();
    mockLoggerWarn.mockReset();
  });

  describe("getApps", () => {
    it("requests with per_page=200 and returns apps on a single page", async () => {
      const mockApps: TDigitalOceanApp[] = [
        {
          id: "app-1",
          spec: {
            name: "app-one",
            services: [{ name: "web" }]
          }
        }
      ];

      mockClientGet.mockResolvedValueOnce({
        data: {
          apps: mockApps,
          links: { pages: {} },
          meta: { total: 1 }
        }
      });

      const apps = await DigitalOceanAppPlatformPublicAPI.getApps(mockConnection);

      expect(apps).toEqual(mockApps);
      expect(mockClientGet).toHaveBeenCalledTimes(1);
      expect(mockClientGet).toHaveBeenCalledWith("/apps?per_page=200", {
        headers: {
          Authorization: "Bearer dop_v1_mock_token"
        }
      });
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });

    it("follows links.pages.next across multiple pages and returns accumulated apps", async () => {
      const page1Apps: TDigitalOceanApp[] = Array.from({ length: 20 }, (_, i) => ({
        id: `app-${i + 1}`,
        spec: { name: `app-${i + 1}`, services: [] }
      }));
      const page2Apps: TDigitalOceanApp[] = Array.from({ length: 15 }, (_, i) => ({
        id: `app-${20 + i + 1}`,
        spec: { name: `app-${20 + i + 1}`, services: [] }
      }));

      mockClientGet
        .mockResolvedValueOnce({
          data: {
            apps: page1Apps,
            links: {
              pages: {
                next: "https://api.digitalocean.com/v2/apps?page=2&per_page=200"
              }
            },
            meta: { total: 35 }
          }
        })
        .mockResolvedValueOnce({
          data: {
            apps: page2Apps,
            links: { pages: {} },
            meta: { total: 35 }
          }
        });

      const apps = await DigitalOceanAppPlatformPublicAPI.getApps(mockConnection);

      expect(apps).toHaveLength(35);
      expect(mockClientGet).toHaveBeenCalledTimes(2);
      expect(mockClientGet).toHaveBeenNthCalledWith(1, "/apps?per_page=200", {
        headers: { Authorization: "Bearer dop_v1_mock_token" }
      });
      expect(mockClientGet).toHaveBeenNthCalledWith(2, "https://api.digitalocean.com/v2/apps?page=2&per_page=200", {
        headers: { Authorization: "Bearer dop_v1_mock_token" }
      });
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });

    it("caps pagination loop at 50 pages and logs warning with sanitized url", async () => {
      mockClientGet.mockImplementation((url: string) =>
        Promise.resolve({
          data: {
            apps: [{ id: `app-from-${url}`, spec: { name: "test", services: [] } }],
            links: {
              pages: {
                next: "https://api.digitalocean.com/v2/apps?page=next&secret=do-not-leak"
              }
            },
            meta: { total: 10000 }
          }
        })
      );

      const apps = await DigitalOceanAppPlatformPublicAPI.getApps(mockConnection);

      expect(mockClientGet).toHaveBeenCalledTimes(50);
      expect(apps).toHaveLength(50);
      expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("DigitalOcean app listing hit page cap of 50 pages for URL:")
      );
      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.not.stringContaining("do-not-leak"));
    });

    it("rejects off-origin links.pages.next URL and halts pagination without following it", async () => {
      const page1Apps: TDigitalOceanApp[] = [
        {
          id: "app-1",
          spec: { name: "app-one", services: [] }
        }
      ];

      mockClientGet.mockResolvedValueOnce({
        data: {
          apps: page1Apps,
          links: {
            pages: {
              next: "https://evil.com/v2/apps?page=2"
            }
          },
          meta: { total: 10 }
        }
      });

      const apps = await DigitalOceanAppPlatformPublicAPI.getApps(mockConnection);

      expect(apps).toEqual(page1Apps);
      expect(mockClientGet).toHaveBeenCalledTimes(1);
      expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Rejected off-origin or non-HTTPS pagination URL in DigitalOcean client:")
      );
    });

    it("handles response with empty or undefined apps gracefully", async () => {
      mockClientGet.mockResolvedValueOnce({
        data: {}
      });

      const apps = await DigitalOceanAppPlatformPublicAPI.getApps(mockConnection);

      expect(apps).toEqual([]);
    });
  });

  describe("healthcheck", () => {
    it("makes a single lightweight request for ApiToken method", async () => {
      mockClientGet.mockResolvedValueOnce({
        data: { apps: [] }
      });

      await expect(DigitalOceanAppPlatformPublicAPI.healthcheck(mockConnection)).resolves.toBeUndefined();
      expect(mockClientGet).toHaveBeenCalledTimes(1);
      expect(mockClientGet).toHaveBeenCalledWith("/apps?per_page=1", {
        headers: { Authorization: "Bearer dop_v1_mock_token" }
      });
    });

    it("throws error for unsupported connection method", async () => {
      const unsupportedConfig = {
        ...mockConnection,
        method: "unsupported" as unknown as DigitalOceanConnectionMethod
      };

      await expect(DigitalOceanAppPlatformPublicAPI.healthcheck(unsupportedConfig)).rejects.toThrow(
        "Unsupported connection method"
      );
    });
  });

  describe("single-resource operations", () => {
    it("getApp fetches app by id", async () => {
      const mockApp: TDigitalOceanApp = {
        id: "app-123",
        spec: { name: "my-app", services: [] }
      };
      mockClientGet.mockResolvedValueOnce({ data: { app: mockApp } });

      const result = await DigitalOceanAppPlatformPublicAPI.getApp(mockConnection, "app-123");

      expect(result).toEqual(mockApp);
      expect(mockClientGet).toHaveBeenCalledWith("/apps/app-123", {
        headers: { Authorization: "Bearer dop_v1_mock_token" }
      });
    });

    it("getVariables returns envs or empty array", async () => {
      mockClientGet.mockResolvedValueOnce({
        data: {
          app: {
            id: "app-123",
            spec: {
              name: "my-app",
              services: [],
              envs: [{ key: "NODE_ENV", value: "production", type: "GENERAL" }]
            }
          }
        }
      });

      const vars = await DigitalOceanAppPlatformPublicAPI.getVariables(mockConnection, "app-123");

      expect(vars).toEqual([{ key: "NODE_ENV", value: "production", type: "GENERAL" }]);
    });

    it("putVariables updates app envs", async () => {
      mockClientGet.mockResolvedValueOnce({
        data: {
          app: {
            id: "app-123",
            spec: { name: "my-app", services: [], envs: [] }
          }
        }
      });
      mockClientPut.mockResolvedValueOnce({ data: {} });

      await DigitalOceanAppPlatformPublicAPI.putVariables(mockConnection, "app-123", {
        key: "SECRET_KEY",
        value: "secret-value",
        type: "SECRET"
      });

      expect(mockClientPut).toHaveBeenCalledWith(
        "/apps/app-123",
        {
          spec: {
            name: "my-app",
            services: [],
            envs: [{ key: "SECRET_KEY", value: "secret-value", type: "SECRET" }]
          }
        },
        {
          headers: { Authorization: "Bearer dop_v1_mock_token" }
        }
      );
    });

    it("deleteVariables filters variables and updates app", async () => {
      mockClientGet.mockResolvedValueOnce({
        data: {
          app: {
            id: "app-123",
            spec: {
              name: "my-app",
              services: [],
              envs: [
                { key: "KEEP_ME", value: "val1", type: "GENERAL" },
                { key: "DELETE_ME", value: "val2", type: "SECRET" }
              ]
            }
          }
        }
      });
      mockClientPut.mockResolvedValueOnce({ data: {} });

      await DigitalOceanAppPlatformPublicAPI.deleteVariables(mockConnection, "app-123", {
        key: "DELETE_ME",
        value: "val2",
        type: "SECRET"
      });

      expect(mockClientPut).toHaveBeenCalledWith(
        "/apps/app-123",
        {
          spec: {
            name: "my-app",
            services: [],
            envs: [{ key: "KEEP_ME", value: "val1", type: "GENERAL" }]
          }
        },
        {
          headers: { Authorization: "Bearer dop_v1_mock_token" }
        }
      );
    });
  });
});
