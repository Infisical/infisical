import { TEntitlementOrg, TEntitlementsResponse } from "../../ce/service/license-server-types/license-server-types";
import { TLicenseClientBackend } from "./license-server-backends";
import { LicenseServerClient } from "./license-server-client";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";

const entitlements = { slug: "enterprise", features: {}, products: [] } as unknown as TEntitlementsResponse;

const stubBackend = ({ fail = false } = {}) => {
  const asked: TEntitlementOrg[] = [];
  const backend = {
    fetchEntitlements: async (org: TEntitlementOrg) => {
      asked.push(org);
      if (fail) throw new Error("license server unreachable");
      return entitlements;
    }
  } as unknown as TLicenseClientBackend;
  return { backend, asked };
};

describe("LicenseServerClient.getEntitlements", () => {
  test("should ask the License Server on every read, with no cache of its own", async () => {
    // Setup
    const { backend, asked } = stubBackend();
    const client = new LicenseServerClient(backend, null);

    // Action
    await client.getEntitlements({ id: ORG_ID });
    await client.getEntitlements({ id: ORG_ID });

    // Assert
    expect(asked).toHaveLength(2);
  });

  test("should return null when the License Server cannot be reached", async () => {
    // Setup
    const { backend } = stubBackend({ fail: true });
    const client = new LicenseServerClient(backend, null);

    // Action
    const result = await client.getEntitlements({ id: ORG_ID });

    // Assert
    expect(result).toBeNull();
  });

  test("should return null and refuse changes when no License Server is configured", async () => {
    // Setup
    const client = new LicenseServerClient(null, null);

    // Action
    const result = await client.getEntitlements({ id: ORG_ID });

    // Assert
    expect(result).toBeNull();
    expect(() => client.deleteOrganization(ORG_ID)).toThrow("license client backend is not configured");
  });
});

const USAGE_ENDPOINT = { serverUrl: "https://license.test", getBearerToken: async () => "token" };
const OBSERVED_AT = new Date("2026-01-01T00:00:00.000Z");
const SNAPSHOT = { dimensionKey: "active_certs", value: 9, observedAt: OBSERVED_AT, source: "cloud" as const };
const EVENT = { eventId: "e1", dimensionKey: "signatures", quantity: 2, occurredAt: OBSERVED_AT.toISOString() };

// Answers every usage post with the given status and JSON body, and keeps what was sent.
const stubLicenseServer = (status: number, body: unknown) => {
  const requests: { url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", async (url: URL, init: { body: string }) => {
    requests.push({ url: url.toString(), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(body), { status });
  });
  return requests;
};

describe("LicenseServerClient.reportSnapshot", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("should post the snapshot in the server's shape, keyed by when it was counted", async () => {
    // Setup
    const requests = stubLicenseServer(200, {});
    const client = new LicenseServerClient(null, USAGE_ENDPOINT);

    // Action
    const outcome = await client.reportSnapshot(ORG_ID, SNAPSHOT);

    // Assert
    expect(outcome).toBe("reported");
    expect(requests).toEqual([
      {
        url: `https://license.test/v1/organizations/${ORG_ID}/usage-snapshots`,
        body: {
          snapshots: [
            {
              dimension_key: "active_certs",
              value: 9,
              observed_at: "2026-01-01T00:00:00.000Z",
              idempotency_key: `cloud:${ORG_ID}:active_certs:${OBSERVED_AT.getTime()}`,
              source: "cloud"
            }
          ]
        }
      }
    ]);
  });

  test.each([
    [404, "license not found", "no-license"],
    [422, "dimension is not priced by any active product on this license", "not-priced"]
  ])("should answer a %i '%s' as the final outcome %s", async (status, message, expected) => {
    // Setup
    stubLicenseServer(status, { message });
    const client = new LicenseServerClient(null, USAGE_ENDPOINT);

    // Action
    const outcome = await client.reportSnapshot(ORG_ID, SNAPSHOT);

    // Assert
    expect(outcome).toBe(expected);
  });

  test.each([
    [404, "organization not found"],
    [422, "value must be a non-negative integer"],
    [500, "boom"]
  ])("should throw a %i '%s', so the caller retries", async (status, message) => {
    // Setup
    stubLicenseServer(status, { message });
    const client = new LicenseServerClient(null, USAGE_ENDPOINT);

    // Action
    const result = client.reportSnapshot(ORG_ID, SNAPSHOT);

    // Assert
    await expect(result).rejects.toThrow(`usage report failed with ${status}`);
  });
});

describe("LicenseServerClient.reportEvents", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("should post events in the server's shape and count what it accepted and deduped", async () => {
    // Setup
    const requests = stubLicenseServer(200, {
      results: [
        { event_id: "e1", status: "accepted" },
        { event_id: "e2", status: "deduped" }
      ]
    });
    const client = new LicenseServerClient(null, USAGE_ENDPOINT);

    // Action
    const outcome = await client.reportEvents(ORG_ID, [EVENT, { ...EVENT, eventId: "e2" }], "self-hosted");

    // Assert
    expect(outcome).toEqual({ status: "reported", accepted: 1, deduped: 1 });
    expect((requests[0].body as { events: unknown[] }).events[0]).toEqual({
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
    stubLicenseServer(status, { message });
    const client = new LicenseServerClient(null, USAGE_ENDPOINT);

    // Action
    const outcome = await client.reportEvents(ORG_ID, [EVENT], "cloud");

    // Assert
    expect(outcome).toEqual({ status: "rejected", reason: `${status} ${message}` });
  });

  test("should throw any other failure, so the caller retries", async () => {
    // Setup
    stubLicenseServer(503, { message: "unavailable" });
    const client = new LicenseServerClient(null, USAGE_ENDPOINT);

    // Action
    const result = client.reportEvents(ORG_ID, [EVENT], "cloud");

    // Assert
    await expect(result).rejects.toThrow("usage report failed with 503");
  });
});
