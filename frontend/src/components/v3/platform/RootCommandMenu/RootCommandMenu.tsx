import { useLocation, useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import {
  BlocksIcon,
  BuildingIcon,
  CogIcon,
  CreditCardIcon,
  DatabaseIcon,
  FileTextIcon,
  FolderOpenIcon,
  InboxIcon,
  KeyIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  SearchIcon,
  ServerCogIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon
} from "lucide-react";

import {
  GlobalCommandMenu,
  type GlobalCommandMenuGroup,
  type GlobalCommandMenuItem,
  type GlobalCommandMenuSearchStatus
} from "@app/components/v3/generic/Command";
import { OrgIcon, ProjectIcon } from "@app/components/v3/platform/ScopeIcons";
import {
  OrgPermissionActions,
  OrgPermissionAuditLogsActions,
  OrgPermissionBillingActions,
  OrgPermissionGroupActions,
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  ProjectPermissionActions,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionCertificateActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionKmipActions,
  ProjectPermissionMemberActions,
  ProjectPermissionPkiDiscoveryActions,
  ProjectPermissionSub,
  type TProjectPermission,
  useOrganization,
  useOrgPermission,
  useProject,
  useProjectPermission
} from "@app/context";
import { OrgPermissionAppConnectionActions } from "@app/context/OrgPermissionContext/types";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSecretScanningFindingActions,
  ProjectPermissionSecretSyncActions
} from "@app/context/ProjectPermissionContext/types";
import { getProjectTitle } from "@app/helpers/project";
import { useGetOrganizationGroups, useGetOrganizations, useGetUserProjects } from "@app/hooks/api";
import type { Project } from "@app/hooks/api/projects/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useGetUserOrgPermissions } from "@app/hooks/api/roles";

import { useSecretManagerCommandSearch } from "./useSecretManagerCommandSearch";

export type RootCommandMenuShell = "organization" | "admin" | "personal-settings";

type CommandContent = {
  browseGroups: GlobalCommandMenuGroup[];
  searchGroups: GlobalCommandMenuGroup[];
};

type AsyncCommandSearch = {
  groups: GlobalCommandMenuGroup[];
  searchStatus: GlobalCommandMenuSearchStatus;
  onSearchChange: (search: string) => void;
};

const NavigationCommandMenu = ({
  browseGroups,
  searchGroups,
  asyncSearch
}: {
  browseGroups: GlobalCommandMenuGroup[];
  searchGroups: GlobalCommandMenuGroup[];
  asyncSearch?: AsyncCommandSearch;
}) => (
  <GlobalCommandMenu
    groups={browseGroups}
    searchGroups={[...searchGroups, ...(asyncSearch?.groups ?? [])]}
    searchStatus={asyncSearch?.searchStatus}
    onSearchChange={asyncSearch?.onSearchChange}
    title="Search Infisical"
    description="Search pages, projects, organizations, teams, and commands."
    placeholder="Find..."
    emptyMessage="No matching pages or commands."
  />
);

const navigateToProject = (navigate: ReturnType<typeof useNavigate>, project: Project) => {
  switch (project.type) {
    case ProjectType.SecretManager:
      return navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/overview",
        params: { orgId: project.orgId, projectId: project.id }
      });
    case ProjectType.CertificateManager:
      return navigate({
        to: "/organizations/$orgId/projects/cert-manager/$projectId/overview",
        params: { orgId: project.orgId, projectId: project.id }
      });
    case ProjectType.SecretScanning:
      return navigate({
        to: "/organizations/$orgId/projects/secret-scanning/$projectId/data-sources",
        params: { orgId: project.orgId, projectId: project.id }
      });
    case ProjectType.PAM:
      return navigate({
        to: "/organizations/$orgId/pam/accounts",
        params: { orgId: project.orgId }
      });
    case ProjectType.KMS:
    default:
      return navigate({
        to: "/organizations/$orgId/projects/kms/$projectId/overview",
        params: { orgId: project.orgId, projectId: project.id }
      });
  }
};

