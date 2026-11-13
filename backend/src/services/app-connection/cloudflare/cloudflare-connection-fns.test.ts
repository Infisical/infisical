import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { safeRequest } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { CloudflareConnectionMethod } from "./cloudflare-connection-enum";
import { validateCloudflareConnectionCredentials } from "./cloudflare-connection-fns";
import type { TCloudflareConnectionConfig } from "./cloudflare-connection-types";

vi.mock("@app/lib/validator", () => ({ safeRequest: { get: vi.fn() } }));

const apiBaseUrl = "https://api.cloudflare.com/client/v4";
const accountUrl = `${apiBaseUrl}/accounts/account-id`;
const workersScriptsUrl = `${accountUrl}/workers/scripts`;

const config = {
  app: AppConnection.Cloudflare,
  method: CloudflareConnectionMethod.APIToken,
  credentials: { apiToken: "test-token", accountId: "account-id" },
  orgId: "org-id"
} as TCloudflareConnectionConfig;

const axiosError = (status: number, message: string) => {
  const error = new AxiosError("Request failed");
  error.response = { status, data: { errors: [{ message }] } } as never;
  return error;
};

describe("validateCloudflareConnectionCredentials", () => {
  const getRequest = vi.mocked(safeRequest.get);

  beforeEach(() => {
    getRequest.mockReset();
  });

  it("keeps account-details validation for tokens that have account access", async () => {
    getRequest.mockResolvedValueOnce({ data: { result: { id: "account-id" } } } as never);

    await expect(validateCloudflareConnectionCredentials(config)).resolves.toEqual(config.credentials);

    expect(getRequest).toHaveBeenCalledTimes(1);
    expect(getRequest).toHaveBeenCalledWith(accountUrl, {
      headers: { Authorization: "Bearer test-token", Accept: "application/json" }
    });
  });

  it("accepts account-owned tokens that can access Workers but not account details", async () => {
    getRequest
      .mockRejectedValueOnce(axiosError(403, "Unauthorized to access requested resource"))
      .mockResolvedValueOnce({ data: { result: [] } } as never);

    await expect(validateCloudflareConnectionCredentials(config)).resolves.toEqual(config.credentials);

    expect(getRequest).toHaveBeenNthCalledWith(2, workersScriptsUrl, {
      headers: { Authorization: "Bearer test-token", Accept: "application/json" },
      params: { per_page: 1 }
    });
  });

  it("does not retry account-details not-found responses against the Workers API", async () => {
    getRequest.mockRejectedValueOnce(axiosError(404, "Account not found"));

    await expect(validateCloudflareConnectionCredentials(config)).rejects.toMatchObject({
      message: "Failed to validate credentials: Account not found"
    });

    expect(getRequest).toHaveBeenCalledTimes(1);
  });

  it("reports the Workers API error when a token is denied by both checks", async () => {
    getRequest
      .mockRejectedValueOnce(axiosError(403, "Account access denied"))
      .mockRejectedValueOnce(axiosError(403, "Workers access denied"));

    await expect(validateCloudflareConnectionCredentials(config)).rejects.toMatchObject({
      message: "Failed to validate credentials: Workers access denied"
    });
  });
});
