import type { ReactNode } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Tabs } from "@app/components/v4/ui/tabs";
import { ToastStack } from "@app/components/v4/ui/toast-stack";
import { TooltipProvider } from "@app/components/v4/ui/tooltip";

import { Shell, useCrumbs } from "../shared";
import { type Detail, type Subject, useAccess } from "./context";
import type { OrgTab, ProjectTab } from "./model";
import { OrgGroupDetail, OrgGroupsTab } from "./org/groups";
import { OrgIdentitiesTab, OrgIdentityDetail } from "./org/identities";
import { OrgMemberDetail } from "./org/member-detail";
import { OrgMembersTab } from "./org/members";
import { OrgRolesTab } from "./org/roles";
import { ProjectGroupDetail, ProjectGroupsTab } from "./project/groups";
import { ProjectIdentitiesTab, ProjectIdentityDetail } from "./project/identities";
import { ProjectMemberDetail, ProjectMembersTab } from "./project/members";
import { ProjectRolesTab } from "./project/roles";
import { ServiceTokensTab } from "./project/service-tokens";
import { OrgRoleDetail, ProjectRoleDetail } from "./roles/role-detail";
import { AccessRestricted, useCan } from "./ui";

const orgTabs: { value: OrgTab; label: string; subject: Subject; requirement: string }[] = [
  { value: "members", label: "Users", subject: "member", requirement: "read Member" },
  {
    value: "identities",
    label: "Machine identities",
    subject: "identity",
    requirement: "read Identity"
  },
  { value: "groups", label: "Groups", subject: "groups", requirement: "read Groups" },
  { value: "roles", label: "Roles", subject: "role", requirement: "read Role" }
];
const projectTabs: { value: ProjectTab; label: string; subject: Subject; requirement: string }[] = [
  { value: "members", label: "Users", subject: "member", requirement: "read Member" },
  {
    value: "identities",
    label: "Machine identities",
    subject: "identity",
    requirement: "read Identity"
  },
  { value: "groups", label: "Groups", subject: "groups", requirement: "read Groups" },
  {
    value: "service-tokens",
    label: "Service tokens",
    subject: "service-token",
    requirement: "read Service Tokens"
  },
  { value: "roles", label: "Roles", subject: "role", requirement: "read Role" }
];

const orgTabBody: Record<OrgTab, () => ReactNode> = {
  members: () => <OrgMembersTab />,
  identities: () => <OrgIdentitiesTab />,
  groups: () => <OrgGroupsTab />,
  roles: () => <OrgRolesTab />
};
const projectTabBody: Record<ProjectTab, () => ReactNode> = {
  members: () => <ProjectMembersTab />,
  identities: () => <ProjectIdentitiesTab />,
  groups: () => <ProjectGroupsTab />,
  "service-tokens": () => <ServiceTokensTab />,
  roles: () => <ProjectRolesTab />
};

const DetailView = ({ detail }: { detail: Detail }) => {
  switch (detail.kind) {
    case "org-member":
      return <OrgMemberDetail id={detail.id} />;
    case "org-group":
      return <OrgGroupDetail id={detail.id} />;
    case "org-identity":
      return <OrgIdentityDetail id={detail.id} />;
    case "org-role":
      return <OrgRoleDetail id={detail.id} />;
    case "project-member":
      return <ProjectMemberDetail id={detail.id} />;
    case "project-group":
      return <ProjectGroupDetail id={detail.id} />;
    case "project-identity":
      return <ProjectIdentityDetail id={detail.id} />;
    default:
      return <ProjectRoleDetail id={detail.id} />;
  }
};

const OrgPage = () => {
  const { nav, navigate } = useAccess();
  const can = useCan("org");
  const allowed = orgTabs.filter((tab) => can(tab.subject, "read"));
  const active = orgTabs.find((tab) => tab.value === nav.orgTab) ?? orgTabs[0];
  return (
    <Stack gap={24}>
      <PageHeader
        title="Organization access control"
        description="Manage fine-grained access for users, groups, roles, and machine identities within your organization resources."
        tabs={
          allowed.length > 0 && (
            <Tabs
              label="Organization access control sections"
              value={active.value}
              onChange={(value) => navigate({ orgTab: value as OrgTab })}
              tabs={orgTabs.map((tab) => ({
                value: tab.value,
                label: tab.label,
                disabled: !can(tab.subject, "read")
              }))}
            />
          )
        }
      />
      {!allowed.length || !can(active.subject, "read") ? (
        <AccessRestricted requirement={allowed.length ? active.requirement : undefined} />
      ) : (
        orgTabBody[active.value]()
      )}
    </Stack>
  );
};

const ProjectPage = () => {
  const { nav, navigate } = useAccess();
  const can = useCan("project");
  const active = projectTabs.find((tab) => tab.value === nav.projectTab) ?? projectTabs[0];
  return (
    <Stack gap={24}>
      <PageHeader
        title="Project access control"
        description="Manage fine-grained access for users, groups, roles, and machine identities within your project resources."
        actions={
          <Button variant="ghost" iconRight="chev-right" onClick={() => navigate({ scope: "org" })}>
            Org access control
          </Button>
        }
        tabs={
          <Tabs
            label="Project access control sections"
            value={active.value}
            onChange={(value) => navigate({ projectTab: value as ProjectTab })}
            tabs={projectTabs.map((tab) => ({ value: tab.value, label: tab.label }))}
          />
        }
      />
      {can(active.subject, "read") ? (
        projectTabBody[active.value]()
      ) : (
        <AccessRestricted requirement={active.requirement} />
      )}
    </Stack>
  );
};

export const AccessPage = () => {
  const { nav, navigate, toasts, dismissToast } = useAccess();
  const { org, product, project } = useCrumbs();
  const base =
    nav.scope === "org"
      ? [org, { label: "Access control" }]
      : [org, product, project, { label: "Access control" }];
  const crumbs = nav.detail ? [...base, { label: nav.detail.label, mono: nav.detail.mono }] : base;
  return (
    <TooltipProvider>
      <Shell
        level={nav.scope === "org" ? "org" : "project"}
        current="access"
        crumbs={crumbs}
        onNavigate={(page) => {
          if (page === "access") navigate({});
        }}
      >
        {nav.detail && <DetailView key={nav.detail.kind + nav.detail.id} detail={nav.detail} />}
        {!nav.detail && nav.scope === "org" && <OrgPage />}
        {!nav.detail && nav.scope === "project" && <ProjectPage />}
      </Shell>
      <ToastStack items={toasts} onDismiss={dismissToast} />
    </TooltipProvider>
  );
};
