import { describe, expect, test, vi } from "vitest";

import { TEntitlementsResponse } from "../../../ce/model/license-server-types";
import { entitlementResolverFactory } from "./entitlement-resolver";

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
  // Entitlements are no longer cached here — the hot reader (getPlan) caches its projection upstream —
  // so every read hits the backend directly.
  test("fetches from the backend on every read", async () => {
    const keyStore = createFakeKeyStore();
    const { backend, getCalls } = createStubBackend(makeEntitlements({ identities: { value: 100, source: "plan" } }));
    const resolver = entitlementResolverFactory({ keyStore, backend });

    const first = await resolver.getEntitlements({ id: ORG_ID });
    expect(first?.features.identities.value).toBe(100);
    expect(getCalls()).toBe(1);

    await resolver.getEntitlements({ id: ORG_ID });
    expect(getCalls()).toBe(2); // no cache — fetched again
  });

  test("returns null when the server is unreachable", async () => {
    const keyStore = createFakeKeyStore();
    const { backend } = createStubBackend(makeEntitlements({}), { fail: true });
    const resolver = entitlementResolverFactory({ keyStore, backend });

    expect(await resolver.getEntitlements({ id: ORG_ID })).toBeNull();
  });

  test("forwards the org identity to the backend so the license server stays current", async () => {
    const keyStore = createFakeKeyStore();
    const { backend, getOrgs } = createStubBackend(makeEntitlements({ identities: { value: 100, source: "plan" } }));
    const resolver = entitlementResolverFactory({ keyStore, backend });

    await resolver.getEntitlements({ id: ORG_ID, name: "Acme Corp", slug: "acme" });
    expect(getOrgs()[0]).toEqual({ id: ORG_ID, name: "Acme Corp", slug: "acme" });
  });
});
