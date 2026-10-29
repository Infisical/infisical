import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { AppConnection } from "../app-connection-enums";
import { VercelConnectionMethod } from "./vercel-connection-enums";
import { listProjects, listTeams, validateVercelConnectionCredentials } from "./vercel-connection-fns";
import { vercelConnectionService } from "./vercel-connection-service";
import { TVercelConnection, TVercelConnectionConfig } from "./vercel-connection-types";

type TGetRequest = (url: string, options?: { params?: Record<string, string | number> }) => Promise<{ data: unknown }>;

const { getMock, logErrorMock } = vi.hoisted(() => ({ getMock: vi.fn<TGetRequest>(), logErrorMock: vi.fn() }));

vi.mock("@app/lib/config/request", () => ({ request: { get: getMock } }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));
vi.mock("@app/lib/logger", () => ({ logger: { error: logErrorMock } }));

const config: TVercelConnectionConfig = {
  app: AppConnection.Vercel,
  method: VercelConnectionMethod.ApiToken,
  orgId: "org-id",
  credentials: { apiToken: "test-vercel-token" }
};

const connection: TVercelConnection = {
  ...config,
  id: "connection-id",
  name: "test-vercel-connection",
  version: 1,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  isAutoRotationEnabled: false
};
const project = { id: "prj_123", name: "my-project", accountId: "team_123" };
const team = { id: "team_123", name: "My Team", slug: "my-team" };
const actor = {
  type: ActorType.USER,
  id: "user-id",
  authMethod: AuthMethod.EMAIL,
  orgId: config.orgId,
  rootOrgId: config.orgId,
  parentOrgId: config.orgId
};

const vercelError = (status: number, code: string, message: string) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { error: { code, message } }
  });

beforeEach(() => {
  getMock.mockReset();
  logErrorMock.mockReset();
});