const useEntityCommandGroups = ({
  currentOrganizationId,
  currentOrganizationName
}: {
  currentOrganizationId?: string;
  currentOrganizationName?: string;
}) => {
  const navigate = useNavigate();
  const { data: projects = [] } = useGetUserProjects();
  const { data: organizations = [] } = useGetOrganizations();
  const { data: orgPermissionData } = useGetUserOrgPermissions({
    orgId: currentOrganizationId ?? ""
  });
  const canReadTeams = Boolean(
    orgPermissionData?.permission.can(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups)
  );
  const { data: teams = [] } = useGetOrganizationGroups(
    canReadTeams ? (currentOrganizationId ?? "") : ""
  );
  const organizationNames = new Map(
    organizations.map((organization) => [organization.id, organization.name])
  );

  const projectItems: GlobalCommandMenuItem[] = projects.map((project) => ({
    id: `entity-project-${project.id}`,
    label: project.name,
    breadcrumb: `${organizationNames.get(project.orgId) ?? "Organization"} / ${getProjectTitle(project.type)}`,
    icon: ProjectIcon,
    keywords: [project.slug, project.type, getProjectTitle(project.type), "project"],
    priority: project.orgId === currentOrganizationId ? 20 : 0,
    onSelect: () => navigateToProject(navigate, project)
  }));

  const organizationItems: GlobalCommandMenuItem[] = organizations.map((organization) => ({
    id: `entity-organization-${organization.id}`,
    label: organization.name,
    breadcrumb: "Organization",
    icon: OrgIcon,
    keywords: [organization.slug, "organization", "workspace"],
    priority: organization.id === currentOrganizationId ? 20 : 0,
    onSelect: () =>
      navigate({
        to: "/organizations/$orgId/projects",
        params: { orgId: organization.id }
      })
  }));

  const teamItems: GlobalCommandMenuItem[] = teams.map((team) => ({
    id: `entity-team-${team.id}`,
    label: team.name,
    breadcrumb: `${currentOrganizationName ?? "Organization"} / Team`,
    icon: UsersIcon,
    keywords: [team.slug, "team", "group"],
    priority: 15,
    onSelect: () =>
      navigate({
        to: "/organizations/$orgId/groups/$groupId",
        params: { orgId: currentOrganizationId!, groupId: team.id }
      })
  }));

  return {
    projectItems,
    organizationItems,
    teamItems,
    searchGroups: [
      { heading: "Projects", items: projectItems },
      { heading: "Organizations", items: organizationItems },
      { heading: "Teams", items: teamItems }
    ]
  };
};

const getNestedCommandGroup = ({
  projectItems,
  organizationItems,
  teamItems
}: {
  projectItems: GlobalCommandMenuItem[];
  organizationItems: GlobalCommandMenuItem[];
  teamItems: GlobalCommandMenuItem[];
}): GlobalCommandMenuGroup => ({
  heading: "Explore",
  items: [
    {
      id: "command-search-projects",
      label: "Search Projects…",
      breadcrumb: "Global / Projects",
      icon: SearchIcon,
      keywords: ["find", "switch", "project"],
      children: [{ heading: "Projects", items: projectItems }],
      drilldownPlaceholder: "Search projects..."
    },
    {
      id: "command-switch-organization",
      label: "Switch Organization…",
      breadcrumb: "Global / Organizations",
      icon: BuildingIcon,
      keywords: ["team", "workspace", "organization"],
      children: [{ heading: "Organizations", items: organizationItems }],
      drilldownPlaceholder: "Search organizations..."
    },
    ...(teamItems.length
      ? [
          {
            id: "command-search-teams",
            label: "Search Teams…",
            breadcrumb: "Current Organization / Teams",
            icon: UsersIcon,
            keywords: ["group", "members"],
            children: [{ heading: "Teams", items: teamItems }],
            drilldownPlaceholder: "Search teams..."
          }
        ]
      : [])
  ]
});

