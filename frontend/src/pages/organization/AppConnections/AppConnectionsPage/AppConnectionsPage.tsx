import { Helmet } from "react-helmet";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { PageHeader } from "@app/components/v2";
import {
  OrgPermissionAppConnectionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { AppConnectionsTable } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

export const AppConnectionsPage = withPermission(
  () => {
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
              description="Manage organization App Connections"
            />
            <div className="mb-4 flex w-full flex-col rounded-md border border-blue-500/50 bg-blue-500/30 px-4 py-2 text-sm text-blue-200">
              <div className="flex items-center">
                <FontAwesomeIcon icon={faInfoCircle} className="mb-0.5 mr-2 text-sm" />
                <span className="text-sm text-blue-200">
                  App connections can also be created and managed independently in projects now.
                </span>
              </div>
            </div>
            <AppConnectionsTable />
          </div>
        </div>
      </div>
    );
  },
  {
    action: OrgPermissionAppConnectionActions.Read,
    subject: OrgPermissionSubjects.AppConnections
  }
);
