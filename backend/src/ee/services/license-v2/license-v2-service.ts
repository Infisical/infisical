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
  TSubscriptionPreviewPayload,
  TSubscriptionResponse
} from "@app/services/license-client/license-client-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { isV2SelfHostedLicenseKey } from "../license/license-fns";
import { OrgPermissionBillingActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  BillingV2CatalogProduct,
  BillingV2CompareRow,
  BillingV2Dim,
  BillingV2Entitlement,
  BillingV2EntitlementDim,
  BillingV2Model,
  BillingV2Overview,
  BillingV2Plan,
  BillingV2Preview,
  BillingV2SubState,
  TAddBillingV2PaymentMethodDTO,
  TAddBillingV2ProductDTO,
  TBillingV2SubscriptionLifecycleDTO,
  TCreateBillingV2CheckoutSessionDTO,
  TCreateBillingV2PortalSessionDTO,
  TGetBillingV2CatalogDTO,
  TGetBillingV2OverviewDTO,
  TPreviewBillingV2ChangeDTO,
  TRemoveBillingV2ProductDTO
} from "./license-v2-types";

type TLicenseV2ServiceFactoryDep = {
  envConfig: Pick<TEnvConfig, "LICENSE_SERVER_V2_MODE" | "LICENSE_KEY">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "countAllOrgMembers">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "countAllOrgIdentities">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseClient: Pick<
    TLicenseClientFactory,
    | "getEntitlements"
    | "invalidateEntitlements"
    | "getCatalog"
    | "getSubscription"
    | "getCloudPlan"
    | "getBillingProfile"
    | "createCheckout"
    | "createPortal"
    | "previewSubscriptionChange"
    | "addSubscriptionItems"
    | "removeSubscriptionItem"
    | "cancelSubscription"
    | "resumeSubscription"
  >;
};

export type TLicenseV2ServiceFactory = ReturnType<typeof licenseV2ServiceFactory>;

// Used only when the catalog omits presentation for a product; the icon name resolves to a generic
// glyph on the client.
const FALLBACK_ICON = "box";
const FALLBACK_COLOR = "#6b7280";

// Self-hosted has no cloud-plan endpoint, so the org seat caps ride on the license entitlements
// instead. These keys mirror the v2 keys in dual-read feature-mapping (MaxIdentities.key, member_limit).
const IDENTITY_LIMIT_FEATURE_KEY = "max_identities";
const MEMBER_LIMIT_FEATURE_KEY = "member_limit";

const CATALOG_MODELS: BillingV2Model[] = ["seat", "usage", "limit", "flat"];

const toModel = (model: string): BillingV2Model => {
  if (CATALOG_MODELS.includes(model as BillingV2Model)) {
    return model as BillingV2Model;
  }
  return "usage";
};

// Price kinds we understand; an unknown kind is treated as non-purchasable, never sold as per_unit.
const PER_UNIT_KIND = "per_unit";
const METERED_KIND = "metered";
const KNOWN_PRICE_KINDS: readonly string[] = [PER_UNIT_KIND, METERED_KIND];
const isKnownPriceKind = (kind: string): boolean => KNOWN_PRICE_KINDS.includes(kind);

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

// A plan carries pricing as a known-kind price, a flat base fee, or both. An unknown price kind is
// treated as non-purchasable (never sold as per_unit); a base-only plan (e.g. the NHI add-on, a base
// fee with no priced dimensions) must still count as priced.
const planHasPricing = (plan: TCatalogProduct["plans"][number]): boolean =>
  plan.prices.some((price) => isKnownPriceKind(price.kind)) ||
  (plan.basePriceMonthlyCents !== null && plan.basePriceMonthlyCents !== undefined) ||
  (plan.basePriceAnnualCents !== null && plan.basePriceAnnualCents !== undefined);

// The paid self-serve plan (e.g. "pro"); the free tier is self-serve too but carries no pricing.
const findPaidSelfServePlan = (product: TCatalogProduct) =>
  product.plans.find((plan) => plan.selfServe === true && plan.tier !== "free" && planHasPricing(plan));

