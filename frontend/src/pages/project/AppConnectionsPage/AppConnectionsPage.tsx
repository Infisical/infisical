import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { withProjectPermission } from "@app/hoc";
import { AppConnectionsTable } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

export const AppConnectionsPage = withProjectPermission(
  () => {
    const { currentWorkspace } = useWorkspace();

    return (
      <div className="bg-bunker-800">
        <Helmet>
          <title>Infisical | App Connections</title>
          <link rel="icon" href="/infisical.ico" />
          <meta property="og:image" content="/images/message.png" />
        </Helmet>
        <div className="flex w-full justify-center bg-bunker-800 text-white">
          <div className="w-full max-w-7xl">
            <PageHeader
              className="w-full"
              title="App Connections"
              description="Manage project App Connections"
            />

            <AppConnectionsTable
              projectId={currentWorkspace.id}
              projectType={currentWorkspace.type}
            />
          </div>
        </div>
      </div>
    );
  },
  {
    action: ProjectPermissionAppConnectionActions.Read,
    subject: ProjectPermissionSub.AppConnections
  }
);