const getAccountItems = (navigate: ReturnType<typeof useNavigate>): GlobalCommandMenuItem[] => [
  {
    id: "account-personal-settings",
    label: "Personal Settings",
    breadcrumb: "Account / General",
    icon: UserIcon,
    keywords: ["profile", "name", "email", "account"],
    priority: 5,
    onSelect: () => navigate({ to: "/personal-settings", search: { selectedTab: "general" } })
  },
  {
    id: "account-authentication",
    label: "Authentication",
    breadcrumb: "Account / Personal Settings",
    icon: ShieldCheckIcon,
    keywords: ["password", "mfa", "passkeys", "sessions"],
    priority: 5,
    onSelect: () =>
      navigate({ to: "/personal-settings", search: { selectedTab: "authentication" } })
  },
  {
    id: "account-api-keys",
    label: "API Keys",
    breadcrumb: "Account / Personal Settings",
    icon: KeyRoundIcon,
    keywords: ["tokens"],
    priority: 5,
    onSelect: () => navigate({ to: "/personal-settings", search: { selectedTab: "api-keys" } })
  }
];

const PersonalSettingsCommandMenu = () => {
  const organizationId = useRouteContext({
    from: "/_authenticate",
    select: (context) => context.organizationId
  });
  const navigate = useNavigate();
  const accountItems = getAccountItems(navigate).map((item) => ({ ...item, priority: 30 }));
  const entityGroups = useEntityCommandGroups({ currentOrganizationId: organizationId });
  const nestedGroup = getNestedCommandGroup(entityGroups);

  return (
    <NavigationCommandMenu
      browseGroups={[{ heading: "Account", items: accountItems }, nestedGroup]}
      searchGroups={[
        { heading: "Pages & Settings", items: accountItems },
        ...entityGroups.searchGroups
      ]}
    />
  );
};

const AdminCommandMenu = () => {
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const accountItems = getAccountItems(navigate);
  const entityGroups = useEntityCommandGroups({
    currentOrganizationId: currentOrg.id,
    currentOrganizationName: currentOrg.name
  });
  const adminItems: GlobalCommandMenuItem[] = [
    {
      id: "admin-general",
      label: "General",
      breadcrumb: "Server Console / Settings",
      icon: CogIcon,
      keywords: ["server", "configuration"],
      priority: 30,
      onSelect: () => navigate({ to: "/admin" })
    },
    {
      id: "admin-resource-overview",
      label: "Resource Overview",
      breadcrumb: "Server Console / Resources",
      icon: BuildingIcon,
      keywords: ["organizations", "users", "machine identities", "email domains"],
      priority: 30,
      onSelect: () =>
        navigate({
          to: "/admin/resources/overview",
          search: { selectedTab: "organizations" }
        })
    },
    {
      id: "admin-access-control",
      label: "Access Control",
      breadcrumb: "Server Console / Administration",
      icon: ShieldIcon,
      keywords: ["permissions", "admins"],
      priority: 30,
      onSelect: () => navigate({ to: "/admin/access-management" })
    }
  ];

  return (
    <NavigationCommandMenu
      browseGroups={[
        { heading: "Server Console", items: adminItems },
        { heading: "Global", items: accountItems.slice(0, 1) },
        getNestedCommandGroup(entityGroups)
      ]}
      searchGroups={[
        { heading: "Pages & Settings", items: [...adminItems, ...accountItems] },
        ...entityGroups.searchGroups
      ]}
    />
  );
};

