import {
  BillingV2Cadence,
  BillingV2CatalogProduct,
  BillingV2Dim,
  BillingV2Entitlement,
  BillingV2EntitlementDim
} from "@app/hooks/api";

type BillingV2ProBase = { monthly: number; annual: number };

export const catalogById = (
  catalog: BillingV2CatalogProduct[],
  id: string
): BillingV2CatalogProduct | undefined => catalog.find((p) => p.id === id);

// Comparator honoring the catalog's displayOrder for products and plans. The server already returns
// them sorted; this keeps the order explicit and stable if any intermediate step reshuffles.
export const byDisplayOrder = <T extends { displayOrder?: number }>(a: T, b: T): number =>
  (a.displayOrder ?? 0) - (b.displayOrder ?? 0);

export const fmtMoney = (n: number, maximumFractionDigits = 0): string =>
  `$${Number(n).toLocaleString("en-US", { maximumFractionDigits })}`;

// Pluralize a singular dimension noun (the catalog's "noun" field) for display beside a count, since
// a limit meter always reads as a plural quantity ("0 / 100 certificates"). Conservative: a noun that
// already ends in "s" is left alone so a value the server sends plural isn't doubled.
export const pluralizeUnit = (noun: string): string => {
  if (/s$/i.test(noun)) {
    return noun;
  }
  if (/[^aeiou]y$/i.test(noun)) {
    return `${noun.slice(0, -1)}ies`;
  }
  if (/(x|z|ch|sh)$/i.test(noun)) {
    return `${noun}es`;
  }
  return `${noun}s`;
};

export const cadenceWord = (cad: BillingV2Cadence): string => {
  if (cad === "annual") {
    return "year";
  }
  return "month";
};

// Abbreviated cadence used beside per-unit dimension prices (e.g. "$5 per MCP / mo").
export const cadenceWordShort = (cad: BillingV2Cadence): string => {
  if (cad === "annual") {
    return "yr";
  }
  return "mo";
};

// Maps the real overview interval onto the catalog cadence used for marketing prices.
export const intervalToCadence = (interval: "month" | "year" | null): BillingV2Cadence => {
  if (interval === "year") {
    return "annual";
  }
  return "monthly";
};

// Per-unit price for the active cadence (returns the per-period charge).
export const unitPrice = (dim: BillingV2Dim | BillingV2ProBase, cad: BillingV2Cadence): number => {
  if (cad === "annual") {
    return dim.annual;
  }
  return dim.monthly;
};

// Whether the active cadence's price is a usage-based (metered) rate rather than a per-unit charge.
export const isMeteredCadence = (dim: BillingV2Dim, cad: BillingV2Cadence): boolean => {
  if (cad === "annual") {
    return dim.meteredAnnual ?? false;
  }
  return dim.meteredMonthly ?? false;
};

// "/ year" or "/ month" for a product's cadence.
export const cadencePeriod = (cadence: BillingV2Cadence | null | undefined): string =>
  cadence === "annual" ? "year" : "month";

// An annually-committed per_resource dimension: usage above `committed` is billed monthly on-demand.
export const dimAnnualCommitted = (dim: BillingV2EntitlementDim): boolean =>
  dim.cadence === "annual" && dim.committed !== null;

// Per-unit monthly rate for a dimension (dollars): metered uses its per-unit rate; a monthly
// per_resource (and an annual dimension's overage) uses the on-demand rate.
export const dimMonthlyRate = (dim: BillingV2EntitlementDim): number => {
  if (dim.metered) {
    return dim.rate ?? 0;
  }
  return dim.onDemandRate ?? dim.rate ?? 0;
};

// On-demand overflow quantity for an annually-committed dimension (0 otherwise).
export const dimOnDemandQuantity = (dim: BillingV2EntitlementDim): number =>
  dimAnnualCommitted(dim) ? Math.max(0, dim.used - (dim.committed ?? 0)) : 0;

// Fill percentage (0-100) for a simple usage bar, or null when there's no finite cap to fill against.
export const usagePct = (used: number, limit: number | null): number | null => {
  if (limit === null || limit <= 0) {
    return null;
  }
  return Math.min(100, (used / limit) * 100);
};

// Segments for a dimension's usage bar. Annual committed: the bar spans the greater of committed and
// used; the committed portion is blue and any overflow orange. Monthly: a single blue used/limit fill.
export const dimBarSegments = (
  dim: BillingV2EntitlementDim
): { committedPct: number; onDemandPct: number } => {
  if (dimAnnualCommitted(dim)) {
    const committed = dim.committed ?? 0;
    const denominator = Math.max(committed, dim.used, 1);
    const committedFill = Math.min(committed, dim.used);
    return {
      committedPct: (committedFill / denominator) * 100,
      onDemandPct: (Math.max(0, dim.used - committed) / denominator) * 100
    };
  }
  return { committedPct: usagePct(dim.used, dim.limit) ?? 0, onDemandPct: 0 };
};

// Headline price breakdown for a product card, e.g. "55 seats committed × $20",
// "1 CA committed × $435 + 100 certificates committed × $3", "140 active contributors × $7", or
// "Flat · up to 10 resources". Annual committed dims read as "{committed} {units} committed × $rate";
// monthly priced dims as "{used} {units} × $rate"; a capped flat dim as "up to {limit} {units}".
export const productBreakdown = (entitlement?: BillingV2Entitlement): string | null => {
  const dims = entitlement?.dimensions ?? [];
  if (dims.length === 0) {
    return null;
  }

  const pricedTerms: string[] = [];
  const flatTerms: string[] = [];
  dims.forEach((dim) => {
    if (dimAnnualCommitted(dim) && dim.committedRate) {
      const committed = dim.committed ?? 0;
      pricedTerms.push(
        `${committed.toLocaleString()} ${pluralizeUnit(dim.noun)} committed × ${fmtMoney(dim.committedRate)}`
      );
      return;
    }
    const rate = dimMonthlyRate(dim);
    if (rate > 0) {
      const qty = dim.metered ? Math.max(0, dim.used - (dim.freeBand ?? 0)) : dim.used;
      pricedTerms.push(`${qty.toLocaleString()} ${pluralizeUnit(dim.noun)} × ${fmtMoney(rate)}`);
      return;
    }
    if (dim.limit !== null) {
      flatTerms.push(`up to ${dim.limit.toLocaleString()} ${pluralizeUnit(dim.noun)}`);
    }
  });

  if (pricedTerms.length > 0) {
    return [...pricedTerms, ...flatTerms].join(" + ");
  }
  if (flatTerms.length > 0) {
    return `Flat · ${flatTerms.join(" + ")}`;
  }
  return null;
};
