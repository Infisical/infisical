import { TCadence } from "./billing-cadence";

// The org's present count for one per-unit price of the plan. present is null when nothing meters the dimension.
export type TCountedDimension = { dimensionKey: string; present: number | null; included: number };

// What one product line asks the License Server to charge for, so a preview and the charge match what the org has.
export class ProductLineItem {
  private constructor(
    readonly planTier: string,
    // Committed units, annual only (the License Server ignores them on monthly).
    readonly quantities: Record<string, number> | undefined,
    // What the org uses now, for the dimensions we can meter. The License Server floors the rest.
    readonly declaredUsage: Record<string, number>
  ) {}

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
    return new ProductLineItem(planTier, quantities, declaredUsage);
  }
}
