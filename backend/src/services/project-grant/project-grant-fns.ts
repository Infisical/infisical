import { getConfig } from "@app/lib/config/env";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";

import { TOrgDALFactory } from "../org/org-dal";

export const canUseCrossProjectSecretSharing = (orgId: string) => {
  const appCfg = getConfig();
  return appCfg.CROSS_PROJECT_SECRET_SHARING_ORG_WHITELIST.includes(orgId);
};

export const isCrossProjectEnabled = async (
  actorOrgId: string,
  orgDAL: Pick<TOrgDALFactory, "findOrgById">
) => {
  const org = await requestMemoize(requestMemoKeys.orgFindOrgById(actorOrgId), () =>
    orgDAL.findOrgById(actorOrgId)
  );
  return canUseCrossProjectSecretSharing(actorOrgId) && (org?.allowCrossProjectSecretSharing ?? false);
};
