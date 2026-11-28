import { OrgMembershipRole } from "@app/db/schemas";
import { EntityNotFoundError, PermissionDeniedError } from "@app/domains/lib/errors";

import { catalog, subscription } from "../../testing/billing-records";
import { buildBilling } from "../../testing/build-billing";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("BillingOverviewService.getOverview", () => {
  test("should show the subscription's state and plan, and the products it holds", async () => {
    // Setup
    const { module, licenseBilling, member, root } = buildBilling();
    const reader = await member(OrgMembershipRole.Member);
    licenseBilling.answer("getSubscription", subscription({ status: "trialing" }));
    licenseBilling.answer("getCatalog", catalog());

    // Action
    const { overview } = await module.billingOverviewService.getOverview({ orgId: root.id, actor: reader() });

    // Assert
    expect(overview).toMatchObject({ isCloud: true, mode: "self-serve", subState: "trialing", planName: "Pro" });
    expect(overview.entitlements.secrets_manager).toMatchObject({ entitled: true, planTier: "pro" });
  });

  test("should show an org with no subscription as free", async () => {
    // Setup
    const { module, member, root } = buildBilling();
    const reader = await member(OrgMembershipRole.Member);

    // Action
    const { overview } = await module.billingOverviewService.getOverview({ orgId: root.id, actor: reader() });

    // Assert
    expect(overview).toMatchObject({ subState: "no-subscription", planName: "Free", entitlements: {} });
  });

  test("should still answer when the billing profile, catalog, entitlements and trials can't be read", async () => {
    // Setup
    const { module, licenseBilling, member, root } = buildBilling();
    const reader = await member(OrgMembershipRole.Member);
    licenseBilling.answer("getSubscription", subscription());
    ["getBillingProfile", "getCatalog", "getEntitlements", "getTrials"].forEach((method) =>
      licenseBilling.fail(method as "getTrials", new Error("License Server unreachable"))
    );

    // Action
    const { overview } = await module.billingOverviewService.getOverview({ orgId: root.id, actor: reader() });

    // Assert
    expect(overview).toMatchObject({ subState: "active", payment: null, invoices: [], trials: [] });
    expect(overview.entitlements.secrets_manager).toMatchObject({ entitled: true });
  });

  test("should fail rather than show the org as free when the subscription can't be read", async () => {
    // Setup
    const { module, licenseBilling, member, root } = buildBilling();
    const reader = await member(OrgMembershipRole.Member);
    licenseBilling.fail("getSubscription", new Error("License Server unreachable"));

    // Action
    const result = module.billingOverviewService.getOverview({ orgId: root.id, actor: reader() });

    // Assert
    await expect(result).rejects.toThrow("License Server unreachable");
  });

  test("should show a self-hosted instance's billing as managed, without asking for its Stripe profile or trials", async () => {
    // Setup
    const { module, licenseBilling, member, root } = buildBilling({ config: { isCloud: false } });
    const reader = await member(OrgMembershipRole.Member);

    // Action
    const { overview } = await module.billingOverviewService.getOverview({ orgId: root.id, actor: reader() });

    // Assert
    expect(overview).toMatchObject({ isCloud: false, mode: "managed" });
    expect(licenseBilling.calls.map((call) => call.method)).toEqual(["getSubscription", "getEntitlements"]);
  });

  test("should let a self-hosted instance admin read another org's billing without being its member", async () => {
    // Setup
    const { module, organizationsService, licenseBilling, member } = buildBilling({ config: { isCloud: false } });
    const otherOrgId = "44444444-4444-4444-8444-444444444444";
    organizationsService.setRoot(otherOrgId, otherOrgId);
    const instanceAdmin = await member(null, { principal: { isSuperAdmin: true } });

    // Action
    const { overview } = await module.billingOverviewService.getOverview({ orgId: otherOrgId, actor: instanceAdmin() });

    // Assert
    expect(overview.mode).toBe("managed");
    expect(licenseBilling.callsTo("getSubscription")[0].orgId).toBe(otherOrgId);
  });

  test("should refuse an instance admin on cloud, where orgs are separate customers", async () => {
    // Setup
    const { module, licenseBilling, member } = buildBilling();
    const instanceAdmin = await member(null, { principal: { isSuperAdmin: true } });

    // Action
    const result = module.billingOverviewService.getOverview({
      orgId: "44444444-4444-4444-8444-444444444444",
      actor: instanceAdmin()
    });

    // Assert
    await expect(result).rejects.toThrow(PermissionDeniedError);
    expect(licenseBilling.calls).toEqual([]);
  });

  test("should refuse a self-hosted instance admin whose token is narrowed to OAuth scopes", async () => {
    // Setup
    const { module, organizationsService, member } = buildBilling({ config: { isCloud: false } });
    const otherOrgId = "44444444-4444-4444-8444-444444444444";
    organizationsService.setRoot(otherOrgId, otherOrgId);
    const narrowed = await member(null, {
      principal: { isSuperAdmin: true, oauth: { clientId: "client", scopes: ["secrets:read"] } }
    });

    // Action
    const result = module.billingOverviewService.getOverview({ orgId: otherOrgId, actor: narrowed() });

    // Assert
    await expect(result).rejects.toThrow(PermissionDeniedError);
  });

  test("should refuse a user who isn't a member of the org", async () => {
    // Setup
    const { module, licenseBilling, member, root } = buildBilling();
    const stranger = await member(null);

    // Action
    const result = module.billingOverviewService.getOverview({ orgId: root.id, actor: stranger() });

    // Assert
    await expect(result).rejects.toThrow(PermissionDeniedError);
    expect(licenseBilling.calls).toEqual([]);
  });

  test("should report an org that doesn't exist as not found", async () => {
    // Setup
    const { module, organizationsService, member, root } = buildBilling();
    const reader = await member(OrgMembershipRole.Member);
    organizationsService.missing.add(root.id);

    // Action
    const result = module.billingOverviewService.getOverview({ orgId: root.id, actor: reader() });

    // Assert
    await expect(result).rejects.toThrow(
      new EntityNotFoundError({ message: `Organization with ID '${root.id}' not found` })
    );
  });
});

