import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { getConvexDeploymentUrl, getConvexErrorMessage, listConvexDeployments } from "./convex-connection-fns";
import { TConvexConnection } from "./convex-connection-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@app/lib/validator", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  safeRequest: { get }
}));

const BASE_URL = "https://api.convex.dev";
const HEADERS = { Authorization: "Bearer pat-token", Accept: "application/json" };

const connection = { credentials: { accessToken: "pat-token" } } as unknown as TConvexConnection;

const deployment = (name: string, kind = "cloud") => ({
  kind,
  name,
  deploymentType: "prod",
  ...(kind === "cloud" ? { deploymentUrl: `https://${name}.convex.cloud` } : {})
});

describe("listConvexDeployments", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists the cloud deployments of every team, following each team's cursor", async () => {
    get.mockImplementation(async (url: string, { params }: { params?: { cursor?: string } } = {}) => {
      if (url === `${BASE_URL}/api/dashboard/teams`) return { data: [{ id: 1 }, { id: 2 }] };
      if (url === `${BASE_URL}/v1/teams/1/list_deployments` && !params?.cursor) {
        return { data: { items: [deployment("first-one-1")], pagination: { hasMore: true, nextCursor: "page-2" } } };
      }
      if (url === `${BASE_URL}/v1/teams/1/list_deployments` && params?.cursor === "page-2") {
        return {
          data: { items: [deployment("first-two-2"), deployment("local-3", "local")], pagination: { hasMore: false } }
        };
      }
      if (url === `${BASE_URL}/v1/teams/2/list_deployments`) {
        return { data: { items: [deployment("second-one-4")], pagination: { hasMore: false } } };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    await expect(listConvexDeployments(connection)).resolves.toEqual([
      { name: "first-one-1", deploymentType: "prod" },
      { name: "first-two-2", deploymentType: "prod" },
      { name: "second-one-4", deploymentType: "prod" }
    ]);
    expect(get).toHaveBeenCalledWith(`${BASE_URL}/v1/teams/1/list_deployments`, {
      headers: HEADERS,
      params: { limit: 100, cursor: "page-2" }
    });
  });

  it("fails instead of returning a partial list when the page cap is reached", async () => {
    get.mockImplementation(async (url: string) =>
      url.endsWith("/api/dashboard/teams")
        ? { data: [{ id: 1 }] }
        : { data: { items: [], pagination: { hasMore: true, nextCursor: "again" } } }
    );

    await expect(listConvexDeployments(connection)).rejects.toThrow("exceeds the listing cap");
  });
});

describe("getConvexDeploymentUrl", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("asks Convex for the deployment's URL with the connection's token", async () => {
    get.mockResolvedValue({ data: deployment("playful-otter-123") });

    await expect(getConvexDeploymentUrl(connection, "playful-otter-123")).resolves.toBe(
      "https://playful-otter-123.convex.cloud"
    );
    expect(get).toHaveBeenCalledWith(`${BASE_URL}/v1/deployments/playful-otter-123`, { headers: HEADERS });
  });

  it("refuses a deployment without a URL", async () => {
    get.mockResolvedValue({ data: deployment("local-1", "local") });

    await expect(getConvexDeploymentUrl(connection, "local-1")).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe("getConvexErrorMessage", () => {
  const axiosError = (data: unknown) => {
    const error = new AxiosError("Request failed with status code 502");
    error.response = { status: 502, data, statusText: "", headers: {}, config: { headers: {} as never } };
    return error;
  };

  it("uses Convex's message and ignores bodies that are not Convex errors", () => {
    expect(getConvexErrorMessage(axiosError({ code: "BadName", message: "Name is invalid" }))).toBe("Name is invalid");
    expect(getConvexErrorMessage(axiosError("<html>Bad gateway</html>"))).toBe("Request failed with status code 502");
  });
});