const getOrganizationItems = ({
  navigate,
  organizationId,
  organizationName,
  isRootOrganization,
  canReadAccessControl,
  canReadAuditLogs,
  canReadBilling,
  canReadIntegrations,
  canReadSettings
}: {
  navigate: ReturnType<typeof useNavigate>;
  organizationId: string;
  organizationName: string;
  isRootOrganization: boolean;
  canReadAccessControl: boolean;
  canReadAuditLogs: boolean;
  canReadBilling: boolean;
  canReadIntegrations: boolean;
  canReadSettings: boolean;
}): GlobalCommandMenuItem[] => [
  {
    id: `organization-${organizationId}-home`,
    label: "Organization Home",
    breadcrumb: organizationName,
    icon: OrgIcon,
    keywords: ["projects", "home"],
    priority: 25,
    onSelect: () =>
      navigate({ to: "/organizations/$orgId/projects", params: { orgId: organizationId } })
  },
  ...(canReadIntegrations
    ? [
        {
          id: `organization-${organizationId}-integrations`,
          label: "Integrations",
          breadcrumb: `${organizationName} / Organization`,
          icon: BlocksIcon,
          keywords: ["connections"],
          priority: 25,
          onSelect: () =>
            navigate({
              to: "/organizations/$orgId/integrations",
              params: { orgId: organizationId }
            })
        }
      ]
    : []),
  ...(canReadAccessControl
    ? [
        {
          id: `organization-${organizationId}-access-control`,
          label: "Access Control",
          breadcrumb: `${organizationName} / Organization`,
          icon: ShieldIcon,
          keywords: ["users", "groups", "teams", "roles", "machine identities"],
          priority: 25,
          onSelect: () =>
            navigate({
              to: "/organizations/$orgId/access-management",
              params: { orgId: organizationId }
            })
        }
      ]
    : []),
  ...(isRootOrganization && canReadBilling
    ? [
        {
          id: `organization-${organizationId}-billing`,
          label: "Usage & Billing",
          breadcrumb: `${organizationName} / Organization Settings`,
          icon: CreditCardIcon,
          keywords: ["subscription", "plan"],
          priority: 25,
          onSelect: () =>
            navigate({ to: "/organizations/$orgId/billing", params: { orgId: organizationId } })
        }
      ]
    : []),
  ...(canReadAuditLogs
    ? [
        {
          id: `organization-${organizationId}-audit-logs`,
          label: "Audit Logs",
          breadcrumb: `${organizationName} / Organization`,
          icon: FileTextIcon,
          priority: 25,
          onSelect: () =>
            navigate({
              to: "/organizations/$orgId/audit-logs",
              params: { orgId: organizationId }
            })
        }
      ]
    : []),
  ...(canReadSettings
    ? [
        {
          id: `organization-${organizationId}-settings`,
          label: "Settings",
          breadcrumb: `${organizationName} / Organization`,
          icon: SettingsIcon,
          keywords: ["general", "organization settings"],
          priority: 25,
          onSelect: () =>
            navigate({
              to: "/organizations/$orgId/settings",
              params: { orgId: organizationId },
              search: { selectedTab: "tab-org-general" }
            })
        }
      ]
    : [])
];

const getProjectLandingItem = ({
  navigate,
  project,
  organizationName,
  isCertificateManagerAdmin
}: {
  navigate: ReturnType<typeof useNavigate>;
  project: Project;
  organizationName: string;
  isCertificateManagerAdmin?: boolean;
}): GlobalCommandMenuItem => {
  const breadcrumb = `${organizationName} / ${project.name}`;

  if (project.type === ProjectType.CertificateManager && !isCertificateManagerAdmin) {
    return {
      id: `project-${project.id}-approval-requests`,
      label: "Approval Requests",
      breadcrumb,
      icon: InboxIcon,
      keywords: [project.name, "certificate manager", "requests"],
      priority: 40,
      onSelect: () =>
        navigate({
          to: "/organizations/$orgId/projects/cert-manager/$projectId/requests",
          params: { orgId: project.orgId, projectId: project.id }
        })
    };
  }

  const presentation: Record<ProjectType, { label: string; icon: GlobalCommandMenuItem["icon"] }> =
    {
      [ProjectType.SecretManager]: { label: "Secrets", icon: ProjectIcon },
      [ProjectType.CertificateManager]: { label: "Dashboard", icon: LayoutDashboardIcon },
      [ProjectType.KMS]: { label: "Overview", icon: KeyIcon },
      [ProjectType.SecretScanning]: { label: "Data Sources", icon: DatabaseIcon },
      [ProjectType.PAM]: { label: "Accounts", icon: FolderOpenIcon }
    };

  return {
    id: `project-${project.id}-home`,
    label: presentation[project.type].label,
    breadcrumb,
    icon: presentation[project.type].icon,
    keywords: [project.name, project.type, getProjectTitle(project.type)],
    priority: 40,
    onSelect: () => navigateToProject(navigate, project)
  };
};

