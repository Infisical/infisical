import { TCadence } from "./catalog-plan";

// The org's present count for one per-unit price of the plan. present is null when nothing meters the dimension.
export type TCountedDimension = { dimensionKey: string; present: number | null; included: number };

export type TProductLineItemRecord = {
  planTier: string;
  cadence: TCadence;
  // Committed units, annual only (the License Server ignores them on monthly).
  quantities?: Record<string, number>;
  // What the org uses now, for the dimensions we can meter. The License Server floors the rest.
  declaredUsage: Record<string, number>;
};

// What one product line asks the License Server to charge for, so a preview and the charge match what the org has.
export class ProductLineItem {
  private constructor(private readonly record: TProductLineItemRecord) {}

  // An annual commitment takes the buyer's entered commitment, else the present count, else the included floor, so
  // an annual line still prices. declaredUsage never takes a commitment.
  static fromUsage({
    planTier,
    cadence,
    counted,
    committed
  }: {
    planTier: string;
    cadence: TCadence;
    counted: TCountedDimension[];
    committed?: Record<string, number>;
  }): ProductLineItem {
    const declaredUsage: Record<string, number> = {};
    counted.forEach(({ dimensionKey, present }) => {
      if (present !== null) {
        declaredUsage[dimensionKey] = present;
      }
    });
    const quantities =
      cadence === "annual"
        ? Object.fromEntries(
            counted.map(({ dimensionKey, present, included }) => [
              dimensionKey,
              committed?.[dimensionKey] ?? present ?? included
            ])
          )
        : undefined;
    return new ProductLineItem({ planTier, cadence, quantities, declaredUsage });
  }

  get planTier(): string {
    return this.record.planTier;
  }

  get cadence(): TCadence {
    return this.record.cadence;
  }

  get quantities(): Record<string, number> | undefined {
    return this.record.quantities;
  }

  get declaredUsage(): Record<string, number> {
    return this.record.declaredUsage;
  }

  toJSON(): TProductLineItemRecord {
    return { ...this.record };
  }
}
