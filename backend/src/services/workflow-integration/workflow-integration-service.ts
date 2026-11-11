import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  TOrganizationsDomain
} from "@app/domains/platform/organizations/ce/module";

import { TWorkflowIntegrationDALFactory } from "./workflow-integration-dal";
import { TGetWorkflowIntegrationsByOrg } from "./workflow-integration-types";

type TWorkflowIntegrationServiceFactoryDep = {
  workflowIntegrationDAL: Pick<TWorkflowIntegrationDALFactory, "find">;
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission">;
};

export type TWorkflowIntegrationServiceFactory = ReturnType<typeof workflowIntegrationServiceFactory>;

export const workflowIntegrationServiceFactory = ({
  workflowIntegrationDAL,
  organizationsDomain
}: TWorkflowIntegrationServiceFactoryDep) => {
  const getIntegrationsByOrg = async ({ actor }: TGetWorkflowIntegrationsByOrg) => {
    const permission = await organizationsDomain.getOrgPermission({ actor });

    permission.assert({ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Settings });

    return workflowIntegrationDAL.find({
      orgId: actor.org.id
    });
  };
  return {
    getIntegrationsByOrg
  };
};
