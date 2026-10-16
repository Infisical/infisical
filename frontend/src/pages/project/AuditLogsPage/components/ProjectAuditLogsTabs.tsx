import { useNavigate, useSearch } from "@tanstack/react-router";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components";

import { AuditLogSettingsTab } from "./AuditLogSettingsTab";

export enum ProjectAuditLogsTab {
  AuditLogs = "audit-logs",
  Settings = "settings"
}

type Props = {
  variant: "project" | "pam" | "av";
};

export const ProjectAuditLogsTabs = ({ variant }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const selectedTab = useSearch({
    strict: false,
    select: (el) => el.selectedTab
  });

  const activeTab = Object.values(ProjectAuditLogsTab).includes(selectedTab as ProjectAuditLogsTab)
    ? selectedTab
    : ProjectAuditLogsTab.AuditLogs;

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: `${getProjectBaseURL(currentProject.type)}/audit-logs` as const,
      search: (prev) => ({ ...prev, selectedTab: tab }),
      params: {
        orgId: currentOrg.id,
        projectId: currentProject.id
      }
    });
  };

  return (
    <Tabs value={activeTab} onValueChange={updateSelectedTab}>
      <TabsList variant={variant}>
        <TabsTrigger value={ProjectAuditLogsTab.AuditLogs}>Audit Logs</TabsTrigger>
        <TabsTrigger value={ProjectAuditLogsTab.Settings}>Settings</TabsTrigger>
      </TabsList>
      <TabsContent value={ProjectAuditLogsTab.AuditLogs}>
        <LogsSection pageView project={currentProject} />
      </TabsContent>
      <TabsContent value={ProjectAuditLogsTab.Settings}>
        <AuditLogSettingsTab />
      </TabsContent>
    </Tabs>
  );
};
