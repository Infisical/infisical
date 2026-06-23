import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas";
import { TEnvConfig } from "@app/lib/config/env";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TIdentityOrgDALFactory } from "@app/services/identity/identity-org-dal";
import { TLicenseClientFactory } from "@app/services/license-client";
import {
  TCatalogProduct,
  TCheckoutLineItem,
  TEntitlementOrg,
  TSubscriptionResponse
} from "@app/services/license-client/license-client-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { OrgPermissionBillingActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  BillingV2CatalogProduct,
  BillingV2CompareRow,
  BillingV2Dim,
  BillingV2Entitlement,
  BillingV2Model,
  BillingV2Overview,
  BillingV2SubState,
  TAddBillingV2PaymentMethodDTO,
  TCreateBillingV2CheckoutSessionDTO,
  TCreateBillingV2PortalSessionDTO,
  TGetBillingV2CatalogDTO,
  TGetBillingV2OverviewDTO
} from "./license-v2-types";

type TLicenseV2ServiceFactoryDep = {
  envConfig: Pick<TEnvConfig, "LICENSE_SERVER_V2_MODE">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "countAllOrgMembers">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "countAllOrgIdentities">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseClient: Pick<
    TLicenseClientFactory,
    | "getEntitlements"
    | "getCatalog"
    | "getSubscription"
    | "getCloudPlan"
    | "getBillingProfile"
    | "createCheckout"
    | "createPortal"
  >;
};

export type TLicenseV2ServiceFactory = ReturnType<typeof licenseV2ServiceFactory>;

// Used only when the catalog omits presentation for a product; the icon name resolves to a generic
// glyph on the client.
const FALLBACK_ICON = "box";
const FALLBACK_COLOR = "#6b7280";

const CATALOG_MODELS: BillingV2Model[] = ["seat", "usage", "limit", "flat"];

const toModel = (model: string): BillingV2Model => {
  if (CATALOG_MODELS.includes(model as BillingV2Model)) {
    return model as BillingV2Model;
  }
  return "usage";
};

const centsToDollars = (cents: number | null | undefined): number => {
  if (!cents) {
    return 0;
  }
  return cents / 100;
};

const formatDate = (unixSeconds: number | null | undefined): string | null => {
  if (!unixSeconds) {
    return null;
  }
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
};

const resolveSubState = (subscription: TSubscriptionResponse | null): BillingV2SubState => {
  if (!subscription || !subscription.status) {
    return "no-subscription";
  }
  const status = subscription.status.toLowerCase();
  if (status === "trialing") {
    return "trialing";
  }
  if (status === "past_due") {
    return "past-due";
  }
  if (status === "unpaid" || status === "canceled" || status === "incomplete") {
    return "suspended";
  }
  if (status === "none" || status === "") {
    return "no-subscription";
  }
  return "active";
};

const resolveInterval = (cadence: string | null | undefined): "month" | "year" | null => {
  if (cadence === "month" || cadence === "year") {
    return cadence;
  }
  return null;
};

const normalizeCadence = (cadence: string | undefined): "monthly" | "annual" => {
  if (cadence === "annual") {
    return "annual";
  }
  return "monthly";
};

// The paid self-serve plan (e.g. "pro"); the free tier is self-serve too but carries no prices.
const findPaidSelfServePlan = (product: TCatalogProduct) =>
  product.plans.find((plan) => plan.selfServe === true && plan.tier !== "free" && plan.prices.length > 0);

const toCatalogProduct = (product: TCatalogProduct): BillingV2CatalogProduct => {
  const paidSelfServePlan = findPaidSelfServePlan(product);
  const salesLedPlan = product.plans.find((plan) => plan.salesLed === true);

  // Fold the plan's per-dimension/per-cadence prices into the dim view the UI renders.
  const priceByDim = new Map<string, { monthly: number; annual: number; included: number }>();
  (paidSelfServePlan?.prices ?? []).forEach((price) => {
    const entry = priceByDim.get(price.dimensionKey) ?? { monthly: 0, annual: 0, included: 0 };
    if (price.cadence === "annual") {
      entry.annual = centsToDollars(price.unitAmountCents);
    } else {
      entry.monthly = centsToDollars(price.unitAmountCents);
    }
    if (price.includedQuantity !== null && price.includedQuantity !== undefined) {
      entry.included = price.includedQuantity;
    }
    priceByDim.set(price.dimensionKey, entry);
  });

  const dims: BillingV2Dim[] = [];
  product.dimensions.forEach((dimension) => {
    const priced = priceByDim.get(dimension.key);
    if (!priced) {
      return;
    }
    dims.push({
      key: dimension.key,
      label: dimension.label,
      noun: dimension.noun,
      monthly: priced.monthly,
      annual: priced.annual,
      included: priced.included
    });
  });

  const pro: BillingV2CatalogProduct["pro"] = {
    proFeature: paidSelfServePlan?.feature ?? "",
    planKey: paidSelfServePlan?.tier,
    dims
  };
  const baseMonthly = paidSelfServePlan?.basePriceMonthlyCents;
  const baseAnnual = paidSelfServePlan?.basePriceAnnualCents;
  if ((baseMonthly !== null && baseMonthly !== undefined) || (baseAnnual !== null && baseAnnual !== undefined)) {
    pro.base = { monthly: centsToDollars(baseMonthly), annual: centsToDollars(baseAnnual) };
  }

  let enterprise: BillingV2CatalogProduct["enterprise"] = null;
  if (salesLedPlan) {
    enterprise = { sales: true, feature: salesLedPlan.feature ?? "" };
  }

  const cellValue = (cells: { tier: string; value: string | boolean }[], tier: string): string | boolean => {
    const cell = cells.find((candidate) => candidate.tier === tier);
    if (!cell) {
      return false;
    }
    return cell.value;
  };

  const compare: BillingV2CompareRow[] = product.comparison.map((row) => ({
    label: row.label,
    pro: cellValue(row.cells, "pro"),
    ent: cellValue(row.cells, "enterprise")
  }));

  return {
    id: product.id,
    name: product.name,
    icon: product.icon || FALLBACK_ICON,
    color: product.color || FALLBACK_COLOR,
    model: toModel(product.model),
    addon: product.addon,
    desc: product.description ?? "",
    tagline: product.tagline,
    pro,
    enterprise,
    includes: product.includes,
    compare
  };
};

