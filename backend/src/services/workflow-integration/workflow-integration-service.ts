import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas/models";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";

import { TWorkflowIntegrationDALFactory } from "./workflow-integration-dal";
import { TGetWorkflowIntegrationsByOrg } from "./workflow-integration-types";

type TWorkflowIntegrationServiceFactoryDep = {
  workflowIntegrationDAL: Pick<TWorkflowIntegrationDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
};

export type TWorkflowIntegrationServiceFactory = ReturnType<typeof workflowIntegrationServiceFactory>;

export const workflowIntegrationServiceFactory = ({
  workflowIntegrationDAL,
  permissionService
}: TWorkflowIntegrationServiceFactoryDep) => {
  const getIntegrationsByOrg = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod
  }: TGetWorkflowIntegrationsByOrg) => {
    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    return workflowIntegrationDAL.find({
      orgId: actorOrgId
    });
  };
  return {
    getIntegrationsByOrg
  };
};
