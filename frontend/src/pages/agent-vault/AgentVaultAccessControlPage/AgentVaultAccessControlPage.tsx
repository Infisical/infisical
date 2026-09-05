import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ShieldIcon } from "lucide-react";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { GroupsTab } from "./components/GroupsTab";
import { IdentitiesTab } from "./components/IdentitiesTab";
import { MembersTab } from "./components/MembersTab";

export enum AgentVaultAccessControlTab {
  Users = "users",
  Groups = "groups",
  MachineIdentities = "identities"
}

export const AgentVaultAccessControlPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();

  const selectedTab =
    useSearch({
      strict: false,
      select: (el) => (el as { selectedTab?: string })?.selectedTab
    }) || AgentVaultAccessControlTab.Users;

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
        description="Manage access for users, groups, and machine identities."
      />
      <Tabs value={selectedTab} onValueChange={updateTab}>
        <TabsList variant="av" aria-label="Agent Vault access control sections">
          <TabsTrigger value={AgentVaultAccessControlTab.Users}>Users</TabsTrigger>
          <TabsTrigger value={AgentVaultAccessControlTab.Groups}>Groups</TabsTrigger>
          <TabsTrigger value={AgentVaultAccessControlTab.MachineIdentities}>
            Machine Identities
          </TabsTrigger>
        </TabsList>
        <TabsContent value={AgentVaultAccessControlTab.Users}>
          <MembersTab />
        </TabsContent>
        <TabsContent value={AgentVaultAccessControlTab.Groups}>
          <GroupsTab />
        </TabsContent>
        <TabsContent value={AgentVaultAccessControlTab.MachineIdentities}>
          <IdentitiesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
