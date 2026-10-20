import { describe, expect, it } from "vitest";

import { BillingV2BreakdownDimension as D } from "@app/hooks/api/billingV2/types";
import { SubscriptionPlan, SubscriptionPlanTypes } from "@app/hooks/api/subscriptions/types";

import {
  buildOfflineBilling,
  offlineQueryDimensions,
  OfflineUsagePlan,
  resolveOfflineLimit
} from "./billing-v2-offline-usage";

const plan = (overrides: Partial<OfflineUsagePlan> = {}): OfflineUsagePlan => ({
  slug: SubscriptionPlanTypes.Enterprise,
  identityLimit: null as unknown as number,
  maxInternalCas: null,
  maxCertificates: null,
  maxWildcardCertificates: null,
  ...overrides
});

const productPlan = (productKey: string, status: string | null = "active") => ({
  productKey,
  planKey: "enterprise",
  status,
  trialPlanKey: null,
  trialEndsAt: null
});

const usageOf = (totals: Partial<Record<D, number>>) =>
  Object.fromEntries(Object.entries(totals).map(([key, total]) => [key, { total, unit: "unit" }]));

describe("resolveOfflineLimit", () => {
  it("skips the identity cap on an enterprise plan unless the key enforces it", () => {
    expect(resolveOfflineLimit(D.Identities, plan({ identityLimit: 50 }))).toBeNull();
    expect(
      resolveOfflineLimit(D.Identities, plan({ identityLimit: 50, enforceIdentityLimit: true }))
    ).toBe(50);
  });

  it("enforces the identity cap on a non-enterprise plan, and never a 0 or null cap", () => {
    expect(
      resolveOfflineLimit(D.Identities, plan({ slug: SubscriptionPlanTypes.Pro, identityLimit: 5 }))
    ).toBe(5);
    expect(
      resolveOfflineLimit(D.Identities, plan({ identityLimit: 0, enforceIdentityLimit: true }))
    ).toBeNull();
    expect(resolveOfflineLimit(D.Identities, plan({ enforceIdentityLimit: true }))).toBeNull();
  });

  it("pairs the internal-CA count with maxInternalCas only, never the all-types maxCas", () => {
    expect(resolveOfflineLimit(D.InternalCas, plan({ maxInternalCas: 10 }))).toBe(10);
    expect(
      resolveOfflineLimit(D.InternalCas, { ...plan(), maxCas: 1 } as OfflineUsagePlan)
    ).toBeNull();
    expect(resolveOfflineLimit(D.InternalCas, plan())).toBeNull();
  });

  it("treats a 0 PKI cap as a real limit, since the backend refuses every create against it", () => {
    expect(resolveOfflineLimit(D.InternalCas, plan({ maxInternalCas: 0 }))).toBe(0);
    expect(resolveOfflineLimit(D.ActiveCerts, plan({ maxCertificates: 0 }))).toBe(0);
    expect(resolveOfflineLimit(D.WildcardCerts, plan({ maxWildcardCertificates: 0 }))).toBe(0);
  });

  it("maps certificates to their caps", () => {
    expect(resolveOfflineLimit(D.ActiveCerts, plan({ maxCertificates: 100 }))).toBe(100);
    expect(resolveOfflineLimit(D.WildcardCerts, plan({ maxWildcardCertificates: 5 }))).toBe(5);
    expect(resolveOfflineLimit(D.ActiveCerts, plan())).toBeNull();
  });

  it("shows no limit for dimensions without an enforced cap", () => {
    const capped = plan({
      identityLimit: 1,
      enforceIdentityLimit: true,
      maxInternalCas: 1,
      maxCertificates: 1,
      maxWildcardCertificates: 1
    }) as OfflineUsagePlan & Pick<SubscriptionPlan, "memberLimit" | "maxPamAccounts">;
    capped.memberLimit = 1;
    capped.maxPamAccounts = 1;
    expect(resolveOfflineLimit(D.UserIdentities, capped)).toBeNull();
    expect(resolveOfflineLimit(D.SecretIdentities, capped)).toBeNull();
    expect(resolveOfflineLimit(D.PamIdentities, capped)).toBeNull();
  });
});

