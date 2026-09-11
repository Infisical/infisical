import { METERED_DIMENSION_KEYS } from "@app/services/license-client/usage/usage-counters";

import { BillingV2BreakdownDimension } from "./license-v2-types";

describe("billing v2 usage breakdown dimensions", () => {
  // The breakdown reads its counts from the meters, so a dimension it offers must be one the license
  // server actually meters. Renaming a key in features.ts without updating the enum would otherwise ship
  // a route that 400s on a dimension the billing page links to.
  test("every breakdown dimension is a metered dimension", () => {
    const metered = new Set(METERED_DIMENSION_KEYS);
    const unknown = Object.values(BillingV2BreakdownDimension).filter((key) => !metered.has(key));

    expect(unknown).toEqual([]);
  });
});
