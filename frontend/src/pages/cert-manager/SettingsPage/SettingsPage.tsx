import { Helmet } from "react-helmet";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionHsmConnectorActions
} from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { AlertsTab } from "./components/AlertsTab";
import { AppConnectionsTab } from "./components/AppConnectionsTab";
import { CertificateCleanupTab } from "./components/CertificateCleanupTab";
import { HsmConnectorsTab } from "./components/HsmConnectorsTab";

export const SettingsPage = () => {
  const { orgId, projectId } = useParams({ strict: false });
  const search = useSearch({ strict: false }) as { selectedTab?: string };
  const navigate = useNavigate();
  const activeTab = search.selectedTab ?? "app-connections";

  return (
    <div className="flex h-full w-full justify-center bg-page text-foreground-inverse">
      <Helmet>
        <title>Settings</title>
      </Helmet>
      <div className="flex w-full max-w-8xl flex-col">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title="Settings"
          description="Configure app connections, HSM connectors, cleanup rules, and alerts."
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
          <TabsList variant="project" aria-label="Certificate Manager settings sections">
            <TabsTrigger value="app-connections">App Connections</TabsTrigger>
            <TabsTrigger value="hsm-connectors">HSM Connectors</TabsTrigger>
            <TabsTrigger value="cleanup">Cleanup</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
          </TabsList>

          <TabsContent value="app-connections">
            <ProjectPermissionCan
              renderGuardBanner
              I={ProjectPermissionAppConnectionActions.Read}
              a={ProjectPermissionSub.AppConnections}
            >
              <AppConnectionsTab />
            </ProjectPermissionCan>
          </TabsContent>

          <TabsContent value="hsm-connectors">
            <ProjectPermissionCan
              renderGuardBanner
              I={ProjectPermissionHsmConnectorActions.Read}
              a={ProjectPermissionSub.HsmConnectors}
            >
              <HsmConnectorsTab />
            </ProjectPermissionCan>
          </TabsContent>

          <TabsContent value="cleanup">
            <CertificateCleanupTab />
          </TabsContent>

          <TabsContent value="alerts">
            <ProjectPermissionCan
              renderGuardBanner
              I={ProjectPermissionActions.Read}
              a={ProjectPermissionSub.PkiAlerts}
            >
              <AlertsTab />
            </ProjectPermissionCan>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
