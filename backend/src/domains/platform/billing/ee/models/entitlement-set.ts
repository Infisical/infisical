import { TCatalogProduct, TLicenseServerBilling, TSubscriptionResponse } from "@app/domains/platform/license/ce/module";

import { BillingCadence } from "./billing-cadence";
import { BillingDate } from "./billing-date";
import { TCadence } from "./catalog-plan";
import { Deprecation, TDeprecationRecord } from "./deprecation";
import { Money } from "./money";
import { PriceBands, TPriceBandsRecord } from "./price-bands";
import { Subscription } from "./subscription";

export type TCatalogRecord = NonNullable<Awaited<ReturnType<TLicenseServerBilling["getCatalog"]>>>;

export type TEntitlementsRecord = NonNullable<Awaited<ReturnType<TLicenseServerBilling["getEntitlements"]>>>;

export type TMeteredUsageView = {
  periodStart: string | null;
  periodEnd: string | null;
  asOf: string | null;
  estimatedAmount: number | null;
  currentTier: number;
  nextTierAt: number | null;
  earlierInPeriod: {
    periodStart: string | null;
    periodEnd: string | null;
    used: number;
    estimatedAmount: number | null;
  }[];
  trial: boolean;
};

// Rates are dollars. onDemandAmount is the monthly overage cost, max(0, used - committed) * onDemandRate.
export type TEntitlementDimView = {
  key: string;
  label: string;
  noun: string;
  unit: string;
  metered: boolean;
  cadence: TCadence | null;
  used: number;
  limit: number | null;
  committed: number | null;
  commitAvailable: boolean;
  committedRate?: number;
  onDemandRate?: number;
  rate?: number;
  freeBand?: number;
  usage?: TMeteredUsageView;
  bands?: TPriceBandsRecord;
  onDemandAmount: number;
  canDecreaseNow?: boolean;
  renewalDate?: string | null;
  decreaseAllowedFrom?: string | null;
};

export type TEntitlementView = {
  entitled: boolean;
  planTier?: string;
  cadence?: TCadence | null;
  amount?: number;
  onDemandAmount?: number;
  dimensions?: TEntitlementDimView[];
  status?: string;
  isTrialing?: boolean;
  trialEndsAt?: string | null;
  trialPlan?: string;
  trialPlanName?: string;
  trialPlanEndsAt?: string | null;
  trialPlanDaysLeft?: number | null;
  trialPaymentDueAt?: string | null;
  trialPlanPaymentDueAt?: string | null;
  renewsOn?: string | null;
  // "product" is terminal (the product is being discontinued); "plan" retires with a way forward. Product wins.
  deprecation?: TDeprecationRecord & { kind: "product" | "plan" };
  limit?: number | null;
  used?: number;
  unit?: string | null;
};

type TSubscriptionItem = TSubscriptionResponse["items"][number];

type TBillingLines = NonNullable<TSubscriptionResponse["billing"]>["lines"];

const isSet = (value: number | null | undefined): value is number => value !== null && value !== undefined;

// What the org holds, per product id: its subscription items, products entitled without a subscription
// (pay-as-you-go, account-based), and products only a feature points at.
export class EntitlementSet {
  private constructor(private readonly byProduct: Record<string, TEntitlementView>) {}

  // A subscription item wins over the entitlement products list, since it carries the dimensions and amount; the
  // list only fills in what the item left out. The catalog supplies each dimension's label and noun and the
  // deprecation flags; it is null when it couldn't be read.
  static build({
    subscription,
    catalog,
    entitlements,
    now
  }: {
    subscription: Subscription;
    catalog: TCatalogRecord | null;
    entitlements: TEntitlementsRecord | null;
    now: Date;
  }): EntitlementSet {
    const byProduct: Record<string, TEntitlementView> = {};
    const labelByDimension = new Map<string, string>();
    const nounByDimension = new Map<string, string>();
    const catalogProductById = new Map<string, TCatalogProduct>();
    catalog?.products.forEach((product) => {
      catalogProductById.set(product.id, product);
      product.dimensions.forEach((dimension) => {
        labelByDimension.set(`${product.id}:${dimension.key}`, dimension.label);
        nounByDimension.set(`${product.id}:${dimension.key}`, dimension.noun);
      });
    });

    const record = subscription.raw;
    if (record) {
      record.items.forEach((item) => {
        byProduct[item.productId] = EntitlementSet.fromItem({
          item,
          lines: record.billing?.lines ?? [],
          catalogProduct: catalogProductById.get(item.productId),
          labelByDimension,
          nounByDimension,
          now
        });
      });
    }

    (entitlements?.products ?? []).forEach((product) => {
      const existing = byProduct[product.product_key];
      if (existing) {
        existing.planTier = existing.planTier ?? product.plan_key ?? undefined;
        existing.status = existing.status ?? product.status ?? undefined;
        existing.trialPlan = existing.trialPlan ?? product.trial_plan_key ?? undefined;
        return;
      }
      byProduct[product.product_key] = {
        entitled: true,
        planTier: product.plan_key ?? undefined,
        status: product.status ?? undefined,
        ...(product.trial_plan_key ? { trialPlan: product.trial_plan_key } : {}),
        isTrialing: product.status === "trialing",
        trialEndsAt: BillingDate.longFromIso(product.trial_ends_at)
      };
    });

    const features = entitlements?.features ?? null;
    if (features) {
      Object.values(features).forEach((feature) => {
        const productId = feature.from_product;
        if (productId && !byProduct[productId]) {
          byProduct[productId] = { entitled: true };
        }
      });
    }

    return new EntitlementSet(byProduct);
  }

