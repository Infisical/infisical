import { TFeatureSet } from "@app/ee/services/license/license-types";

import { TEntitlementsResponse } from "../license-client-types";
import { FEATURE_MAPPINGS } from "./feature-mapping";

// Builds a v1-shaped TFeatureSet from the v2 entitlement set so getPlan can serve v2 in "on" mode
// without changing its callers. Starts from the passed base (free-tier defaults) and overlays each
// mapped feature; a key v2 omits or returns null for keeps the base value. Base is passed in (not
// imported from license-fns) to avoid a license-service <-> license-fns import cycle.
export const projectV2ToFeatureSet = (base: TFeatureSet, entitlements: TEntitlementsResponse): TFeatureSet => {
  const plan = JSON.parse(JSON.stringify(base)) as Record<string, unknown> & { rateLimits: Record<string, unknown> };

  FEATURE_MAPPINGS.forEach((mapping) => {
    if (mapping.v1Field === null) {
      return;
    }
    const raw = entitlements.features[mapping.v2Key];
    if (!raw || raw.value === null || raw.value === undefined) {
      return;
    }

    if (mapping.v1Field.includes(".")) {
      const [parent, child] = mapping.v1Field.split(".");
      (plan[parent] as Record<string, unknown>)[child] = raw.value;
    } else {
      plan[mapping.v1Field] = raw.value;
    }
  });

  console.log(
    "base",
    JSON.stringify(base, null, 4),
    "entitlements",
    JSON.stringify(entitlements.features, null, 4),
    "plan",
    JSON.stringify(plan, null, 4)
  );
  return plan as unknown as TFeatureSet;
};
