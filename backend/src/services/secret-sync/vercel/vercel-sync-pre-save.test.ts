import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { VercelConnectionMethod } from "@app/services/app-connection/vercel/vercel-connection-enums";

import { TPreSaveTransformDeps } from "../secret-sync-types";
import { VercelEnvironmentType, VercelSyncScope } from "./vercel-sync-enums";
import { vercelPreSaveTransformDestinationConfig } from "./vercel-sync-pre-save";
import { VercelSyncSchema } from "./vercel-sync-schemas";
import { TVercelSync } from "./vercel-sync-types";

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn<(url: string, options?: unknown) => Promise<{ data: unknown }>>()
}));

vi.mock("@app/lib/config/request", () => ({ request: { get: getMock } }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({ decryptAppConnectionCredentials: vi.fn() }));

const findById = vi.fn<TPreSaveTransformDeps["appConnectionDAL"]["findById"]>();
const deps: TPreSaveTransformDeps = {
  appConnectionDAL: { findById, updateById: vi.fn() },
  kmsService: { createCipherPairWithDataKey: vi.fn() },
  secretV2BridgeDAL: { findOne: vi.fn() }
};
const connection = {
  id: "connection-id",
  name: "Vercel",
  app: AppConnection.Vercel,
  method: VercelConnectionMethod.ApiToken,
  orgId: "org-id",
  projectId: "project-id",
  encryptedCredentials: Buffer.from("encrypted-test-credentials"),
  version: 1,
  isAutoRotationEnabled: false,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01")
};
const destinationConfig = {
  scope: VercelSyncScope.Team,
  teamId: "team_123",
  targetEnvironments: [VercelEnvironmentType.Production],
  applyToAllCustomEnvironments: false,
  sensitive: false
} satisfies Extract<TVercelSync["destinationConfig"], { scope: VercelSyncScope.Team }>;
const params = { destinationConfig, connectionId: connection.id };
const credentials = { apiToken: "test-vercel-token" };

const vercelError = (status: number) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { error: { message: `Provider details containing ${credentials.apiToken}` } }
  });

beforeEach(() => {
  vi.resetAllMocks();
  findById.mockResolvedValue(connection);
  vi.mocked(decryptAppConnectionCredentials).mockResolvedValue(credentials);
  getMock.mockResolvedValue({ data: { data: [], pagination: { count: 0, next: null, prev: null } } });
});

