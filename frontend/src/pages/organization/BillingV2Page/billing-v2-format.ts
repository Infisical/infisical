import axios from "axios";

import {
  BillingV2Band,
  BillingV2Bands,
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

// The license server's machine code (details.code) on a failed billing request, if any.
export const billingV2ErrorCode = (error: unknown): string | undefined =>
  axios.isAxiosError<{ details?: { code?: string } }>(error)
    ? error.response?.data?.details?.code
    : undefined;

// Negative amounts put the sign before the currency symbol ("-$8.70", not "$-8.70").
export const fmtMoney = (n: number, maximumFractionDigits = 0, minimumFractionDigits = 0): string =>
  `${n < 0 ? "-" : ""}$${Math.abs(Number(n)).toLocaleString("en-US", {
    minimumFractionDigits,
    maximumFractionDigits
  })}`;

// Whole dollars stay whole ("$408"); any fractional amount always shows cents ("$22.20", "-$8.70").
export const fmtMoneyCents = (n: number): string =>
  Number.isInteger(n) ? fmtMoney(n) : fmtMoney(n, 2, 2);

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

export const unitForCount = (noun: string, count: number): string =>
  count === 1 ? noun : pluralizeUnit(noun);

const IDENTITY_DIMENSIONS = new Set([
  "identities",
  "secret_identities",
  "pam_identities",
  "agent_vault_identities"
]);

export const isIdentityDim = (dim: { key: string }): boolean => IDENTITY_DIMENSIONS.has(dim.key);

export const dimDisplayLabel = (dim: { key: string; label: string }): string =>
  isIdentityDim(dim) ? "Identities" : dim.label;

export const dimDisplayNoun = (dim: { key: string; noun: string }): string =>
  isIdentityDim(dim) ? "identity" : dim.noun;

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

// A per_resource dimension carrying a prepaid annual commitment: usage above `committed` is billed
// monthly on-demand. A commitment is identified by a non-null committed quantity, NOT by the product's
// cadence — a monthly-cadence product can still prepay an annual commitment on a dimension. Metered
// dimensions are usage-based (no buyer-selected quantity), so they are never "committed" even if the
// server reports a committed value, which keeps the commitment UI off usage-based pricing.
export const dimCommitted = (dim: BillingV2EntitlementDim): boolean =>
  !dim.metered && dim.committed !== null;

// A ceiling to fill a usage bar against: an annual commitment or a finite limit.
export const dimHasCeiling = (dim: BillingV2EntitlementDim): boolean =>
  dimCommitted(dim) || (dim.limit !== null && dim.limit > 0);

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
  dimCommitted(dim) ? Math.max(0, dim.used - (dim.committed ?? 0)) : 0;

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
  if (dimCommitted(dim)) {
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
    if (dimCommitted(dim) && dim.committedRate) {
      return sum + (dim.committed ?? 0) * dim.committedRate;
    }
    return sum;
  }, 0);
};

export const dimCommittable = (dim: BillingV2EntitlementDim): boolean =>
  dim.commitAvailable && !dim.metered;

// A dimension the commitment sheet should manage: one the customer is currently eligible to commit
// (dimCommittable), OR one that already carries a commitment (dimCommitted) even if it is no longer
// commit-eligible (e.g. a grandfathered dimension, or an older license server that omits
// commitAvailable and so defaults it to false). This is the single predicate the "Change commitment"
// action AND the commitment view share, so the action never opens onto an empty sheet.
export const dimCommitManageable = (dim: BillingV2EntitlementDim): boolean =>
  dimCommittable(dim) || dimCommitted(dim);

export type BillingV2CommitNudge = {
  label: string;
  qty: number;
  annualCommitted: number;
  monthlyAnnualized: number;
  savingsPct: number;
};

export const commitSavingsNudge = (
  entitlement?: BillingV2Entitlement
): BillingV2CommitNudge | null => {
  if (!entitlement?.entitled) {
    return null;
  }
  const dim = (entitlement.dimensions ?? []).find(
    (d) =>
      dimCommittable(d) &&
      d.committed === null &&
      d.used > 0 &&
      (d.committedRate ?? 0) > 0 &&
      (d.onDemandRate ?? 0) > 0
  );
  if (!dim) {
    return null;
  }
  const annualCommitted = dim.used * (dim.committedRate ?? 0);
  const monthlyAnnualized = dim.used * (dim.onDemandRate ?? 0) * 12;
  const savingsPct = Math.round((1 - annualCommitted / monthlyAnnualized) * 100);
  if (savingsPct <= 0) {
    return null;
  }
  return { label: dim.label, qty: dim.used, annualCommitted, monthlyAnnualized, savingsPct };
};

