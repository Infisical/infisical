import { TActorContext } from "@app/domains/lib/actor-context";
import { RuleViolationError } from "@app/domains/lib/errors";
import { TLicenseServerBilling, TLicenseService, TUsageMeteringService } from "@app/domains/platform/license/ce/module";
import { TOrganizationsService, TOrgPermissionService } from "@app/domains/platform/organizations/ce/module";

import { CatalogProduct } from "../../models/catalog-product";
import { PaymentLink } from "../../models/payment-link";
import { ReturnUrl } from "../../models/return-url";
import { TBillingConfig } from "../dependencies";
import { assertManageBilling } from "../helpers/billing-access";
import { settlePaymentAction } from "../helpers/billing-change";
import { resolveLineItem } from "../helpers/line-item";

export type TStartTrialInput = {
  orgId: string;
  actor: TActorContext;
  productId: string;
  plan: string;
  // The signed-in user's, never the client's.
  email?: string;
  returnPath?: string;
};

export type TCancelTrialInput = { orgId: string; actor: TActorContext; productId: string };

export type TConfirmTrialPaymentInput = { orgId: string; actor: TActorContext; returnPath?: string };

export type TStartTrialResult = { outcome: "trial_started" | "awaiting_card"; cardSetupUrl?: string };

export type TConfirmTrialPaymentResult =
  | { outcome: "payment_action_required"; redirectUrl: string }
  | { outcome: "upgraded" }
  | { outcome: "checkout_created"; redirectUrl: string };

export type TTrialService = {
  startTrial(input: TStartTrialInput): Promise<TStartTrialResult>;
  // The product drops to free and the trial never converts. No active trial is the License Server's 404.
  cancelTrial(input: TCancelTrialInput): Promise<{ outcome: "trial_completed" }>;
  confirmTrialPayment(input: TConfirmTrialPaymentInput): Promise<TConfirmTrialPaymentResult>;
};

// Plan-scoped self-serve trials.
export class TrialService implements TTrialService {
  constructor(
    private readonly orgPermissionService: TOrgPermissionService,
    private readonly organizationsService: TOrganizationsService,
    private readonly licenseBilling: TLicenseServerBilling,
    private readonly licenseService: TLicenseService,
    private readonly usageMeteringService: TUsageMeteringService,
    private readonly billingConfig: TBillingConfig
  ) {}

  // A customer with a card on file is granted the trial at once; anyone else first completes a card-setup checkout,
  // and the trial is granted by webhook after it, so the plan is revalidated over the checkout window.
  async startTrial({ orgId, actor, productId, plan, email, returnPath }: TStartTrialInput): Promise<TStartTrialResult> {
    await assertManageBilling(this.orgPermissionService, { actor, orgId });
    // The License Server creates the Stripe customer from the org's name.
    const organization = await this.organizationsService.findOrganization(orgId);

    // Seeded with present usage, as checkout is. A trial converts to a monthly usage-based line, so it is counted
    // at the monthly cadence, and left out when the product or plan can't be resolved (the server floors it).
    const catalog = await this.licenseBilling.getCatalog(orgId);
    const product = CatalogProduct.findIn(catalog, productId);
    const lineItem = product
      ? await resolveLineItem(this.usageMeteringService, { product, cadence: "monthly", orgId, planTier: plan })
      : null;

    const result = await this.licenseBilling.startTrial(orgId, {
      productKey: productId,
      planKey: plan,
      email,
      name: organization?.name,
      declaredUsage: lineItem?.declaredUsage,
      returnUrl: ReturnUrl.build(this.billingConfig.siteUrl, orgId, returnPath)
    });
    await this.licenseService.refreshPlan(orgId, {
      afterBillingChange: { checkout: result.outcome === "awaiting_card" }
    });
    return { outcome: result.outcome, cardSetupUrl: result.cardSetupUrl };
  }

  async cancelTrial({ orgId, actor, productId }: TCancelTrialInput): Promise<{ outcome: "trial_completed" }> {
    await assertManageBilling(this.orgPermissionService, { actor, orgId });
    const result = await this.licenseBilling.cancelTrial(orgId, { productKey: productId });
    await this.licenseService.refreshPlan(orgId, { afterBillingChange: {} });
    return { outcome: result.outcome };
  }

  // The trial converts by webhook once the customer approves, so the checkout window is held open.
  async confirmTrialPayment({
    orgId,
    actor,
    returnPath
  }: TConfirmTrialPaymentInput): Promise<TConfirmTrialPaymentResult> {
    await assertManageBilling(this.orgPermissionService, { actor, orgId });
    const result = await this.licenseBilling.confirmTrialPayment(orgId, {
      returnUrl: ReturnUrl.build(this.billingConfig.siteUrl, orgId, returnPath)
    });
    if (result.outcome === "payment_action_required") {
      const { paymentUrl } = await settlePaymentAction(this.licenseService, { orgId, paymentUrl: result.paymentUrl });
      return { outcome: result.outcome, redirectUrl: paymentUrl };
    }
    if (result.outcome === "upgraded") {
      await this.licenseService.refreshPlan(orgId, { afterBillingChange: {} });
      return { outcome: result.outcome };
    }
    const checkoutUrl = PaymentLink.httpsOrNull(result.checkoutUrl);
    if (!checkoutUrl) {
      throw new RuleViolationError({
        message: "We couldn't get a secure checkout link. Please try again or contact support."
      });
    }
    await this.licenseService.refreshPlan(orgId, { afterBillingChange: { checkout: true } });
    return { outcome: result.outcome, redirectUrl: checkoutUrl };
  }
}
