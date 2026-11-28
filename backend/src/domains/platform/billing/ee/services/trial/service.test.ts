import { OrgMembershipRole } from "@app/db/schemas";
import { PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { Meter } from "@app/domains/platform/license/ce/module";

import { catalog } from "../../testing/billing-records";
import { buildBilling, SITE_URL } from "../../testing/build-billing";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const arrange = async () => {
  const built = buildBilling();
  built.licenseBilling.answer("getCatalog", catalog());
  const admin = await built.member(OrgMembershipRole.Admin, { principal: { email: "ada@acme.test" } });
  return { ...built, admin };
};

describe("TrialService.startTrial", () => {
  test("should start the trial with the org's name and monthly usage, revalidating the plan at once", async () => {
    // Setup
    const { module, licenseBilling, licenseService, usageMeteringService, admin, root } = await arrange();
    usageMeteringService.counts.set(Meter.SecretIdentities, 4);
    licenseBilling.answer("startTrial", { outcome: "trial_started" });

    // Action
    const result = await module.trialService.startTrial({
      orgId: root.id,
      actor: admin(),
      productId: "secrets_manager",
      plan: "pro",
      email: "ada@acme.test"
    });

    // Assert
    expect(result).toEqual({ outcome: "trial_started", cardSetupUrl: undefined });
    expect(licenseBilling.callsTo("startTrial")[0].args[0]).toEqual({
      productKey: "secrets_manager",
      planKey: "pro",
      email: "ada@acme.test",
      name: `org ${root.id}`,
      declaredUsage: { secret_identities: 4 },
      returnUrl: `${SITE_URL}/organizations/${root.id}/billing`
    });
    expect(licenseService.refreshes).toEqual([
      { orgId: root.id, options: { afterBillingChange: { checkout: false } } }
    ]);
  });

  test("should send the customer to card setup and hold revalidation open when no card is on file", async () => {
    // Setup
    const { module, licenseBilling, licenseService, admin, root } = await arrange();
    licenseBilling.answer("startTrial", {
      outcome: "awaiting_card",
      cardSetupUrl: "https://checkout.stripe.test/setup"
    });

    // Action
    const result = await module.trialService.startTrial({
      orgId: root.id,
      actor: admin(),
      productId: "secrets_manager",
      plan: "pro"
    });

    // Assert
    expect(result).toEqual({ outcome: "awaiting_card", cardSetupUrl: "https://checkout.stripe.test/setup" });
    expect(licenseService.refreshes).toEqual([{ orgId: root.id, options: { afterBillingChange: { checkout: true } } }]);
  });

  test("should still start a trial for a product the catalog doesn't list, leaving usage to the License Server", async () => {
    // Setup
    const { module, licenseBilling, admin, root } = await arrange();
    licenseBilling.answer("startTrial", { outcome: "trial_started" });

    // Action
    await module.trialService.startTrial({ orgId: root.id, actor: admin(), productId: "unlisted", plan: "pro" });

    // Assert
    expect(licenseBilling.callsTo("startTrial")[0].args[0]).toMatchObject({
      productKey: "unlisted",
      declaredUsage: undefined
    });
  });

  test("should refuse a member who can read billing but not manage it, and start nothing", async () => {
    // Setup
    const { module, licenseBilling, member, root } = await arrange();
    const reader = await member(OrgMembershipRole.Member);

    // Action
    const result = module.trialService.startTrial({
      orgId: root.id,
      actor: reader(),
      productId: "secrets_manager",
      plan: "pro"
    });

    // Assert
    await expect(result).rejects.toThrow(PermissionDeniedError);
    expect(licenseBilling.calls).toEqual([]);
  });
});

describe("TrialService.cancelTrial", () => {
  test("should end the trial and revalidate the plan at once", async () => {
    // Setup
    const { module, licenseBilling, licenseService, admin, root } = await arrange();
    licenseBilling.answer("cancelTrial", { outcome: "trial_completed" });

    // Action
    const result = await module.trialService.cancelTrial({
      orgId: root.id,
      actor: admin(),
      productId: "secrets_manager"
    });

    // Assert
    expect(result).toEqual({ outcome: "trial_completed" });
    expect(licenseService.refreshes).toEqual([{ orgId: root.id, options: { afterBillingChange: {} } }]);
  });
});

describe("TrialService.confirmTrialPayment", () => {
  test("should send the customer to the checkout and hold revalidation open", async () => {
    // Setup
    const { module, licenseBilling, licenseService, admin, root } = await arrange();
    licenseBilling.answer("confirmTrialPayment", {
      outcome: "checkout_created",
      checkoutUrl: "https://checkout.stripe.test/c"
    });

    // Action
    const result = await module.trialService.confirmTrialPayment({ orgId: root.id, actor: admin() });

    // Assert
    expect(result).toEqual({ outcome: "checkout_created", redirectUrl: "https://checkout.stripe.test/c" });
    expect(licenseService.refreshes).toEqual([{ orgId: root.id, options: { afterBillingChange: { checkout: true } } }]);
  });

  test("should send the customer to the bank's approval link when the payment needs approving", async () => {
    // Setup
    const { module, licenseBilling, admin, root } = await arrange();
    licenseBilling.answer("confirmTrialPayment", {
      outcome: "payment_action_required",
      paymentUrl: "https://invoice.stripe.test/i"
    });

    // Action
    const result = await module.trialService.confirmTrialPayment({ orgId: root.id, actor: admin() });

    // Assert
    expect(result).toEqual({ outcome: "payment_action_required", redirectUrl: "https://invoice.stripe.test/i" });
  });

  test("should revalidate at once when the trial converted in place", async () => {
    // Setup
    const { module, licenseBilling, licenseService, admin, root } = await arrange();
    licenseBilling.answer("confirmTrialPayment", { outcome: "upgraded" });

    // Action
    const result = await module.trialService.confirmTrialPayment({ orgId: root.id, actor: admin() });

    // Assert
    expect(result).toEqual({ outcome: "upgraded" });
    expect(licenseService.refreshes).toEqual([{ orgId: root.id, options: { afterBillingChange: {} } }]);
  });

  test("should refuse an insecure checkout link and leave the plan alone", async () => {
    // Setup
    const { module, licenseBilling, licenseService, admin, root } = await arrange();
    licenseBilling.answer("confirmTrialPayment", {
      outcome: "checkout_created",
      checkoutUrl: "http://checkout.stripe.test/c"
    });

    // Action
    const result = module.trialService.confirmTrialPayment({ orgId: root.id, actor: admin() });

    // Assert
    await expect(result).rejects.toThrow(
      new RuleViolationError({
        message: "We couldn't get a secure checkout link. Please try again or contact support."
      })
    );
    expect(licenseService.refreshes).toEqual([]);
  });
});