const getProjectPageItems = ({
  navigate,
  project,
  organizationName,
  pathname,
  isCertificateManagerAdmin
}: {
  navigate: ReturnType<typeof useNavigate>;
  project: Project;
  organizationName: string;
  pathname: string;
  isCertificateManagerAdmin?: boolean;
}): GlobalCommandMenuItem[] => {
  const breadcrumb = `${organizationName} / ${project.name}`;
  const item = (
    id: string,
    label: string,
    icon: GlobalCommandMenuItem["icon"],
    pathSuffix: string,
    onSelect: () => void,
    keywords?: string[]
  ): GlobalCommandMenuItem => ({
    id: `project-${project.id}-${id}`,
    label,
    breadcrumb,
    icon,
    keywords: [project.name, getProjectTitle(project.type), ...(keywords ?? [])],
    priority: pathname.includes(`/${pathSuffix}`) ? 50 : 35,
    onSelect
  });
  const sortByContext = (items: GlobalCommandMenuItem[]) =>
    items.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  switch (project.type) {
    case ProjectType.SecretManager:
      return sortByContext([
        getProjectLandingItem({ navigate, project, organizationName }),
        item("integrations", "Integrations", BlocksIcon, "integrations", () =>
          navigate({
            to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
            params: { orgId: project.orgId, projectId: project.id }
          })
        ),
        item("access-control", "Access Control", ShieldIcon, "access-management", () =>
          navigate({
            to: "/organizations/$orgId/projects/secret-management/$projectId/access-management",
            params: { orgId: project.orgId, projectId: project.id }
          })
        ),
        item("audit-logs", "Audit Logs", FileTextIcon, "audit-logs", () =>
          navigate({
            to: "/organizations/$orgId/projects/secret-management/$projectId/audit-logs",
            params: { orgId: project.orgId, projectId: project.id }
          })
        ),
        item("settings", "Settings", SettingsIcon, "settings", () =>
          navigate({
            to: "/organizations/$orgId/projects/secret-management/$projectId/settings",
            params: { orgId: project.orgId, projectId: project.id },
            search: { selectedTab: "tab-project-general" }
          })
        )
      ]);
    case ProjectType.KMS:
      return sortByContext([
        getProjectLandingItem({ navigate, project, organizationName }),
        item("kmip", "KMIP", KeyIcon, "kmip", () =>
          navigate({
            to: "/organizations/$orgId/projects/kms/$projectId/kmip",
            params: { orgId: project.orgId, projectId: project.id }
          })
        ),
        item("access-control", "Access Control", ShieldIcon, "access-management", () =>
          navigate({
            to: "/organizations/$orgId/projects/kms/$projectId/access-management",
            params: { orgId: project.orgId, projectId: project.id }
          })
        ),
        item("audit-logs", "Audit Logs", FileTextIcon, "audit-logs", () =>
          navigate({
            to: "/organizations/$orgId/projects/kms/$projectId/audit-logs",
            params: { orgId: project.orgId, projectId: project.id }
          })
        ),
        item("settings", "Settings", SettingsIcon, "settings", () =>
          navigate({
            to: "/organizations/$orgId/projects/kms/$projectId/settings",
            params: { orgId: project.orgId, projectId: project.id }
          })
        )
      ]);
    case ProjectType.SecretScanning:
      return sortByContext([
        getProjectLandingItem({ navigate, project, organizationName }),
        item("findings", "Findings", SearchIcon, "findings", () =>
          navigate({
            to: "/organizations/$orgId/projects/secret-scanning/$projectId/findings",
            params: { orgId: project.orgId, projectId: project.id }
          })
        ),
        item("app-connections", "App Connections", BlocksIcon, "app-connections", () =>
          navigate({
            to: "/organizations/$orgId/projects/secret-scanning/$projectId/app-connections",
            params: { orgId: project.orgId, projectId: project.id }
          })
        ),
        item("access-control", "Access Control", ShieldIcon, "access-management", () =>
          navigate({
            to: "/organizations/$orgId/projects/secret-scanning/$projectId/access-management",
            params: { orgId: project.orgId, projectId: project.id }
          })
        ),
        item("audit-logs", "Audit Logs", FileTextIcon, "audit-logs", () =>
          navigate({
            to: "/organizations/$orgId/projects/secret-scanning/$projectId/audit-logs",
            params: { orgId: project.orgId, projectId: project.id }
          })
        ),
        item("settings", "Settings", SettingsIcon, "settings", () =>
          navigate({
            to: "/organizations/$orgId/projects/secret-scanning/$projectId/settings",
            params: { orgId: project.orgId, projectId: project.id },
            search: { selectedTab: "general" }
          })
        )
      ]);
    case ProjectType.CertificateManager: {
      const landing = getProjectLandingItem({
        navigate,
        project,
        organizationName,
        isCertificateManagerAdmin
      });
      if (!isCertificateManagerAdmin) return [landing];
      return sortByContext([
        landing,
        item("inventory", "Inventory", DatabaseIcon, "inventory", () =>
          navigate({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/inventory",
            params: { orgId: project.orgId, projectId: project.id }
          })
        ),
        item("discovery", "Discovery", SearchIcon, "discovery", () =>
          navigate({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/discovery",
            params: { orgId: project.orgId, projectId: project.id }
          })
        ),
        item("access-control", "Access Control", ShieldIcon, "access-management", () =>
          navigate({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/access-management",
            params: { orgId: project.orgId, projectId: project.id }
          })
        ),
        item("audit-logs", "Audit Logs", FileTextIcon, "audit-logs", () =>
          navigate({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/audit-logs",
            params: { orgId: project.orgId, projectId: project.id }
          })
        ),
        item("settings", "Settings", SettingsIcon, "settings", () =>
          navigate({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/settings",
            params: { orgId: project.orgId, projectId: project.id }
          })
        )
      ]);
    }
    case ProjectType.PAM:
    default:
      return [getProjectLandingItem({ navigate, project, organizationName })];
  }
};

