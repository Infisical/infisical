import { TActorContext } from "@app/domains/lib/actor-context";
import { EntityNotFoundError, ExternalSystemError, RuleViolationError } from "@app/domains/lib/errors";
import {
  TLicenseServerBilling,
  TLicenseService,
  TSubscriptionPreviewPayload,
  TUsageMeteringService
} from "@app/domains/platform/license/ce/module";
import { TOrgPermissionService } from "@app/domains/platform/organizations/ce/module";

import { BillingCadence } from "../../models/billing-cadence";
import { TCadence } from "../../models/catalog-plan";
import { CatalogProduct } from "../../models/catalog-product";
import { ChangePreviewRequest, TCommitmentChange } from "../../models/change-preview-request";
import { Money } from "../../models/money";
import { ProrationQuote } from "../../models/proration-quote";
import { ReturnUrl } from "../../models/return-url";
import { TBillingConfig } from "../dependencies";
import { assertManageBilling } from "../helpers/billing-access";
import { settlePaymentAction } from "../helpers/billing-change";
import { resolveLineItem } from "../helpers/line-item";

type TBillingChangeRequest = { orgId: string; actor: TActorContext };

export type TOpenPortalInput = TBillingChangeRequest & { returnPath?: string };

export type TBuyProductInput = TBillingChangeRequest & {
  productId: string;
  plan?: string;
  cadence?: TCadence;
  // The buyer's committed choice; what the org uses now is counted here.
  quantities?: Record<string, number>;
  email?: string;
  returnPath?: string;
};

export type TPreviewChangeInput = TBillingChangeRequest & {
  addProductId?: string;
  plan?: string;
  cadence?: TCadence;
  quantities?: Record<string, number>;
  removeProductId?: string;
  commitmentChanges?: TCommitmentChange[];
  upgradeProductId?: string;
  upgradePlan?: string;
};

export type TUpgradeProductInput = TBillingChangeRequest & {
  productId: string;
  plan: string;
  expectedPlanVersionId: string;
  prorationDate?: number;
};

export type TChangeCommitmentsInput = TBillingChangeRequest & { productId: string; changes: TCommitmentChange[] };

export type TRemoveProductInput = TBillingChangeRequest & { productId: string };

export type TPreviewView = {
  currency: string;
  prorationAmount: number;
  additionalCharges: number;
  totalDueNow: number;
  nextInvoiceTotal: number;
  nextRecurringTotal: number;
  prorationDate?: number | null;
  toPlanVersionId?: string | null;
  lines: { description: string; amount: number; proration: boolean }[];
};

export type TBuyProductResult = { plan: string; cadence: TCadence } & (
  | { outcome: "payment_action_required"; paymentUrl: string }
  | { outcome: "subscription_updated"; subscriptionId?: string }
  | { outcome: "checkout_created"; checkoutUrl: string }
);

export type TUpgradeProductResult =
  | { outcome: "payment_action_required"; paymentUrl: string }
  | { outcome: "upgraded"; subscriptionId?: string; fromPlanKey?: string; toPlanKey?: string };

export type TChangeCommitmentsResult =
  | { outcome: "payment_action_required"; paymentUrl: string }
  | { outcome: "checkout_created"; checkoutUrl: string }
  | { outcome: "subscription_updated"; subscriptionId?: string };

export type TSubscriptionService = {
  openPortal(input: TOpenPortalInput): Promise<{ url: string }>;
  buyProduct(input: TBuyProductInput): Promise<TBuyProductResult>;
  previewChange(input: TPreviewChangeInput): Promise<{ preview: TPreviewView }>;
  upgradeProduct(input: TUpgradeProductInput): Promise<TUpgradeProductResult>;
  changeCommitments(input: TChangeCommitmentsInput): Promise<TChangeCommitmentsResult>;
  removeProduct(input: TRemoveProductInput): Promise<{ subscriptionId?: string }>;
};

