import { AxiosError } from "axios";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ INF_APP_CONNECTION_STRIPE_SECRET_KEY: "sk_test_platform" })
}));

// eslint-disable-next-line import/first
import { InternalServerError } from "@app/lib/errors";

// eslint-disable-next-line import/first
import {
  getStripeErrorMessage,
  getStripeErrorStatus,
  getStripeMerchantRequestConfig,
  getStripePlatformRequestConfig,
  STRIPE_PREVIEW_API_VERSION,
  throwStripeApiKeyManagementError,
  withIdempotencyKey
} from "./stripe-connection-public-client";

const axiosErrorWith = (status: number, data: unknown) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    config: {} as any,
    data
  });

describe("stripe public client", () => {
  it("authenticates as the platform and names the account", () => {
    const config = getStripePlatformRequestConfig("acct_123");

    expect(config.auth).toEqual({ username: "sk_test_platform", password: "" });
    expect(config.headers).toEqual({
      "Stripe-Version": STRIPE_PREVIEW_API_VERSION,
      "Stripe-Context": "acct_123"
    });
  });

  it("authenticates as a merchant key without context or preview version", () => {
    const config = getStripeMerchantRequestConfig("rk_test_merchant");

    expect(config.auth).toEqual({ username: "rk_test_merchant", password: "" });
    expect(config.headers).toBeUndefined();
  });

  it("adds an idempotency key without dropping existing headers", () => {
    const config = withIdempotencyKey(getStripePlatformRequestConfig("acct_123"));

    expect(config.headers?.["Stripe-Context"]).toBe("acct_123");
    expect(config.headers?.["Idempotency-Key"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("reads Stripe's own error message when there is one", () => {
    const error = axiosErrorWith(400, { error: { message: "Invalid permissions: nope" } });

    expect(getStripeErrorMessage(error)).toBe("Invalid permissions: nope");
    expect(getStripeErrorStatus(error)).toBe(400);
  });

  it("falls back to the axios message and handles plain errors", () => {
    expect(getStripeErrorMessage(axiosErrorWith(500, undefined))).toBe("Request failed");
    expect(getStripeErrorMessage(new Error("socket hang up"))).toBe("socket hang up");
    expect(getStripeErrorStatus(new Error("socket hang up"))).toBeUndefined();
  });

  it("wraps an axios error as a Stripe management failure", () => {
    expect(() =>
      throwStripeApiKeyManagementError("acct_123", axiosErrorWith(403, { error: { message: "app removed" } }))
    ).toThrow(/Infisical cannot manage API keys on Stripe account 'acct_123'/);
  });

  it("rethrows a non-axios error as itself instead of blaming Stripe or the installed app", () => {
    const localError = new InternalServerError({ message: "Stripe is not configured on this instance." });

    expect(() => throwStripeApiKeyManagementError("acct_123", localError)).toThrow(localError);
  });
});
