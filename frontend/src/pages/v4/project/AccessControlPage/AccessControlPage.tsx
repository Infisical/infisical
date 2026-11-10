import type { ReactNode } from "react";
import { useSearch } from "@tanstack/react-router";

import { Button } from "@app/components/v4/ui/button";
import { Stack } from "@app/components/v4/ui/layout";
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
import { AgentVaultGroupsTab } from "../../access/product/agent-vault/groups";
import { AgentVaultIdentitiesTab } from "../../access/product/agent-vault/identities";
import { AgentVaultMembersTab } from "../../access/product/agent-vault/members";
import { PamGroupsTab } from "../../access/product/pam/groups";
import { PamIdentitiesTab } from "../../access/product/pam/identities";
import { PamMembersTab } from "../../access/product/pam/members";
import { ProjectGroupsTab } from "../../access/project/groups";
import { ProjectIdentitiesTab } from "../../access/project/identities";
import { ProjectMembersTab } from "../../access/project/members";
import { ProjectRolesTab } from "../../access/project/roles";
import { ORG_SCOPED_ACCESS_PRODUCTS, useProjectScope } from "../../access/project/scope";
import { ServiceTokensTab } from "../../access/project/service-tokens";
import { AccessRestricted } from "../../access/ui";
import { productOf } from "../../shell/navigation";
import { PageLoader } from "../../shell/project-gate";

type AccessTab = {
  value: ProjectAccessControlTabs;
  label: string;
  requirement: string;
  Body: () => ReactNode;
};

const tabs: AccessTab[] = [
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

const tabFor = (value: ProjectAccessControlTabs) => tabs.find((entry) => entry.value === value)!;

const PRODUCT_ROLE_MODEL = new Set([ProjectType.PAM, ProjectType.AgentVault]);

const productTabs = (projectType: ProjectType): (AccessTab & { urlOnly?: boolean })[] => {
  switch (projectType) {
    case ProjectType.SecretManager:
      return tabs;
    case ProjectType.CertificateManager:
      return tabs
        .filter((entry) => entry.value !== ProjectAccessControlTabs.ServiceTokens)
        .map((entry) =>
          entry.value === ProjectAccessControlTabs.Roles ? { ...entry, urlOnly: true } : entry
        );
    case ProjectType.PAM:
      return [
        { ...tabFor(ProjectAccessControlTabs.Member), label: "Members", Body: PamMembersTab },
        { ...tabFor(ProjectAccessControlTabs.Groups), Body: PamGroupsTab },
        {
          ...tabFor(ProjectAccessControlTabs.Identities),
          label: "Identities",
          Body: PamIdentitiesTab
        }
      ];
    case ProjectType.AgentVault:
      return [
        { ...tabFor(ProjectAccessControlTabs.Member), Body: AgentVaultMembersTab },
        { ...tabFor(ProjectAccessControlTabs.Identities), Body: AgentVaultIdentitiesTab },
        { ...tabFor(ProjectAccessControlTabs.Groups), Body: AgentVaultGroupsTab }
      ];
    default:
      return tabs.filter((entry) => entry.value !== ProjectAccessControlTabs.ServiceTokens);
  }
};

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
  if (isPending) return <PageLoader label="Loading access control" />;
  const available = productTabs(projectType);
  const visible = available.filter((tab) => !tab.urlOnly);
  const active = available.find((tab) => tab.value === selectedTab) ?? visible[0];
  const restricted =
    projectType === ProjectType.AgentVault
      ? !readable[ProjectAccessControlTabs.Member]
      : !readable[active.value];
  const productLabel = productOf(projectType).label;
  const orgScoped = ORG_SCOPED_ACCESS_PRODUCTS.has(projectType);
  return (
    <AccessFrame>
      <Stack gap={24}>
        <PageHeader
          title={orgScoped ? "Access control" : "Project access control"}
          description={`Control who can access ${orgScoped ? productLabel : "this project"} and what they can do.`}
          actions={
            PRODUCT_ROLE_MODEL.has(projectType) ? undefined : (
              <Button variant="ghost" iconRight="chev-right" asChild>
                <a href={accessLinks.org(orgId, OrgAccessControlTabSections.Member)}>
                  Org access control
                </a>
              </Button>
            )
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
        {restricted ? (
          <AccessRestricted
            requirement={
              projectType === ProjectType.AgentVault ? "read Member" : active.requirement
            }
          />
        ) : (
          <active.Body />
        )}
      </Stack>
    </AccessFrame>
  );
};