describe("BillingOverviewService.getCatalog", () => {
  test("should offer the paid self-serve and sales-led plans, never the free tier", async () => {
    // Setup
    const { module, licenseBilling, member, root } = buildBilling();
    const reader = await member(OrgMembershipRole.Member);
    licenseBilling.answer("getCatalog", catalog());

    // Action
    const { products } = await module.billingOverviewService.getCatalog({ orgId: root.id, actor: reader() });

    // Assert
    expect(products[0].plans.map((plan) => plan.tier)).toEqual(["pro", "enterprise"]);
  });

  test("should offer nothing when the License Server has no catalog", async () => {
    // Setup
    const { module, member, root } = buildBilling();
    const reader = await member(OrgMembershipRole.Member);

    // Action
    const result = await module.billingOverviewService.getCatalog({ orgId: root.id, actor: reader() });

    // Assert
    expect(result).toEqual({ products: [] });
  });
});

describe("BillingOverviewService.refreshEntitlements", () => {
  test("should refetch the org's plan", async () => {
    // Setup
    const { module, licenseService, member, root } = buildBilling();
    const reader = await member(OrgMembershipRole.Member);

    // Action
    const result = await module.billingOverviewService.refreshEntitlements({ orgId: root.id, actor: reader() });

    // Assert
    expect(result).toEqual({ success: true });
    expect(licenseService.refreshes).toEqual([{ orgId: root.id, options: undefined }]);
  });

  test("should never let a self-hosted instance admin refresh an org they aren't a member of", async () => {
    // Setup
    const { module, organizationsService, licenseService, member } = buildBilling({ config: { isCloud: false } });
    const otherOrgId = "44444444-4444-4444-8444-444444444444";
    organizationsService.setRoot(otherOrgId, otherOrgId);
    const instanceAdmin = await member(null, { principal: { isSuperAdmin: true } });

    // Action
    const result = module.billingOverviewService.refreshEntitlements({ orgId: otherOrgId, actor: instanceAdmin() });

    // Assert
    await expect(result).rejects.toThrow(PermissionDeniedError);
    expect(licenseService.refreshes).toEqual([]);
  });
});

describe("BillingOverviewService.getOrgPlan", () => {
  test("should give a sub-org's member the root org's plan, refetching only when asked", async () => {
    // Setup
    const { module, licenseService, member, root, sub } = buildBilling();
    licenseService.setPlan(root.id, { slug: "enterprise" });
    const subMember = await member(OrgMembershipRole.NoAccess, { org: sub });

    // Action
    const cached = await module.billingOverviewService.getOrgPlan({
      orgId: sub.id,
      actor: subMember(),
      refreshCache: false
    });
    const refreshed = await module.billingOverviewService.getOrgPlan({
      orgId: sub.id,
      actor: subMember(),
      refreshCache: true
    });

    // Assert
    expect([cached.slug, refreshed.slug]).toEqual(["enterprise", "enterprise"]);
    expect(licenseService.refreshes).toEqual([{ orgId: root.id, options: undefined }]);
  });

  test("should refuse someone who isn't a member of the org", async () => {
    // Setup
    const { module, member, root } = buildBilling();
    const stranger = await member(null);

    // Action
    const result = module.billingOverviewService.getOrgPlan({ orgId: root.id, actor: stranger(), refreshCache: false });

    // Assert
    await expect(result).rejects.toThrow(PermissionDeniedError);
  });
});
