import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { CoolifyConnectionMethod } from "./coolify-connection-enums";
import {
  getCoolifyConnectionListItem,
  getCoolifyInstanceUrl,
  listCoolifyApplications,
  listCoolifyProjectEnvironments,
  listCoolifyProjects,
  validateCoolifyConnectionCredentials
} from "./coolify-connection-fns";
import { TCoolifyConnection, TCoolifyConnectionConfig } from "./coolify-connection-types";

const { get } = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock("@app/lib/validator", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  safeRequest: { get }
}));

const mockConfig: TCoolifyConnectionConfig = {
  app: AppConnection.Coolify,
  method: CoolifyConnectionMethod.ApiToken,
  orgId: "org-1",
  credentials: {
    instanceUrl: "https://coolify.example.com/",
    apiToken: "test-token"
  }
};

const mockConnection = {
  id: "conn-1",
  name: "Coolify Connection",
  app: AppConnection.Coolify,
  method: CoolifyConnectionMethod.ApiToken,
  orgId: "org-1",
  credentials: {
    instanceUrl: "https://coolify.example.com",
    apiToken: "test-token"
  }
} as unknown as TCoolifyConnection;

describe("Coolify Connection Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCoolifyInstanceUrl", () => {
    it("strips trailing slash from instanceUrl", () => {
      expect(getCoolifyInstanceUrl(mockConfig)).toBe("https://coolify.example.com");
    });
  });

  describe("getCoolifyConnectionListItem", () => {
    it("returns correct list item structure", () => {
      expect(getCoolifyConnectionListItem()).toEqual({
        name: "Coolify",
        app: "coolify",
        methods: [CoolifyConnectionMethod.ApiToken]
      });
    });
  });

  describe("validateCoolifyConnectionCredentials", () => {
    it("validates credentials successfully", async () => {
      get.mockResolvedValueOnce({ data: [] });

      const result = await validateCoolifyConnectionCredentials(mockConfig);
      expect(result).toEqual(mockConfig.credentials);
      expect(get).toHaveBeenCalledWith("https://coolify.example.com/api/v1/servers", {
        headers: {
          Authorization: "Bearer test-token",
          Accept: "application/json"
        }
      });
    });

    it("throws BadRequestError with message on Axios error", async () => {
      const axiosError = new AxiosError("Unauthorized");
      axiosError.response = { data: { message: "Invalid API token" }, status: 401 } as AxiosError["response"];
      get.mockRejectedValueOnce(axiosError);

      await expect(validateCoolifyConnectionCredentials(mockConfig)).rejects.toThrow(
        "Failed to validate Coolify credentials: Invalid API token"
      );
    });

    it("rethrows BadRequestError directly (e.g., SSRF validation)", async () => {
      const badRequest = new BadRequestError({ message: "Private IP blocked" });
      get.mockRejectedValueOnce(badRequest);

      await expect(validateCoolifyConnectionCredentials(mockConfig)).rejects.toThrow("Private IP blocked");
    });
  });

  describe("listCoolifyProjects", () => {
    it("fetches projects from API", async () => {
      const projects = [{ id: 1, uuid: "proj-1", name: "Default" }];
      get.mockResolvedValueOnce({ data: projects });

      const result = await listCoolifyProjects(mockConnection);
      expect(result).toEqual(projects);
      expect(get).toHaveBeenCalledWith("https://coolify.example.com/api/v1/projects", {
        headers: {
          Authorization: "Bearer test-token",
          Accept: "application/json"
        }
      });
    });
  });

  describe("listCoolifyProjectEnvironments", () => {
    it("fetches project environments from API", async () => {
      const project = {
        id: 1,
        uuid: "proj-1",
        name: "Default",
        environments: [{ id: 10, uuid: "env-1", name: "production" }]
      };
      get.mockResolvedValueOnce({ data: project });

      const result = await listCoolifyProjectEnvironments(mockConnection, "proj-1");
      expect(result).toEqual(project.environments);
      expect(get).toHaveBeenCalledWith("https://coolify.example.com/api/v1/projects/proj-1", {
        headers: {
          Authorization: "Bearer test-token",
          Accept: "application/json"
        }
      });
    });
  });

  describe("listCoolifyApplications", () => {
    it("fetches applications from API", async () => {
      const apps = [{ uuid: "app-1", name: "web-app", environment_id: 10 }];
      get.mockResolvedValueOnce({ data: apps });

      const result = await listCoolifyApplications(mockConnection);
      expect(result).toEqual(apps);
      expect(get).toHaveBeenCalledWith("https://coolify.example.com/api/v1/applications", {
        headers: {
          Authorization: "Bearer test-token",
          Accept: "application/json"
        }
      });
    });
  });
});
