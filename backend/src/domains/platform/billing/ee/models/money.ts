// The License Server prices in cents; every amount the billing pages show is dollars.
export class Money {
  private constructor() {}

  // Absent and zero both read as 0, so a missing amount never shows as NaN.
  static dollars(cents: number | null | undefined): number {
    if (!cents) return 0;
    return cents / 100;
  }

  // For amounts where "not priced" (null) differs from "free" (0).
  static dollarsOrNull(cents: number | null | undefined): number | null {
    return cents === null || cents === undefined ? null : Money.dollars(cents);
  }
}
