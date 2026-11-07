import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import {
  listConvexDeployments,
  normalizeConvexDeploymentUrl,
  resolveConvexDeploymentDestination
} from "./convex-connection-fns";
import { TConvexConnection } from "./convex-connection-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get } = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock("@app/lib/validator", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  safeRequest: { get }
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

describe("normalizeConvexDeploymentUrl", () => {
  it("strips trailing slashes and lowercases the host", () => {
    expect(normalizeConvexDeploymentUrl("https://Playful-Otter-123.convex.cloud/")).toBe(
      "https://playful-otter-123.convex.cloud"
    );
  });

  it("drops a default HTTPS port and a trailing path slash", () => {
    expect(normalizeConvexDeploymentUrl("https://playful-otter-123.convex.cloud:443/api/")).toBe(
      "https://playful-otter-123.convex.cloud/api"
    );
  });
});

describe("listConvexDeployments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(get).toHaveBeenCalledWith(`${BASE_URL}/v1/token_details`, expect.anything());
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

  it("normalizes listed deployment URLs so trailing slashes collapse", async () => {
    get.mockImplementation(async (url: string) => {
      if (url.endsWith("/v1/token_details")) {
        return { data: { teamId: 41 } };
      }
      if (url.includes("/v1/teams/41/list_deployments")) {
        return {
          data: {
            items: [deployment("playful-otter-123", "https://playful-otter-123.convex.cloud/")],
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
});

describe("resolveConvexDeploymentDestination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation(async (url: string) => {
      if (url.endsWith("/v1/token_details")) {
        return { data: { teamId: 41 } };
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
  });

  it("accepts a listed deployment URL even when the caller adds a trailing slash", async () => {
    await expect(
      resolveConvexDeploymentDestination(connection, {
        deploymentUrl: "https://playful-otter-123.convex.cloud/",
        deploymentName: "stale-name"
      })
    ).resolves.toEqual({
      deploymentUrl: "https://playful-otter-123.convex.cloud",
      deploymentName: "playful-otter-123"
    });

    expect(get.mock.calls.every((call) => String(call[0]).startsWith(BASE_URL))).toBe(true);
  });

  it("refuses a deployment URL that the connection cannot access", async () => {
    const attackerUrl = "https://attacker.example";

    await expect(
      resolveConvexDeploymentDestination(connection, {
        deploymentUrl: attackerUrl,
        deploymentName: "attacker"
      })
    ).rejects.toMatchObject({
      name: "BadRequest",
      message:
        "The selected Convex deployment is not available on this connection. Choose a deployment the connection can access."
    });

    expect(get.mock.calls.some((call) => String(call[0]).startsWith(attackerUrl))).toBe(false);
  });

  it("wraps listing failures as a Convex provider error", async () => {
    get.mockRejectedValue(new Error("Convex API is unavailable"));

    await expect(
      resolveConvexDeploymentDestination(connection, {
        deploymentUrl: "https://playful-otter-123.convex.cloud",
        deploymentName: "playful-otter-123"
      })
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      resolveConvexDeploymentDestination(connection, {
        deploymentUrl: "https://playful-otter-123.convex.cloud",
        deploymentName: "playful-otter-123"
      })
    ).rejects.toMatchObject({
      message: "Failed to verify the Convex deployment against this connection: Convex API is unavailable"
    });
  });
});
