import { OrgMembershipRole } from "@app/db/schemas";
import {
  EntityNotFoundError,
  ExternalSystemError,
  PermissionDeniedError,
  RuleViolationError
} from "@app/domains/lib/errors";
import { Meter } from "@app/domains/platform/license/ce/module";

import { catalog, catalogProduct, proPlan } from "../../testing/billing-records";
import { buildBilling, SITE_URL } from "../../testing/build-billing";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const arrange = async () => {
  const built = buildBilling();
  built.licenseBilling.answer("getCatalog", catalog());
  const admin = await built.member(OrgMembershipRole.Admin);
  return { ...built, admin };
};

describe("SubscriptionService.buyProduct", () => {
  test("should send the org's live usage and return the checkout link when the customer must finish in Stripe", async () => {
    // Setup
    const { module, licenseBilling, licenseService, usageMeteringService, admin, root } = await arrange();
    usageMeteringService.counts.set(Meter.SecretIdentities, 7);
    licenseBilling.answer("buyProduct", { outcome: "checkout_created", checkoutUrl: "https://checkout.stripe.test/c" });

    // Action
    const result = await module.subscriptionService.buyProduct({
      orgId: root.id,
      actor: admin(),
      productId: "secrets_manager"
    });

    // Assert
    expect(result).toEqual({
      outcome: "checkout_created",
      checkoutUrl: "https://checkout.stripe.test/c",
      plan: "pro",
      cadence: "monthly"
    });
    expect(licenseBilling.callsTo("buyProduct")[0].args[0]).toMatchObject({
      plan: "pro",
      cadence: "monthly",
      declaredUsage: { secret_identities: 7 },
      returnUrl: `${SITE_URL}/organizations/${root.id}/billing`
    });
    expect(licenseService.refreshes).toEqual([{ orgId: root.id, options: { afterBillingChange: { checkout: true } } }]);
  });

  test("should commit the buyer's quantity over the live count, and the live count over the included floor, when buying annually", async () => {
    // Setup
    const { module, licenseBilling, admin, root } = await arrange();
    const twoDimensions = proPlan({
      prices: [
        {
          dimensionKey: "secret_identities",
          cadence: "annual",
          kind: "per_unit",
          unitAmountCents: 1500,
          includedQuantity: 5
        },
        {
          dimensionKey: "pam_identities",
          cadence: "annual",
          kind: "per_unit",
          unitAmountCents: 900,
          includedQuantity: 3
        }
      ]
    });
    licenseBilling.answer("getCatalog", catalog(catalogProduct({ plans: [twoDimensions] })));
    licenseBilling.answer("buyProduct", { outcome: "subscription_updated", subscriptionId: "sub_1" });

    // Action
    await module.subscriptionService.buyProduct({
      orgId: root.id,
      actor: admin(),
      productId: "secrets_manager",
      cadence: "annual",
      quantities: { secret_identities: 40 }
    });

    // Assert
    expect(licenseBilling.callsTo("buyProduct")[0].args[0]).toMatchObject({
      quantities: { secret_identities: 40, pam_identities: 3 },
      declaredUsage: {}
    });
  });

  test("should revalidate the plan at once when the change applied to the existing subscription", async () => {
    // Setup
    const { module, licenseBilling, licenseService, admin, root } = await arrange();
    licenseBilling.answer("buyProduct", { outcome: "subscription_updated", subscriptionId: "sub_1" });

    // Action
    const result = await module.subscriptionService.buyProduct({
      orgId: root.id,
      actor: admin(),
      productId: "secrets_manager"
    });

    // Assert
    expect(result).toMatchObject({ outcome: "subscription_updated", subscriptionId: "sub_1" });
    expect(licenseService.refreshes).toEqual([{ orgId: root.id, options: { afterBillingChange: {} } }]);
  });

  test("should hand back the bank's approval link when the payment needs approving", async () => {
    // Setup
    const { module, licenseBilling, licenseService, admin, root } = await arrange();
    licenseBilling.answer("buyProduct", {
      outcome: "payment_action_required",
      paymentUrl: "https://invoice.stripe.test/i"
    });

    // Action
    const result = await module.subscriptionService.buyProduct({
      orgId: root.id,
      actor: admin(),
      productId: "secrets_manager"
    });

    // Assert
    expect(result).toEqual({
      outcome: "payment_action_required",
      paymentUrl: "https://invoice.stripe.test/i",
      plan: "pro",
      cadence: "monthly"
    });
    expect(licenseService.refreshes).toEqual([{ orgId: root.id, options: { afterBillingChange: { checkout: true } } }]);
  });

  test("should refuse with the payment_action_required code when the approval link isn't https", async () => {
    // Setup
    const { module, licenseBilling, licenseService, admin, root } = await arrange();
    licenseBilling.answer("buyProduct", {
      outcome: "payment_action_required",
      paymentUrl: "http://invoice.stripe.test/i"
    });

    // Action
    const result = module.subscriptionService.buyProduct({
      orgId: root.id,
      actor: admin(),
      productId: "secrets_manager"
    });

    // Assert
    await expect(result).rejects.toThrow(RuleViolationError);
    await expect(result).rejects.toMatchObject({ details: { code: "payment_action_required" } });
    expect(licenseService.refreshes).toEqual([]);
  });

  test("should fail as a server problem and leave the plan alone when checkout returns no link", async () => {
    // Setup
    const { module, licenseBilling, licenseService, admin, root } = await arrange();
    licenseBilling.answer("buyProduct", { outcome: "checkout_created" });

    // Action
    const result = module.subscriptionService.buyProduct({
      orgId: root.id,
      actor: admin(),
      productId: "secrets_manager"
    });

    // Assert
    await expect(result).rejects.toThrow(new ExternalSystemError({ message: "Checkout session did not return a URL" }));
    expect(licenseService.refreshes).toEqual([]);
  });

  test("should refuse a product the catalog doesn't sell, and buy nothing", async () => {
    // Setup
    const { module, licenseBilling, admin, root } = await arrange();

    // Action
    const result = module.subscriptionService.buyProduct({ orgId: root.id, actor: admin(), productId: "nope" });

    // Assert
    await expect(result).rejects.toThrow(new EntityNotFoundError({ message: "Product with ID 'nope' not found" }));
    expect(licenseBilling.callsTo("buyProduct")).toEqual([]);
  });

  test("should refuse a sales-led plan, and buy nothing", async () => {
    // Setup
    const { module, licenseBilling, admin, root } = await arrange();

    // Action
    const result = module.subscriptionService.buyProduct({
      orgId: root.id,
      actor: admin(),
      productId: "secrets_manager",
      plan: "enterprise"
    });

    // Assert
    await expect(result).rejects.toThrow(
      new RuleViolationError({ message: "This product is not available for self-serve checkout" })
    );
    expect(licenseBilling.callsTo("buyProduct")).toEqual([]);
  });

  test("should refuse a member who can read billing but not manage it, and buy nothing", async () => {
    // Setup
    const { module, licenseBilling, member, root } = await arrange();
    const reader = await member(OrgMembershipRole.Member);

    // Action
    const result = module.subscriptionService.buyProduct({
      orgId: root.id,
      actor: reader(),
      productId: "secrets_manager"
    });

    // Assert
    await expect(result).rejects.toThrow(PermissionDeniedError);
    expect(licenseBilling.calls).toEqual([]);
  });

  test("should refuse a sub-org, since billing belongs to the root org", async () => {
    // Setup
    const { module, licenseBilling, member, sub } = await arrange();
    const subAdmin = await member(OrgMembershipRole.Admin, { org: sub });

    // Action
    const result = module.subscriptionService.buyProduct({
      orgId: sub.id,
      actor: subAdmin(),
      productId: "secrets_manager"
    });

    // Assert
    await expect(result).rejects.toThrow("Child organization cannot do this operation");
    expect(licenseBilling.calls).toEqual([]);
  });
});

