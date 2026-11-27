import { TActorContext } from "@app/domains/lib/actor-context";
import { EntityNotFoundError } from "@app/domains/lib/errors";
import { Plan, TLicenseServerBilling, TLicenseService } from "@app/domains/platform/license/ce/module";
import { TOrganizationsService, TOrgPermissionService } from "@app/domains/platform/organizations/ce/module";
import { logger } from "@app/lib/logger";

import { BillingAccess } from "../../models/billing-access";
import { BillingDate } from "../../models/billing-date";
import { CatalogProduct, TCatalogProductView } from "../../models/catalog-product";
import { EntitlementSet, TCatalogRecord, TEntitlementsRecord, TEntitlementView } from "../../models/entitlement-set";
import { Money } from "../../models/money";
import {
  Subscription,
  TBillingSummaryView,
  TPaymentAlertView,
  TSubState,
  TTrialPaymentDueView
} from "../../models/subscription";
import { TrialHistory, TTrialView } from "../../models/trial-history";
import { TBillingConfig } from "../dependencies";
import { assertBillingRead } from "../helpers/billing-access";

export type TBillingRequest = { orgId: string; actor: TActorContext };

export type TGetOrgPlanInput = TBillingRequest & { refreshCache: boolean };

export type TPaymentMethodView = { brand: string; last4: string; expMonth: number; expYear: number } | null;

export type TInvoiceView = { id: string; number: string; date: string; amount: number; paid: boolean; pdfUrl: string };

export type TBillingDetailsView = {
  name: string;
  email: string;
  address: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null;
  taxIds: { type: string; value: string }[];
} | null;

export type TBillingOverview = {
  // Self-hosted is a read-only, managed view: the page hides payment, invoices and details.
  isCloud: boolean;
  mode: "self-serve" | "managed";
  subState: TSubState;
  planName: string;
  billing: TBillingSummaryView;
  payment: TPaymentMethodView;
  billingDetails: TBillingDetailsView;
  invoices: TInvoiceView[];
  entitlements: Record<string, TEntitlementView>;
  trialedProductKeys: string[];
  trials: TTrialView[];
  onDemandAmount: number;
  trialPaymentDue: TTrialPaymentDueView | null;
  paymentAlert: TPaymentAlertView | null;
  checkoutFrozen: boolean;
  selfServe: boolean;
};

export type TBillingOverviewService = {
  getOverview(input: TBillingRequest): Promise<{ overview: TBillingOverview }>;
  getCatalog(input: TBillingRequest): Promise<{ products: TCatalogProductView[] }>;
  // Only replaces the cached plan on success, so an outage keeps the current plan.
  refreshEntitlements(input: TBillingRequest): Promise<{ success: true }>;
  // Any member reads the plan, which is always the root org's.
  getOrgPlan(input: TGetOrgPlanInput): Promise<Plan>;
};

// The billing page's reads: what the org holds and pays, what it can buy, and its plan.
export class BillingOverviewService implements TBillingOverviewService {
  constructor(
    private readonly orgPermissionService: TOrgPermissionService,
    private readonly organizationsService: TOrganizationsService,
    private readonly licenseBilling: TLicenseServerBilling,
    private readonly licenseService: TLicenseService,
    private readonly billingConfig: TBillingConfig
  ) {}

  async getOverview({ orgId, actor }: TBillingRequest): Promise<{ overview: TBillingOverview }> {
    const access = BillingAccess.of(actor.principal, this.billingConfig.isCloud);
    await assertBillingRead(this.orgPermissionService, { actor, orgId, access });

    const organization = await this.organizationsService.findOrganization(orgId);
    if (!organization) {
      throw new EntityNotFoundError({ message: `Organization with ID '${orgId}' not found` });
    }

    // A reachable server with no subscription returns null. A failure means billing can't be read at all, so it
    // fails the page rather than showing the org as free.
    let subscriptionRecord: Awaited<ReturnType<TLicenseServerBilling["getSubscription"]>>;
    try {
      subscriptionRecord = await this.licenseBilling.getSubscription(orgId);
    } catch (error) {
      logger.error(error, `billing-v2: failed to read subscription [orgId=${orgId}]`);
      throw error;
    }
    const subscription = Subscription.restore(subscriptionRecord);
    const { isCloud } = this.billingConfig;
    const now = new Date();

    const profile = isCloud ? await this.readBillingProfile(orgId) : null;
    const catalog = subscription.hasItems() ? await this.readCatalogForEntitlements(orgId) : null;
    const entitlementsRecord = await this.readEntitlements(organization);
    const entitlements = EntitlementSet.build({ subscription, catalog, entitlements: entitlementsRecord, now });
    const trials = isCloud ? await this.readTrials(orgId, now) : TrialHistory.empty();

    return {
      overview: {
        isCloud,
        mode: isCloud ? "self-serve" : "managed",
        subState: subscription.state(),
        planName: subscription.planName(),
        billing: subscription.billingSummary(entitlements.activeProductCount()),
        payment: profile?.payment ?? null,
        billingDetails: profile?.billingDetails ?? null,
        invoices: profile?.invoices ?? [],
        entitlements: entitlements.toJSON(),
        trialedProductKeys: trials.productKeys(),
        trials: trials.toJSON(),
        onDemandAmount: entitlements.onDemandAmount(),
        trialPaymentDue: subscription.trialPaymentDue(),
        paymentAlert: subscription.paymentAlert(),
        checkoutFrozen: subscription.isCheckoutFrozen(),
        selfServe: subscription.isSelfServe()
      }
    };
  }