  // Org-wide monthly on-demand overage, in dollars.
  onDemandAmount(): number {
    return Object.values(this.byProduct).reduce((sum, entitlement) => sum + (entitlement.onDemandAmount ?? 0), 0);
  }

  activeProductCount(): number {
    return Object.values(this.byProduct).filter(
      (entitlement) => entitlement.entitled && entitlement.status !== "churned"
    ).length;
  }

  toJSON(): Record<string, TEntitlementView> {
    return this.byProduct;
  }

  private static fromItem({
    item,
    lines,
    catalogProduct,
    labelByDimension,
    nounByDimension,
    now
  }: {
    item: TSubscriptionItem;
    lines: TBillingLines;
    catalogProduct: TCatalogProduct | undefined;
    labelByDimension: Map<string, string>;
    nounByDimension: Map<string, string>;
    now: Date;
  }): TEntitlementView {
    const dimensions = item.dimensions.map((dimension) =>
      EntitlementSet.dimensionView(dimension, `${item.productId}:${dimension.key}`, labelByDimension, nounByDimension)
    );

    // The most constraining limit: the highest utilization, each limit paired with its own quantity. Older License
    // Servers send no dimensions, only the limits and quantities maps.
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
    for (const [key, dimensionLimit] of limitPairs) {
      const dimensionUsed = usedForKey(key);
      // An unlimited (<= 0) cap can't be hit.
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

    let cadence: TCadence | null = null;
    if (dimensions.some((dimension) => dimension.cadence === "annual")) {
      cadence = "annual";
    } else if (dimensions.length > 0) {
      cadence = "monthly";
    }

    // A product can have several lines, each on its own cycle; it renews on the soonest to close.
    const lineEnds = (lines ?? [])
      .filter((line) => line.productKey === item.productId && typeof line.currentPeriodEnd === "number")
      .map((line) => line.currentPeriodEnd as number);
    const renewsOn = lineEnds.length > 0 ? BillingDate.long(Math.min(...lineEnds)) : null;

    // The sunset date lives only on the catalog; the item's own reason and next steps win over the catalog's.
    const catalogPlan = catalogProduct?.plans.find((candidate) => candidate.tier === item.plan);
    let deprecation: TEntitlementView["deprecation"];
    if (catalogProduct?.deprecated) {
      const base = Deprecation.from(
        {
          deprecated: true,
          reason: item.deprecation?.reason ?? catalogProduct.deprecationReason,
          nextSteps: item.deprecation?.nextSteps ?? catalogProduct.deprecationNextSteps,
          date: catalogProduct.deprecationDate
        },
        now
      );
      if (base) deprecation = { kind: "product", ...base };
    } else if (catalogPlan?.deprecated) {
      const base = Deprecation.from(
        {
          deprecated: true,
          reason: item.deprecation?.reason ?? catalogPlan.deprecationReason,
          nextSteps: item.deprecation?.nextSteps ?? catalogPlan.deprecationNextSteps,
          date: catalogPlan.deprecationDate
        },
        now
      );
      if (base) deprecation = { kind: "plan", ...base };
    }

    return {
      entitled: true,
      planTier: item.plan,
      cadence,
      amount: item.amount !== undefined ? Money.dollars(item.amount) : undefined,
      onDemandAmount: dimensions.reduce((sum, dimension) => sum + dimension.onDemandAmount, 0),
      dimensions: dimensions.length > 0 ? dimensions : undefined,
      status: item.status,
      isTrialing: item.isTrialing ?? false,
      trialEndsAt: item.trialEndsAt ? BillingDate.long(item.trialEndsAt) : null,
      ...(item.trialPlan
        ? {
            trialPlan: item.trialPlan,
            trialPlanName:
              catalogProduct?.plans.find((candidate) => candidate.tier === item.trialPlan)?.name ?? item.trialPlan,
            trialPlanEndsAt: BillingDate.long(item.trialPlanEndsAt),
            trialPlanDaysLeft: item.trialPlanPaymentDueAt ? null : BillingDate.daysUntil(item.trialPlanEndsAt, now),
            trialPlanPaymentDueAt: BillingDate.long(item.trialPlanPaymentDueAt)
          }
        : {}),
      trialPaymentDueAt: BillingDate.long(item.trialPaymentDueAt),
      renewsOn,
      ...(deprecation ? { deprecation } : {}),
      used,
      limit,
      unit
    };
  }

  // Usage is the License Server's figure for every dimension (metered: the period reading; per_resource: the latest
  // snapshot), so it matches what the customer is billed on.
  private static dimensionView(
    dimension: TSubscriptionItem["dimensions"][number],
    catalogKey: string,
    labelByDimension: Map<string, string>,
    nounByDimension: Map<string, string>
  ): TEntitlementDimView {
    const metered = dimension.metered ?? false;
    const committed = dimension.committed ?? null;
    const used = dimension.used ?? 0;
    const onDemandRate = isSet(dimension.onDemandRateCents) ? Money.dollars(dimension.onDemandRateCents) : undefined;
    const onDemandAmount =
      committed !== null && onDemandRate !== undefined ? Math.max(0, used - committed) * onDemandRate : 0;

    return {
      key: dimension.key,
      label: labelByDimension.get(catalogKey) ?? dimension.key,
      noun: nounByDimension.get(catalogKey) ?? dimension.unit ?? dimension.key,
      unit: dimension.unit ?? nounByDimension.get(catalogKey) ?? dimension.key,
      metered,
      cadence: BillingCadence.orNull(dimension.cadence),
      used,
      limit: dimension.limit ?? null,
      committed,
      // From the pinned plan version, not the catalog, so a grandfathered customer keeps it.
      commitAvailable: dimension.commitAvailable ?? false,
      onDemandAmount,
      ...(isSet(dimension.committedRateCents) ? { committedRate: Money.dollars(dimension.committedRateCents) } : {}),
      ...(onDemandRate !== undefined ? { onDemandRate } : {}),
      ...(metered && isSet(dimension.rateCents) ? { rate: Money.dollars(dimension.rateCents) } : {}),
      ...(metered && isSet(dimension.freeBand) ? { freeBand: dimension.freeBand } : {}),
      ...(metered && dimension.usage
        ? {
            usage: {
              periodStart: BillingDate.long(dimension.usage.periodStart),
              periodEnd: BillingDate.long(dimension.usage.periodEnd - 1),
              asOf: dimension.usage.asOf ? new Date(dimension.usage.asOf * 1000).toISOString() : null,
              estimatedAmount: Money.dollarsOrNull(dimension.usage.estimatedAmountCents),
              currentTier: dimension.usage.currentTier,
              nextTierAt: dimension.usage.nextTierAt ?? null,
              earlierInPeriod: dimension.usage.earlierInPeriod.map((segment) => ({
                periodStart: BillingDate.long(segment.periodStart),
                periodEnd: BillingDate.long(segment.periodEnd - 1),
                used: segment.used,
                estimatedAmount: Money.dollarsOrNull(segment.estimatedAmountCents)
              })),
              trial: dimension.usage.trial
            }
          }
        : {}),
      ...(metered && dimension.pricing
        ? { bands: PriceBands.fromTiers(dimension.pricing.tiersMode, dimension.pricing.tiers) }
        : {}),
      // The page holds the commitment floor at the current quantity unless canDecreaseNow, and shows when a decrease
      // opens.
      ...(dimension.canDecreaseNow !== null && dimension.canDecreaseNow !== undefined
        ? { canDecreaseNow: dimension.canDecreaseNow }
        : {}),
      ...(dimension.renewalDate ? { renewalDate: BillingDate.long(dimension.renewalDate) } : {}),
      ...(dimension.decreaseAllowedFrom ? { decreaseAllowedFrom: BillingDate.long(dimension.decreaseAllowedFrom) } : {})
    };
  }
}