// Project a single catalog plan into the UI shape: fold its per-dimension/per-cadence prices into the
// dim view, and surface its base fee when it has one. Each plan carries its own pricing, so a product
// with several tiers (pro, advanced, pro+) maps each tier independently. metered is tracked per cadence
// so a dimension priced per_unit on one cadence and metered on the other doesn't mislabel both.
const toPlan = (product: TCatalogProduct, plan: TCatalogProduct["plans"][number]): BillingV2Plan => {
  const priceByDim = new Map<
    string,
    { monthly: number; annual: number; included: number; meteredMonthly: boolean; meteredAnnual: boolean }
  >();
  plan.prices.forEach((price) => {
    if (!isKnownPriceKind(price.kind)) {
      return;
    }
    const entry = priceByDim.get(price.dimensionKey) ?? {
      monthly: 0,
      annual: 0,
      included: 0,
      meteredMonthly: false,
      meteredAnnual: false
    };
    if (price.cadence === "annual") {
      entry.annual = centsToDollars(price.unitAmountCents);
      entry.meteredAnnual = price.kind === METERED_KIND;
    } else {
      entry.monthly = centsToDollars(price.unitAmountCents);
      entry.meteredMonthly = price.kind === METERED_KIND;
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
      included: priced.included,
      meteredMonthly: priced.meteredMonthly,
      meteredAnnual: priced.meteredAnnual
    });
  });

  const result: BillingV2Plan = {
    tier: plan.tier,
    name: plan.name,
    selfServe: plan.selfServe,
    salesLed: plan.salesLed,
    feature: plan.feature,
    dims
  };

  const baseMonthly = plan.basePriceMonthlyCents;
  const baseAnnual = plan.basePriceAnnualCents;
  if ((baseMonthly !== null && baseMonthly !== undefined) || (baseAnnual !== null && baseAnnual !== undefined)) {
    result.base = { monthly: centsToDollars(baseMonthly), annual: centsToDollars(baseAnnual) };
  }

  return result;
};

const toCatalogProduct = (product: TCatalogProduct): BillingV2CatalogProduct => {
  // Surface every paid self-serve plan plus any sales-led plan, in catalog order; the free tier is
  // implicit and never rendered as an upgrade option.
  const plans = product.plans
    .filter(
      (plan) => plan.tier !== "free" && ((plan.selfServe === true && planHasPricing(plan)) || plan.salesLed === true)
    )
    .map((plan) => toPlan(product, plan));

  // Keep every comparison cell keyed by its tier so the UI can render a column per plan.
  const compare: BillingV2CompareRow[] = product.comparison.map((row) => {
    const cells: Record<string, string | boolean | number> = {};
    row.cells.forEach((cell) => {
      cells[cell.tier] = cell.value;
    });
    return { label: row.label, cells };
  });

  return {
    id: product.id,
    name: product.name,
    icon: product.icon || FALLBACK_ICON,
    color: product.color || FALLBACK_COLOR,
    model: toModel(product.model),
    addon: product.addon,
    desc: product.description ?? "",
    tagline: product.tagline,
    plans,
    includes: product.includes,
    compare
  };
};

