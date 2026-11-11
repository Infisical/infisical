import { AxiosError, AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pkcs11js", () => ({
  default: class {},
  PKCS11: class {}
}));

const { safeRequestGetMock } = vi.hoisted(() => ({
  safeRequestGetMock: vi.fn()
}));

vi.mock("@app/lib/validator", () => ({
  safeRequest: {
    get: (...args: unknown[]) => safeRequestGetMock(...args)
  }
}));

vi.mock("@app/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { CloudflareConnectionMethod } from "./cloudflare-connection-enum";
import { validateCloudflareConnectionCredentials } from "./cloudflare-connection-fns";
import { TCloudflareConnectionConfig } from "./cloudflare-connection-types";

describe("validateCloudflareConnectionCredentials", () => {
  const credentials = {
    accountId: "test-account-id",
    apiToken: "test-api-token"
  };

  const config: TCloudflareConnectionConfig = {
    app: AppConnection.Cloudflare,
    method: CloudflareConnectionMethod.APIToken,
    orgId: "org-1",
    credentials
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully validates an account-owned Cloudflare API token", async () => {
    safeRequestGetMock.mockResolvedValueOnce({
      data: {
        success: true,
        result: {
          id: "token-id",
          status: "active"
        }
      }
    });

    const result = await validateCloudflareConnectionCredentials(config);

    expect(result).toEqual(credentials);
    expect(safeRequestGetMock).toHaveBeenCalledTimes(1);
    expect(safeRequestGetMock).toHaveBeenCalledWith(
      expect.stringContaining("/client/v4/accounts/test-account-id/tokens/verify"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-token"
        })
      })
    );
  });

  it("successfully validates a user-owned Cloudflare API token when account-level verification fails", async () => {
    // 1. Account-owned endpoint rejects user token (401 Unauthorized)
    safeRequestGetMock.mockRejectedValueOnce(
      new AxiosError("Unauthorized", "401", undefined, undefined, {
        status: 401,
        data: { errors: [{ message: "Unauthorized to access requested resource" }] }
      } as AxiosResponse)
    );

    // 2. User-owned endpoint verifies the token
    safeRequestGetMock.mockResolvedValueOnce({
      data: {
        success: true,
        result: {
          id: "user-token-id",
          status: "active"
        }
      }
    });

    const result = await validateCloudflareConnectionCredentials(config);

    expect(result).toEqual(credentials);
    expect(safeRequestGetMock).toHaveBeenCalledTimes(2);
    expect(safeRequestGetMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/client/v4/user/tokens/verify"),
      expect.any(Object)
    );
  });

  it("falls back to account details endpoint if token verify endpoints are not accessible", async () => {
    safeRequestGetMock.mockRejectedValueOnce(new AxiosError("Forbidden", "403"));
    safeRequestGetMock.mockRejectedValueOnce(new AxiosError("Forbidden", "403"));
    safeRequestGetMock.mockResolvedValueOnce({
      data: {
        result: { id: "test-account-id", name: "Account Name" }
      }
    });

    const result = await validateCloudflareConnectionCredentials(config);

    expect(result).toEqual(credentials);
    expect(safeRequestGetMock).toHaveBeenCalledTimes(3);
    expect(safeRequestGetMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/client/v4/accounts/test-account-id"),
      expect.any(Object)
    );
  });

  it("rejects when the token status is disabled or expired", async () => {
    safeRequestGetMock.mockResolvedValueOnce({
      data: {
        success: true,
        result: {
          id: "token-id",
          status: "disabled"
        }
      }
    });

    await expect(validateCloudflareConnectionCredentials(config)).rejects.toThrow(
      "Unable to validate connection: Cloudflare API token is disabled."
    );
  });

  it("rejects with Cloudflare error message when all verification paths fail with AxiosError", async () => {
    const errorResponse = {
      status: 401,
      data: { errors: [{ message: "Invalid API token" }] }
    } as AxiosResponse;

    safeRequestGetMock.mockRejectedValue(new AxiosError("Unauthorized", "401", undefined, undefined, errorResponse));

    await expect(validateCloudflareConnectionCredentials(config)).rejects.toThrow(
      "Failed to validate credentials: Invalid API token"
    );
  });
});
