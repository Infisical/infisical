import { AxiosError, AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { SupabaseConnectionMethod } from "./supabase-connection-constants";
import { listProjects, validateSupabaseConnectionCredentials } from "./supabase-connection-fns";
import {
  SanitizedSupabaseConnectionSchema,
  SupabaseConnectionAccessTokenCredentialsSchema
} from "./supabase-connection-schemas";
import { TSupabaseConnection, TSupabaseConnectionConfig } from "./supabase-connection-types";

const { healthcheckMock, getProjectsMock } = vi.hoisted(() => ({
  healthcheckMock: vi.fn(),
  getProjectsMock: vi.fn()
}));

vi.mock("./supabase-connection-public-client", () => ({
  SupabasePublicAPI: {
    healthcheck: healthcheckMock,
    getProjects: getProjectsMock
  }
}));

const makeAxiosError = (status: number, message = "Request failed") => {
  const error = new AxiosError(message);
  error.response = {
    status,
    statusText: status === 403 ? "Forbidden" : "Error",
    headers: {},
    config: {} as never,
    data: {}
  } as AxiosResponse;
  return error;
};

describe("supabase-connection-fns", () => {
  const accountScopedConfig: TSupabaseConnectionConfig = {
    app: AppConnection.Supabase,
    method: SupabaseConnectionMethod.AccessToken,
    orgId: "org-1",
    credentials: {
      accessKey: "sbp_account_key"
    }
  };

  const projectScopedConfig: TSupabaseConnectionConfig = {
    app: AppConnection.Supabase,
    method: SupabaseConnectionMethod.AccessToken,
    orgId: "org-1",
    credentials: {
      accessKey: "sbp_project_key",
      projectRef: "target-project-ref"
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateSupabaseConnectionCredentials", () => {
    it("successfully validates account-scoped credentials", async () => {
      healthcheckMock.mockResolvedValueOnce(undefined);

      const result = await validateSupabaseConnectionCredentials(accountScopedConfig);

      expect(result).toEqual(accountScopedConfig.credentials);
      expect(healthcheckMock).toHaveBeenCalledWith(accountScopedConfig);
    });

    it("successfully validates project-scoped credentials with projectRef", async () => {
      healthcheckMock.mockResolvedValueOnce(undefined);

      const result = await validateSupabaseConnectionCredentials(projectScopedConfig);

      expect(result).toEqual(projectScopedConfig.credentials);
      expect(healthcheckMock).toHaveBeenCalledWith(projectScopedConfig);
    });

    it("produces an actionable error message on 403 when projectRef is missing", async () => {
      healthcheckMock.mockRejectedValueOnce(makeAxiosError(403, "Request failed with status code 403"));

      await expect(validateSupabaseConnectionCredentials(accountScopedConfig)).rejects.toThrow(
        "Failed to validate credentials: Request failed with status code 403. If using a project-scoped access token, please specify a Project Reference."
      );
    });

    it("does not append projectRef guidance on 403 when projectRef is already provided", async () => {
      healthcheckMock.mockRejectedValueOnce(makeAxiosError(403, "Request failed with status code 403"));

      const error = (await validateSupabaseConnectionCredentials(projectScopedConfig).catch((e: Error) => e)) as Error;

      expect(error.message).toContain("Failed to validate credentials: Request failed with status code 403");
      expect(error.message).not.toContain("If using a project-scoped access token");
    });

    it("handles 401 unauthorized errors without projectRef hint", async () => {
      healthcheckMock.mockRejectedValueOnce(makeAxiosError(401, "Request failed with status code 401"));

      await expect(validateSupabaseConnectionCredentials(accountScopedConfig)).rejects.toThrow(
        "Failed to validate credentials: Request failed with status code 401"
      );
    });

    it("handles non-Axios generic errors gracefully", async () => {
      healthcheckMock.mockRejectedValueOnce(new Error("Unexpected internal error"));

      await expect(validateSupabaseConnectionCredentials(accountScopedConfig)).rejects.toThrow(
        "Unable to validate connection - verify credentials"
      );
    });
  });

  describe("listProjects", () => {
    it("returns configured project directly for project-scoped tokens without calling getProjects", async () => {
      const appConnection: TSupabaseConnection = {
        id: "conn-1",
        name: "My Connection",
        app: AppConnection.Supabase,
        method: SupabaseConnectionMethod.AccessToken,
        orgId: "org-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        isAutoRotationEnabled: false,
        credentials: {
          accessKey: "sbp_proj_token",
          projectRef: "scoped-ref-xyz"
        }
      };

      const result = await listProjects(appConnection);

      expect(result).toEqual([{ id: "scoped-ref-xyz", name: "scoped-ref-xyz" }]);
      expect(getProjectsMock).not.toHaveBeenCalled();
    });

    it("calls getProjects for account-scoped tokens and returns all projects", async () => {
      const appConnection: TSupabaseConnection = {
        id: "conn-2",
        name: "My Account Connection",
        app: AppConnection.Supabase,
        method: SupabaseConnectionMethod.AccessToken,
        orgId: "org-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        isAutoRotationEnabled: false,
        credentials: {
          accessKey: "sbp_acct_token"
        }
      };

      const mockProjects = [
        {
          id: "p1",
          organization_id: "org-1",
          name: "Project Alpha",
          region: "us-east-1",
          created_at: new Date(),
          status: "ACTIVE",
          database: { host: "h1", version: "v1", postgres_engine: "15", release_channel: "stable" }
        },
        {
          id: "p2",
          organization_id: "org-1",
          name: "Project Beta",
          region: "eu-west-1",
          created_at: new Date(),
          status: "ACTIVE",
          database: { host: "h2", version: "v1", postgres_engine: "15", release_channel: "stable" }
        }
      ];

      getProjectsMock.mockResolvedValueOnce(mockProjects);

      const result = await listProjects(appConnection);

      expect(result).toEqual(mockProjects);
      expect(getProjectsMock).toHaveBeenCalledWith(appConnection);
    });

    it("wraps AxiosError from getProjects into BadRequestError", async () => {
      const appConnection: TSupabaseConnection = {
        id: "conn-3",
        name: "Failing Connection",
        app: AppConnection.Supabase,
        method: SupabaseConnectionMethod.AccessToken,
        orgId: "org-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        isAutoRotationEnabled: false,
        credentials: {
          accessKey: "sbp_token"
        }
      };

      getProjectsMock.mockRejectedValueOnce(makeAxiosError(500, "Internal Server Error"));

      const error = (await listProjects(appConnection).catch((e: Error) => e)) as Error;

      expect(error).toBeInstanceOf(BadRequestError);
      expect(error.message).toBe("Failed to list projects: Internal Server Error");
    });
  });

  describe("Supabase schema validation and sanitization", () => {
    it("accepts valid projectRef and trims whitespace", () => {
      const parsed = SupabaseConnectionAccessTokenCredentialsSchema.parse({
        accessKey: "sbp_valid_key",
        projectRef: "  test-ref  "
      });
      expect(parsed.projectRef).toBe("test-ref");
    });

    it("accepts credentials when projectRef is omitted", () => {
      const parsed = SupabaseConnectionAccessTokenCredentialsSchema.parse({
        accessKey: "sbp_valid_key"
      });
      expect(parsed.projectRef).toBeUndefined();
    });

    it("rejects explicitly supplied empty string for projectRef", () => {
      const result = SupabaseConnectionAccessTokenCredentialsSchema.safeParse({
        accessKey: "sbp_valid_key",
        projectRef: ""
      });
      expect(result.success).toBe(false);
    });

    it("rejects whitespace-only string for projectRef", () => {
      const result = SupabaseConnectionAccessTokenCredentialsSchema.safeParse({
        accessKey: "sbp_valid_key",
        projectRef: "    "
      });
      expect(result.success).toBe(false);
    });

    it("rejects projectRef exceeding 255 characters", () => {
      const result = SupabaseConnectionAccessTokenCredentialsSchema.safeParse({
        accessKey: "sbp_valid_key",
        projectRef: "a".repeat(256)
      });
      expect(result.success).toBe(false);
    });

    it("sanitizes connection by exposing projectRef and instanceUrl while stripping secret accessKey", () => {
      const sanitized = SanitizedSupabaseConnectionSchema.parse({
        id: "11111111-1111-1111-1111-111111111111",
        name: "test-conn",
        app: AppConnection.Supabase,
        method: SupabaseConnectionMethod.AccessToken,
        orgId: "22222222-2222-2222-2222-222222222222",
        version: 1,
        isAutoRotationEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        credentials: {
          accessKey: "sbp_secret_key",
          instanceUrl: "https://api.supabase.com",
          projectRef: "persisted-project-ref"
        }
      });
      expect(sanitized.credentials.projectRef).toBe("persisted-project-ref");
      expect(sanitized.credentials.instanceUrl).toBe("https://api.supabase.com");
      expect((sanitized.credentials as Record<string, unknown>).accessKey).toBeUndefined();
    });
  });
});
