import { BillingDate } from "./billing-date";

// date is formatted for display; daysLeft is whole days until the sunset. Both null when no date was given.
export type TDeprecationRecord = {
  reason?: string;
  nextSteps?: string;
  date: string | null;
  daysLeft: number | null;
};

export type TDeprecationInput = {
  deprecated?: boolean;
  reason?: string | null;
  nextSteps?: string | null;
  date?: number | string | null;
};

// Something kept for existing customers and closed to new ones.
export class Deprecation {
  private constructor() {}

  // Undefined when nothing is deprecated, so callers can spread it in only when present.
  static from(input: TDeprecationInput, now: Date): TDeprecationRecord | undefined {
    if (!input.deprecated) return undefined;
    const date = BillingDate.parseFlexible(input.date);
    return {
      reason: input.reason ?? undefined,
      nextSteps: input.nextSteps ?? undefined,
      date: date ? BillingDate.longFromDate(date) : null,
      daysLeft: date ? BillingDate.daysUntilDate(date, now) : null
    };
  }
}
