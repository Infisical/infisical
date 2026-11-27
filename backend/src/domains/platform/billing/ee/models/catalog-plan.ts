import { TCatalogProduct } from "@app/domains/platform/license/ce/module";

import { Deprecation, TDeprecationRecord } from "./deprecation";
import { Money } from "./money";
import { PriceBands, TPriceBandsRecord } from "./price-bands";

export type TCatalogPlanRecord = TCatalogProduct["plans"][number];

export type TCatalogPrice = TCatalogPlanRecord["prices"][number];

export type TCadence = "monthly" | "annual";

export type TCatalogDimView = {
  key: string;
  label: string;
  noun: string;
  monthly: number;
  annual: number;
  included: number;
  // The matching cadence's price is a usage overage rate, not a buyer-set quantity.
  meteredMonthly?: boolean;
  meteredAnnual?: boolean;
  aggregation?: string;
  bands?: TPriceBandsRecord;
};

export type TCatalogPlanView = {
  tier: string;
  name: string;
  selfServe: boolean;
  salesLed: boolean;
  trialable: boolean;
  upgradeable: boolean;
  trialDays: number;
  deprecated?: boolean;
  deprecation?: TDeprecationRecord;
  displayOrder?: number;
  feature?: string;
  base?: { monthly: number; annual: number };
  dims: TCatalogDimView[];
};

const PER_UNIT_KIND = "per_unit";
const METERED_KIND = "metered";

// An unknown kind is never sold, rather than sold as per_unit.
const isKnownPriceKind = (kind: string) => kind === PER_UNIT_KIND || kind === METERED_KIND;

const isSet = (value: number | null | undefined): value is number => value !== null && value !== undefined;

// One plan of a catalog product (pro, advanced, ...), read with its product's dimensions, which decide how its
// prices are charged.
export class CatalogPlan {
  private constructor(
    private readonly record: TCatalogPlanRecord,
    private readonly dimensions: TCatalogProduct["dimensions"]
  ) {}

  static restore(record: TCatalogPlanRecord, dimensions: TCatalogProduct["dimensions"]): CatalogPlan {
    return new CatalogPlan(record, dimensions);
  }

  get tier(): string {
    return this.record.tier;
  }

  // A known-kind price, a flat base fee, or both. A base-only plan (a base fee with no priced dimensions) is priced.
  hasPricing(): boolean {
    return (
      this.record.prices.some((price) => isKnownPriceKind(price.kind)) ||
      isSet(this.record.basePriceMonthlyCents) ||
      isSet(this.record.basePriceAnnualCents)
    );
  }

  isSelfServe(): boolean {
    return this.record.selfServe === true;
  }

  // The free tier is self-serve too, but carries no pricing.
  isPaidSelfServe(): boolean {
    return this.isSelfServe() && this.record.tier !== "free" && this.hasPricing();
  }

  // What the catalog page offers: every paid self-serve plan and every sales-led one. The free tier is implicit.
  isOffered(): boolean {
    return this.record.tier !== "free" && (this.isPaidSelfServe() || this.record.salesLed === true);
  }

  // Buyable at a cadence when it has a known-kind price or a base fee for it.
  sellsAt(cadence: TCadence): boolean {
    const hasPrice = this.record.prices.some((price) => price.cadence === cadence && isKnownPriceKind(price.kind));
    const base = cadence === "annual" ? this.record.basePriceAnnualCents : this.record.basePriceMonthlyCents;
    return hasPrice || isSet(base);
  }

  // The prices the buyer sets a quantity for at a cadence. Metered ones are rated from usage instead.
  perUnitPrices(cadence: TCadence): TCatalogPrice[] {
    return this.record.prices.filter(
      (price) => price.cadence === cadence && this.effectivePriceKind(price) === PER_UNIT_KIND
    );
  }

  // The License Server classifies a price by its dimension's billing type and doesn't always send a kind, so a
  // metered dimension's price would otherwise be sold as a buyer-set quantity.
  effectivePriceKind(price: TCatalogPrice): string {
    if (price.kind && price.kind !== PER_UNIT_KIND) return price.kind;
    const dimension = this.dimensions.find((candidate) => candidate.key === price.dimensionKey);
    return dimension?.billingType === METERED_KIND ? METERED_KIND : PER_UNIT_KIND;
  }

  // Metered is tracked per cadence, so a dimension priced per_unit on one cadence and metered on the other
  // isn't mislabelled on both. Bands come from the monthly price.
  toView(now: Date): TCatalogPlanView {
    const priceByDim = new Map<
      string,
      { monthly: number; annual: number; included: number; meteredMonthly: boolean; meteredAnnual: boolean }
    >();
    this.record.prices.forEach((price) => {
      const kind = this.effectivePriceKind(price);
      if (!isKnownPriceKind(kind)) return;
      const entry = priceByDim.get(price.dimensionKey) ?? {
        monthly: 0,
        annual: 0,
        included: 0,
        meteredMonthly: false,
        meteredAnnual: false
      };
      if (price.cadence === "annual") {
        entry.annual = Money.dollars(price.unitAmountCents);
        entry.meteredAnnual = kind === METERED_KIND;
      } else {
        entry.monthly = Money.dollars(price.unitAmountCents);
        entry.meteredMonthly = kind === METERED_KIND;
      }
      if (isSet(price.includedQuantity)) {
        entry.included = price.includedQuantity;
      }
      priceByDim.set(price.dimensionKey, entry);
    });
    const bandsByDim = new Map<string, TPriceBandsRecord>();
    this.record.prices.forEach((price) => {
      const bands = PriceBands.fromTiers(price.tiersMode, price.tiers);
      if (bands && price.cadence === "monthly") {
        bandsByDim.set(price.dimensionKey, bands);
      }
    });

    const dims: TCatalogDimView[] = [];
    this.dimensions.forEach((dimension) => {
      const priced = priceByDim.get(dimension.key);
      if (!priced) return;
      dims.push({
        key: dimension.key,
        label: dimension.label,
        noun: dimension.noun,
        monthly: priced.monthly,
        annual: priced.annual,
        included: priced.included,
        meteredMonthly: priced.meteredMonthly,
        meteredAnnual: priced.meteredAnnual,
        ...(dimension.aggregation ? { aggregation: dimension.aggregation } : {}),
        ...(bandsByDim.has(dimension.key) ? { bands: bandsByDim.get(dimension.key) } : {})
      });
    });

    const deprecation = Deprecation.from(
      {
        deprecated: this.record.deprecated,
        reason: this.record.deprecationReason,
        nextSteps: this.record.deprecationNextSteps,
        date: this.record.deprecationDate
      },
      now
    );
    const view: TCatalogPlanView = {
      tier: this.record.tier,
      name: this.record.name,
      selfServe: this.record.selfServe,
      salesLed: this.record.salesLed,
      trialable: this.record.trialable ?? false,
      upgradeable: this.record.upgradeable ?? false,
      trialDays: this.record.trialDays ?? 0,
      deprecated: this.record.deprecated ?? false,
      ...(deprecation ? { deprecation } : {}),
      displayOrder: this.record.displayOrder ?? undefined,
      feature: this.record.feature,
      dims
    };

    const baseMonthly = this.record.basePriceMonthlyCents;
    const baseAnnual = this.record.basePriceAnnualCents;
    if (isSet(baseMonthly) || isSet(baseAnnual)) {
      view.base = { monthly: Money.dollars(baseMonthly), annual: Money.dollars(baseAnnual) };
    }
    return view;
  }
}
