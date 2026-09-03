import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ShieldIcon } from "lucide-react";

import { Badge, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api";
import { useListAgentVaultProductIdentityMembers } from "@app/hooks/api/agentVault";
import { ProjectType } from "@app/hooks/api/projects/types";

import { GroupsTab } from "./components/GroupsTab";
import { IdentitiesTab } from "./components/IdentitiesTab";
import { MembersTab } from "./components/MembersTab";

export enum AgentVaultAccessControlTab {
  Members = "members",
  Groups = "groups",
  Identities = "identities"
}

export const AgentVaultAccessControlPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const selectedTab =
    useSearch({
      strict: false,
      select: (el) => (el as { selectedTab?: string })?.selectedTab
    }) || AgentVaultAccessControlTab.Members;

  // Members and groups come from the generic project hooks, which carry the names, emails and pending
  // state the rows need. Only identities need our own endpoint, for the role beside each name.
  const { data: members = [] } = useGetWorkspaceUsers(currentProject.id);
  const { data: groups = [] } = useListWorkspaceGroups(currentProject.id);
  const { data: identities = [] } = useListAgentVaultProductIdentityMembers();

  const updateTab = (tab: string) => {
    navigate({
      to: "/organizations/$orgId/agent-vault/access-management",
      search: (prev) => ({ ...prev, selectedTab: tab }),
      params: { orgId: currentOrg.id }
    });
  };

  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <Helmet>
        <title>{t("common.head-title", { title: "Access Control" })}</title>
      </Helmet>
      <PageHeader
        scope={ProjectType.AgentVault}
        icon={ShieldIcon}
        title="Access Control"
        description="Manage members, groups, and machine identities."
      />
      <Tabs value={selectedTab} onValueChange={updateTab}>
        <TabsList variant="av" aria-label="Agent Vault access control sections">
          <TabsTrigger value={AgentVaultAccessControlTab.Members}>
            Members
            <Badge variant="av">{members.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value={AgentVaultAccessControlTab.Groups}>
            Groups
            <Badge variant="av">{groups.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value={AgentVaultAccessControlTab.Identities}>
            Identities
            <Badge variant="av">{identities.length}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value={AgentVaultAccessControlTab.Members}>
          <MembersTab />
        </TabsContent>
        <TabsContent value={AgentVaultAccessControlTab.Groups}>
          <GroupsTab />
        </TabsContent>
        <TabsContent value={AgentVaultAccessControlTab.Identities}>
          <IdentitiesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