  async getCatalog({ orgId, actor }: TBillingRequest): Promise<{ products: TCatalogProductView[] }> {
    const access = BillingAccess.of(actor.principal, this.billingConfig.isCloud);
    await assertBillingRead(this.orgPermissionService, { actor, orgId, access });

    const catalog = await this.licenseBilling.getCatalog(orgId);
    if (!catalog) return { products: [] };
    const now = new Date();
    return { products: catalog.products.map((product) => CatalogProduct.restore(product).toView(now)) };
  }

  async refreshEntitlements({ orgId, actor }: TBillingRequest): Promise<{ success: true }> {
    await assertBillingRead(this.orgPermissionService, { actor, orgId });
    await this.licenseService.refreshPlan(orgId);
    return { success: true };
  }

  async getOrgPlan({ orgId, actor, refreshCache }: TGetOrgPlanInput): Promise<Plan> {
    await this.orgPermissionService.getOrgPermission({ actor, orgId });
    if (refreshCache) {
      await this.licenseService.refreshPlan(actor.org.rootOrgId);
    }
    return this.licenseService.getPlan(actor.org.rootOrgId);
  }

  // Payment method, billing identity and invoices come from the org's Stripe customer. A failure shows the empty
  // state rather than failing the page.
  private async readBillingProfile(orgId: string): Promise<{
    payment: TPaymentMethodView;
    billingDetails: TBillingDetailsView;
    invoices: TInvoiceView[];
  } | null> {
    try {
      const profile = await this.licenseBilling.getBillingProfile(orgId);
      if (!profile) return null;
      return {
        payment: profile.payment,
        // Extra License Server keys are stripped by the response schema.
        billingDetails: profile.billingDetails
          ? { ...profile.billingDetails, address: profile.billingDetails.address ?? null }
          : null,
        invoices: profile.invoices.map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          date: BillingDate.long(invoice.date) ?? "",
          amount: Money.dollars(invoice.amount),
          paid: invoice.paid,
          pdfUrl: invoice.pdfUrl ?? ""
        }))
      };
    } catch (error) {
      logger.error(error, `billing-v2: failed to read billing profile [orgId=${orgId}]`);
      return null;
    }
  }

  // Labels for the subscription's dimensions; without it they show their keys.
  private async readCatalogForEntitlements(orgId: string): Promise<TCatalogRecord | null> {
    try {
      const catalog = await this.licenseBilling.getCatalog(orgId);
      return catalog;
    } catch (error) {
      logger.error(error, `billing-v2: failed to read catalog for entitlement units [orgId=${orgId}]`);
      return null;
    }
  }

  private async readEntitlements(organization: { id: string; name: string; slug: string }) {
    try {
      const entitlements: TEntitlementsRecord | null = await this.licenseBilling.getEntitlements(organization);
      return entitlements;
    } catch (error) {
      logger.error(error, `billing-v2: failed to read entitlements [orgId=${organization.id}]`);
      return null;
    }
  }

  private async readTrials(orgId: string, now: Date): Promise<TrialHistory> {
    try {
      const trials = await this.licenseBilling.getTrials(orgId);
      return TrialHistory.fromServer(trials, now);
    } catch (error) {
      logger.error(error, `billing-v2: failed to read trial history [orgId=${orgId}]`);
      return TrialHistory.empty();
    }
  }
}