// Translates a catalog product into the line items the checkout endpoint expects: the chosen plan's
// per_unit dimensions at quantity 1. Metered and base lines are added server-side, so a metered-only
// or base-only plan (e.g. the NHI add-on) checks out with no quantities.
const buildCheckoutItems = (
  product: TCatalogProduct,
  cadence: "monthly" | "annual",
  planTier?: string
): TCheckoutLineItem[] | null => {
  // A requested tier must resolve to a self-serve plan; with none requested, fall back to the first
  // paid self-serve plan (the legacy single-"pro" behaviour).
  const plan = planTier
    ? product.plans.find((candidate) => candidate.tier === planTier && candidate.selfServe === true)
    : findPaidSelfServePlan(product);
  if (!plan) {
    return null;
  }

  const quantities: Record<string, number> = {};
  const perUnitPrice = plan.prices.find(
    (candidate) => candidate.cadence === cadence && candidate.kind === PER_UNIT_KIND && candidate.unitAmountCents > 0
  );
  if (perUnitPrice) {
    quantities[perUnitPrice.dimensionKey] = 1;
  }

  const hasMetered = plan.prices.some((candidate) => candidate.cadence === cadence && candidate.kind === METERED_KIND);
  const baseForCadence = cadence === "annual" ? plan.basePriceAnnualCents : plan.basePriceMonthlyCents;
  const hasBase = baseForCadence !== null && baseForCadence !== undefined;
  if (!perUnitPrice && !hasMetered && !hasBase) {
    return null;
  }

  return [
    {
      productId: product.id,
      plan: plan.tier,
      cadence,
      quantities
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
  // A self-hosted v2 license is managed out-of-band: the billing surface is read-only. Self-serve
  // mutations don't need an explicit guard here, the self-hosted license client rejects them itself.
  const isSelfHostedLicense = isV2SelfHostedLicenseKey(envConfig.LICENSE_KEY ?? "");

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

    const labelByDimension = new Map<string, string>();
    const nounByDimension = new Map<string, string>();
    // Fetch the catalog when any item carries dimensions or limits to name; the pinned subscription
    // dimensions supply used/limit/rate, the catalog supplies each dimension's label and noun.
    const needsCatalog = Boolean(
      subscription?.items.some((item) => item.dimensions.length > 0 || Object.keys(item.limits).length > 0)
    );
    if (needsCatalog) {
      try {
        const catalog = await licenseClient.getCatalog();
        catalog?.products.forEach((product) => {
          product.dimensions.forEach((dimension) => {
            labelByDimension.set(`${product.id}:${dimension.key}`, dimension.label);
            nounByDimension.set(`${product.id}:${dimension.key}`, dimension.noun);
          });
        });
      } catch (error) {
        logger.error(error, `billing-v2: failed to read catalog for entitlement units [orgId=${org.id}]`);
      }
    }

    if (subscription) {
      subscription.items.forEach((item) => {
        // Resolve the pinned per-dimension contract into a display-ready list: label/noun from the
        // catalog, metered/used/limit/rate/freeBand from the org's pinned subscription version. Money
        // is converted to dollars here so *Cents fields never reach the client. rate/freeBand are set
        // only for metered dimensions; per-unit dimensions get their rate from the catalog client-side.
        const dimensions: BillingV2EntitlementDim[] = item.dimensions.map((dimension) => {
          const catalogKey = `${item.productId}:${dimension.key}`;
          const metered = dimension.metered ?? false;
          const hasRate = dimension.rateCents !== null && dimension.rateCents !== undefined;
          const hasFreeBand = dimension.freeBand !== null && dimension.freeBand !== undefined;
          return {
            key: dimension.key,
            label: labelByDimension.get(catalogKey) ?? dimension.key,
            noun: nounByDimension.get(catalogKey) ?? dimension.unit ?? dimension.key,
            unit: dimension.unit ?? nounByDimension.get(catalogKey) ?? dimension.key,
            metered,
            used: dimension.used ?? 0,
            limit: dimension.limit ?? null,
            ...(metered && hasFreeBand ? { freeBand: dimension.freeBand as number } : {}),
            ...(metered && hasRate ? { rate: centsToDollars(dimension.rateCents) } : {})
          };
        });

        // Estimated metered usage cost for the period: sum of max(0, used - freeBand) * rate over the
        // metered dimensions. Fixed recurring (item.amount) excludes this per the contract.
        const estimatedUsageAmount = dimensions.reduce((sum, dimension) => {
          if (!dimension.metered || dimension.rate === undefined) {
            return sum;
          }
          return sum + Math.max(0, dimension.used - (dimension.freeBand ?? 0)) * dimension.rate;
        }, 0);

        // Collapsed "most constraining" summary retained for callers that render a single limit line
        // (the product sheet). Derived from the resolved dimensions when present, else from the legacy
        // limits/quantities maps for older license servers. "Most constraining" = the highest
        // utilization (closest to, or furthest past, its cap), i.e. the limit the customer is likeliest
        // to hit; each limit is paired with its OWN quantity so the resolved unit matches the count.
        const limitPairs: [string, number][] =
          dimensions.length > 0
            ? dimensions
                .filter((dimension) => dimension.limit !== null)
                .map((dimension) => [dimension.key, dimension.limit as number])
            : Object.entries(item.limits);
        const usedForKey = (key: string): number =>
          dimensions.length > 0
            ? (dimensions.find((dimension) => dimension.key === key)?.used ?? 0)
            : (item.quantities[key] ?? 0);

        let used = 0;
        let limit: number | null = null;
        let limitKey: string | null = null;
        let highestUtilization = -1;
        // Plain for-of (not forEach): assignments inside a closure don't refine the outer
        // variable's type, so after a forEach TS still sees limitKey as null and the `limitKey ?`
        // branch below collapses to `never`. A same-scope loop lets control-flow keep it string|null.
        for (const [key, dimensionLimit] of limitPairs) {
          const dimensionUsed = usedForKey(key);
          // An unlimited (<= 0) cap can't be "hit"; only a positive cap yields a real ratio.
          const utilization =
            // eslint-disable-next-line no-nested-ternary
            dimensionLimit > 0 ? dimensionUsed / dimensionLimit : dimensionUsed > 0 ? Infinity : 0;
          if (limitKey === null || utilization > highestUtilization) {
            highestUtilization = utilization;
            used = dimensionUsed;
            limit = dimensionLimit;
            limitKey = key;
          }
        }

        const unit = limitKey ? (nounByDimension.get(`${item.productId}:${limitKey}`) ?? null) : null;

        entitlements[item.productId] = {
          entitled: true,
          planTier: item.plan,
          amount: item.amount !== undefined ? centsToDollars(item.amount) : undefined,
          estimatedUsageAmount,
          dimensions: dimensions.length > 0 ? dimensions : undefined,
          used,
          limit,
          unit
        };
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
    // are overlaid here; a missing plan leaves limits unknown. Self-hosted has no cloud-plan endpoint,
    // so the caps are read off the license entitlements instead.
    let memberLimit: number | null = null;
    let identityLimit: number | null = null;
    if (isSelfHostedLicense) {
      try {
        const entitlements = await licenseClient.getEntitlements({
          id: orgId,
          name: organization.name,
          slug: organization.slug
        });
        const memberCap = entitlements?.features[MEMBER_LIMIT_FEATURE_KEY]?.value;
        const identityCap = entitlements?.features[IDENTITY_LIMIT_FEATURE_KEY]?.value;
        memberLimit = typeof memberCap === "number" ? memberCap : null;
        identityLimit = typeof identityCap === "number" ? identityCap : null;
      } catch (error) {
        logger.error(error, `billing-v2: failed to read entitlement caps [orgId=${orgId}]`);
      }
    } else {
      try {
        const cloudPlan = await licenseClient.getCloudPlan(orgId);
        memberLimit = cloudPlan?.currentPlan.memberLimit ?? null;
        identityLimit = cloudPlan?.currentPlan.identityLimit ?? null;
      } catch (error) {
        logger.error(error, `billing-v2: failed to read cloud plan [orgId=${orgId}]`);
      }
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
    // Self-hosted has no Stripe customer (no billing profile endpoint); leave payment/invoices empty.
    try {
      const profile = isSelfHostedLicense ? null : await licenseClient.getBillingProfile(orgId);
      if (profile) {
        payment = profile.payment;
        // name/email/address/taxIds pass straight through (address keeps its nullable sub-fields;
        // the UI drops blank lines). The ?? null just normalizes an absent address to null, and any
        // extra license-server keys the spread carries are stripped by the response schema.
        billingDetails = profile.billingDetails
          ? { ...profile.billingDetails, address: profile.billingDetails.address ?? null }
          : null;
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

    const entitlements = await buildEntitlements(
      { id: orgId, name: organization.name, slug: organization.slug },
      subscription
    );
    // Org-wide projected metered usage (dollars): the summary adds this to recurringAmount for the
    // next-month total, so every product's estimate is summed once here.
    const estimatedUsageAmount = Object.values(entitlements).reduce(
      (sum, entitlement) => sum + (entitlement.estimatedUsageAmount ?? 0),
      0
    );

    const overview: BillingV2Overview = {
      // Self-hosted is a read-only, managed view: the UI hides payment/invoices/details and shows the
      // "managed by your account team" banner off these two fields.
      isCloud: !isSelfHostedLicense,
      mode: isSelfHostedLicense ? "managed" : "self-serve",
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
      entitlements,
      estimatedUsageAmount
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
    plan,
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

    const items = buildCheckoutItems(product, normalizeCadence(cadence), plan);
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

  // Resolve a catalog product id + cadence into the license-server line items, shared by the
  // preview and add paths so both price the same way checkout does.
  const resolveAddItems = async (
    productId: string,
    cadence?: "monthly" | "annual",
    plan?: string
  ): Promise<TCheckoutLineItem[]> => {
    const catalog = await licenseClient.getCatalog();
    const product = catalog?.products.find((candidate) => candidate.id === productId);
    if (!product) {
      throw new NotFoundError({ message: `Product with ID '${productId}' not found` });
    }
    const items = buildCheckoutItems(product, normalizeCadence(cadence), plan);
    if (!items) {
      throw new BadRequestError({ message: "This product is not available for self-serve checkout" });
    }
    return items;
  };

  // Preview the proration impact of adding or removing a product before it is committed, so the UI
  // can show an explicit confirmation. Amounts come back as dollars (cents / 100) to match overview.
  const previewChange = async ({
    orgId,
    actor,
    addProductId,
    plan,
    cadence,
    removeProductId
  }: TPreviewBillingV2ChangeDTO): Promise<{ preview: BillingV2Preview }> => {
    await ensureManageBilling(orgId, actor);
    if (!addProductId && !removeProductId) {
      throw new BadRequestError({ message: "Provide a product to add or remove" });
    }

    const payload: TSubscriptionPreviewPayload = {};
    if (addProductId) {
      payload.add = await resolveAddItems(addProductId, cadence, plan);
    }
    if (removeProductId) {
      payload.remove = [removeProductId];
    }

    const preview = await licenseClient.previewSubscriptionChange(orgId, payload);
    const estimatedUsage = centsToDollars(preview.estimatedUsageCents);
    return {
      preview: {
        currency: preview.currency,
        prorationAmount: centsToDollars(preview.prorationAmount),
        nextInvoiceTotal: centsToDollars(preview.nextInvoiceTotal),
        nextRecurringTotal: centsToDollars(preview.nextRecurringTotal),
        prorationDate: preview.prorationDate,
        lines: preview.lines.map((line) => ({
          description: line.description,
          amount: centsToDollars(line.amount),
          proration: line.proration
        })),
        estimatedUsage,
        estimatedUsageLines: preview.estimatedUsageLines.map((line) => ({
          dimension: line.dimension,
          unit: line.unit ?? line.dimension,
          peak: line.peak,
          freeBand: line.freeBand,
          rate: centsToDollars(line.rateCents),
          amount: centsToDollars(line.amountCents)
        })),
        // Fall back to nextRecurringTotal + estimatedUsage when an older server omits estimatedTotal.
        estimatedTotal:
          preview.estimatedTotal !== null && preview.estimatedTotal !== undefined
            ? centsToDollars(preview.estimatedTotal)
            : centsToDollars(preview.nextRecurringTotal) + estimatedUsage
      }
    };
  };

  // Add a product to an existing active subscription (clears any scheduled cancel server-side). The
  // first-purchase / no-subscription path stays on checkoutSession, which opens Stripe Checkout.
  const addProduct = async ({ orgId, actor, productId, plan, cadence }: TAddBillingV2ProductDTO) => {
    await ensureManageBilling(orgId, actor);
    const items = await resolveAddItems(productId, cadence, plan);
    const result = await licenseClient.addSubscriptionItems(orgId, { items });
    await licenseClient.invalidateEntitlements(orgId);
    return { subscriptionId: result.subscriptionId };
  };

  // Remove a single product from a multi-product subscription, the operation the Stripe Customer
  // Portal cannot do. The license server prorates at commit time (Stripe default = now).
  const removeProduct = async ({ orgId, actor, productId }: TRemoveBillingV2ProductDTO) => {
    await ensureManageBilling(orgId, actor);
    const result = await licenseClient.removeSubscriptionItem(orgId, productId);
    await licenseClient.invalidateEntitlements(orgId);
    return { subscriptionId: result.subscriptionId };
  };

  const cancelSubscription = async ({ orgId, actor }: TBillingV2SubscriptionLifecycleDTO) => {
    await ensureManageBilling(orgId, actor);
    const result = await licenseClient.cancelSubscription(orgId);
    await licenseClient.invalidateEntitlements(orgId);
    return { subscriptionId: result.subscriptionId };
  };

  const resumeSubscription = async ({ orgId, actor }: TBillingV2SubscriptionLifecycleDTO) => {
    await ensureManageBilling(orgId, actor);
    const result = await licenseClient.resumeSubscription(orgId);
    await licenseClient.invalidateEntitlements(orgId);
    return { subscriptionId: result.subscriptionId };
  };

  return {
    // Billing surface (portal, checkout, overview) goes live only at full v2 cutover, not during read-compare.
    isEnabled: () => envConfig.LICENSE_SERVER_V2_MODE === "on",
    getOverview,
    getCatalog,
    portalSession,
    checkoutSession,
    addPaymentMethod,
    previewChange,
    addProduct,
    removeProduct,
    cancelSubscription,
    resumeSubscription
  };
};