// Capitalize a plan tier ("pro" -> "Pro") for the badge beside a product's name.
// hardcoded legacy for now
export const tierLabel = (tier: string): string => {
  const stripped = tier.replace("legacy_", "").replace(/_/g, " ");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
};

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

// Price of one band as a buyer reads it: whole-unit prices per unit, sub-cent ones per 1,000 or per
// 1,000,000 ("$5 per 1,000 minutes"), "free" when it costs nothing.
// A sub-cent unit price reads better per pack: $0.005 a unit is "$5 per 1,000".
const bandPackPrice = (band: BillingV2Band): { price: number; pack: number } => {
  let pack = 1;
  if (band.unitPrice < 0.01) {
    pack = band.unitPrice * 1000 >= 0.01 ? 1000 : 1_000_000;
  }
  return { price: Math.round(band.unitPrice * pack * 1e6) / 1e6, pack };
};

const fmtPackPrice = (price: number): string => fmtMoney(price, 6, price % 1 === 0 ? 0 : 2);

export const bandRateLabel = (band: BillingV2Band, noun: string): string => {
  const flat = band.flatFee > 0 ? ` + ${fmtMoneyCents(band.flatFee)}` : "";
  if (band.unitPrice <= 0) {
    return band.flatFee > 0 ? `${fmtMoneyCents(band.flatFee)} flat` : "free";
  }
  const { price, pack } = bandPackPrice(band);
  const per = pack === 1 ? noun : `${pack.toLocaleString("en-US")} ${pluralizeUnit(noun)}`;
  return `${fmtPackPrice(price)} per ${per}${flat}`;
};

// A band's price in a band table, whose range column already names the unit: "Included",
// "$5 per 1,000", "$0.25 each".
export const bandTableRate = (band: BillingV2Band): string => {
  const flat = band.flatFee > 0 ? ` + ${fmtMoneyCents(band.flatFee)}` : "";
  if (band.unitPrice <= 0) {
    return band.flatFee > 0 ? `${fmtMoneyCents(band.flatFee)} flat` : "Included";
  }
  const { price, pack } = bandPackPrice(band);
  const per = pack === 1 ? "each" : `per ${pack.toLocaleString("en-US")}`;
  return `${fmtPackPrice(price)} ${per}${flat}`;
};

// Range a band covers, e.g. "10,001 – 100,000" or "100,001+"; the first band starts at 0.
export const bandRangeLabel = (bands: BillingV2Bands, index: number): string => {
  const from = index === 0 ? 0 : (bands.tiers[index - 1].upTo ?? 0) + 1;
  const { upTo } = bands.tiers[index];
  return upTo === null
    ? `${from.toLocaleString("en-US")}+`
    : `${from.toLocaleString("en-US")} – ${upTo.toLocaleString("en-US")}`;
};

// A metered dimension's tile caption: what usage so far this period is estimated to cost, and the
// band it is in when the price has more than one.
export const meteredUsageCaption = (dim: BillingV2EntitlementDim): string | null => {
  if (!dim.metered || !dim.usage) {
    return null;
  }
  // A trial's usage is free, so it carries no amount; the plan card shows which band it reached.
  if (dim.usage.trial) {
    return "free during your trial";
  }
  const parts: string[] = [];
  if (dim.usage.estimatedAmount !== null) {
    parts.push(`≈ ${fmtMoneyCents(dim.usage.estimatedAmount)} so far`);
  }
  if (dim.bands && dim.bands.tiers.length > 1) {
    const band = dim.bands.tiers[dim.usage.currentTier];
    if (band) {
      parts.push(`band ${dim.usage.currentTier + 1}: ${bandRateLabel(band, dim.noun)}`);
    }
  } else if (dim.bands && dim.bands.tiers.length === 1) {
    parts.push(bandRateLabel(dim.bands.tiers[0], dim.noun));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
};

// The band a period total lands in: the first whose inclusive upper limit covers it.
export const bandIndexFor = (bands: BillingV2Bands, quantity: number): number => {
  const index = bands.tiers.findIndex((band) => band.upTo === null || quantity <= band.upTo);
  return index >= 0 ? index : bands.tiers.length - 1;
};

// Whether meteredUsageCaption names the dimension's rate, so a meter beside it should not repeat it.
export const meteredRateInCaption = (dim: BillingV2EntitlementDim): boolean =>
  dim.metered && Boolean(dim.usage) && (dim.bands?.tiers.length ?? 0) > 0;
