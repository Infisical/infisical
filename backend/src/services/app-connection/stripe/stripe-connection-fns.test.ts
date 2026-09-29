import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { postMock, decryptMock, encryptMock } = vi.hoisted(() => ({
  postMock: vi.fn<(url: string, body?: unknown, config?: unknown) => Promise<unknown>>(),
  decryptMock: vi.fn<() => Promise<unknown>>(),
  encryptMock: vi.fn(async ({ credentials }: { credentials: unknown }) => ({ encrypted: credentials }))
}));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ INF_APP_CONNECTION_STRIPE_SECRET_KEY: "sk_test_app" })
}));
vi.mock("@app/lib/config/request", () => ({
  request: { post: postMock, get: vi.fn() }
}));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnectionCredentials: decryptMock,
  encryptAppConnectionCredentials: encryptMock
}));

// eslint-disable-next-line import/first
import { AppConnection } from "../app-connection-enums";
// eslint-disable-next-line import/first
import { assertStripeConnectionAuthorized } from "./stripe-connection-fns";

const storedCredentials = (overrides: Record<string, unknown> = {}) => ({
  accountId: "acct_123",
  refreshToken: "rt_old",
  ...overrides
});

const appConnectionDAL = {
  findById: vi.fn(async () => ({
    id: "connection-id",
    app: AppConnection.Stripe,
    orgId: "org-id",
    projectId: null,
    encryptedCredentials: Buffer.from("")
  })),
  updateById: vi.fn(async () => ({}))
};

const authorize = () =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  assertStripeConnectionAuthorized("connection-id", appConnectionDAL as any, {} as any);

const oauthError = (status: number, error: string, description: string) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: {} as never,
    data: { error, error_description: description }
  });

const invalidGrant = () => oauthError(400, "invalid_grant", "Refresh token revoked");

const refreshed = (refreshToken: string, accountId = "acct_123") => ({
  data: { access_token: "rk_unused", refresh_token: refreshToken, account_id: accountId }
});

const sentRefreshToken = (call: number) => (postMock.mock.calls[call][1] as URLSearchParams).get("refresh_token");

describe("assertStripeConnectionAuthorized", () => {
  beforeEach(() => {
    postMock.mockReset();
    decryptMock.mockReset();
    encryptMock.mockClear();
    appConnectionDAL.findById.mockClear();
    appConnectionDAL.updateById.mockClear();
  });

  it("refreshes on every call and stores only the account and the new refresh token", async () => {
    decryptMock.mockResolvedValue(storedCredentials());
    postMock.mockResolvedValue(refreshed("rt_new"));

    await authorize();
    await authorize();

    expect(postMock).toHaveBeenCalledTimes(2);
    expect((postMock.mock.calls[0][1] as URLSearchParams).get("grant_type")).toBe("refresh_token");
    expect(sentRefreshToken(0)).toBe("rt_old");
    expect(encryptMock.mock.calls[0][0].credentials).toEqual({ accountId: "acct_123", refreshToken: "rt_new" });
    expect(appConnectionDAL.updateById).toHaveBeenCalledWith("connection-id", expect.anything());
  });

  it("retries with the token a concurrent refresh stored when its own spent one is rejected", async () => {
    decryptMock
      .mockResolvedValueOnce(storedCredentials())
      .mockResolvedValueOnce(storedCredentials({ refreshToken: "rt_raced" }));
    postMock.mockRejectedValueOnce(invalidGrant()).mockResolvedValueOnce(refreshed("rt_after_race"));

    await authorize();

    expect(sentRefreshToken(1)).toBe("rt_raced");
    expect(encryptMock.mock.calls[0][0].credentials).toEqual({ accountId: "acct_123", refreshToken: "rt_after_race" });
  });

  it("stays revoked after an uninstall, even when a concurrent refresh stored a newer token", async () => {
    decryptMock
      .mockResolvedValueOnce(storedCredentials())
      .mockResolvedValueOnce(storedCredentials({ refreshToken: "rt_raced" }));
    postMock.mockRejectedValue(invalidGrant());

    await expect(authorize()).rejects.toThrow(/no longer authorized on Stripe account 'acct_123'/);
    expect(appConnectionDAL.updateById).not.toHaveBeenCalled();
  });

  it("asks for a reinstall when the refresh token was revoked", async () => {
    decryptMock.mockResolvedValue(storedCredentials());
    postMock.mockRejectedValue(invalidGrant());

    await expect(authorize()).rejects.toThrow(
      /Infisical is no longer authorized on Stripe account 'acct_123': Refresh token revoked\. This happens when the Infisical app is uninstalled/
    );
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("does not blame an uninstall for a Stripe outage", async () => {
    decryptMock.mockResolvedValue(storedCredentials());
    postMock.mockRejectedValue(oauthError(503, "api_error", "Service unavailable"));

    await expect(authorize()).rejects.toThrow(
      "Infisical could not confirm its access to Stripe account 'acct_123': Service unavailable"
    );
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("refuses tokens Stripe issued for a different account", async () => {
    decryptMock.mockResolvedValue(storedCredentials());
    postMock.mockResolvedValue(refreshed("rt_other", "acct_other"));

    await expect(authorize()).rejects.toThrow(/bound to 'acct_123'/);
    expect(appConnectionDAL.updateById).not.toHaveBeenCalled();
  });
});
