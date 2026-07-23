import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";

import { TOrgDALFactory } from "../org/org-dal";

type TCrossProjectSecretSharingServiceFactoryDep = {
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TCrossProjectSecretSharingServiceFactory = ReturnType<typeof crossProjectSecretSharingServiceFactory>;

export const crossProjectSecretSharingServiceFactory = ({
  licenseService
}: TCrossProjectSecretSharingServiceFactoryDep) => {
  const canUseCrossProjectSecretSharing = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    return plan.crossProjectSecretSharing;
  };

  const isCrossProjectEnabled = async (actorOrgId: string, orgDAL: Pick<TOrgDALFactory, "findOrgById">) => {
    const org = await requestMemoize(requestMemoKeys.orgFindOrgById(actorOrgId), () => orgDAL.findOrgById(actorOrgId));
    return (await canUseCrossProjectSecretSharing(actorOrgId)) && (org?.allowCrossProjectSecretSharing ?? false);
  };

  return { canUseCrossProjectSecretSharing, isCrossProjectEnabled };
};
