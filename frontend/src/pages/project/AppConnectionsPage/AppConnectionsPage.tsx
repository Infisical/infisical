import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v3/platform";
import { useProject } from "@app/context";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { getProjectLabel, hidesProjects } from "@app/helpers/project";
import { withProjectPermission } from "@app/hoc";
import { AppConnectionsTable } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

export const AppConnectionsPage = withProjectPermission(
  () => {
    const { currentProject } = useProject();

    return (
      <div className="bg-page">
        <Helmet>
          <title>Infisical | App Connections</title>
          <link rel="icon" href="/infisical.ico" />
          <meta property="og:image" content="/images/message.png" />
        </Helmet>
        <div className="flex w-full justify-center bg-page text-foreground-inverse">
          <div className="w-full max-w-8xl">
            <PageHeader
              scope={currentProject.type}
              className="w-full"
              title={
                hidesProjects(currentProject.type) ? "App Connections" : "Project App Connections"
              }
              description={`Manage ${getProjectLabel(currentProject.type)} App Connections`}
            />

            <AppConnectionsTable projectId={currentProject.id} projectType={currentProject.type} />
          </div>
        </div>
      </div>
    );
  },
  {
    action: ProjectPermissionAppConnectionActions.Read,
    subject: ProjectPermissionSub.AppConnections,
    accessRestrictedMode: "dialog"
  }
);