describe("offlineQueryDimensions", () => {
  it("queries every dimension for a v1 key", () => {
    expect(offlineQueryDimensions(plan())).toHaveLength(7);
  });

  it("skips products a v2 key does not list or lists as churned", () => {
    const keys = offlineQueryDimensions(
      plan({
        productPlans: [
          productPlan("legacy_secret_management"),
          productPlan("cert_management"),
          productPlan("pam", "churned")
        ]
      })
    );
    expect(keys).toEqual([
      D.Identities,
      D.UserIdentities,
      D.InternalCas,
      D.ActiveCerts,
      D.WildcardCerts
    ]);
  });
});

describe("buildOfflineBilling", () => {
  it("shapes a managed overview with every product licensed on a v1 key", () => {
    const { overview, catalog } = buildOfflineBilling(
      plan({ maxInternalCas: 6 }),
      usageOf({ [D.Identities]: 5, [D.UserIdentities]: 1, [D.InternalCas]: 3 })
    );
    expect(overview.mode).toBe("managed");
    expect(overview.selfServe).toBe(false);
    expect(catalog.map((product) => product.id)).toEqual([
      "legacy_secret_management",
      "secrets_manager",
      "cert_management",
      "pam"
    ]);
    expect(overview.billing.activeProductCount).toBe(4);
    const cas = overview.entitlements.cert_management.dimensions?.find(
      (dim) => dim.key === D.InternalCas
    );
    expect(cas).toMatchObject({ used: 3, limit: 6, committed: null, metered: false });
  });

  it("splits the legacy identity meters from the new Secrets Management product", () => {
    const { overview } = buildOfflineBilling(
      plan(),
      usageOf({ [D.Identities]: 5, [D.UserIdentities]: 1, [D.SecretIdentities]: 4 })
    );
    expect(
      overview.entitlements.legacy_secret_management.dimensions?.map((dim) => dim.label)
    ).toEqual(["Identities", "User Identities"]);
    expect(overview.entitlements.secrets_manager.dimensions?.map((dim) => dim.label)).toEqual([
      "Secret Identities"
    ]);
  });

  it("keeps every v1 product whatever the selected scope counts", () => {
    const { overview } = buildOfflineBilling(plan(), usageOf({}));
    expect(Object.keys(overview.entitlements)).toHaveLength(4);
    expect(overview.entitlements.secrets_manager.dimensions?.[0]).toMatchObject({
      used: 0,
      limit: null
    });
  });

  it("lists unlicensed v2 products without an entitlement, so they render as not in the license", () => {
    const { overview, catalog } = buildOfflineBilling(
      plan({
        productPlans: [
          productPlan("legacy_secret_management"),
          productPlan("cert_management"),
          productPlan("pam", "churned")
        ]
      }),
      usageOf({ [D.Identities]: 2 })
    );
    expect(catalog.map((product) => product.id)).toEqual([
      "legacy_secret_management",
      "secrets_manager",
      "cert_management",
      "pam"
    ]);
    expect(Object.keys(overview.entitlements)).toEqual([
      "legacy_secret_management",
      "cert_management"
    ]);
  });

  it("marks the legacy product deprecated so it hides when the key does not include it", () => {
    const { catalog, overview } = buildOfflineBilling(
      plan({ productPlans: [productPlan("secrets_manager")] }),
      usageOf({})
    );
    expect(catalog.find((product) => product.id === "legacy_secret_management")?.deprecated).toBe(
      true
    );
    expect(Object.keys(overview.entitlements)).toEqual(["secrets_manager"]);
  });

  it("uses the v2 plan key as the product tier", () => {
    const { overview } = buildOfflineBilling(
      plan({ productPlans: [{ ...productPlan("cert_management"), planKey: "pro" }] }),
      usageOf({})
    );
    expect(overview.entitlements.cert_management.planTier).toBe("pro");
  });
});
