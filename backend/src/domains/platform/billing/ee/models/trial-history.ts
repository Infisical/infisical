import { TLicenseServerBilling } from "@app/domains/platform/license/ce/module";

import { BillingDate } from "./billing-date";

export type TTrialsRecord = Awaited<ReturnType<TLicenseServerBilling["getTrials"]>>;

export type TTrialView = {
  productKey: string;
  planTier: string | null;
  basePlanTier: string | null;
  outcome: string;
  endedReason: string | null;
  endedDetail: string | null;
  endedAt: string | null;
  endedDaysAgo: number | null;
};

// The org's past and current trials, as the License Server reports them.
export class TrialHistory {
  private constructor(private readonly trials: TTrialView[]) {}

  static empty(): TrialHistory {
    return new TrialHistory([]);
  }

  static fromServer(record: TTrialsRecord, now: Date): TrialHistory {
    return new TrialHistory(
      record.trials.map((trial) => ({
        productKey: trial.product_key,
        planTier: trial.plan_key ?? null,
        basePlanTier: trial.base_plan_key ?? null,
        outcome: trial.outcome,
        endedReason: trial.ended_reason ?? null,
        endedDetail: trial.ended_detail ?? null,
        endedAt: BillingDate.long(trial.ended_at),
        endedDaysAgo: BillingDate.daysSince(trial.ended_at, now)
      }))
    );
  }

  // Each product trialled at least once.
  productKeys(): string[] {
    return [...new Set(this.trials.map((trial) => trial.productKey))];
  }

  toJSON(): TTrialView[] {
    return this.trials;
  }
}
