import { AxiosError } from "axios";
import RE2 from "re2";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ INF_APP_CONNECTION_STRIPE_SECRET_KEY: "sk_test_app" })
}));

// eslint-disable-next-line import/first
import { InternalServerError } from "@app/lib/errors";

// eslint-disable-next-line import/first
import {
  getStripeAppRequestConfig,
  getStripeErrorMessage,
  getStripeErrorStatus,
  getStripeMerchantRequestConfig,
  STRIPE_PREVIEW_API_VERSION,
  throwStripeApiKeyManagementError,
  withIdempotencyKey
} from "./stripe-connection-public-client";

const UUID_PATTERN = new RE2("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");

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
  it("authenticates as the app and names the account", () => {
    const config = getStripeAppRequestConfig("acct_123");

    expect(config.headers).toEqual({
      Authorization: "Bearer sk_test_app",
      "Stripe-Version": STRIPE_PREVIEW_API_VERSION,
      "Stripe-Context": "acct_123"
    });
  });

  it("authenticates as a merchant key without context or preview version", () => {
    const config = getStripeMerchantRequestConfig("rk_test_merchant");

    expect(config.headers).toEqual({ Authorization: "Bearer rk_test_merchant" });
  });

  it("adds an idempotency key without dropping existing headers", () => {
    const config = withIdempotencyKey(getStripeAppRequestConfig("acct_123"));
    const idempotencyKey = config.headers?.["Idempotency-Key"] as string;

    expect(config.headers?.["Stripe-Context"]).toBe("acct_123");
    expect(UUID_PATTERN.test(idempotencyKey), `expected a UUID, got "${idempotencyKey}"`).toBe(true);
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
