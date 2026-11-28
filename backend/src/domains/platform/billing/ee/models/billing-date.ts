const DAY_IN_MS = 24 * 60 * 60 * 1000;

const LONG: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };

// Dates for display on the billing pages. The License Server sends unix seconds, except entitlement product dates
// (ISO strings).
export class BillingDate {
  private constructor() {}

  // "August 16, 2026".
  static long(unixSeconds: number | null | undefined): string | null {
    if (!unixSeconds) return null;
    return new Date(unixSeconds * 1000).toLocaleDateString("en-US", LONG);
  }

  // "Aug 16", for the header's next-charge line, where the year is noise.
  static short(unixSeconds: number | null | undefined): string | null {
    if (!unixSeconds) return null;
    return new Date(unixSeconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  static longFromIso(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("en-US", LONG);
  }

  static longFromDate(date: Date): string {
    return date.toLocaleDateString("en-US", LONG);
  }

  // Whole days left, rounded up and never negative.
  static daysUntil(unixSeconds: number | null | undefined, now: Date): number | null {
    if (!unixSeconds) return null;
    return Math.max(0, Math.ceil((unixSeconds * 1000 - now.getTime()) / DAY_IN_MS));
  }

  // Whole days gone, rounded down and never negative.
  static daysSince(unixSeconds: number | null | undefined, now: Date): number | null {
    if (!unixSeconds) return null;
    return Math.max(0, Math.floor((now.getTime() - unixSeconds * 1000) / DAY_IN_MS));
  }
}
