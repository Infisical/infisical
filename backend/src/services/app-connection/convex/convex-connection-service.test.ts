import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { convexConnectionService } from "./convex-connection-service";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { listConvexDeployments, loggerError } = vi.hoisted(() => ({
  listConvexDeployments: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock("./convex-connection-fns", () => ({
  listConvexDeployments,
  getConvexErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Unknown error")
}));

vi.mock("@app/lib/logger", () => ({
  logger: { error: loggerError, info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const CONNECTION_ID = "11111111-1111-4111-8111-111111111111";
const actor = { type: "user" } as unknown as OrgServiceActor;
const appConnection = { id: CONNECTION_ID, credentials: { accessToken: "pat-token" } };

describe("convexConnectionService", () => {
  const getAppConnection = vi.fn();
  const service = convexConnectionService(getAppConnection);

  beforeEach(() => {
    vi.clearAllMocks();
    getAppConnection.mockResolvedValue(appConnection);
  });

  it("returns deployments from Convex", async () => {
    const deployments = [
      {
        name: "playful-otter-123",
        deploymentUrl: "https://playful-otter-123.convex.cloud",
        deploymentType: "prod"
      }
    ];
    listConvexDeployments.mockResolvedValue(deployments);

    await expect(service.listDeployments(CONNECTION_ID, actor)).resolves.toEqual(deployments);
    expect(getAppConnection).toHaveBeenCalledWith(AppConnection.Convex, CONNECTION_ID, actor);
    expect(listConvexDeployments).toHaveBeenCalledWith(appConnection);
  });

  it("throws a Convex provider error instead of returning an empty list", async () => {
    listConvexDeployments.mockRejectedValue(new Error("Convex API is unavailable"));

    await expect(service.listDeployments(CONNECTION_ID, actor)).rejects.toMatchObject({
      name: "BadRequest",
      message: "Failed to list Convex deployments: Convex API is unavailable"
    });

    expect(loggerError).toHaveBeenCalledWith(
      expect.any(Error),
      `Failed to list Convex deployments [connectionId=${CONNECTION_ID}]`
    );
  });
});