describe("Vercel Team sync access validation", () => {
  it("accepts a team with no shared variables when the token can access them", async () => {
    expect(VercelSyncSchema.shape.destinationConfig.parse(destinationConfig)).toEqual(destinationConfig);
    await expect(vercelPreSaveTransformDestinationConfig(params, deps)).resolves.toBe(destinationConfig);

    expect(getMock).toHaveBeenCalledExactlyOnceWith("https://api.vercel.com/v1/env", {
      params: { teamId: destinationConfig.teamId },
      headers: { Authorization: `Bearer ${credentials.apiToken}` }
    });
    expect(decryptAppConnectionCredentials).toHaveBeenCalledWith({
      orgId: connection.orgId,
      projectId: connection.projectId,
      encryptedCredentials: connection.encryptedCredentials,
      kmsService: deps.kmsService
    });
  });

  it.each([403, 404])("rejects missing team access with a Project scope remedy (%s)", async (status) => {
    getMock.mockRejectedValueOnce(vercelError(status));
    const result = vercelPreSaveTransformDestinationConfig(params, deps);

    await expect(result).rejects.toMatchObject({ name: "BadRequest" });
    await expect(result).rejects.toThrow("Use Project scope for a project-scoped token");
    await expect(result).rejects.not.toThrow(credentials.apiToken);
  });

  it("identifies an invalid token separately from missing team access", async () => {
    getMock.mockRejectedValueOnce(vercelError(401));

    await expect(vercelPreSaveTransformDestinationConfig(params, deps)).rejects.toThrow(
      "Update the connection with a valid token"
    );
  });

  it.each([vercelError(429), vercelError(500), new AxiosError("Connection reset", "ECONNRESET")])(
    "fails closed on temporary Vercel failures without misidentifying token permissions",
    async (error) => {
      getMock.mockRejectedValueOnce(error);
      const result = vercelPreSaveTransformDestinationConfig(params, deps);

      await expect(result).rejects.toMatchObject({
        name: "BadRequest",
        message: "Could not verify access to Vercel shared environment variables. Try again later."
      });
      await expect(result).rejects.not.toThrow(credentials.apiToken);
    }
  );

  it("does not require team-level permissions for a Project sync", async () => {
    const projectConfig = {
      scope: VercelSyncScope.Project,
      app: "prj_123",
      appName: "my-project",
      teamId: destinationConfig.teamId,
      env: VercelEnvironmentType.Production,
      sensitive: false
    } satisfies TVercelSync["destinationConfig"];

    expect(VercelSyncSchema.shape.destinationConfig.parse(projectConfig)).toEqual(projectConfig);
    await expect(
      vercelPreSaveTransformDestinationConfig({ ...params, destinationConfig: projectConfig }, deps)
    ).resolves.toBe(projectConfig);
    expect(findById).not.toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("does not contact Vercel for a name-only update with the same connection", async () => {
    await expect(
      vercelPreSaveTransformDestinationConfig(
        {
          ...params,
          destinationConfig: undefined,
          existingDestinationConfig: destinationConfig,
          existingConnectionId: connection.id
        },
        deps
      )
    ).resolves.toBeUndefined();
    expect(findById).not.toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalled();
  });

  it.each([vercelError(429), vercelError(500), new AxiosError("Connection reset", "ECONNRESET")])(
    "does not contact Vercel when the edit form resubmits an unchanged destination",
    async (error) => {
      getMock.mockRejectedValue(error);
      const submittedConfig = { ...destinationConfig };

      await expect(
        vercelPreSaveTransformDestinationConfig(
          {
            ...params,
            destinationConfig: submittedConfig,
            existingDestinationConfig: destinationConfig,
            existingConnectionId: connection.id
          },
          deps
        )
      ).resolves.toBe(submittedConfig);
      expect(findById).not.toHaveBeenCalled();
      expect(getMock).not.toHaveBeenCalled();
    }
  );

  it("preserves sync options changed within the same team without probing access again", async () => {
    const submittedConfig = { ...destinationConfig, targetEnvironments: [VercelEnvironmentType.Preview] };

    await expect(
      vercelPreSaveTransformDestinationConfig(
        {
          ...params,
          destinationConfig: submittedConfig,
          existingDestinationConfig: destinationConfig,
          existingConnectionId: connection.id
        },
        deps
      )
    ).resolves.toBe(submittedConfig);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("checks access when changing from Project to Team scope", async () => {
    getMock.mockRejectedValueOnce(vercelError(403));

    await expect(
      vercelPreSaveTransformDestinationConfig(
        {
          ...params,
          existingDestinationConfig: {
            scope: VercelSyncScope.Project,
            teamId: destinationConfig.teamId,
            app: "prj_123",
            appName: "my-project",
            env: VercelEnvironmentType.Production,
            sensitive: false
          },
          existingConnectionId: connection.id
        },
        deps
      )
    ).rejects.toThrow("Use Project scope");
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it.each([200, 403])("checks the existing team when only the connection changes (%s)", async (status) => {
    if (status === 403) getMock.mockRejectedValueOnce(vercelError(status));
    const result = vercelPreSaveTransformDestinationConfig(
      {
        ...params,
        connectionId: "new-connection-id",
        existingConnectionId: connection.id,
        destinationConfig: undefined,
        existingDestinationConfig: destinationConfig
      },
      deps
    );

    if (status === 403) {
      await expect(result).rejects.toThrow("Use Project scope");
    } else {
      await expect(result).resolves.toBeUndefined();
    }
    expect(findById).toHaveBeenCalledWith("new-connection-id");
    expect(getMock).toHaveBeenCalledWith(
      "https://api.vercel.com/v1/env",
      expect.objectContaining({ params: { teamId: destinationConfig.teamId } })
    );
  });

  it("checks the selected team when the destination changes", async () => {
    await vercelPreSaveTransformDestinationConfig(
      {
        ...params,
        destinationConfig: { ...destinationConfig, teamId: "team_456" },
        existingDestinationConfig: destinationConfig,
        existingConnectionId: connection.id
      },
      deps
    );

    expect(getMock).toHaveBeenCalledWith(
      "https://api.vercel.com/v1/env",
      expect.objectContaining({ params: { teamId: "team_456" } })
    );
  });

  it("rejects an incompatible connection before using its credentials", async () => {
    findById.mockResolvedValueOnce({ ...connection, app: AppConnection.GitHub });

    await expect(vercelPreSaveTransformDestinationConfig(params, deps)).rejects.toMatchObject({ name: "NotFound" });
    expect(decryptAppConnectionCredentials).not.toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalled();
  });
});
