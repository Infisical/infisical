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
import { TMeteredFeature } from "@app/services/license-client/usage";
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
  BillingV2Overview,
  BillingV2Plan,
  BillingV2Preview,
  BillingV2SubState,
  TAddBillingV2PaymentMethodDTO,
  TAddBillingV2ProductDTO,
  TBillingV2SubscriptionLifecycleDTO,
  TCancelBillingV2TrialDTO,
  TChangeBillingV2CommitmentDTO,
  TCreateBillingV2CheckoutSessionDTO,
  TCreateBillingV2PortalSessionDTO,
  TGetBillingV2CatalogDTO,
  TGetBillingV2OverviewDTO,
  TPreviewBillingV2ChangeDTO,
  TRemoveBillingV2ProductDTO,
  TStartBillingV2TrialDTO
} from "./license-v2-types";

type TLicenseV2ServiceFactoryDep = {
  envConfig: Pick<TEnvConfig, "LICENSE_SERVER_V2_MODE" | "LICENSE_KEY">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "countAllOrgMembers">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "countAllOrgIdentities">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  // Feature-keyed live-count fns (the same source the usage meter uses), so per-unit dimensions can
  // show real utilization instead of the zero the license server reports for non-metered dimensions.
  meteredFeatures: TMeteredFeature[];
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
    | "changeCommitment"
    | "startTrial"
    | "cancelTrial"
    | "getTrials"
    | "cancelSubscription"
    | "resumeSubscription"
  >;
};

export type TLicenseV2ServiceFactory = ReturnType<typeof licenseV2ServiceFactory>;

// Used only when the catalog omits presentation for a product; the icon name resolves to a generic
// glyph on the client.
const FALLBACK_ICON = "box";
const FALLBACK_COLOR = "#6b7280";

// Feature key for the identity seat dimension (mirrors MaxIdentities.key in dual-read feature-mapping);
// used to seed that dimension's usage when building entitlements.
const IDENTITY_LIMIT_FEATURE_KEY = "max_identities";

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

