import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  TOrgPermissionService
} from "@app/domains/platform/organizations/ce/module";

import { TWorkflowIntegrationDALFactory } from "./workflow-integration-dal";
import { TGetWorkflowIntegrationsByOrg } from "./workflow-integration-types";

type TWorkflowIntegrationServiceFactoryDep = {
  workflowIntegrationDAL: Pick<TWorkflowIntegrationDALFactory, "find">;
  orgPermissionService: TOrgPermissionService;
};

export type TWorkflowIntegrationServiceFactory = ReturnType<typeof workflowIntegrationServiceFactory>;

export const workflowIntegrationServiceFactory = ({
  workflowIntegrationDAL,
  orgPermissionService
}: TWorkflowIntegrationServiceFactoryDep) => {
  const getIntegrationsByOrg = async ({ actor }: TGetWorkflowIntegrationsByOrg) => {
    const permission = await orgPermissionService.getOrgPermission({ actor });

    permission.assert({ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Settings });

    return workflowIntegrationDAL.find({
      orgId: actor.org.id
    });
  };
  return {
    getIntegrationsByOrg
  };
};
