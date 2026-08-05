import { TableName } from "@app/db/schemas";
import { TDynamicSecretLeaseDALFactory } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-dal";
import { OrgPermissionSecretsManagementInsightsActions } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError } from "@app/lib/errors";
import { TIdentityOrgDALFactory } from "@app/services/identity/identity-org-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { checkSecretsManagementInsightsPermission } from "./product-insights-fns";
import { TGetSecretsUsageInsightsDTO, TSecretsUsageInsights } from "./product-insights-types";

type TProductInsightsServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  orgDAL: Pick<TOrgDALFactory, "countAllOrgMembers">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "countAllOrgIdentities">;
  dynamicSecretLeaseDAL: Pick<TDynamicSecretLeaseDALFactory, "countLeasesForOrg">;
};

export type TProductInsightsServiceFactory = ReturnType<typeof productInsightsServiceFactory>;

export const productInsightsServiceFactory = ({
  permissionService,
  licenseService,
  orgDAL,
  identityOrgMembershipDAL,
  dynamicSecretLeaseDAL
}: TProductInsightsServiceFactoryDep) => {
  const getSecretsUsageInsights = async (dto: TGetSecretsUsageInsightsDTO): Promise<TSecretsUsageInsights> => {
    await checkSecretsManagementInsightsPermission(
      permissionService,
      OrgPermissionSecretsManagementInsightsActions.Read,
      dto
    );

    const plan = await licenseService.getPlan(dto.orgId);
    if (!plan.secretAccessInsights) {
      throw new BadRequestError({
        message: "Secrets management insights are not available on your plan. Upgrade your plan to access insights."
      });
    }

    const [activeLeases, users, identities] = await Promise.all([
      dynamicSecretLeaseDAL.countLeasesForOrg(dto.orgId),
      orgDAL.countAllOrgMembers(dto.orgId),
      identityOrgMembershipDAL.countAllOrgIdentities({
        [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: dto.orgId
      })
    ]);

    return { activeLeases, users, identities };
  };

  return { getSecretsUsageInsights };
};
