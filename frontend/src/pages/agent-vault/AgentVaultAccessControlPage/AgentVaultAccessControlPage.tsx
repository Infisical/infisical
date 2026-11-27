import { useNavigate, useSearch } from "@tanstack/react-router";
import { ShieldIcon } from "lucide-react";

import { AgentVaultRestrictedPage } from "@app/components/agent-vault/AgentVaultRestrictedPage";
import { PageTitle } from "@app/components/PageTitle";
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
} from "@app/context";
import { canOpenAgentVaultAccessControl } from "@app/helpers/agentVaultPermissions";
import { ProjectType } from "@app/hooks/api/projects/types";

import { GroupsTab } from "./components/GroupsTab";
import { IdentitiesTab } from "./components/IdentitiesTab";
import { MembersTab } from "./components/MembersTab";
import { RolesTab } from "./components/RolesTab";

export enum AgentVaultAccessControlTab {
  // "members" is the shared tab vocabulary (ProjectAccessControlTabs.Member) that both the access
  // request notification link and the member-details breadcrumb send; only the label says "Users".
  Users = "members",
  MachineIdentities = "identities",
  Groups = "groups",
  // Matches ProjectAccessControlTabs.Roles, so links built with the shared tab vocabulary land here.
  Roles = "roles"
}

const TITLE = "Access Control";
const DESCRIPTION = "Manage access for users, machine identities, groups, and roles.";

const AgentVaultAccessControlTabs = () => {
  const { projectId } = useProject();
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { permission } = useProjectPermission();

  // Each tab lists something its own permission guards, so only the ones the caller can read are offered.
  const tabs = [
    {
      value: AgentVaultAccessControlTab.Users,
      label: "Users",
      canRead: permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member),
      content: <MembersTab />
    },
    {
      value: AgentVaultAccessControlTab.MachineIdentities,
      label: "Machine Identities",
      canRead: permission.can(ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity),
      content: <IdentitiesTab />
    },
    {
      value: AgentVaultAccessControlTab.Groups,
      label: "Groups",
      canRead: permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Groups),
      content: <GroupsTab />
    },
    {
      value: AgentVaultAccessControlTab.Roles,
      label: "Roles",
      canRead: permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Role),
      content: <RolesTab />
    }
  ].filter((tab) => tab.canRead);

  const requestedTab = useSearch({
    strict: false,
    select: (el) => (el as { selectedTab?: string })?.selectedTab
  });
  // A link can name a tab the caller can't read, so it opens on the first one they can.
  const selectedTab = tabs.find((tab) => tab.value === requestedTab)?.value ?? tabs[0]?.value;

  const updateTab = (tab: string) => {
    navigate({
      to: "/organizations/$orgId/projects/agent-vault/$projectId/access-management",
      search: (prev) => ({ ...prev, selectedTab: tab }),
      params: { orgId: currentOrg.id, projectId }
    });
  };

  return (
    <Tabs value={selectedTab} onValueChange={updateTab}>
      <TabsList variant="av" aria-label="Agent Vault access control sections">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
};

export const AgentVaultAccessControlPage = () => {
  const { permission } = useProjectPermission();
  if (!canOpenAgentVaultAccessControl(permission)) {
    return (
      <AgentVaultRestrictedPage
        title={TITLE}
        icon={ShieldIcon}
        description={DESCRIPTION}
        requirement={{ action: "read", subject: ProjectPermissionSub.Member }}
      />
    );
  }
  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <PageTitle title={TITLE} />
      <PageHeader
        scope={ProjectType.AgentVault}
        icon={ShieldIcon}
        title={TITLE}
        description={DESCRIPTION}
      />
      <AgentVaultAccessControlTabs />
    </div>
  );
};
