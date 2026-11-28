import { Money } from "./money";

// upTo is inclusive and null on the last band; unitPrice is dollars per unit (fractions of a cent kept);
// flatFee is charged once the band is reached.
export type TPriceBandRecord = { upTo: number | null; unitPrice: number; flatFee: number };

export type TPriceBandsRecord = { mode: "graduated" | "volume"; tiers: TPriceBandRecord[] };

export type TPriceTier = { upTo: number | null; unitAmountDecimal: string; flatAmountCents?: number };

// A metered price's bands, in dollars.
export class PriceBands {
  private constructor() {}

  // unitAmountDecimal keeps sub-cent rates, so it arrives as a decimal string of cents. Anything but "volume" is
  // graduated. Undefined when there are no tiers.
  static fromTiers(
    mode: string | null | undefined,
    tiers: TPriceTier[] | null | undefined
  ): TPriceBandsRecord | undefined {
    if (!tiers || tiers.length === 0) return undefined;
    return {
      mode: mode === "volume" ? "volume" : "graduated",
      tiers: tiers.map((tier) => ({
        upTo: tier.upTo,
        unitPrice: Number(tier.unitAmountDecimal) / 100,
        flatFee: Money.dollars(tier.flatAmountCents)
      }))
    };
  }
}
