import { TEntitlementOrg, TEntitlementsResponse } from "../../ce/service/license-server-types/license-server-types";
import { TLicenseClientBackend } from "./license-server-backends";
import { LicenseServerClient } from "./license-server-client";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";

const entitlements = { slug: "enterprise", features: {}, products: [] } as unknown as TEntitlementsResponse;

// A backend that records the orgs it was asked about, and fails when told to.
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
    expect(() => client.cancelSubscription(ORG_ID)).toThrow("license client backend is not configured");
  });
});
