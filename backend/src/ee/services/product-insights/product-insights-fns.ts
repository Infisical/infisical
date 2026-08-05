import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas";
import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";

import { TProductInsightsDTO } from "./product-insights-types";

export const checkSecretsManagementInsightsPermission = async (
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">,
  action: OrgPermissionSecretsManagementInsightsActions,
  { actor, actorId, orgId, actorAuthMethod, actorOrgId }: TProductInsightsDTO
) => {
  const { permission } = await permissionService.getOrgPermission({
    scope: OrganizationActionScope.Any,
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  });

  ForbiddenError.from(permission).throwUnlessCan(action, OrgPermissionSubjects.SecretsManagementInsights);

  return { permission };
};