describe("SubscriptionService.upgradeProduct", () => {
  const upgrade = { productId: "secrets_manager", plan: "advanced", expectedPlanVersionId: "v2" };

  test("should refuse a quote older than fifteen minutes without charging", async () => {
    // Setup
    const { module, licenseBilling, admin, root } = await arrange();
    const sixteenMinutesAgo = Math.floor(Date.now() / 1000) - 16 * 60;

    // Action
    const result = module.subscriptionService.upgradeProduct({
      orgId: root.id,
      actor: admin(),
      ...upgrade,
      prorationDate: sixteenMinutesAgo
    });

    // Assert
    await expect(result).rejects.toThrow(
      "This quote is no longer current. Review the updated total and confirm again."
    );
    expect(licenseBilling.callsTo("upgradeProduct")).toEqual([]);
  });

  test("should move the product to the new plan and revalidate at once for a current quote", async () => {
    // Setup
    const { module, licenseBilling, licenseService, admin, root } = await arrange();
    licenseBilling.answer("upgradeProduct", {
      outcome: "upgraded",
      subscriptionId: "sub_1",
      fromPlanKey: "pro",
      toPlanKey: "advanced"
    });

    // Action
    const result = await module.subscriptionService.upgradeProduct({
      orgId: root.id,
      actor: admin(),
      ...upgrade,
      prorationDate: Math.floor(Date.now() / 1000)
    });

    // Assert
    expect(result).toEqual({ outcome: "upgraded", subscriptionId: "sub_1", fromPlanKey: "pro", toPlanKey: "advanced" });
    expect(licenseService.refreshes).toEqual([{ orgId: root.id, options: { afterBillingChange: {} } }]);
  });
});

