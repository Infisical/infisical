import { TFeatureSet } from "@app/ee/services/license/license-types";

import { TEntitlementsResponse } from "../license-client-types";

// An unlicensed org resolves to all-default features (vacuously true on the empty map v2 returns today),
// so there is nothing to compare. Paid v1 orgs are still flagged since they get downgraded at cutover.
export const classifyUnlicensedCompare = (
  entitlements: TEntitlementsResponse,
  planV1: TFeatureSet
): { skip: boolean; warnPaid: boolean } => {
  const skip = Object.values(entitlements.features).every((f) => f.source === "default");
  const warnPaid = skip && Boolean(planV1.slug) && planV1.slug !== "starter";
  return { skip, warnPaid };
};
