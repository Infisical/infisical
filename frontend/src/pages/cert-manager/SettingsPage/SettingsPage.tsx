import { Helmet } from "react-helmet";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { Button } from "@app/components/v3";
import { ProjectPermissionSub, useProject } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { AppConnectionsTab } from "./components/AppConnectionsTab";
import { CertificateCleanupTab } from "./components/CertificateCleanupTab";

export const SettingsPage = () => {
  const { orgId, projectId } = useParams({ strict: false });
  const search = useSearch({ strict: false }) as { selectedTab?: string };
  const navigate = useNavigate();
  const { currentProject } = useProject();
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
          description="Configure app connections and cleanup rules."
        >
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              navigator.clipboard.writeText(currentProject?.id || "");
              createNotification({
                text: "Copied project ID to clipboard",
                type: "success"
              });
            }}
          >
            Copy Project ID
          </Button>
        </PageHeader>

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

          <TabPanel value="cleanup">
            <CertificateCleanupTab />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
