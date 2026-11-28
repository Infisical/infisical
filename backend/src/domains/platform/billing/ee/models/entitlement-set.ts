import { TCatalogProduct, TLicenseServerBilling, TSubscriptionResponse } from "@app/domains/platform/license/ce/module";

import { BillingCadence, TCadence } from "./billing-cadence";
import { BillingDate } from "./billing-date";
import { Deprecation, TDeprecationRecord } from "./deprecation";
import { Money } from "./money";
import { PriceBands, TPriceBandsRecord } from "./price-bands";

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

type TCatalogDimension = TCatalogProduct["dimensions"][number];

type TMostConstrainingLimit = { used: number; limit: number | null; key: string | null };

// An unlimited (<= 0) cap can't be hit, so it only constrains once anything is used.
const utilizationOf = (used: number, limit: number): number => {
  if (limit > 0) return used / limit;
  return used > 0 ? Infinity : 0;
};

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
    subscription: TSubscriptionResponse | null;
    catalog: TCatalogRecord | null;
    entitlements: TEntitlementsRecord | null;
    now: Date;
  }): EntitlementSet {
    const byProduct: Record<string, TEntitlementView> = {};
    const lines = subscription?.billing?.lines ?? [];

    (subscription?.items ?? []).forEach((item) => {
      const catalogProduct = catalog?.products.find((product) => product.id === item.productId);
      byProduct[item.productId] = EntitlementSet.fromItem({ item, lines, catalogProduct, now });
    });

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
        trialPlan: product.trial_plan_key || undefined,
        isTrialing: product.status === "trialing",
        trialEndsAt: BillingDate.longFromIso(product.trial_ends_at)
      };
    });

    Object.values(entitlements?.features ?? {}).forEach((feature) => {
      const productId = feature.from_product;
      if (productId && !byProduct[productId]) {
        byProduct[productId] = { entitled: true };
      }
    });

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
    now
  }: {
    item: TSubscriptionItem;
    lines: TBillingLines;
    catalogProduct: TCatalogProduct | undefined;
    now: Date;
  }): TEntitlementView {
    const catalogDimension = (key: string) => catalogProduct?.dimensions.find((dimension) => dimension.key === key);
    const dimensions = item.dimensions.map((dimension) =>
      EntitlementSet.dimensionView(dimension, catalogDimension(dimension.key))
    );
    const mostConstraining = EntitlementSet.mostConstrainingLimit(item, dimensions);

    return {
      entitled: true,
      planTier: item.plan,
      cadence: EntitlementSet.productCadence(dimensions),
      amount: item.amount !== undefined ? Money.dollars(item.amount) : undefined,
      onDemandAmount: dimensions.reduce((sum, dimension) => sum + dimension.onDemandAmount, 0),
      dimensions: dimensions.length > 0 ? dimensions : undefined,
      status: item.status,
      isTrialing: item.isTrialing ?? false,
      trialEndsAt: item.trialEndsAt ? BillingDate.long(item.trialEndsAt) : null,
      ...EntitlementSet.trialPlanFields(item, catalogProduct, now),
      trialPaymentDueAt: BillingDate.long(item.trialPaymentDueAt),
      renewsOn: EntitlementSet.renewsOn(item.productId, lines),
      deprecation: EntitlementSet.deprecationOf(item, catalogProduct, now),
      used: mostConstraining.used,
      limit: mostConstraining.limit,
      unit: mostConstraining.key ? (catalogDimension(mostConstraining.key)?.noun ?? null) : null
    };
  }

  // An upgrade trial on another plan of the product. Its days left are not counted while its payment is due.
  private static trialPlanFields(
    item: TSubscriptionItem,
    catalogProduct: TCatalogProduct | undefined,
    now: Date
  ): Pick<
    TEntitlementView,
    "trialPlan" | "trialPlanName" | "trialPlanEndsAt" | "trialPlanDaysLeft" | "trialPlanPaymentDueAt"
  > {
    const { trialPlan } = item;
    if (!trialPlan) return {};
    const plan = catalogProduct?.plans.find((candidate) => candidate.tier === trialPlan);
    return {
      trialPlan,
      trialPlanName: plan?.name ?? trialPlan,
      trialPlanEndsAt: BillingDate.long(item.trialPlanEndsAt),
      trialPlanDaysLeft: item.trialPlanPaymentDueAt ? null : BillingDate.daysUntil(item.trialPlanEndsAt, now),
      trialPlanPaymentDueAt: BillingDate.long(item.trialPlanPaymentDueAt)
    };
  }

  // The highest utilization, each limit paired with its own quantity, so the unit shown matches the count. Older
  // License Servers send no dimensions, only the limits and quantities maps. The first maximum wins.
  private static mostConstrainingLimit(
    item: TSubscriptionItem,
    dimensions: TEntitlementDimView[]
  ): TMostConstrainingLimit {
    const hasDimensions = dimensions.length > 0;
    const limitPairs: [string, number][] = hasDimensions
      ? dimensions.flatMap((dimension) => (dimension.limit === null ? [] : [[dimension.key, dimension.limit]]))
      : Object.entries(item.limits);
    const usedFor = (key: string): number =>
      hasDimensions ? (dimensions.find((dimension) => dimension.key === key)?.used ?? 0) : (item.quantities[key] ?? 0);

    let best: TMostConstrainingLimit = { used: 0, limit: null, key: null };
    let highestUtilization = -1;
    for (const [key, limit] of limitPairs) {
      const used = usedFor(key);
      const utilization = utilizationOf(used, limit);
      if (best.key === null || utilization > highestUtilization) {
        highestUtilization = utilization;
        best = { used, limit, key };
      }
    }
    return best;
  }

  // Annual when any dimension is committed annually; monthly when it has dimensions at all.
  private static productCadence(dimensions: TEntitlementDimView[]): TCadence | null {
    if (dimensions.some((dimension) => dimension.cadence === "annual")) return "annual";
    return dimensions.length > 0 ? "monthly" : null;
  }

  // A product can have several lines, each on its own cycle; it renews on the soonest to close.
  private static renewsOn(productId: string, lines: TBillingLines): string | null {
    const lineEnds = (lines ?? [])
      .filter((line) => line.productKey === productId && typeof line.currentPeriodEnd === "number")
      .map((line) => line.currentPeriodEnd as number);
    return lineEnds.length > 0 ? BillingDate.long(Math.min(...lineEnds)) : null;
  }

  // A deprecated product wins over a deprecated plan. The sunset date lives only on the catalog; the item's own reason
  // and next steps win over the catalog's.
  private static deprecationOf(
    item: TSubscriptionItem,
    catalogProduct: TCatalogProduct | undefined,
    now: Date
  ): TEntitlementView["deprecation"] {
    const catalogPlan = catalogProduct?.plans.find((candidate) => candidate.tier === item.plan);
    const kind = catalogProduct?.deprecated ? "product" : "plan";
    const source = kind === "product" ? catalogProduct : catalogPlan;
    const base = Deprecation.from(source, now, item.deprecation);
    return base && { kind, ...base };
  }

  // Usage is the License Server's figure for every dimension (metered: the period reading; per_resource: the latest
  // snapshot), so it matches what the customer is billed on.
  private static dimensionView(
    dimension: TSubscriptionItem["dimensions"][number],
    catalogDimension: TCatalogDimension | undefined
  ): TEntitlementDimView {
    const metered = dimension.metered ?? false;
    const committed = dimension.committed ?? null;
    const used = dimension.used ?? 0;
    const onDemandRate = isSet(dimension.onDemandRateCents) ? Money.dollars(dimension.onDemandRateCents) : undefined;
    const onDemandAmount =
      committed !== null && onDemandRate !== undefined ? Math.max(0, used - committed) * onDemandRate : 0;
    const usage = metered ? dimension.usage : undefined;

    return {
      key: dimension.key,
      label: catalogDimension?.label ?? dimension.key,
      noun: catalogDimension?.noun ?? dimension.unit ?? dimension.key,
      unit: dimension.unit ?? catalogDimension?.noun ?? dimension.key,
      metered,
      cadence: BillingCadence.orNull(dimension.cadence),
      used,
      limit: dimension.limit ?? null,
      committed,
      // From the pinned plan version, not the catalog, so a grandfathered customer keeps it.
      commitAvailable: dimension.commitAvailable ?? false,
      onDemandAmount,
      committedRate: isSet(dimension.committedRateCents) ? Money.dollars(dimension.committedRateCents) : undefined,
      onDemandRate,
      rate: metered && isSet(dimension.rateCents) ? Money.dollars(dimension.rateCents) : undefined,
      freeBand: metered && isSet(dimension.freeBand) ? dimension.freeBand : undefined,
      usage: usage
        ? {
            periodStart: BillingDate.long(usage.periodStart),
            periodEnd: BillingDate.long(usage.periodEnd - 1),
            asOf: usage.asOf ? new Date(usage.asOf * 1000).toISOString() : null,
            estimatedAmount: Money.dollarsOrNull(usage.estimatedAmountCents),
            currentTier: usage.currentTier,
            nextTierAt: usage.nextTierAt ?? null,
            earlierInPeriod: usage.earlierInPeriod.map((segment) => ({
              periodStart: BillingDate.long(segment.periodStart),
              periodEnd: BillingDate.long(segment.periodEnd - 1),
              used: segment.used,
              estimatedAmount: Money.dollarsOrNull(segment.estimatedAmountCents)
            })),
            trial: usage.trial
          }
        : undefined,
      bands:
        metered && dimension.pricing
          ? PriceBands.fromTiers(dimension.pricing.tiersMode, dimension.pricing.tiers)
          : undefined,
      // The page holds the commitment floor at the current quantity unless canDecreaseNow, and shows when a decrease
      // opens.
      canDecreaseNow: dimension.canDecreaseNow ?? undefined,
      renewalDate: dimension.renewalDate ? BillingDate.long(dimension.renewalDate) : undefined,
      decreaseAllowedFrom: dimension.decreaseAllowedFrom ? BillingDate.long(dimension.decreaseAllowedFrom) : undefined
    };
  }
}
