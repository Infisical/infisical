import { BillingV2Cadence, BillingV2CatalogProduct, BillingV2Dim } from "@app/hooks/api";

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
