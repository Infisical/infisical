import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ContentLoader, PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { MCPActivityLogsTab } from "./components/MCPActivityLogsTab";
import { MCPEndpointsTab } from "./components/MCPEndpointsTab";
import { MCPServersTab } from "./components/MCPServersTab";

enum TabSections {
  MCPEndpoints = "mcp-endpoints",
  MCPServers = "mcp-servers",
  ActivityLogs = "activity-logs"
}

export const MCPPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const [activeTab, setActiveTab] = useState(TabSections.MCPEndpoints);

  if (!currentProject) {
    return <ContentLoader />;
  }

  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "MCP Management" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.AI}
          title="MCP Management"
          description="Manage MCP endpoints, connect MCP servers, and configure tools with secure governance"
        />
        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabSections)}
        >
          <TabList>
            <Tab variant="project" value={TabSections.MCPEndpoints}>
              MCP Endpoints
            </Tab>
            <Tab variant="project" value={TabSections.MCPServers}>
              MCP Servers
            </Tab>
            <Tab variant="project" value={TabSections.ActivityLogs}>
              Activity Logs
            </Tab>
          </TabList>

          <TabPanel value={TabSections.MCPEndpoints}>
            <MCPEndpointsTab />
          </TabPanel>

          <TabPanel value={TabSections.MCPServers}>
            <MCPServersTab />
          </TabPanel>

          <TabPanel value={TabSections.ActivityLogs}>
            <MCPActivityLogsTab />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