// Translates a catalog product into the line items the checkout endpoint expects: its paid
// self-serve plan plus the primary priced dimension for the chosen cadence at quantity 1.
const buildCheckoutItems = (product: TCatalogProduct, cadence: "monthly" | "annual"): TCheckoutLineItem[] | null => {
  const paidSelfServePlan = findPaidSelfServePlan(product);
  if (!paidSelfServePlan) {
    return null;
  }

  const price = paidSelfServePlan.prices.find(
    (candidate) => candidate.cadence === cadence && candidate.unitAmountCents > 0
  );
  if (!price) {
    return null;
  }

  return [
    {
      productId: product.id,
      plan: paidSelfServePlan.tier,
      cadence,
      quantities: { [price.dimensionKey]: 1 }
    }
  ];
};

export const licenseV2ServiceFactory = ({
  envConfig,
  orgDAL,
  identityOrgMembershipDAL,
  permissionService,
  licenseClient
}: TLicenseV2ServiceFactoryDep) => {
  const ensureBillingRead = async (orgId: string, actor: TGetBillingV2OverviewDTO["actor"]) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);
  };

  const ensureManageBilling = async (orgId: string, actor: TGetBillingV2OverviewDTO["actor"]) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );
  };

  // Fold the subscription items and the entitlement features sourced from a product into a single
  // per-product entitlement map, keyed by the server's product ids.
  const buildEntitlements = async (org: TEntitlementOrg, subscription: TSubscriptionResponse | null) => {
    const entitlements: Record<string, BillingV2Entitlement> = {};

    if (subscription) {
      subscription.items.forEach((item) => {
        const quantityValues = Object.values(item.quantities);
        let used = 0;
        if (quantityValues.length > 0) {
          used = Math.max(...quantityValues);
        }

        const limitValues = Object.values(item.limits);
        let limit: number | null = null;
        if (limitValues.length > 0) {
          limit = Math.max(...limitValues);
        }

        entitlements[item.productId] = { entitled: true, used, limit };
      });
    }

    let features = null;
    try {
      const result = await licenseClient.getEntitlements(org);
      features = result?.features ?? null;
    } catch (error) {
      logger.error(error, `billing-v2: failed to read entitlements [orgId=${org.id}]`);
    }

    if (features) {
      Object.values(features).forEach((feature) => {
        const productId = feature.from_product;
        if (!productId) {
          return;
        }
        if (!entitlements[productId]) {
          entitlements[productId] = { entitled: true };
        }
      });
    }

    return entitlements;
  };

  const getOverview = async ({ orgId, actor }: TGetBillingV2OverviewDTO) => {
    await ensureBillingRead(orgId, actor);

    const organization = await orgDAL.findById(orgId);
    if (!organization) {
      throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
    }

    // A reachable server with no subscription returns null; a thrown error means the billing service
    // is unreachable, so surface it (the UI shows an error state) rather than masquerading as "Free".
    let subscription: TSubscriptionResponse | null = null;
    try {
      subscription = await licenseClient.getSubscription(orgId);
    } catch (error) {
      logger.error(error, `billing-v2: failed to read subscription [orgId=${orgId}]`);
      throw error;
    }

    const subState = resolveSubState(subscription);

    let interval: "month" | "year" | null = null;
    let nextBillingDate: string | null = null;
    let recurringAmount: number | null = null;
    if (subscription) {
      interval = resolveInterval(subscription.cadence);
      nextBillingDate = formatDate(subscription.currentPeriodEnd);
      if (subscription.recurringTotal !== null) {
        recurringAmount = centsToDollars(subscription.recurringTotal);
      }
    }

    const members = await orgDAL.countAllOrgMembers(orgId);
    const identities = await identityOrgMembershipDAL.countAllOrgIdentities({
      scopeOrgId: orgId
    });

    // Plan caps come from the license server (a null limit means genuinely unlimited). Used counts
    // are overlaid here; a missing plan leaves limits unknown.
    let memberLimit: number | null = null;
    let identityLimit: number | null = null;
    try {
      const cloudPlan = await licenseClient.getCloudPlan(orgId);
      memberLimit = cloudPlan?.currentPlan.memberLimit ?? null;
      identityLimit = cloudPlan?.currentPlan.identityLimit ?? null;
    } catch (error) {
      logger.error(error, `billing-v2: failed to read cloud plan [orgId=${orgId}]`);
    }

    // Name the plan from the subscription's tier so enterprise/trial orgs aren't all labelled "Pro".
    let planName = "Free";
    if (subState !== "no-subscription") {
      const tier = subscription?.items[0]?.plan;
      if (tier) {
        planName = tier.charAt(0).toUpperCase() + tier.slice(1);
      } else {
        planName = "Pro";
      }
    }

    // Payment method, billing identity, and invoices come from the org's Stripe customer. A
    // failure (or unconfigured backend) degrades to the empty state rather than failing the page.
    let payment: BillingV2Overview["payment"] = null;
    let billingDetails: BillingV2Overview["billingDetails"] = null;
    let invoices: BillingV2Overview["invoices"] = [];
    try {
      const profile = await licenseClient.getBillingProfile(orgId);
      if (profile) {
        payment = profile.payment;
        billingDetails = profile.billingDetails;
        invoices = profile.invoices.map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          date: formatDate(invoice.date) ?? "",
          amount: centsToDollars(invoice.amount),
          paid: invoice.paid,
          pdfUrl: invoice.pdfUrl ?? ""
        }));
      }
    } catch (error) {
      logger.error(error, `billing-v2: failed to read billing profile [orgId=${orgId}]`);
    }

    const overview: BillingV2Overview = {
      isCloud: true,
      mode: "self-serve",
      subState,
      planName,
      nextBillingDate,
      recurringAmount,
      interval,
      usage: {
        members,
        memberLimit,
        identities,
        identityLimit
      },
      payment,
      billingDetails,
      invoices,
      entitlements: await buildEntitlements(
        { id: orgId, name: organization.name, slug: organization.slug },
        subscription
      )
    };

    return { overview };
  };

  const getCatalog = async ({ orgId, actor }: TGetBillingV2CatalogDTO) => {
    await ensureBillingRead(orgId, actor);

    const catalog = await licenseClient.getCatalog();
    if (!catalog) {
      return { products: [] };
    }

    const products = catalog.products.map(toCatalogProduct);
    return { products };
  };

  // Stripe billing portal: manages the existing subscription, payment methods, and billing details.
  const openPortal = async (orgId: string, returnPath?: string) => {
    const session = await licenseClient.createPortal(orgId, { returnPath });
    return { url: session.url };
  };

  const portalSession = async ({ orgId, actor, returnPath }: TCreateBillingV2PortalSessionDTO) => {
    await ensureManageBilling(orgId, actor);
    return openPortal(orgId, returnPath);
  };

  const checkoutSession = async ({
    orgId,
    actor,
    productId,
    cadence,
    email,
    returnPath
  }: TCreateBillingV2CheckoutSessionDTO) => {
    await ensureManageBilling(orgId, actor);

    const catalog = await licenseClient.getCatalog();
    const product = catalog?.products.find((candidate) => candidate.id === productId);
    if (!product) {
      throw new NotFoundError({ message: `Product with ID '${productId}' not found` });
    }

    const items = buildCheckoutItems(product, normalizeCadence(cadence));
    if (!items) {
      throw new BadRequestError({ message: "This product is not available for self-serve checkout" });
    }

    const result = await licenseClient.createCheckout(orgId, { items, email, returnPath });
    if (result.outcome === "subscription_updated") {
      return { outcome: "subscription_updated" as const, subscriptionId: result.subscriptionId };
    }

    // checkout_created: the customer must finish in Stripe Checkout.
    if (!result.checkoutUrl) {
      throw new InternalServerError({ message: "Checkout session did not return a URL" });
    }
    return { outcome: "checkout_created" as const, checkoutUrl: result.checkoutUrl };
  };

  const addPaymentMethod = async ({ orgId, actor, returnPath }: TAddBillingV2PaymentMethodDTO) => {
    await ensureManageBilling(orgId, actor);
    return openPortal(orgId, returnPath);
  };

  return {
    // Billing surface (portal, checkout, overview) goes live only at full v2 cutover, not during read-compare.
    isEnabled: () => envConfig.LICENSE_SERVER_V2_MODE === "on",
    getOverview,
    getCatalog,
    portalSession,
    checkoutSession,
    addPaymentMethod
  };
};
