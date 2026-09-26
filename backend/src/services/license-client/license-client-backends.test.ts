import { afterEach, describe, expect, test, vi } from "vitest";

import { licenseServerBackend } from "./license-client-backends";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock("jsonwebtoken", () => ({
  default: { sign: () => "service-token" }
}));

const SERVER_URL = "https://license.example.com";
const ORG_ID = "org-1";

const mockFetchReturning = (body: unknown) =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body
  })) as unknown as typeof fetch;

const readBody = (fetchMock: typeof fetch): Record<string, unknown> =>
  JSON.parse(vi.mocked(fetchMock).mock.calls[0][1]?.body as string) as Record<string, unknown>;

// Region is insert-only on the license server: it is read only by the call that creates the license,
// so every license-creating call has to carry this deployment's region or the org is recorded as "us".
describe("licenseServerBackend region on license-creating calls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("buyProduct sends the deployment region alongside the payload", async () => {
    const fetchMock = mockFetchReturning({ outcome: "subscription_updated" });
    vi.stubGlobal("fetch", fetchMock);

    await licenseServerBackend(SERVER_URL, "key", "eu").buyProduct(ORG_ID, { productId: "boost", plan: "pro" });

    expect(readBody(fetchMock)).toMatchObject({ productId: "boost", plan: "pro", region: "eu" });
  });

  test("changeCommitments sends the deployment region alongside the payload", async () => {
    const fetchMock = mockFetchReturning({ outcome: "subscription_updated" });
    vi.stubGlobal("fetch", fetchMock);

    await licenseServerBackend(SERVER_URL, "key", "eu").changeCommitments(ORG_ID, {
      productId: "boost",
      dimensions: []
    });

    expect(readBody(fetchMock)).toMatchObject({ productId: "boost", region: "eu" });
  });

  test("startTrial sends the deployment region alongside the payload", async () => {
    const fetchMock = mockFetchReturning({ outcome: "trial_started" });
    vi.stubGlobal("fetch", fetchMock);

    await licenseServerBackend(SERVER_URL, "key", "eu").startTrial(ORG_ID, {
      productKey: "boost",
      planKey: "pro"
    });

    expect(readBody(fetchMock)).toMatchObject({ product_key: "boost", plan_key: "pro", region: "eu" });
  });

  test("omits region entirely when the deployment has none configured", async () => {
    const fetchMock = mockFetchReturning({ outcome: "subscription_updated" });
    vi.stubGlobal("fetch", fetchMock);

    await licenseServerBackend(SERVER_URL, "key").buyProduct(ORG_ID, { productId: "boost", plan: "pro" });

    expect(readBody(fetchMock)).not.toHaveProperty("region");
  });
});

describe("licenseServerBackend confirmTrialPayment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("posts the return URL to the org's trial confirm-payment endpoint", async () => {
    const fetchMock = mockFetchReturning({
      outcome: "checkout_created",
      checkoutUrl: "https://checkout.stripe.com/c/1"
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await licenseServerBackend(SERVER_URL, "key", "eu").confirmTrialPayment(ORG_ID, {
      returnUrl: "https://app.infisical.com/organizations/org-1/billing"
    });

    const [url, init] = vi.mocked(fetchMock).mock.calls[0];
    expect(String(url)).toBe(`${SERVER_URL}/v1/organizations/${ORG_ID}/subscription/trials/confirm-payment`);
    expect(init?.method).toBe("POST");
    expect(readBody(fetchMock)).toEqual({ returnUrl: "https://app.infisical.com/organizations/org-1/billing" });
    expect(result).toMatchObject({ outcome: "checkout_created", checkoutUrl: "https://checkout.stripe.com/c/1" });
  });
});

describe("licenseServerBackend payment_action_required", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("changeCommitments accepts the approval outcome and its payment URL", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchReturning({
        outcome: "payment_action_required",
        paymentUrl: "https://invoice.stripe.com/i/1",
        subscriptionId: "sub_1",
        request_id: "req-1"
      })
    );

    const result = await licenseServerBackend(SERVER_URL, "key").changeCommitments(ORG_ID, {
      productId: "boost",
      dimensions: []
    });

    expect(result).toMatchObject({ outcome: "payment_action_required", paymentUrl: "https://invoice.stripe.com/i/1" });
  });

  test("upgradeProduct accepts the approval outcome", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchReturning({ outcome: "payment_action_required", paymentUrl: "https://invoice.stripe.com/i/1" })
    );

    const result = await licenseServerBackend(SERVER_URL, "key").upgradeProduct(ORG_ID, {
      productId: "boost",
      plan: "enterprise",
      expectedPlanVersionId: "v1"
    });

    expect(result.outcome).toBe("payment_action_required");
  });
});