// Self-serve changes to the org's subscription. After each change the plan is revalidated: over the longer checkout
// window when the change only applies once the customer finishes in Stripe.
export class SubscriptionService implements TSubscriptionService {
  constructor(
    private readonly orgPermissionService: TOrgPermissionService,
    private readonly licenseBilling: TLicenseServerBilling,
    private readonly licenseService: TLicenseService,
    private readonly usageMeteringService: TUsageMeteringService,
    private readonly billingConfig: TBillingConfig,
    private readonly now: () => Date
  ) {}

  // The Stripe customer portal, for payment methods and invoices.
  async openPortal({ orgId, actor, returnPath }: TOpenPortalInput): Promise<{ url: string }> {
    await assertManageBilling(this.orgPermissionService, { actor, orgId });
    const session = await this.licenseBilling.createPortal(orgId, {
      returnPath,
      returnUrl: ReturnUrl.build(this.billingConfig.siteUrl, orgId, returnPath)
    });
    return { url: session.url };
  }

  async buyProduct({
    orgId,
    actor,
    productId,
    plan,
    cadence,
    quantities,
    email,
    returnPath
  }: TBuyProductInput): Promise<TBuyProductResult> {
    await assertManageBilling(this.orgPermissionService, { actor, orgId });

    const product = CatalogProduct.findIn(await this.licenseBilling.getCatalog(orgId), productId);
    if (!product) {
      throw new EntityNotFoundError({ message: `Product with ID '${productId}' not found` });
    }
    const billedCadence = BillingCadence.orMonthly(cadence);
    const lineItem = await resolveLineItem(this.usageMeteringService, {
      product,
      cadence: billedCadence,
      orgId,
      planTier: plan,
      committed: quantities
    });
    if (!lineItem) {
      throw new RuleViolationError({ message: "This product is not available for self-serve checkout" });
    }

    const result = await this.licenseBilling.buyProduct(orgId, {
      productId,
      plan: lineItem.planTier,
      cadence: billedCadence,
      quantities: lineItem.quantities,
      declaredUsage: lineItem.declaredUsage,
      email,
      returnUrl: ReturnUrl.build(this.billingConfig.siteUrl, orgId, returnPath)
    });
    const bought = { plan: lineItem.planTier, cadence: billedCadence };

    if (result.outcome === "payment_action_required") {
      return {
        ...(await settlePaymentAction(this.licenseService, { orgId, paymentUrl: result.paymentUrl })),
        ...bought
      };
    }
    if (result.outcome === "subscription_updated") {
      await this.licenseService.refreshPlan(orgId, { afterBillingChange: {} });
      return { outcome: "subscription_updated", subscriptionId: result.subscriptionId, ...bought };
    }
    // checkout_created: the customer finishes in Stripe Checkout and the change applies by webhook.
    if (!result.checkoutUrl) {
      throw new ExternalSystemError({ message: "Checkout session did not return a URL" });
    }
    await this.licenseService.refreshPlan(orgId, { afterBillingChange: { checkout: true } });
    return { outcome: "checkout_created", checkoutUrl: result.checkoutUrl, ...bought };
  }

