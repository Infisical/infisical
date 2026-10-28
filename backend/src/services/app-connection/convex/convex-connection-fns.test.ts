import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listConvexDeployments } from "./convex-connection-fns";
import { TConvexConnection } from "./convex-connection-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get, blockLocalAndPrivateIpAddresses } = vi.hoisted(() => ({
  get: vi.fn(),
  blockLocalAndPrivateIpAddresses: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@app/lib/config/request", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  request: { get }
}));

vi.mock("@app/lib/validator", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  blockLocalAndPrivateIpAddresses
}));

vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const BASE_URL = "https://api.convex.dev";
const TOKEN = "pat-token";

const connection = {
  credentials: { accessToken: TOKEN }
} as unknown as TConvexConnection;

const deployment = (name: string, url = `https://${name}.convex.cloud`) => ({
  name,
  deploymentUrl: url,
  deploymentType: "prod"
});

const axiosError = (status: number) => {
  const error = new AxiosError("request failed");
  error.response = {
    status,
    data: {},
    statusText: "Error",
    headers: {},
    config: { headers: {} as never }
  };
  return error;
};

describe("listConvexDeployments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blockLocalAndPrivateIpAddresses.mockResolvedValue(undefined);
  });

  it("lists team deployments from token details", async () => {
    get.mockImplementation(async (url: string) => {
      if (url.endsWith("/v1/token_details")) {
        return { data: { type: "teamToken", teamId: 41 } };
      }
      if (url.includes("/v1/teams/41/list_deployments")) {
        return {
          data: {
            items: [deployment("playful-otter-123")],
            pagination: { hasMore: false }
          }
        };
      }
      throw new Error(`unexpected url ${url}`);
    });

    await expect(listConvexDeployments(connection)).resolves.toEqual([
      {
        name: "playful-otter-123",
        deploymentUrl: "https://playful-otter-123.convex.cloud",
        deploymentType: "prod"
      }
    ]);
    expect(blockLocalAndPrivateIpAddresses).toHaveBeenCalledWith(BASE_URL);
  });

  it("lists project deployments from token details", async () => {
    get.mockImplementation(async (url: string) => {
      if (url.endsWith("/v1/token_details")) {
        return { data: { type: "projectToken", projectId: "proj_1" } };
      }
      if (url.endsWith("/v1/projects/proj_1/list_deployments")) {
        return { data: [deployment("happy-cat-9")] };
      }
      throw new Error(`unexpected url ${url}`);
    });

    await expect(listConvexDeployments(connection)).resolves.toEqual([
      {
        name: "happy-cat-9",
        deploymentUrl: "https://happy-cat-9.convex.cloud",
        deploymentType: "prod"
      }
    ]);
  });

  it("falls back to dashboard teams when token details rejects a personal access token", async () => {
    get.mockImplementation(async (url: string) => {
      if (url.endsWith("/v1/token_details")) {
        throw axiosError(400);
      }
      if (url.endsWith("/api/dashboard/teams")) {
        return { data: { teams: [{ id: 7, name: "Acme" }] } };
      }
      if (url.includes("/v1/teams/7/list_deployments")) {
        return {
          data: {
            items: [deployment("playful-otter-123"), { name: "broken", deployment_url: "http://local" }],
            pagination: { hasMore: false }
          }
        };
      }
      throw new Error(`unexpected url ${url}`);
    });

    await expect(listConvexDeployments(connection)).resolves.toEqual([
      {
        name: "playful-otter-123",
        deploymentUrl: "https://playful-otter-123.convex.cloud",
        deploymentType: "prod"
      }
    ]);
  });

  it("paginates team deployments until Convex reports no further pages", async () => {
    get.mockImplementation(async (url: string, config?: { params?: { cursor?: string } }) => {
      if (url.endsWith("/v1/token_details")) {
        return { data: { teamId: 41 } };
      }
      if (url.includes("/v1/teams/41/list_deployments")) {
        if (!config?.params?.cursor) {
          return {
            data: {
              items: [deployment("page-one")],
              pagination: { hasMore: true, nextCursor: "next" }
            }
          };
        }
        return {
          data: {
            items: [deployment("page-two")],
            pagination: { hasMore: false }
          }
        };
      }
      throw new Error(`unexpected url ${url}`);
    });

    await expect(listConvexDeployments(connection)).resolves.toEqual([
      {
        name: "page-one",
        deploymentUrl: "https://page-one.convex.cloud",
        deploymentType: "prod"
      },
      {
        name: "page-two",
        deploymentUrl: "https://page-two.convex.cloud",
        deploymentType: "prod"
      }
    ]);
  });
});
