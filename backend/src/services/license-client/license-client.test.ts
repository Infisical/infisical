import { describe, expect, test, vi } from "vitest";

import { featureReaderFactory } from "./feature-reader";
import { AuditRetentionDays, IdentitiesMeter, SsoEnforcement } from "./features";
import { licenseClientFactory } from "./license-client";
import { entitlementResolverFactory } from "./license-client-cache";
import { TEntitlementsResponse } from "./license-client-types";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const LICENSE_ID = "22222222-2222-2222-2222-222222222222";

const makeEntitlements = (features: TEntitlementsResponse["features"]): TEntitlementsResponse => ({
  license_id: LICENSE_ID,
  org_id: ORG_ID,
  account: { sfdc_account_id: "0014x000001abcd", name: "Acme Corp" },
  billing_method: "enterprise_contract",
  deployment_mode: "self_hosted",
  status: "active",
  products: [],
  features,
  refresh_after: "2026-12-31T00:00:00Z",
  etag: "sha256:deadbeef",
  request_id: "req-1"
});

const createFakeKeyStore = () => {
  const store = new Map<string, string>();
  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItemWithExpiry: async (key: string, _ttl: number | string, value: string | number | Buffer) => {
      store.set(key, String(value));
      return "OK" as const;
    },
    deleteItem: async (key: string) => {
      const existed = store.delete(key);
      return existed ? 1 : 0;
    }
  };
};

const createStubBackend = (response: TEntitlementsResponse, opts: { fail?: boolean } = {}) => {
  let calls = 0;
  const orgs: { id: string; name?: string | null; slug?: string | null }[] = [];
  return {
    backend: {
      fetchEntitlements: async (org: { id: string; name?: string | null; slug?: string | null }) => {
        calls += 1;
        orgs.push(org);
        if (opts.fail) {
          throw new Error("license server unreachable");
        }
        return response;
      }
    },
    getCalls: () => calls,
    getOrgs: () => orgs
  };
};

describe("entitlementResolverFactory", () => {
  test("fetches once then serves subsequent reads from the cache", async () => {
    const keyStore = createFakeKeyStore();
    const { backend, getCalls } = createStubBackend(makeEntitlements({ identities: { value: 100, source: "plan" } }));
    const resolver = entitlementResolverFactory({ keyStore, backend });

    const first = await resolver.getEntitlements({ id: ORG_ID });
    expect(first?.features.identities.value).toBe(100);
    expect(getCalls()).toBe(1);

    await resolver.getEntitlements({ id: ORG_ID });
    expect(getCalls()).toBe(1); // served from the cache
  });

  test("returns null when the server is unreachable", async () => {
    const keyStore = createFakeKeyStore();
    const { backend } = createStubBackend(makeEntitlements({}), { fail: true });
    const resolver = entitlementResolverFactory({ keyStore, backend });

    expect(await resolver.getEntitlements({ id: ORG_ID })).toBeNull();
  });

  test("forwards org identity to the backend even after an identity-less call seeded the cache", async () => {
    const keyStore = createFakeKeyStore();
    const { backend, getCalls, getOrgs } = createStubBackend(
      makeEntitlements({ identities: { value: 100, source: "plan" } })
    );
    const resolver = entitlementResolverFactory({ keyStore, backend });

    await resolver.getEntitlements({ id: ORG_ID }); // feature-check style, identity-less
    expect(getCalls()).toBe(1);
    expect(getOrgs()[0]).toEqual({ id: ORG_ID });

    await resolver.getEntitlements({ id: ORG_ID, name: "Acme Corp", slug: "acme" });
    expect(getCalls()).toBe(2); // bypassed the identity-less cache entry
    expect(getOrgs()[1]).toEqual({ id: ORG_ID, name: "Acme Corp", slug: "acme" });
  });

  test("syncs org identity once per ttl window then serves from the cache", async () => {
    const keyStore = createFakeKeyStore();
    const { backend, getCalls } = createStubBackend(makeEntitlements({ identities: { value: 100, source: "plan" } }));
    const resolver = entitlementResolverFactory({ keyStore, backend });

    await resolver.getEntitlements({ id: ORG_ID, name: "Acme Corp", slug: "acme" });
    expect(getCalls()).toBe(1);

    await resolver.getEntitlements({ id: ORG_ID, name: "Acme Corp", slug: "acme" });
    expect(getCalls()).toBe(1); // identity already synced, served from the cache
  });
});

describe("featureReaderFactory", () => {
  test("falls back to the descriptor fallback when no entitlements resolve", async () => {
    const reader = featureReaderFactory({ getEntitlements: async () => null });

    expect((await reader.getFeature(ORG_ID, SsoEnforcement)).value).toBe(false);
    expect((await reader.getFeature(ORG_ID, AuditRetentionDays)).value).toBe(30);
    expect((await reader.getFeature(ORG_ID, IdentitiesMeter)).value).toBe(0);
  });

  test("returns server-resolved values when present", async () => {
    const entitlements = makeEntitlements({
      sso_enforcement: { value: true, source: "plan", from_product: "boost" },
      identities: { value: 100, source: "plan", from_product: "secrets_management" }
    });
    const reader = featureReaderFactory({ getEntitlements: async () => entitlements });

    expect((await reader.getFeature(ORG_ID, SsoEnforcement)).value).toBe(true);
    expect((await reader.getFeature(ORG_ID, IdentitiesMeter)).value).toBe(100);
  });

  test("canUse enforces the cap against a registered counter", async () => {
    const entitlements = makeEntitlements({ identities: { value: 100, source: "plan" } });
    const reader = featureReaderFactory({ getEntitlements: async () => entitlements });
    reader.registerCounter(IdentitiesMeter, async () => 99);

    const limit = await reader.getFeature(ORG_ID, IdentitiesMeter);
    expect(await limit.canUse(1)).toBe(true);
    expect(await limit.canUse(2)).toBe(false);
  });

  test("canUse without a registered counter compares the request against the cap", async () => {
    const entitlements = makeEntitlements({ identities: { value: 100, source: "plan" } });
    const reader = featureReaderFactory({ getEntitlements: async () => entitlements });

    const limit = await reader.getFeature(ORG_ID, IdentitiesMeter);
    expect(await limit.canUse(50)).toBe(true);
    expect(await limit.canUse(101)).toBe(false);
  });
});

// How a consumer uses the client. With the kill switch off, every feature resolves to its fallback.
describe("licenseClientFactory (usage example)", () => {
  const licenseClient = licenseClientFactory({
    envConfig: {
      LICENSE_SERVER_V2_MODE: "off",
      LICENSE_SERVER_V2_URL: undefined,
      LICENSE_SERVER_V2_SERVICE_KEY: undefined,
      INTERNAL_REGION: undefined
    },
    keyStore: createFakeKeyStore()
  });

  // A metered feature needs its live-count source registered once at init.
  licenseClient.registerCounter(IdentitiesMeter, async () => 4);

  test("boolean gate", async () => {
    const sso = await licenseClient.getFeature(ORG_ID, SsoEnforcement);
    if (sso.value) {
      // enforce SSO
    }
    expect(sso.value).toBe(false);
  });

  test("limit gate via canUse", async () => {
    const identities = await licenseClient.getFeature(ORG_ID, IdentitiesMeter);
    // throw a LimitExceededError here in real code
    expect(await identities.canUse(1)).toBe(false); // fallback cap is 0, current is 4
  });
});
