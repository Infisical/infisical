export type TCadence = "monthly" | "annual";

// How often a line bills. Anything but "annual" bills monthly, the License Server's default.
export class BillingCadence {
  private constructor() {}

  static orMonthly(cadence: string | null | undefined): TCadence {
    return cadence === "annual" ? "annual" : "monthly";
  }

  // A subscription dimension's cadence; "" or anything unknown is null.
  static orNull(cadence: string | null | undefined): TCadence | null {
    if (cadence === "annual") return "annual";
    if (cadence === "monthly") return "monthly";
    return null;
  }
}
