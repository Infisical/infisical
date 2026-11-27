import { RuleViolationError } from "@app/domains/lib/errors";

const MAX_AGE_SECONDS = 15 * 60;
// A quote can be dated slightly ahead of this clock.
const MAX_SKEW_SECONDS = 60;

// The proration date a plan change was priced at. Charging on a stale one would bill a different total than the
// buyer confirmed.
export class ProrationQuote {
  private constructor(private readonly prorationDate: number | undefined) {}

  // Undefined when the caller confirms without a quote, which is always current.
  static of(prorationDate: number | undefined): ProrationQuote {
    return new ProrationQuote(prorationDate);
  }

  assertCurrent(now: Date): void {
    if (this.prorationDate === undefined) return;
    const age = Math.floor(now.getTime() / 1000) - this.prorationDate;
    if (age > MAX_AGE_SECONDS || age < -MAX_SKEW_SECONDS) {
      throw new RuleViolationError({
        message: "This quote is no longer current. Review the updated total and confirm again."
      });
    }
  }
}
