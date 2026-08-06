import { TableName } from "@app/db/schemas";
import { TDynamicSecretLeaseDALFactory } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-dal";
import { OrgPermissionSecretsManagementInsightsActions } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { BadRequestError } from "@app/lib/errors";
import { TIdentityOrgDALFactory } from "@app/services/identity/identity-org-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TProductInsightsDALFactory } from "./product-insights-dal";
import { checkSecretsManagementInsightsPermission } from "./product-insights-fns";
import {
  TGetSecretsProjectWarningsDTO,
  TGetSecretsUsageInsightsDTO,
  TSecretsProjectWarnings,
  TSecretsUsageInsights
} from "./product-insights-types";

type TProductInsightsServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  orgDAL: Pick<TOrgDALFactory, "countAllOrgMembers">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "countAllOrgIdentities">;
  dynamicSecretLeaseDAL: Pick<TDynamicSecretLeaseDALFactory, "countLeasesForOrg">;
  productInsightsDAL: Pick<TProductInsightsDALFactory, "findProjectWarningsForOrg">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

// Same threshold the per-project insights summary uses (insights-service.ts)
const STALE_SECRET_THRESHOLD_DAYS = 90;

export type TProductInsightsServiceFactory = ReturnType<typeof productInsightsServiceFactory>;

export const productInsightsServiceFactory = ({
  permissionService,
  licenseService,
  orgDAL,
  identityOrgMembershipDAL,
  dynamicSecretLeaseDAL,
  productInsightsDAL,
  keyStore
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

  const getSecretsProjectWarnings = async (dto: TGetSecretsProjectWarningsDTO): Promise<TSecretsProjectWarnings> => {
    // Permission and plan checks run before the cache lookup so cached data is
    // never served to an unauthorized actor.
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

    const cacheKey = KeyStorePrefixes.ProductInsightsCache(dto.orgId, `project-warnings:${dto.offset}:${dto.limit}`);
    return withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: async () => {
        const staleBefore = new Date();
        staleBefore.setDate(staleBefore.getDate() - STALE_SECRET_THRESHOLD_DAYS);

        const { projects, totalProjects, projectsWithIssues } = await productInsightsDAL.findProjectWarningsForOrg(
          dto.orgId,
          { offset: dto.offset, limit: dto.limit, staleBefore }
        );

        return { projects, totalProjects, projectsWithIssues, offset: dto.offset, limit: dto.limit };
      }
    });
  };

  return { getSecretsUsageInsights, getSecretsProjectWarnings };
};