describe("SubscriptionService.changeCommitments", () => {
  test("should refuse an empty change without calling the License Server", async () => {
    // Setup
    const { module, licenseBilling, admin, root } = await arrange();

    // Action
    const result = module.subscriptionService.changeCommitments({
      orgId: root.id,
      actor: admin(),
      productId: "secrets_manager",
      changes: []
    });

    // Assert
    await expect(result).rejects.toThrow(new RuleViolationError({ message: "Provide at least one commitment change" }));
    expect(licenseBilling.calls).toEqual([]);
  });

  test("should hold the plan's revalidation open when the increase needs a checkout", async () => {
    // Setup
    const { module, licenseBilling, licenseService, admin, root } = await arrange();
    licenseBilling.answer("changeCommitments", {
      outcome: "checkout_created",
      checkoutUrl: "https://checkout.stripe.test/c"
    });

    // Action
    const result = await module.subscriptionService.changeCommitments({
      orgId: root.id,
      actor: admin(),
      productId: "secrets_manager",
      changes: [{ dimensionKey: "secret_identities", quantity: 50 }]
    });

    // Assert
    expect(result).toEqual({ outcome: "checkout_created", checkoutUrl: "https://checkout.stripe.test/c" });
    expect(licenseBilling.callsTo("changeCommitments")[0].args[0]).toEqual({
      productId: "secrets_manager",
      dimensions: [{ dimensionKey: "secret_identities", quantity: 50 }]
    });
    expect(licenseService.refreshes).toEqual([{ orgId: root.id, options: { afterBillingChange: { checkout: true } } }]);
  });
});

describe("SubscriptionService.previewChange", () => {
  test("should price adding a product with the org's usage and return the totals in dollars", async () => {
    // Setup
    const { module, licenseBilling, usageMeteringService, admin, root } = await arrange();
    usageMeteringService.counts.set(Meter.SecretIdentities, 9);
    licenseBilling.answer("previewSubscriptionChange", {
      currency: "usd",
      prorationAmount: 1250,
      additionalCharges: 50,
      nextInvoiceTotal: 9000,
      nextRecurringTotal: 8000,
      lines: [{ description: "Secrets Manager", amount: 1250, proration: true }]
    });

    // Action
    const { preview } = await module.subscriptionService.previewChange({
      orgId: root.id,
      actor: admin(),
      addProductId: "secrets_manager"
    });

    // Assert
    expect(licenseBilling.callsTo("previewSubscriptionChange")[0].args[0]).toEqual({
      add: [
        {
          productId: "secrets_manager",
          plan: "pro",
          cadence: "monthly",
          quantities: undefined,
          declaredUsage: { secret_identities: 9 }
        }
      ]
    });
    expect(preview).toMatchObject({
      prorationAmount: 12.5,
      additionalCharges: 0.5,
      totalDueNow: 13,
      nextInvoiceTotal: 90
    });
  });

  test("should refuse an upgrade combined with removing the same product without calling the License Server", async () => {
    // Setup
    const { module, licenseBilling, admin, root } = await arrange();

    // Action
    const result = module.subscriptionService.previewChange({
      orgId: root.id,
      actor: admin(),
      upgradeProductId: "secrets_manager",
      upgradePlan: "advanced",
      removeProductId: "secrets_manager"
    });

    // Assert
    await expect(result).rejects.toThrow("A plan change cannot be combined with adding or removing the same product");
    expect(licenseBilling.calls).toEqual([]);
  });
});

describe("SubscriptionService.openPortal", () => {
  test("should send the buyer back to the page they came from on the application's own origin", async () => {
    // Setup
    const { module, licenseBilling, admin, root } = await arrange();
    licenseBilling.answer("createPortal", { url: "https://billing.stripe.test/p" });

    // Action
    const result = await module.subscriptionService.openPortal({
      orgId: root.id,
      actor: admin(),
      returnPath: "/organizations/x/billing?tab=invoices"
    });

    // Assert
    expect(result).toEqual({ url: "https://billing.stripe.test/p" });
    expect(licenseBilling.callsTo("createPortal")[0].args[0]).toEqual({
      returnPath: "/organizations/x/billing?tab=invoices",
      returnUrl: `${SITE_URL}/organizations/x/billing?tab=invoices`
    });
  });

  test("should fail as a server problem, and open nothing, when the instance has no site URL", async () => {
    // Setup
    const built = buildBilling({ config: { siteUrl: undefined } });
    const admin = await built.member(OrgMembershipRole.Admin);

    // Action
    const result = built.module.subscriptionService.openPortal({ orgId: built.root.id, actor: admin() });

    // Assert
    await expect(result).rejects.toThrow(new ExternalSystemError({ message: "Failed to build a billing return URL" }));
    expect(built.licenseBilling.calls).toEqual([]);
  });
});

describe("SubscriptionService.removeProduct", () => {
  test("should remove the product and revalidate the plan at once", async () => {
    // Setup
    const { module, licenseBilling, licenseService, admin, root } = await arrange();
    licenseBilling.answer("removeProduct", { outcome: "subscription_updated", subscriptionId: "sub_1" });

    // Action
    const result = await module.subscriptionService.removeProduct({
      orgId: root.id,
      actor: admin(),
      productId: "secrets_manager"
    });

    // Assert
    expect(result).toEqual({ subscriptionId: "sub_1" });
    expect(licenseService.refreshes).toEqual([{ orgId: root.id, options: { afterBillingChange: {} } }]);
  });
});
