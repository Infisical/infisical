import { ProjectPermissionCan } from "@app/components/permissions";
import { ProjectPermissionSub, useProject } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { AppConnectionsTable } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

export const AppConnectionsTab = () => {
  const { currentProject } = useProject();

  return (
    <ProjectPermissionCan
      renderGuardBanner
      I={ProjectPermissionAppConnectionActions.Read}
      a={ProjectPermissionSub.AppConnections}
    >
      <AppConnectionsTable projectId={currentProject.id} projectType={currentProject.type} />
    </ProjectPermissionCan>
  );
};
