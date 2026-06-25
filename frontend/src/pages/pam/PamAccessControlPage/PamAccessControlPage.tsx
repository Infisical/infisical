import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Shield } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useGetWorkspaceUsers, useListWorkspaceGroups } from "@app/hooks/api";
import { useListPamProductIdentities } from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";

import { GroupsTab } from "./components/GroupsTab";
import { IdentitiesTab } from "./components/IdentitiesTab";
import { MembersTab } from "./components/MembersTab";

export enum PamAccessControlTab {
  Members = "members",
  Groups = "groups",
  Identities = "identities"
}

export const PamAccessControlPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const selectedTab =
    useSearch({
      strict: false,
      select: (el) => (el as { selectedTab?: string })?.selectedTab
    }) || PamAccessControlTab.Members;

  const { data: members = [] } = useGetWorkspaceUsers(currentProject.id);
  const { data: groups = [] } = useListWorkspaceGroups(currentProject.id);
  const { data: identities = [] } = useListPamProductIdentities();

  const updateTab = (tab: string) => {
    navigate({
      to: "/organizations/$orgId/pam/access-management",
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
        scope={ProjectType.PAM}
        icon={Shield}
        title="Access Control"
        description="Manage members and groups."
      />
      <Tabs value={selectedTab} onValueChange={updateTab}>
        <TabsList variant="pam">
          <TabsTrigger value={PamAccessControlTab.Members}>
            Members
            <Badge variant="pam">{members.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value={PamAccessControlTab.Groups}>
            Groups
            <Badge variant="pam">{groups.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value={PamAccessControlTab.Identities}>
            Identities
            <Badge variant="pam">{identities.length}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value={PamAccessControlTab.Members}>
          <MembersTab />
        </TabsContent>
        <TabsContent value={PamAccessControlTab.Groups}>
          <GroupsTab />
        </TabsContent>
        <TabsContent value={PamAccessControlTab.Identities}>
          <IdentitiesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
