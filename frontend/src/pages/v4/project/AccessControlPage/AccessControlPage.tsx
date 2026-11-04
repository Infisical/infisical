import { useSearch } from "@tanstack/react-router";

import { Button } from "@app/components/v4/ui/button";
import { Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Tabs } from "@app/components/v4/ui/tabs";
import {
  ProjectPermissionActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { OrgAccessControlTabSections } from "@app/types/org";
import { ProjectAccessControlTabs } from "@app/types/project";

import { AccessFrame } from "../../access/AccessFrame";
import { accessLinks } from "../../access/links";
import { useGo } from "../../access/navigation";
import { useProjectPermission } from "../../access/permissions";
import { ProjectGroupsTab } from "../../access/project/groups";
import { ProjectIdentitiesTab } from "../../access/project/identities";
import { ProjectMembersTab } from "../../access/project/members";
import { ProjectRolesTab } from "../../access/project/roles";
import { useProjectScope } from "../../access/project/scope";
import { ServiceTokensTab } from "../../access/project/service-tokens";
import { AccessRestricted } from "../../access/ui";

const tabs = [
  {
    value: ProjectAccessControlTabs.Member,
    label: "Users",
    requirement: "read Member",
    Body: ProjectMembersTab
  },
  {
    value: ProjectAccessControlTabs.Identities,
    label: "Machine identities",
    requirement: "read Identity",
    Body: ProjectIdentitiesTab
  },
  {
    value: ProjectAccessControlTabs.Groups,
    label: "Groups",
    requirement: "read Groups",
    Body: ProjectGroupsTab
  },
  {
    value: ProjectAccessControlTabs.ServiceTokens,
    label: "Service tokens",
    requirement: "read Service Tokens",
    Body: ServiceTokensTab
  },
  {
    value: ProjectAccessControlTabs.Roles,
    label: "Roles",
    requirement: "read Role",
    Body: ProjectRolesTab
  }
];

export const AccessControlPage = () => {
  const go = useGo();
  const scope = useProjectScope();
  const { orgId, projectId, projectType } = scope;
  const { selectedTab } = useSearch({ strict: false });
  const { permission, isPending } = useProjectPermission(projectId);
  const readable: Record<ProjectAccessControlTabs, boolean> = {
    [ProjectAccessControlTabs.Member]: permission.can(
      ProjectPermissionMemberActions.Read,
      ProjectPermissionSub.Member
    ),
    [ProjectAccessControlTabs.Identities]: permission.can(
      ProjectPermissionIdentityActions.Read,
      ProjectPermissionSub.Identity
    ),
    [ProjectAccessControlTabs.Groups]: permission.can(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Groups
    ),
    [ProjectAccessControlTabs.ServiceTokens]: permission.can(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.ServiceTokens
    ),
    [ProjectAccessControlTabs.Roles]: permission.can(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Role
    )
  };
  if (isPending) return <Loader size="page" label="Loading access control" />;
  const visible = tabs.filter(
    (tab) =>
      projectType === ProjectType.SecretManager ||
      tab.value !== ProjectAccessControlTabs.ServiceTokens
  );
  const active = visible.find((tab) => tab.value === selectedTab) ?? visible[0];
  return (
    <AccessFrame>
      <Stack gap={24}>
        <PageHeader
          title="Project access control"
          description="Manage fine-grained access for users, groups, roles, and machine identities within your project resources."
          actions={
            <Button variant="ghost" iconRight="chev-right" asChild>
              <a href={accessLinks.org(orgId, OrgAccessControlTabSections.Member)}>
                Org access control
              </a>
            </Button>
          }
          tabs={
            <Tabs
              label="Project access control sections"
              value={active.value}
              onChange={(value) =>
                go(accessLinks.project(scope, value as ProjectAccessControlTabs))
              }
              tabs={visible.map((tab) => ({ value: tab.value, label: tab.label }))}
            />
          }
        />
        {readable[active.value] ? (
          <active.Body />
        ) : (
          <AccessRestricted requirement={active.requirement} />
        )}
      </Stack>
    </AccessFrame>
  );
};