describe("validateVercelConnectionCredentials", () => {
  it("accepts a project token without requiring user or team access", async () => {
    getMock.mockResolvedValueOnce({ data: { projects: [project] } });

    await expect(validateVercelConnectionCredentials(config)).resolves.toBe(config.credentials);
    expect(getMock).toHaveBeenCalledExactlyOnceWith("https://api.vercel.com/v10/projects", {
      params: { limit: 1 },
      headers: { Authorization: `Bearer ${config.credentials.apiToken}` }
    });
  });

  it("accepts a valid token even if there are no projects yet", async () => {
    getMock.mockResolvedValueOnce({ data: { projects: [] } });

    await expect(validateVercelConnectionCredentials(config)).resolves.toBe(config.credentials);
  });

  it.each([401, 403])("rejects invalid or unauthorized tokens without exposing the token (%s)", async (status) => {
    getMock.mockRejectedValueOnce(vercelError(status, "forbidden", `Invalid token: ${config.credentials.apiToken}`));

    const validation = validateVercelConnectionCredentials(config);

    await expect(validation).rejects.toMatchObject({ name: "BadRequest" });
    await expect(validation).rejects.toThrow("has access to the projects");
    await expect(validation).rejects.not.toThrow(config.credentials.apiToken);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [404, "unknown_error"],
    [429, "rate_limited"],
    [500, "internal_server_error"]
  ])("preserves other Vercel failures (%s, %s)", async (status, code) => {
    getMock.mockRejectedValueOnce(vercelError(status, code, "Vercel request failed"));

    await expect(validateVercelConnectionCredentials(config)).rejects.toMatchObject({
      name: "BadRequest",
      message: `Failed to validate credentials: ${JSON.stringify({ error: { code, message: "Vercel request failed" } })}`
    });
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});

describe("listProjects", () => {
  it.each([
    { format: "paginated object", data: { projects: [project], pagination: { next: null } } },
    { format: "plain array", data: [project] }
  ])("discovers the scoped project from a $format when team discovery is forbidden", async ({ data }) => {
    getMock
      .mockRejectedValueOnce(vercelError(403, "forbidden", "Team access denied"))
      .mockResolvedValueOnce({ data })
      .mockResolvedValueOnce({ data: { environments: [{ id: "env_123", slug: "staging", type: "custom" }] } })
      .mockResolvedValueOnce({ data: [{ ref: "main" }, { ref: "feature/test" }] });

    await expect(listProjects(connection, "my-project")).resolves.toEqual([
      {
        id: "team_123",
        name: "team_123",
        slug: "team_123",
        apps: [
          {
            id: "prj_123",
            name: "my-project",
            envs: [{ id: "env_123", slug: "staging", type: "custom" }],
            previewBranches: ["feature/test"]
          }
        ]
      }
    ]);
    expect(getMock).toHaveBeenCalledWith(
      "https://api.vercel.com/v10/projects",
      expect.objectContaining({ params: { limit: 10, search: "my-project" } })
    );
    expect(getMock).toHaveBeenCalledWith(
      "https://api.vercel.com/v9/projects/prj_123/custom-environments?teamId=team_123",
      expect.anything()
    );
    expect(getMock).toHaveBeenCalledWith(
      "https://api.vercel.com/v1/integrations/git-branches",
      expect.objectContaining({ params: { projectId: "prj_123", teamId: "team_123" } })
    );
    expect(getMock.mock.calls.some(([url]) => url === "https://api.vercel.com/v2/user")).toBe(false);
  });

  it.each([403, 404])("keeps accessible teams when personal account discovery is denied (%s)", async (status) => {
    getMock
      .mockResolvedValueOnce({ data: { teams: [team] } })
      .mockRejectedValueOnce(vercelError(status, "not_found", "User not found."))
      .mockResolvedValueOnce({ data: { projects: [project] } })
      .mockRejectedValueOnce(vercelError(403, "forbidden", "Custom environments denied"))
      .mockRejectedValueOnce(vercelError(403, "forbidden", "Git branches denied"));

    await expect(listProjects(connection)).resolves.toEqual([
      { ...team, apps: [{ id: project.id, name: project.name, envs: [], previewBranches: [] }] }
    ]);
    expect(getMock).toHaveBeenCalledWith(
      "https://api.vercel.com/v10/projects",
      expect.objectContaining({ params: { teamId: team.id, limit: 10 } })
    );
  });

  it("still discovers team and personal projects with an account token", async () => {
    getMock.mockImplementation(async (url, options) => {
      if (url.endsWith("/v2/teams")) return { data: { teams: [team] } };
      if (url.endsWith("/v2/user")) {
        return { data: { user: { id: "user_123", name: "Personal", username: "personal" } } };
      }
      if (url.endsWith("/v10/projects")) {
        const owner = options?.params?.teamId;
        return { data: { projects: [{ id: `prj_${owner}`, name: `project-${owner}`, accountId: owner }] } };
      }
      if (url.includes("/custom-environments")) return { data: { environments: [] } };
      if (url.endsWith("/git-branches")) return { data: [] };
      throw new Error(`Unexpected request: ${url}`);
    });

    await expect(listProjects(connection)).resolves.toEqual([
      { ...team, apps: [{ id: "prj_team_123", name: "project-team_123", envs: [], previewBranches: [] }] },
      {
        id: "user_123",
        name: "Personal",
        slug: "personal",
        apps: [{ id: "prj_user_123", name: "project-user_123", envs: [], previewBranches: [] }]
      }
    ]);
  });

  it.each([
    { format: "paginated object", data: { projects: [], pagination: { next: null } } },
    { format: "plain array", data: [] }
  ])("returns no projects for an empty $format", async ({ data }) => {
    getMock.mockRejectedValueOnce(vercelError(403, "forbidden", "Team access denied")).mockResolvedValueOnce({ data });

    await expect(listProjects(connection)).resolves.toEqual([]);
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("uses project discovery if no account metadata is available", async () => {
    getMock
      .mockResolvedValueOnce({ data: { teams: [] } })
      .mockRejectedValueOnce(vercelError(404, "not_found", "User not found."))
      .mockResolvedValueOnce({ data: { projects: [project] } })
      .mockResolvedValueOnce({ data: { environments: [] } })
      .mockResolvedValueOnce({ data: [] });

    const result = await listProjects(connection);

    expect(result[0].id).toBe(project.accountId);
    expect(result[0].apps[0].id).toBe(project.id);
  });

  it("rejects scoped projects without an owning account instead of guessing the team", async () => {
    getMock
      .mockRejectedValueOnce(vercelError(403, "forbidden", "Team access denied"))
      .mockResolvedValueOnce({ data: { projects: [{ id: project.id, name: project.name }] } });

    await expect(listProjects(connection)).rejects.toThrow("Vercel did not return the owning account");
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("does not accept a forbidden team response as proof of access to projects", async () => {
    getMock
      .mockRejectedValueOnce(vercelError(403, "forbidden", "Team access denied"))
      .mockRejectedValueOnce(vercelError(401, "unauthorized", "Token expired"));

    await expect(listProjects(connection)).rejects.toMatchObject({ name: "BadRequest" });
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it.each([401, 429, 500])("does not use scope fallback for other team errors (%s)", async (status) => {
    getMock.mockRejectedValueOnce(vercelError(status, "upstream_error", "Request failed"));

    await expect(listProjects(connection)).rejects.toMatchObject({ name: "BadRequest" });
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("does not use scope fallback for network errors", async () => {
    getMock.mockRejectedValueOnce(new AxiosError("Connection reset", "ECONNRESET"));

    await expect(listProjects(connection)).rejects.toMatchObject({ name: "BadRequest" });
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});

describe("Vercel connection project discovery service", () => {
  const service = vercelConnectionService(async () => connection);

  it("returns an empty list only when project discovery succeeds without any projects", async () => {
    getMock
      .mockRejectedValueOnce(vercelError(403, "forbidden", "Team access denied"))
      .mockResolvedValueOnce({ data: { projects: [], pagination: { next: null } } });

    await expect(service.listProjects(connection.id, actor)).resolves.toEqual([]);
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it.each([401, 429, 500])(
    "reports a scoped project discovery failure instead of an empty list (%s)",
    async (status) => {
      getMock
        .mockRejectedValueOnce(vercelError(403, "forbidden", "Team access denied"))
        .mockRejectedValueOnce(vercelError(status, "upstream_error", "Project discovery failed"));

      const result = service.listProjects(connection.id, actor);
      await expect(result).rejects.toMatchObject({ name: "BadRequest" });
      await expect(result).rejects.toThrow("Failed to fetch Vercel resources");
      expect(logErrorMock).toHaveBeenCalledTimes(1);
    }
  );

  it.each([401, 429, 500])("reports project discovery failures within an accessible team (%s)", async (status) => {
    getMock
      .mockResolvedValueOnce({ data: { teams: [team] } })
      .mockRejectedValueOnce(vercelError(404, "not_found", "User not found."))
      .mockRejectedValueOnce(vercelError(status, "upstream_error", "Project discovery failed"));

    await expect(service.listProjects(connection.id, actor)).rejects.toMatchObject({ name: "BadRequest" });
    expect(logErrorMock).toHaveBeenCalledTimes(1);
  });

  it.each([403, 404])("continues to skip teams outside the token's scope (%s)", async (status) => {
    getMock
      .mockResolvedValueOnce({ data: { teams: [team] } })
      .mockRejectedValueOnce(vercelError(404, "not_found", "User not found."))
      .mockRejectedValueOnce(vercelError(status, "forbidden", "Project access denied"));

    await expect(service.listProjects(connection.id, actor)).resolves.toEqual([]);
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("reports unexpected failures without exposing provider details", async () => {
    getMock.mockRejectedValueOnce(new Error(`Provider details containing ${config.credentials.apiToken}`));

    await expect(service.listProjects(connection.id, actor)).rejects.toMatchObject({
      name: "BadRequest",
      message: "Could not load Vercel projects. Try again later."
    });
    expect(logErrorMock).toHaveBeenCalledTimes(1);
  });
});

describe("listTeams pagination", () => {
  it("uses the next cursor as until when fetching the next page", async () => {
    getMock
      .mockResolvedValueOnce({ data: { teams: [team], pagination: { next: 1000 } } })
      .mockResolvedValueOnce({ data: { teams: [{ ...team, id: "team_456" }], pagination: { next: null } } })
      .mockResolvedValueOnce({ data: {} });

    await expect(listTeams(connection)).resolves.toHaveLength(2);
    expect(getMock).toHaveBeenNthCalledWith(
      2,
      "https://api.vercel.com/v2/teams",
      expect.objectContaining({ params: { limit: 100, until: 1000 } })
    );
  });

  it("stops instead of looping forever if Vercel keeps returning a cursor", async () => {
    getMock.mockResolvedValue({ data: { teams: [], pagination: { next: 1000 } } });

    await expect(listTeams(connection)).rejects.toThrow("Vercel returned too many pages");
    expect(getMock).toHaveBeenCalledTimes(100);
  });
});