  async previewChange({
    orgId,
    actor,
    plan,
    cadence,
    quantities,
    ...change
  }: TPreviewChangeInput): Promise<{ preview: TPreviewView }> {
    await assertManageBilling(this.orgPermissionService, { actor, orgId });
    const request = ChangePreviewRequest.create(change);

    const payload: TSubscriptionPreviewPayload = {};
    if (request.upgrade) payload.upgrade = request.upgrade;
    if (request.addProductId) {
      const product = CatalogProduct.findIn(await this.licenseBilling.getCatalog(orgId), request.addProductId);
      if (!product) {
        throw new EntityNotFoundError({ message: `Product with ID '${request.addProductId}' not found` });
      }
      const billedCadence = BillingCadence.orMonthly(cadence);
      const lineItem = await resolveLineItem(this.usageMeteringService, {
        product,
        cadence: billedCadence,
        orgId,
        planTier: plan,
        committed: quantities
      });
      if (!lineItem) {
        throw new RuleViolationError({ message: "This product is not available for self-serve checkout" });
      }
      payload.add = [
        {
          productId: request.addProductId,
          plan: lineItem.planTier,
          cadence: billedCadence,
          quantities: lineItem.quantities,
          declaredUsage: lineItem.declaredUsage
        }
      ];
    }
    if (request.removeProductIds) payload.remove = request.removeProductIds;
    if (request.commitmentChanges) payload.commitmentChanges = request.commitmentChanges;

    const preview = await this.licenseBilling.previewSubscriptionChange(orgId, payload);
    const totalDueNowCents = preview.totalDueNow ?? preview.prorationAmount + preview.additionalCharges;
    return {
      preview: {
        currency: preview.currency,
        prorationAmount: Money.dollars(preview.prorationAmount),
        additionalCharges: Money.dollars(preview.additionalCharges),
        totalDueNow: Money.dollars(totalDueNowCents),
        nextInvoiceTotal: Money.dollars(preview.nextInvoiceTotal),
        nextRecurringTotal: Money.dollars(preview.nextRecurringTotal),
        prorationDate: preview.prorationDate ?? null,
        toPlanVersionId: preview.toPlanVersionId ?? null,
        lines: preview.lines.map((line) => ({
          description: line.description,
          amount: Money.dollars(line.amount),
          proration: line.proration
        }))
      }
    };
  }

  // Moves a held product to a higher plan. The License Server carries every line forward with its live quantity,
  // so only the prorated difference is charged and the renewal date doesn't move.
  async upgradeProduct({
    orgId,
    actor,
    productId,
    plan,
    expectedPlanVersionId,
    prorationDate
  }: TUpgradeProductInput): Promise<TUpgradeProductResult> {
    await assertManageBilling(this.orgPermissionService, { actor, orgId });
    ProrationQuote.of(prorationDate).assertCurrent(this.now());

    const result = await this.licenseBilling.upgradeProduct(orgId, {
      productId,
      plan,
      expectedPlanVersionId,
      prorationDate
    });
    if (result.outcome === "payment_action_required") {
      return settlePaymentAction(this.licenseService, { orgId, paymentUrl: result.paymentUrl });
    }
    await this.licenseService.refreshPlan(orgId, { afterBillingChange: {} });
    return {
      outcome: result.outcome,
      subscriptionId: result.subscriptionId,
      fromPlanKey: result.fromPlanKey,
      toPlanKey: result.toPlanKey
    };
  }

  async changeCommitments({
    orgId,
    actor,
    productId,
    changes
  }: TChangeCommitmentsInput): Promise<TChangeCommitmentsResult> {
    await assertManageBilling(this.orgPermissionService, { actor, orgId });
    if (!changes.length) {
      throw new RuleViolationError({ message: "Provide at least one commitment change" });
    }
    const result = await this.licenseBilling.changeCommitments(orgId, {
      productId,
      dimensions: changes.map((change) => ({ dimensionKey: change.dimensionKey, quantity: change.quantity }))
    });
    if (result.outcome === "payment_action_required") {
      return settlePaymentAction(this.licenseService, { orgId, paymentUrl: result.paymentUrl });
    }
    if (result.outcome === "checkout_created") {
      if (!result.checkoutUrl) {
        throw new ExternalSystemError({ message: "Checkout session did not return a URL" });
      }
      await this.licenseService.refreshPlan(orgId, { afterBillingChange: { checkout: true } });
      return { outcome: "checkout_created", checkoutUrl: result.checkoutUrl };
    }
    await this.licenseService.refreshPlan(orgId, { afterBillingChange: {} });
    return { outcome: "subscription_updated", subscriptionId: result.subscriptionId };
  }

  // The one change the Stripe portal can't make on a multi-product subscription. Prorated as of now.
  async removeProduct({ orgId, actor, productId }: TRemoveProductInput): Promise<{ subscriptionId?: string }> {
    await assertManageBilling(this.orgPermissionService, { actor, orgId });
    const result = await this.licenseBilling.removeProduct(orgId, productId);
    await this.licenseService.refreshPlan(orgId, { afterBillingChange: {} });
    return { subscriptionId: result.subscriptionId };
  }
}