// Entitlement product dates (trial_ends_at, current_period_end) are ISO strings, not unix seconds.
const formatIsoDate = (iso: string | null | undefined): string | null => {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

// Compact date ("Aug 16") for the header's next-charge line, where the year is noise.
const formatShortDate = (unixSeconds: number | null | undefined): string | null => {
  if (!unixSeconds) {
    return null;
  }
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

const normalizeCadence = (cadence: string | undefined): "monthly" | "annual" => {
  if (cadence === "annual") {
    return "annual";
  }
  return "monthly";
};

// Per-dimension cadence off the subscription contract; "" or anything unknown resolves to null.
const toCadence = (cadence: string | null | undefined): "monthly" | "annual" | null => {
  if (cadence === "annual") {
    return "annual";
  }
  if (cadence === "monthly") {
    return "monthly";
  }
  return null;
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
    trialable: plan.trialable ?? false,
    displayOrder: plan.displayOrder ?? undefined,
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
    addon: product.addon,
    tagline: product.tagline,
    displayOrder: product.displayOrder ?? undefined,
    plans,
    includes: product.includes,
    compare
  };
};

// Translates a catalog product into the line item the checkout endpoint expects. Monthly is
// usage-based (no commitment); an annual per_resource line carries the caller-chosen per-dimension
// commitments. Metered and base lines are added server-side. Returns null when the plan is not
// purchasable for the cadence (no priced line and no base fee).
const buildCheckoutItems = (
  product: TCatalogProduct,
  cadence: "monthly" | "annual",
  planTier?: string,
  commitments?: Record<string, number>
): TCheckoutLineItem[] | null => {
  // A requested tier must resolve to a self-serve plan; with none requested, fall back to the first
  // paid self-serve plan (the legacy single-"pro" behaviour).
  const plan = planTier
    ? product.plans.find((candidate) => candidate.tier === planTier && candidate.selfServe === true)
    : findPaidSelfServePlan(product);
  if (!plan) {
    return null;
  }

  const hasPriceForCadence = plan.prices.some(
    (candidate) => candidate.cadence === cadence && isKnownPriceKind(candidate.kind)
  );
  const baseForCadence = cadence === "annual" ? plan.basePriceAnnualCents : plan.basePriceMonthlyCents;
  const hasBase = baseForCadence !== null && baseForCadence !== undefined;
  if (!hasPriceForCadence && !hasBase) {
    return null;
  }

  const item: TCheckoutLineItem = { productId: product.id, plan: plan.tier, cadence };
  if (commitments && Object.keys(commitments).length > 0) {
    item.commitments = commitments;
  }
  return [item];
};

export const licenseV2ServiceFactory = ({
  envConfig,
  orgDAL,
  identityOrgMembershipDAL,
  permissionService,
  licenseClient,
  meteredFeatures
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

  const counterByFeatureKey = new Map(meteredFeatures.map((metered) => [metered.feature.key, metered.count]));

  // Live per-org usage for the subscription's non-metered dimensions, keyed by feature key. Seeded
  // values (e.g. the shared member+identity pool, computed once for the Usage card) win, so a
  // dimension that also has its own count elsewhere on the page reads the same number. The rest are
  // counted once each, in parallel, via the same counters the usage meter uses. A count failure is
  // logged and dropped so the overview still renders.
  const resolveLiveUsage = async (
    orgId: string,
    subscription: TSubscriptionResponse | null,
    seed: Map<string, number>
  ): Promise<Map<string, number>> => {
    const usage = new Map<string, number>(seed);
    if (!subscription) {
      return usage;
    }

    const featureKeys = new Set<string>();
    subscription.items.forEach((item) => {
      item.dimensions.forEach((dimension) => {
        // The stable key the dimension caps against is limitKey (contract); older servers send it as
        // featureKey. Overlay live counts for non-metered dims we have a counter for.
        const overlayKey = dimension.limitKey ?? dimension.featureKey;
        if (!dimension.metered && overlayKey && !usage.has(overlayKey) && counterByFeatureKey.has(overlayKey)) {
          featureKeys.add(overlayKey);
        }
      });
    });

    await Promise.all(
      [...featureKeys].map(async (featureKey) => {
        const count = counterByFeatureKey.get(featureKey);
        if (count === undefined) {
          return;
        }
        try {
          usage.set(featureKey, await count(orgId));
        } catch (error) {
          logger.error(error, `billing-v2: failed to count live usage [orgId=${orgId}, feature=${featureKey}]`);
        }
      })
    );

    return usage;
  };

  // Fold the subscription items and the entitlement features sourced from a product into a single
  // per-product entitlement map, keyed by the server's product ids.
  const buildEntitlements = async (
    org: TEntitlementOrg,
    subscription: TSubscriptionResponse | null,
    liveUsageSeed: Map<string, number>
  ) => {
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

    // The license server only tracks usage for metered dimensions, so per-unit ones come back with
    // used=0. Overlay live counts, matched on the stable feature key (dimension keys drift). Metered
    // dimensions keep the server's period peak, which is the billed figure.
    const liveUsageByFeatureKey = await resolveLiveUsage(org.id, subscription, liveUsageSeed);

    if (subscription) {
      subscription.items.forEach((item) => {
        // Resolve the pinned per-dimension contract into a display-ready list: label/noun from the
        // catalog, everything else from the org's version-pinned subscription. Money is converted to
        // dollars here so *Cents fields never reach the client. per_resource dims carry committedRate
        // (annual) + onDemandRate (monthly overage); metered dims carry rate + freeBand.
        const dimensions: BillingV2EntitlementDim[] = item.dimensions.map((dimension) => {
          const catalogKey = `${item.productId}:${dimension.key}`;
          const metered = dimension.metered ?? false;
          const cadence = toCadence(dimension.cadence);
          const committed = dimension.committed ?? null;
          const hasCommittedRate = dimension.committedRateCents !== null && dimension.committedRateCents !== undefined;
          const hasOnDemandRate = dimension.onDemandRateCents !== null && dimension.onDemandRateCents !== undefined;
          const hasRate = dimension.rateCents !== null && dimension.rateCents !== undefined;
          const hasFreeBand = dimension.freeBand !== null && dimension.freeBand !== undefined;

          // Overlay live per-org usage for non-metered dims (the server reports 0 for them); metered
          // dims keep the server's period reading. Matched on the stable limit/feature key.
          let used = dimension.used ?? 0;
          const overlayKey = dimension.limitKey ?? dimension.featureKey;
          const liveUsed = overlayKey ? liveUsageByFeatureKey.get(overlayKey) : undefined;
          if (!metered && liveUsed !== undefined) {
            used = liveUsed;
          }

          const onDemandRate = hasOnDemandRate ? centsToDollars(dimension.onDemandRateCents) : undefined;
          // Monthly overage cost: usage above the prepaid commitment at the on-demand rate.
          const onDemandAmount =
            committed !== null && onDemandRate !== undefined ? Math.max(0, used - committed) * onDemandRate : 0;

          return {
            key: dimension.key,
            label: labelByDimension.get(catalogKey) ?? dimension.key,
            noun: nounByDimension.get(catalogKey) ?? dimension.unit ?? dimension.key,
            unit: dimension.unit ?? nounByDimension.get(catalogKey) ?? dimension.key,
            metered,
            cadence,
            used,
            limit: dimension.limit ?? null,
            committed,
            onDemandAmount,
            ...(hasCommittedRate ? { committedRate: centsToDollars(dimension.committedRateCents) } : {}),
            ...(onDemandRate !== undefined ? { onDemandRate } : {}),
            ...(metered && hasRate ? { rate: centsToDollars(dimension.rateCents) } : {}),
            ...(metered && hasFreeBand ? { freeBand: dimension.freeBand as number } : {})
          };
        });

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

        // Product cadence is annual when any dimension is annually committed, else monthly; drives the
        // YEARLY/MONTHLY badge and the headline period.
        let cadence: "monthly" | "annual" | null = null;
        if (dimensions.some((dimension) => dimension.cadence === "annual")) {
          cadence = "annual";
        } else if (dimensions.length > 0) {
          cadence = "monthly";
        }
        const onDemandAmount = dimensions.reduce((sum, dimension) => sum + dimension.onDemandAmount, 0);

        // Each product renews on its own line's cycle; a product can have several lines, so show the
        // one about to close (soonest currentPeriodEnd) as this product's renewal date.
        const productLineEnds = (subscription.billing?.lines ?? [])
          .filter((line) => line.productKey === item.productId && typeof line.currentPeriodEnd === "number")
          .map((line) => line.currentPeriodEnd as number);
        const renewsOn = productLineEnds.length > 0 ? formatDate(Math.min(...productLineEnds)) : null;

        entitlements[item.productId] = {
          entitled: true,
          planTier: item.plan,
          cadence,
          amount: item.amount !== undefined ? centsToDollars(item.amount) : undefined,
          onDemandAmount,
          dimensions: dimensions.length > 0 ? dimensions : undefined,
          status: item.status,
          isTrialing: item.isTrialing ?? false,
          trialEndsAt: item.trialEndsAt ? formatDate(item.trialEndsAt) : null,
          renewsOn,
          used,
          limit,
          unit
        };
      });
    }

    let features = null;
    let products: NonNullable<Awaited<ReturnType<typeof licenseClient.getEntitlements>>>["products"] = [];
    try {
      const result = await licenseClient.getEntitlements(org);
      features = result?.features ?? null;
      products = result?.products ?? [];
    } catch (error) {
      logger.error(error, `billing-v2: failed to read entitlements [orgId=${org.id}]`);
    }

    // The entitlement products[] list is authoritative for what the org holds: an entitlement can
    // exist without a Stripe subscription (paygo / account-based), so a product here that the
    // subscription didn't cover must still render as active. A subscription item, when present, wins
    // (it carries the dimensions/amount); here we only fill the entitled flag, plan, and trial state.
    products.forEach((product) => {
      const isTrialing = product.status === "trialing";
      const existing = entitlements[product.product_key];
      if (existing) {
        existing.planTier = existing.planTier ?? product.plan_key ?? undefined;
        existing.status = existing.status ?? product.status ?? undefined;
        return;
      }
      entitlements[product.product_key] = {
        entitled: true,
        planTier: product.plan_key ?? undefined,
        status: product.status ?? undefined,
        isTrialing,
        trialEndsAt: formatIsoDate(product.trial_ends_at)
      };
    });

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

    const members = await orgDAL.countAllOrgMembers(orgId);
    const identities = await identityOrgMembershipDAL.countAllOrgIdentities({
      scopeOrgId: orgId
    });

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

    // Seed the identity dimension's usage from the org's combined member + machine-identity count,
    // which is what its per-dimension counter in the product card renders.
    const entitlements = await buildEntitlements(
      { id: orgId, name: organization.name, slug: organization.slug },
      subscription,
      new Map([[IDENTITY_LIMIT_FEATURE_KEY, members + identities]])
    );
    // Org-wide monthly on-demand overage (dollars), summed once for the summary's on-demand note.
    const onDemandAmount = Object.values(entitlements).reduce(
      (sum, entitlement) => sum + (entitlement.onDemandAmount ?? 0),
      0
    );

    // Products whose one-per-product trial is used up (any outcome — trialing/converted/expired/
    // canceled/completed). The UI gates the trial CTA on this so a canceled trial isn't re-offered.
    // A failed lookup degrades to empty: the server still blocks a repeat trial with a 409 on start.
    let trialedProductKeys: string[] = [];
    if (!isSelfHostedLicense) {
      try {
        const trials = await licenseClient.getTrials(orgId);
        trialedProductKeys = [...new Set(trials.trials.map((trial) => trial.product_key))];
      } catch (error) {
        logger.error(error, `billing-v2: failed to read trial history [orgId=${orgId}]`);
      }
    }

    // Header billing summary. Monthly-recurring and annual-committed are two independent clocks and are
    // never summed. The next charge is the soonest line to close: derive its amount/product(s)/cadence
    // from the lines whose currentPeriodEnd matches nextChargeAt (usage-based lines make the total an
    // estimate, so flag hasUsage). activeProductCount is the number of entitled products.
    const subBilling = subscription?.billing;
    const closingLines = subBilling?.nextChargeAt
      ? (subBilling.lines ?? []).filter((line) => line.currentPeriodEnd === subBilling.nextChargeAt)
      : [];
    const closingCadences = new Set(closingLines.map((line) => normalizeCadence(line.cadence ?? undefined)));
    const nextCharge =
      subBilling?.nextChargeAt && closingLines.length > 0
        ? {
            amount: centsToDollars(closingLines.reduce((sum, line) => sum + (line.amountCents ?? 0), 0)),
            at: formatShortDate(subBilling.nextChargeAt) ?? "",
            productKeys: [...new Set(closingLines.map((line) => line.productKey))],
            cadence: closingCadences.size === 1 ? [...closingCadences][0] : null,
            hasUsage: closingLines.some((line) => line.usageBased)
          }
        : null;
    const activeProductCount = Object.values(entitlements).filter(
      (entitlement) => entitlement.entitled && entitlement.status !== "churned"
    ).length;
    const billing = {
      monthlyRecurring: centsToDollars(subBilling?.monthlyRecurringCents),
      annualCommitted: centsToDollars(subBilling?.annualRecurringCents),
      activeProductCount,
      nextCharge
    };

    const overview: BillingV2Overview = {
      // Self-hosted is a read-only, managed view: the UI hides payment/invoices/details and shows the
      // "managed by your account team" banner off these two fields.
      isCloud: !isSelfHostedLicense,
      mode: isSelfHostedLicense ? "managed" : "self-serve",
      subState,
      planName,
      billing,
      payment,
      billingDetails,
      invoices,
      entitlements,
      trialedProductKeys,
      onDemandAmount
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
    commitments,
    email,
    returnPath
  }: TCreateBillingV2CheckoutSessionDTO) => {
    await ensureManageBilling(orgId, actor);

    const catalog = await licenseClient.getCatalog();
    const product = catalog?.products.find((candidate) => candidate.id === productId);
    if (!product) {
      throw new NotFoundError({ message: `Product with ID '${productId}' not found` });
    }

    const items = buildCheckoutItems(product, normalizeCadence(cadence), plan, commitments);
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
    plan?: string,
    commitments?: Record<string, number>
  ): Promise<TCheckoutLineItem[]> => {
    const catalog = await licenseClient.getCatalog();
    const product = catalog?.products.find((candidate) => candidate.id === productId);
    if (!product) {
      throw new NotFoundError({ message: `Product with ID '${productId}' not found` });
    }
    const items = buildCheckoutItems(product, normalizeCadence(cadence), plan, commitments);
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
    commitments,
    removeProductId,
    commitmentChanges
  }: TPreviewBillingV2ChangeDTO): Promise<{ preview: BillingV2Preview }> => {
    await ensureManageBilling(orgId, actor);
    if (!addProductId && !removeProductId && !(commitmentChanges && commitmentChanges.length > 0)) {
      throw new BadRequestError({ message: "Provide a product to add or remove, or a commitment change" });
    }

    const payload: TSubscriptionPreviewPayload = {};
    if (addProductId) {
      payload.add = await resolveAddItems(addProductId, cadence, plan, commitments);
    }
    if (removeProductId) {
      payload.remove = [removeProductId];
    }
    if (commitmentChanges && commitmentChanges.length > 0) {
      payload.commitmentChanges = commitmentChanges;
    }

    const preview = await licenseClient.previewSubscriptionChange(orgId, payload);
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
        }))
      }
    };
  };

  // Add a product to an existing active subscription (clears any scheduled cancel server-side). The
  // first-purchase / no-subscription path stays on checkoutSession, which opens Stripe Checkout.
  const addProduct = async ({ orgId, actor, productId, plan, cadence, commitments }: TAddBillingV2ProductDTO) => {
    await ensureManageBilling(orgId, actor);
    const items = await resolveAddItems(productId, cadence, plan, commitments);
    const result = await licenseClient.addSubscriptionItems(orgId, { items });
    await licenseClient.invalidateEntitlements(orgId);
    return { subscriptionId: result.subscriptionId };
  };

  // Apply one or more previewed per_resource commitment changes. The License Server's apply endpoint
  // is single-dimension, so loop per change reusing the previewed prorationDate (assumption C): the
  // per-dimension prorations, pinned to the same instant, sum to the "charged today" the user saw. A
  // mid-loop failure leaves earlier changes applied and surfaces the error to retry the rest.
  const changeCommitment = async ({ orgId, actor, changes, prorationDate }: TChangeBillingV2CommitmentDTO) => {
    await ensureManageBilling(orgId, actor);
    if (!changes.length) {
      throw new BadRequestError({ message: "Provide at least one commitment change" });
    }

    let subscriptionId: string | undefined;
    for (const change of changes) {
      // eslint-disable-next-line no-await-in-loop
      const result = await licenseClient.changeCommitment(orgId, {
        dimensionKey: change.dimensionKey,
        quantity: change.quantity,
        prorationDate
      });
      subscriptionId = result.subscriptionId ?? subscriptionId;
    }
    await licenseClient.invalidateEntitlements(orgId);
    return { subscriptionId };
  };

  // Start a plan-scoped self-serve trial. The trial is granted immediately (no upfront charge);
  // cardSetupUrl, when present, is a best-effort card-setup checkout the client redirects to.
  const startTrial = async ({ orgId, actor, productId, plan, email }: TStartBillingV2TrialDTO) => {
    await ensureManageBilling(orgId, actor);
    // The trial has no Stripe customer yet, so the server creates one from the org's own name + the
    // authenticated user's email; neither is client-supplied.
    const organization = await orgDAL.findById(orgId);
    const result = await licenseClient.startTrial(orgId, {
      productKey: productId,
      planKey: plan,
      email,
      name: organization?.name
    });
    await licenseClient.invalidateEntitlements(orgId);
    return { outcome: result.outcome, cardSetupUrl: result.cardSetupUrl };
  };

  // Cancel an in-progress trial: the product drops to free and the trial never converts. A 404 from
  // the server (no active trial) propagates so the UI can surface it.
  const cancelTrial = async ({ orgId, actor, productId }: TCancelBillingV2TrialDTO) => {
    await ensureManageBilling(orgId, actor);
    const result = await licenseClient.cancelTrial(orgId, { productKey: productId });
    await licenseClient.invalidateEntitlements(orgId);
    return { outcome: result.outcome };
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
    changeCommitment,
    startTrial,
    cancelTrial,
    cancelSubscription,
    resumeSubscription
  };
};
