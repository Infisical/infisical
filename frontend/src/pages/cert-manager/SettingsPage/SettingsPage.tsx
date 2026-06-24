import { Helmet } from "react-helmet";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionHsmConnectorActions
} from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { AppConnectionsTab } from "./components/AppConnectionsTab";
import { CertificateCleanupTab } from "./components/CertificateCleanupTab";
import { HsmConnectorsTab } from "./components/HsmConnectorsTab";

export const SettingsPage = () => {
  const { orgId, projectId } = useParams({ strict: false });
  const search = useSearch({ strict: false }) as { selectedTab?: string };
  const navigate = useNavigate();
  const activeTab = search.selectedTab ?? "app-connections";

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>Settings</title>
      </Helmet>
      <div className="w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title="Settings"
          description="Configure app connections, HSM connectors, and cleanup rules."
        />

        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            navigate({
              to: "/organizations/$orgId/projects/cert-manager/$projectId/settings",
              params: { orgId: orgId ?? "", projectId: projectId ?? "" },
              search: { selectedTab: v }
            })
          }
        >
          <TabList>
            <Tab variant="project" value="app-connections">
              App Connections
            </Tab>
            <Tab variant="project" value="hsm-connectors">
              HSM Connectors
            </Tab>
            <Tab variant="project" value="cleanup">
              Cleanup
            </Tab>
          </TabList>

          <TabPanel value="app-connections">
            <ProjectPermissionCan
              renderGuardBanner
              I={ProjectPermissionAppConnectionActions.Read}
              a={ProjectPermissionSub.AppConnections}
            >
              <AppConnectionsTab />
            </ProjectPermissionCan>
          </TabPanel>

          <TabPanel value="hsm-connectors">
            <ProjectPermissionCan
              renderGuardBanner
              I={ProjectPermissionHsmConnectorActions.Read}
              a={ProjectPermissionSub.HsmConnectors}
            >
              <HsmConnectorsTab />
            </ProjectPermissionCan>
          </TabPanel>

          <TabPanel value="cleanup">
            <CertificateCleanupTab />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
