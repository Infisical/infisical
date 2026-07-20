import {
  BillingV2Cadence,
  BillingV2CatalogProduct,
  BillingV2Dim,
  BillingV2Entitlement,
  BillingV2EntitlementDim,
  BillingV2Overview
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

// A ceiling to fill a usage bar against: an annual commitment or a finite limit.
export const dimHasCeiling = (dim: BillingV2EntitlementDim): boolean =>
  dimAnnualCommitted(dim) || (dim.limit !== null && dim.limit > 0);

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

// Segments for a dimension's usage bar. Annual committed: the bar spans the greater of committed
// and used, split into committed fill and on-demand overflow. Monthly: a single used/limit fill.
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

// Annual committed total for a product (dollars/yr): committed quantity × pinned annual rate, summed
// across its annually-committed dimensions. This is the prepaid yearly figure, shown separately from
// any monthly on-demand overage (the two are never summed into one headline).
export const productAnnualCommitted = (entitlement?: BillingV2Entitlement): number => {
  const dims = entitlement?.dimensions ?? [];
  return dims.reduce((sum, dim) => {
    if (dimAnnualCommitted(dim) && dim.committedRate) {
      return sum + (dim.committed ?? 0) * dim.committedRate;
    }
    return sum;
  }, 0);
};

// Capitalize a plan tier ("pro" -> "Pro") for the badge beside a product's name.
export const tierLabel = (tier: string): string => tier.charAt(0).toUpperCase() + tier.slice(1);

// Cadence as an adjective ("annual"/"monthly"), empty for an unknown cadence. Distinct from
// cadenceWord, which returns the period noun ("year"/"month").
export const cadenceLabel = (cadence: BillingV2Cadence | null): string => {
  if (cadence === "annual") {
    return "annual";
  }
  if (cadence === "monthly") {
    return "monthly";
  }
  return "";
};

// Resolve the product(s) closing on the next-charge date into a display label. A single product reads
// as its name; several collapse to "{first} + N more" so the line stays short.
export const nextChargeProductLabel = (
  catalog: BillingV2CatalogProduct[],
  productKeys: string[]
): string => {
  const names = productKeys.map((key) => catalog.find((prod) => prod.id === key)?.name ?? key);
  if (names.length === 0) {
    return "";
  }
  if (names.length === 1) {
    return names[0];
  }
  return `${names[0]} + ${names.length - 1} more`;
};

type BillingAddress = NonNullable<BillingV2Overview["billingDetails"]>["address"];

// Resolve a 2-letter ISO country code to its English name, falling back to the raw value.
export const countryName = (code: string): string => {
  if (code.length !== 2) {
    return code;
  }
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
};

// Collapse a Stripe address into display lines, dropping any empty field.
export const formatAddressLines = (address: BillingAddress): string[] => {
  if (!address) {
    return [];
  }
  const regionLine = [address.city, [address.state, address.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [
    address.line1,
    address.line2,
    regionLine,
    address.country ? countryName(address.country) : ""
    // type-guard predicate (not bare Boolean) so the nullable sub-fields narrow to string[].
  ].filter((line): line is string => Boolean(line));
};

// Friendly labels for common Stripe tax-id types; falls back to the upper-cased raw type.
const TAX_TYPE_LABELS: Record<string, string> = {
  eu_vat: "EU VAT",
  gb_vat: "UK VAT",
  ch_vat: "CH VAT",
  no_vat: "NO VAT",
  in_gst: "GSTIN",
  au_abn: "ABN",
  nz_gst: "NZ GST",
  ca_gst_hst: "GST/HST",
  us_ein: "US EIN"
};

export const taxTypeLabel = (type: string): string =>
  TAX_TYPE_LABELS[type] ?? type.replace(/_/g, " ").toUpperCase();
