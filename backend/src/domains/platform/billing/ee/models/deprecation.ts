import { BillingDate } from "./billing-date";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

// date is formatted for display; daysLeft is whole days until the sunset. Both null when no date was given.
export type TDeprecationRecord = {
  reason?: string;
  nextSteps?: string;
  date: string | null;
  daysLeft: number | null;
};

// A catalog product or plan, which carries its deprecation in these fields.
export type TDeprecatable = {
  deprecated?: boolean | null;
  deprecationReason?: string | null;
  deprecationNextSteps?: string | null;
  deprecationDate?: number | string | null;
};

// Wording a customer's own contract gives, which wins over the catalog's.
export type TDeprecationOverride = { reason?: string | null; nextSteps?: string | null } | null | undefined;

// The License Server sends seconds, milliseconds or an ISO string, depending on the server. Under 1e12 is seconds.
const parseSunset = (value: number | string | null | undefined): Date | null => {
  if (value === null || value === undefined) return null;
  const date = typeof value === "number" ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Something kept for existing customers and closed to new ones.
export class Deprecation {
  private constructor() {}

  // Undefined when nothing is deprecated.
  static from(
    source: TDeprecatable | undefined,
    now: Date,
    override?: TDeprecationOverride
  ): TDeprecationRecord | undefined {
    if (!source?.deprecated) return undefined;
    const sunset = parseSunset(source.deprecationDate);
    return {
      reason: override?.reason ?? source.deprecationReason ?? undefined,
      nextSteps: override?.nextSteps ?? source.deprecationNextSteps ?? undefined,
      date: sunset ? BillingDate.longFromDate(sunset) : null,
      daysLeft: sunset ? Math.max(0, Math.ceil((sunset.getTime() - now.getTime()) / DAY_IN_MS)) : null
    };
  }
}