const filterProjectPageItems = (items: GlobalCommandMenuItem[], permission: TProjectPermission) => {
  const canReadAccessControl =
    permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member) ||
    permission.can(ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity) ||
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Groups) ||
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Role) ||
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens);
  const canReadIntegrations =
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations) ||
    permission.can(ProjectPermissionSecretSyncActions.Read, ProjectPermissionSub.SecretSyncs) ||
    permission.can(ProjectPermissionAppConnectionActions.Read, ProjectPermissionSub.AppConnections);
  const canReadSettings =
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings) ||
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments) ||
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags) ||
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks) ||
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);

  return items.filter(({ id }) => {
    if (id.endsWith("-access-control")) return canReadAccessControl;
    if (id.endsWith("-integrations")) return canReadIntegrations;
    if (id.endsWith("-audit-logs")) {
      return permission.can(ProjectPermissionAuditLogsActions.Read, ProjectPermissionSub.AuditLogs);
    }
    if (id.endsWith("-settings")) return canReadSettings;
    if (id.endsWith("-kmip")) {
      return permission.can(ProjectPermissionKmipActions.ReadClients, ProjectPermissionSub.Kmip);
    }
    if (id.endsWith("-inventory")) {
      return permission.can(
        ProjectPermissionCertificateActions.Read,
        ProjectPermissionSub.Certificates
      );
    }
    if (id.endsWith("-discovery")) {
      return permission.can(
        ProjectPermissionPkiDiscoveryActions.Read,
        ProjectPermissionSub.PkiDiscovery
      );
    }
    if (id.endsWith("-findings")) {
      return permission.can(
        ProjectPermissionSecretScanningFindingActions.Read,
        ProjectPermissionSub.SecretScanningFindings
      );
    }
    if (id.endsWith("-app-connections")) {
      return permission.can(
        ProjectPermissionAppConnectionActions.Read,
        ProjectPermissionSub.AppConnections
      );
    }
    return true;
  });
};

const CertificateProjectCommandMenu = ({
  content,
  hasProjectRole,
  permission
}: {
  content: CommandContent;
  hasProjectRole: (role: string) => boolean;
  permission: TProjectPermission;
}) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const projectItems = filterProjectPageItems(
    getProjectPageItems({
      navigate,
      project: currentProject,
      organizationName: currentOrg.name,
      pathname,
      isCertificateManagerAdmin: hasProjectRole("admin")
    }),
    permission
  );

  return (
    <NavigationCommandMenu
      browseGroups={[
        { heading: currentProject.name, items: projectItems.slice(0, 2) },
        ...content.browseGroups
      ]}
      searchGroups={[{ heading: "Current Project", items: projectItems }, ...content.searchGroups]}
    />
  );
};

