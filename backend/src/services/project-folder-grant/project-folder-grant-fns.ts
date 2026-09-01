import { TFeatureSet } from "@app/ee/services/license/license-types";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";

import { TOrgDALFactory } from "../org/org-dal";

export const isCrossProjectEnabled = async (
  actorOrgId: string,
  orgDAL: Pick<TOrgDALFactory, "findOrgById">,
  plan: TFeatureSet
) => {
  const org = await requestMemoize(requestMemoKeys.orgFindOrgById(actorOrgId), () => orgDAL.findOrgById(actorOrgId));
  return plan.crossProjectSecretSharing && (org?.allowCrossProjectSecretSharing ?? false);
};
