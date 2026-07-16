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

export const intervalWord = (interval: "month" | "year" | null): string => {
  if (interval === "year") {
    return "year";
  }
  return "month";
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

// Fixed recurring + estimated metered usage for a product (dollars). This is the product card
// headline; the metered portion is a projection, so callers show an "est." qualifier when it's > 0.
export const productTotal = (entitlement?: BillingV2Entitlement): number =>
  (entitlement?.amount ?? 0) + (entitlement?.estimatedUsageAmount ?? 0);

// The per-unit rate to display for a dimension (dollars): the pinned metered rate when the backend
// sent one, otherwise the catalog's per-unit price for the active cadence. null when neither exists.
export const dimRate = (
  dim: BillingV2EntitlementDim,
  product: BillingV2CatalogProduct | undefined,
  planTier: string | undefined,
  cadence: BillingV2Cadence
): number | null => {
  if (dim.rate !== undefined && dim.rate !== null) {
    return dim.rate;
  }
  const plan = product?.plans.find((candidate) => candidate.tier === planTier) ?? product?.plans[0];
  const catalogDim = plan?.dims.find((candidate) => candidate.key === dim.key);
  if (!catalogDim) {
    return null;
  }
  return unitPrice(catalogDim, cadence);
};

// The billed quantity for a dimension: for a metered dimension it's the overage above the included
// free band; for a per-unit dimension it's the used count.
export const dimBilledQuantity = (dim: BillingV2EntitlementDim): number => {
  if (dim.metered) {
    return Math.max(0, dim.used - (dim.freeBand ?? 0));
  }
  return dim.used;
};

// Fill percentage (0-100) for a dimension's usage bar, or null when there's no finite cap to fill
// against (unlimited or usage-based). Mirrors the utilization semantics used server-side.
export const usagePct = (used: number, limit: number | null): number | null => {
  if (limit === null || limit <= 0) {
    return null;
  }
  return Math.min(100, (used / limit) * 100);
};

// Human-readable price breakdown for a product card, e.g. "1 CA × $500 + 84 certificates × $3" or
// "Flat · up to 10 resources". Priced/metered dimensions read as "{qty} {units} × ${rate}"; flat
// dimensions (a cap with no per-unit rate) read as "up to {limit} {units}". Returns null when nothing
// is priced. Illustrative only: the authoritative total is the product headline (amount + usage).
export const productBreakdown = (
  entitlement: BillingV2Entitlement | undefined,
  product: BillingV2CatalogProduct | undefined,
  cadence: BillingV2Cadence
): string | null => {
  const dims = entitlement?.dimensions ?? [];
  if (dims.length === 0) {
    return null;
  }

  const pricedTerms: string[] = [];
  const flatTerms: string[] = [];
  dims.forEach((dim) => {
    const rate = dimRate(dim, product, entitlement?.planTier, cadence);
    if (rate !== null && rate > 0) {
      const qty = dimBilledQuantity(dim);
      pricedTerms.push(`${qty.toLocaleString()} ${pluralizeUnit(dim.noun)} × ${fmtMoney(rate)}`);
    } else if (dim.limit !== null) {
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
