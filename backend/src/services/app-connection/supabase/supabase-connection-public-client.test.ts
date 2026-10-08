import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppConnection } from "../app-connection-enums";
import { SupabaseConnectionMethod } from "./supabase-connection-constants";
import { SupabasePublicAPI } from "./supabase-connection-public-client";
import { TSupabaseConnectionConfig } from "./supabase-connection-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));
vi.mock("@app/lib/validator", () => ({ blockLocalAndPrivateIpAddresses: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@app/lib/delay", () => ({ delay: vi.fn().mockResolvedValue(undefined) }));

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock("@app/lib/config/request", () => ({ createRequestClient: () => ({ request: requestMock }) }));

describe("SupabasePublicAPI client", () => {
  const accountScopedConnection: TSupabaseConnectionConfig = {
    app: AppConnection.Supabase,
    method: SupabaseConnectionMethod.AccessToken,
    orgId: "org-123",
    credentials: {
      accessKey: "sbp_account_token"
    }
  };

  const projectScopedConnection: TSupabaseConnectionConfig = {
    app: AppConnection.Supabase,
    method: SupabaseConnectionMethod.AccessToken,
    orgId: "org-123",
    credentials: {
      accessKey: "sbp_project_token",
      projectRef: "test-project-ref"
    }
  };

  beforeEach(() => {
    requestMock.mockReset();
  });

  describe("healthcheck", () => {
    it("validates account-scoped token by calling GET /v1/projects when projectRef is omitted", async () => {
      requestMock.mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: [{ id: "proj-1", name: "Project 1" }]
      });

      await SupabasePublicAPI.healthcheck(accountScopedConnection);

      expect(requestMock).toHaveBeenCalledTimes(1);
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          url: "/v1/projects",
          baseURL: "https://api.supabase.com",
          headers: {
            Authorization: "Bearer sbp_account_token"
          }
        })
      );
    });

    it("validates project-scoped token by calling GET /v1/projects/{projectRef}/secrets when projectRef is provided", async () => {
      requestMock.mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: [{ name: "EXISTING_KEY", value: "val" }]
      });

      await SupabasePublicAPI.healthcheck(projectScopedConnection);

      expect(requestMock).toHaveBeenCalledTimes(1);
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          url: "/v1/projects/test-project-ref/secrets",
          baseURL: "https://api.supabase.com",
          headers: {
            Authorization: "Bearer sbp_project_token"
          }
        })
      );
    });

    it("respects custom instanceUrl if provided", async () => {
      requestMock.mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: []
      });

      const customInstanceConnection: TSupabaseConnectionConfig = {
        app: AppConnection.Supabase,
        method: SupabaseConnectionMethod.AccessToken,
        orgId: "org-123",
        credentials: {
          accessKey: "sbp_token",
          instanceUrl: "https://custom.supabase.internal",
          projectRef: "custom-proj"
        }
      };

      await SupabasePublicAPI.healthcheck(customInstanceConnection);

      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: "https://custom.supabase.internal",
          url: "/v1/projects/custom-proj/secrets"
        })
      );
    });
  });

  describe("rate limiting (429 handling)", () => {
    it("retries when receiving 429 and succeeds upon recovery", async () => {
      requestMock
        .mockResolvedValueOnce({ status: 429, headers: {}, data: { error: "rate limited" } })
        .mockResolvedValueOnce({ status: 200, headers: {}, data: [] });

      const result = await SupabasePublicAPI.getVariables(projectScopedConnection, "test-project-ref");

      expect(result).toEqual([]);
      expect(requestMock).toHaveBeenCalledTimes(2);
    });

    it("exhausts retries after max attempts on continuous 429 responses", async () => {
      requestMock.mockResolvedValue({ status: 429, headers: {}, data: { error: "rate limited" } });

      const result = await SupabasePublicAPI.getVariables(projectScopedConnection, "test-project-ref");

      // Attempt 0 + 4 retries (maxAttempts: 3 -> retry 0, 1, 2, 3) = 5 attempts total
      expect(requestMock).toHaveBeenCalledTimes(5);
      expect(result).toEqual({ error: "rate limited" });
    });
  });

  describe("error handling", () => {
    it("preserves non-rate-limit request failures", async () => {
      const networkError = new Error("Connection timed out");
      requestMock.mockRejectedValueOnce(networkError);

      await expect(SupabasePublicAPI.healthcheck(projectScopedConnection)).rejects.toThrow("Connection timed out");
      expect(requestMock).toHaveBeenCalledTimes(1);
    });
  });
});
