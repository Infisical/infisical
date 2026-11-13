import { afterEach, describe, expect, test, vi } from "vitest";

import { LicenseServerClient, TLicenseServerConnection } from "./client";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock("jsonwebtoken", () => ({
  default: { sign: () => "service-token" }
}));

const SERVER_URL = "https://license.example.com";
const ORG_ID = "org-1";

const cloud = (region?: string): TLicenseServerConnection => ({
  serverUrl: SERVER_URL,
  auth: { getToken: async () => "service-token" },
  isSelfHosted: false,
  reportsUsage: true,
  region
});

const selfHosted = (auth: TLicenseServerConnection["auth"] = { getToken: async () => "license-token" }) =>
  new LicenseServerClient({ serverUrl: SERVER_URL, auth, isSelfHosted: true, reportsUsage: true, region: "eu" });

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const stubFetch = (status: number, body: unknown, headers: Record<string, string> = {}) => {
  const fetchMock = vi.fn(async () => respond(status, body, headers));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const sent = (fetchMock: ReturnType<typeof vi.fn>, call = 0) => {
  const [url, init] = fetchMock.mock.calls[call] as [URL, RequestInit];
  return {
    url: new URL(String(url)),
    method: init.method,
    authorization: (init.headers as Record<string, string>).Authorization,
    body: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LicenseServerClient.getEntitlements", () => {
  test("should ask cloud for the org with its name, slug and the deployment region", async () => {
    // Setup
    const fetchMock = stubFetch(200, { slug: "pro", features: {} });

    // Action
    await new LicenseServerClient(cloud("eu")).getEntitlements({ id: ORG_ID, name: "Acme", slug: "acme" });

    // Assert
    const request = sent(fetchMock);
    expect(request.url.pathname).toBe(`/v1/organizations/${ORG_ID}/entitlements`);
    expect(Object.fromEntries(request.url.searchParams)).toEqual({ org_name: "Acme", org_slug: "acme", region: "eu" });
    expect(request.authorization).toBe("Bearer service-token");
  });

  test("should leave out a name, slug and region it was not given", async () => {
    // Setup
    const fetchMock = stubFetch(200, { slug: "pro", features: {} });

    // Action
    await new LicenseServerClient(cloud()).getEntitlements({ id: ORG_ID });

    // Assert
    expect([...sent(fetchMock).url.searchParams.keys()]).toEqual([]);
  });

  test("should ask a self-hosted license for its own entitlements, with no org", async () => {
    // Setup
    const fetchMock = stubFetch(200, { slug: "enterprise", features: {} });

    // Action
    await selfHosted().getEntitlements({ id: "self-hosted", name: "Acme" });

    // Assert
    const request = sent(fetchMock);
    expect(request.url.pathname).toBe("/v1/entitlements");
    expect(Object.fromEntries(request.url.searchParams)).toEqual({ region: "eu" });
    expect(request.authorization).toBe("Bearer license-token");
  });

  test("should ask the License Server on every read, with no cache of its own", async () => {
    // Setup
    const fetchMock = stubFetch(200, { slug: "pro", features: {} });
    const client = new LicenseServerClient(cloud());

    // Action
    await client.getEntitlements({ id: ORG_ID });
    await client.getEntitlements({ id: ORG_ID });

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("should return null when the License Server cannot be reached", async () => {
    // Setup
    vi.stubGlobal("fetch", async () => {
      throw new Error("license server unreachable");
    });

    // Action
    const result = await new LicenseServerClient(cloud()).getEntitlements({ id: ORG_ID });

    // Assert
    expect(result).toBeNull();
  });

  test("should return null and refuse changes when no License Server is configured", async () => {
    // Setup
    const client = new LicenseServerClient(null);

    // Action
    const result = await client.getEntitlements({ id: ORG_ID });

    // Assert
    expect(result).toBeNull();
    await expect(client.deleteOrganization(ORG_ID)).rejects.toThrow("the License Server is not configured");
  });
});

describe("LicenseServerClient on a self-hosted license", () => {
  test("should drop an expired token and retry once with a fresh one", async () => {
    // Setup
    const tokens = ["expired-token", "fresh-token"];
    const invalidate = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(401, {}))
      .mockResolvedValueOnce(respond(200, { slug: "enterprise", features: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const client = selfHosted({ getToken: async () => tokens.shift() ?? "", invalidate });

    // Action
    const result = await client.getEntitlements({ id: "self-hosted" });

    // Assert
    expect(result).toMatchObject({ slug: "enterprise" });
    expect(invalidate).toHaveBeenCalledOnce();
    expect(sent(fetchMock, 1).authorization).toBe("Bearer fresh-token");
  });

  test("should read its catalog and subscription without an org", async () => {
    // Setup
    const fetchMock = stubFetch(404, {});
    const client = selfHosted();

    // Action
    await client.getCatalog("self-hosted").catch(() => undefined);
    const subscription = await client.getSubscription("self-hosted");

    // Assert
    expect(sent(fetchMock, 0).url.pathname).toBe("/v1/products");
    expect(sent(fetchMock, 1).url.pathname).toBe("/v1/subscription");
    expect(subscription).toBeNull();
  });

  test("should refuse billing without calling the License Server", async () => {
    // Setup
    const fetchMock = stubFetch(200, {});

    // Action
    const result = selfHosted().buyProduct("self-hosted", { productId: "boost", plan: "pro" });

    // Assert
    await expect(result).rejects.toThrow("billing isn't available for self-hosted licenses");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("LicenseServerClient.fromConfig", () => {
  test.each([
    ["self-hosted", { LICENSE_KEY: "key" }],
    ["cloud", { LICENSE_SERVER_V2_SERVICE_KEY: "signing-key" }]
  ])("should use a plain-http %s License Server outside development, but not report usage to it", (_mode, keys) => {
    // Setup + Action
    const client = LicenseServerClient.fromConfig({
      envConfig: { LICENSE_SERVER_URL: "http://license.example.com", ...keys },
      isOffline: false
    });

    // Assert
    expect(client.isEnabled()).toBe(true);
    expect(client.canReportUsage()).toBe(false);
  });

  test("should report usage to an https License Server", () => {
    // Setup + Action
    const client = LicenseServerClient.fromConfig({
      envConfig: { LICENSE_SERVER_URL: SERVER_URL, LICENSE_KEY: "key" },
      isOffline: false
    });

    // Assert
    expect(client.isEnabled()).toBe(true);
    expect(client.canReportUsage()).toBe(true);
  });

  test("should not call a cloud License Server whose URL isn't http(s)", () => {
    // Setup + Action
    const client = LicenseServerClient.fromConfig({
      envConfig: { LICENSE_SERVER_URL: "ftp://license.example.com", LICENSE_SERVER_V2_SERVICE_KEY: "signing-key" },
      isOffline: false
    });

    // Assert
    expect(client.isEnabled()).toBe(false);
  });

  test("should stay dormant on an offline license", () => {
    // Setup + Action
    const client = LicenseServerClient.fromConfig({
      envConfig: { LICENSE_SERVER_URL: SERVER_URL, LICENSE_KEY: "offline-key" },
      isOffline: true
    });

    // Assert
    expect(client.isEnabled()).toBe(false);
  });
});

// Region is insert-only on the license server, so every license-creating call must send it or the org lands in "us".
describe("LicenseServerClient region on license-creating calls", () => {
  test("buyProduct sends the deployment region alongside the payload", async () => {
    const fetchMock = stubFetch(200, { outcome: "subscription_updated" });

    await new LicenseServerClient(cloud("eu")).buyProduct(ORG_ID, { productId: "boost", plan: "pro" });

    expect(sent(fetchMock).body).toMatchObject({ productId: "boost", plan: "pro", region: "eu" });
  });

  test("changeCommitments sends the deployment region alongside the payload", async () => {
    const fetchMock = stubFetch(200, { outcome: "subscription_updated" });

    await new LicenseServerClient(cloud("eu")).changeCommitments(ORG_ID, { productId: "boost", dimensions: [] });

    expect(sent(fetchMock).body).toMatchObject({ productId: "boost", region: "eu" });
  });

  test("startTrial sends the deployment region alongside the payload", async () => {
    const fetchMock = stubFetch(200, { outcome: "trial_started" });

    await new LicenseServerClient(cloud("eu")).startTrial(ORG_ID, { productKey: "boost", planKey: "pro" });

    expect(sent(fetchMock).body).toMatchObject({ product_key: "boost", plan_key: "pro", region: "eu" });
  });

  test("omits region entirely when the deployment has none configured", async () => {
    const fetchMock = stubFetch(200, { outcome: "subscription_updated" });

    await new LicenseServerClient(cloud()).buyProduct(ORG_ID, { productId: "boost", plan: "pro" });

    expect(sent(fetchMock).body).not.toHaveProperty("region");
  });
});

describe("LicenseServerClient.confirmTrialPayment", () => {
  const returnUrl = "https://app.infisical.com/organizations/org-1/billing";

  test("posts the return URL to the org's trial confirm-payment endpoint", async () => {
    const fetchMock = stubFetch(200, { outcome: "checkout_created", checkoutUrl: "https://checkout.stripe.com/c/1" });

    const result = await new LicenseServerClient(cloud("eu")).confirmTrialPayment(ORG_ID, { returnUrl });

    const request = sent(fetchMock);
    expect(request.url.toString()).toBe(`${SERVER_URL}/v1/organizations/${ORG_ID}/subscription/trials/confirm-payment`);
    expect(request.method).toBe("POST");
    expect(request.body).toEqual({ returnUrl });
    expect(result).toMatchObject({ outcome: "checkout_created", checkoutUrl: "https://checkout.stripe.com/c/1" });
  });

  test("accepts an upgrade trial's held change and its payment URL", async () => {
    stubFetch(200, { outcome: "payment_action_required", paymentUrl: "https://invoice.stripe.com/i/1" });

    const result = await new LicenseServerClient(cloud()).confirmTrialPayment(ORG_ID, { returnUrl });

    expect(result).toMatchObject({ outcome: "payment_action_required", paymentUrl: "https://invoice.stripe.com/i/1" });
  });

  test("rejects an outcome without the URL it needs", async () => {
    stubFetch(200, { outcome: "payment_action_required" });

    await expect(new LicenseServerClient(cloud()).confirmTrialPayment(ORG_ID, { returnUrl })).rejects.toThrow();
  });

  test("accepts an upgrade trial that converted without needing approval", async () => {
    stubFetch(200, { outcome: "upgraded" });

    const result = await new LicenseServerClient(cloud()).confirmTrialPayment(ORG_ID, { returnUrl });

    expect(result.outcome).toBe("upgraded");
  });
});

describe("LicenseServerClient payment_action_required", () => {
  test("changeCommitments accepts the approval outcome and its payment URL", async () => {
    stubFetch(200, {
      outcome: "payment_action_required",
      paymentUrl: "https://invoice.stripe.com/i/1",
      subscriptionId: "sub_1",
      request_id: "req-1"
    });

    const result = await new LicenseServerClient(cloud()).changeCommitments(ORG_ID, {
      productId: "boost",
      dimensions: []
    });

    expect(result).toMatchObject({ outcome: "payment_action_required", paymentUrl: "https://invoice.stripe.com/i/1" });
  });

  test("upgradeProduct accepts the approval outcome", async () => {
    stubFetch(200, { outcome: "payment_action_required", paymentUrl: "https://invoice.stripe.com/i/1" });

    const result = await new LicenseServerClient(cloud()).upgradeProduct(ORG_ID, {
      productId: "boost",
      plan: "enterprise",
      expectedPlanVersionId: "v1"
    });

    expect(result.outcome).toBe("payment_action_required");
  });
});

describe("LicenseServerClient rejected billing requests", () => {
  test.each([
    {
      code: "change_awaiting_payment",
      want: "You have a payment waiting for your bank's approval. Complete it from the banner above before making another change."
    },
    { code: "lock_held", want: "Another billing change is in progress. Please try again in a moment." }
  ])("$code is shown as customer copy, not the server's wording", async ({ code, want }) => {
    stubFetch(409, { error: "BadRequest", message: "server wording", details: { code } }, { "x-request-id": "req-1" });

    await expect(
      new LicenseServerClient(cloud()).upgradeProduct(ORG_ID, {
        productId: "boost",
        plan: "enterprise",
        expectedPlanVersionId: "v1"
      })
    ).rejects.toThrow(want);
  });
});

describe("LicenseServerClient.deleteOrganization", () => {
  test("calls DELETE on the org and returns what the license server closed", async () => {
    const fetchMock = stubFetch(200, {
      licensesClosed: 1,
      canceledSubscriptionIds: ["sub_1"],
      commitmentForfeited: true
    });

    const result = await new LicenseServerClient(cloud()).deleteOrganization(ORG_ID);

    const request = sent(fetchMock);
    expect(request.url.toString()).toBe(`${SERVER_URL}/v1/organizations/${ORG_ID}`);
    expect(request.method).toBe("DELETE");
    expect(result).toMatchObject({ licensesClosed: 1, canceledSubscriptionIds: ["sub_1"], commitmentForfeited: true });
  });

  test("gives up on a stalled license server so the outbox can retry it", async () => {
    const controller = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetchMock = vi.fn(
      (_url: URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) reject(init.signal.reason);
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const call = new LicenseServerClient(cloud()).deleteOrganization(ORG_ID);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

    await expect(call).rejects.toMatchObject({ name: "TimeoutError" });
    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
  });
});

const OBSERVED_AT = new Date("2026-01-01T00:00:00.000Z");
const SNAPSHOT = { dimensionKey: "active_certs", value: 9, observedAt: OBSERVED_AT, source: "cloud" as const };
const EVENT = { eventId: "e1", dimensionKey: "signatures", quantity: 2, occurredAt: OBSERVED_AT.toISOString() };

describe("LicenseServerClient.reportSnapshot", () => {
  test("should post the snapshot in the server's shape, keyed by when it was counted", async () => {
    // Setup
    const fetchMock = stubFetch(200, {});

    // Action
    const outcome = await new LicenseServerClient(cloud()).reportSnapshot(ORG_ID, SNAPSHOT);

    // Assert
    expect(outcome).toBe("reported");
    const request = sent(fetchMock);
    expect(request.url.toString()).toBe(`${SERVER_URL}/v1/organizations/${ORG_ID}/usage-snapshots`);
    expect(request.body).toEqual({
      snapshots: [
        {
          dimension_key: "active_certs",
          value: 9,
          observed_at: "2026-01-01T00:00:00.000Z",
          idempotency_key: `cloud:${ORG_ID}:active_certs:${OBSERVED_AT.getTime()}`,
          source: "cloud"
        }
      ]
    });
  });

  test("should report nothing and succeed when no License Server is configured", async () => {
    // Setup
    const fetchMock = stubFetch(200, {});

    // Action
    const outcome = await new LicenseServerClient(null).reportSnapshot(ORG_ID, SNAPSHOT);

    // Assert
    expect(outcome).toBe("reported");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    [404, "license not found", "no-license"],
    [422, "dimension is not priced by any active product on this license", "not-priced"]
  ])("should answer a %i '%s' as the final outcome %s", async (status, message, expected) => {
    // Setup
    stubFetch(status, { message });

    // Action
    const outcome = await new LicenseServerClient(cloud()).reportSnapshot(ORG_ID, SNAPSHOT);

    // Assert
    expect(outcome).toBe(expected);
  });

  test.each([
    [404, "organization not found"],
    [422, "value must be a non-negative integer"],
    [500, "boom"]
  ])("should throw a %i '%s', so the caller retries", async (status, message) => {
    // Setup
    stubFetch(status, { message });

    // Action
    const result = new LicenseServerClient(cloud()).reportSnapshot(ORG_ID, SNAPSHOT);

    // Assert
    await expect(result).rejects.toThrow(`usage report failed with ${status}`);
  });
});

describe("LicenseServerClient.reportEvents", () => {
  test("should post events in the server's shape and count what it accepted and deduped", async () => {
    // Setup
    const fetchMock = stubFetch(200, {
      results: [
        { event_id: "e1", status: "accepted" },
        { event_id: "e2", status: "deduped" }
      ]
    });

    // Action
    const outcome = await new LicenseServerClient(cloud()).reportEvents(
      ORG_ID,
      [EVENT, { ...EVENT, eventId: "e2" }],
      "self-hosted"
    );

    // Assert
    expect(outcome).toEqual({ status: "reported", accepted: 1, deduped: 1 });
    expect((sent(fetchMock).body as { events: unknown[] }).events[0]).toEqual({
      event_id: "e1",
      dimension_key: "signatures",
      quantity: 2,
      occurred_at: "2026-01-01T00:00:00.000Z",
      source: "self-hosted"
    });
  });

  test.each([
    [422, "not metered"],
    [404, "license not found"]
  ])("should answer a %i '%s' as a rejected batch", async (status, message) => {
    // Setup
    stubFetch(status, { message });

    // Action
    const outcome = await new LicenseServerClient(cloud()).reportEvents(ORG_ID, [EVENT], "cloud");

    // Assert
    expect(outcome).toEqual({ status: "rejected", reason: `${status} ${message}` });
  });

  test("should not send usage when reporting is off", async () => {
    // Setup
    const fetchMock = stubFetch(200, {});
    const client = new LicenseServerClient({ ...cloud(), reportsUsage: false });

    // Action
    const outcome = await client.reportEvents(ORG_ID, [EVENT], "cloud");

    // Assert
    expect(outcome).toEqual({ status: "reported", accepted: 0, deduped: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("should throw any other failure, so the caller retries", async () => {
    // Setup
    stubFetch(503, { message: "unavailable" });

    // Action
    const result = new LicenseServerClient(cloud()).reportEvents(ORG_ID, [EVENT], "cloud");

    // Assert
    await expect(result).rejects.toThrow("usage report failed with 503");
  });
});
