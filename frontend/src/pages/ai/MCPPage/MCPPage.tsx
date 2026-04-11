import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";

import { ContentLoader, PageHeader } from "@app/components/v2";
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
  const { selectedTab } = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/ai/$projectId/_ai-layout/overview"
  });

  const activeTab = (selectedTab as TabSections) || TabSections.MCPEndpoints;

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
        <div>
          {activeTab === TabSections.MCPEndpoints && <MCPEndpointsTab />}
          {activeTab === TabSections.MCPServers && <MCPServersTab />}
          {activeTab === TabSections.ActivityLogs && <MCPActivityLogsTab />}
        </div>
      </div>
    </div>
  );
};