const SecretManagerProjectCommandMenu = ({
  content,
  projectItems
}: {
  content: CommandContent;
  projectItems: GlobalCommandMenuItem[];
}) => {
  const { currentProject } = useProject();
  const asyncSearch = useSecretManagerCommandSearch(currentProject);

  return (
    <NavigationCommandMenu
      browseGroups={[
        { heading: currentProject.name, items: projectItems.slice(0, 2) },
        ...content.browseGroups
      ]}
      searchGroups={[{ heading: "Current Project", items: projectItems }, ...content.searchGroups]}
      asyncSearch={asyncSearch}
    />
  );
};

const CurrentProjectCommandMenu = ({ content }: { content: CommandContent }) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { hasProjectRole, permission } = useProjectPermission();

  if (currentProject.type === ProjectType.CertificateManager) {
    return (
      <CertificateProjectCommandMenu
        content={content}
        hasProjectRole={hasProjectRole}
        permission={permission}
      />
    );
  }

  const projectItems = filterProjectPageItems(
    getProjectPageItems({
      navigate,
      project: currentProject,
      organizationName: currentOrg.name,
      pathname
    }),
    permission
  );

  if (currentProject.type === ProjectType.SecretManager) {
    return <SecretManagerProjectCommandMenu content={content} projectItems={projectItems} />;
  }

  return (
    <NavigationCommandMenu
      browseGroups={[
        { heading: currentProject.name, items: projectItems.slice(0, 2) },
        ...content.browseGroups
      ]}
      searchGroups={[{ heading: "Current Project", items: projectItems }, ...content.searchGroups]}
    />
  );
};

const OrganizationCommandMenu = () => {
  const { pathname } = useLocation();
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const { currentOrg, isRootOrganization } = useOrganization();
  const user = useRouteContext({ from: "/_authenticate", select: (context) => context.user });
  const { permission } = useOrgPermission();
  const navigate = useNavigate();
  const entityGroups = useEntityCommandGroups({
    currentOrganizationId: currentOrg.id,
    currentOrganizationName: currentOrg.name
  });
  const organizationItems = getOrganizationItems({
    navigate,
    organizationId: currentOrg.id,
    organizationName: currentOrg.name,
    isRootOrganization,
    canReadAccessControl:
      permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Member) ||
      permission.can(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity) ||
      permission.can(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups) ||
      permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Role),
    canReadAuditLogs: permission.can(
      OrgPermissionAuditLogsActions.Read,
      OrgPermissionSubjects.AuditLogs
    ),
    canReadBilling: permission.can(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing),
    canReadIntegrations:
      permission.can(
        OrgPermissionAppConnectionActions.Read,
        OrgPermissionSubjects.AppConnections
      ) || permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Settings),
    canReadSettings: permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Settings)
  });
  const accountItems = getAccountItems(navigate);
  const globalItems = [
    ...accountItems,
    ...(user.superAdmin
      ? [
          {
            id: "account-server-console",
            label: "Server Console",
            breadcrumb: "Global / Administration",
            icon: ServerCogIcon,
            keywords: ["admin", "server"],
            priority: 5,
            onSelect: () => navigate({ to: "/admin" })
          }
        ]
      : [])
  ];
  const content: CommandContent = {
    browseGroups: [
      { heading: currentOrg.name, items: organizationItems.slice(0, 3) },
      { heading: "Global", items: globalItems.slice(0, user.superAdmin ? 2 : 1) },
      getNestedCommandGroup(entityGroups)
    ],
    searchGroups: [
      { heading: "Pages & Settings", items: [...organizationItems, ...globalItems] },
      ...entityGroups.searchGroups
    ]
  };
  const isProjectRoute = Boolean(projectId);
  const isPamRoute = pathname.startsWith(`/organizations/${currentOrg.id}/pam`);

  if (isProjectRoute || isPamRoute) return <CurrentProjectCommandMenu content={content} />;
  return <NavigationCommandMenu {...content} />;
};

export const RootCommandMenu = ({ shell }: { shell: RootCommandMenuShell }) => {
  switch (shell) {
    case "organization":
      return <OrganizationCommandMenu />;
    case "admin":
      return <AdminCommandMenu />;
    case "personal-settings":
      return <PersonalSettingsCommandMenu />;
    default:
      return null;
  }
};
