import {
  BookOpenText,
  Braces,
  FileText,
  IdCard,
  Info,
  ListChecks,
  Plug,
  Package,
  Server,
  Settings,
  Shield
} from "lucide-react";

import { useAgentVaultIntro } from "@app/components/agent-vault/AgentVaultIntro";
import {
  SetupChecklist,
  useAgentVaultSetupProgress
} from "@app/components/agent-vault/SetupChecklist";
import {
  SidebarCollapsibleGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProjectPermission,
  useSubscription,
  useProject
} from "@app/context";
import { canManageAgentVaultSkills } from "@app/helpers/agentVaultPermissions";
import { isAgentVaultSessionLogBlockedByPlan } from "@app/helpers/agentVaultSessionLogs";
import {
  useGetAgentVaultSessionLogHealth,
  useGetAgentVaultSessionLogSettings,
  useListGrantedAgentVaultServicesRequiringSetup
} from "@app/hooks/api/agentVault";

import { ProjectNavList } from "./ProjectNavLink";
import { AGENT_VAULT_SETTINGS_SUBMENU } from "./submenus";
import type { NavItem, Submenu } from "./types";

export const AgentVaultNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const { projectId } = useProject();
  const { permission } = useProjectPermission();
  const { setOpen: setIsIntroOpen } = useAgentVaultIntro();
  const canReadSessionLogSettings = permission.can(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Settings
  );
  const canReadMembers =
    permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member) ||
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Groups) ||
    permission.can(ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity);
  const canReadAuditLogs = permission.can(
    ProjectPermissionAuditLogsActions.Read,
    ProjectPermissionSub.AuditLogs
  );
  const { data: sessionLogState } = useGetAgentVaultSessionLogSettings(
    projectId,
    canReadSessionLogSettings
  );
  const sessionLogSettings = sessionLogState?.settings ?? null;
  const { data: sessionLogHealth } = useGetAgentVaultSessionLogHealth(
    projectId,
    canReadSessionLogSettings
  );
  const { subscription } = useSubscription();
  // Services is where a member sets up their personal values. An admin can use any bundle, but the nav only nags about
  // services in the ones granted to them.
  const { data: grantedRequiringSetup } = useListGrantedAgentVaultServicesRequiringSetup(projectId);
  const needsSetup = Boolean(grantedRequiringSetup?.totalCount);
  const setupProgress = useAgentVaultSetupProgress();

  const accessItems: NavItem[] = [
    { label: "Sessions", icon: IdCard, pathSuffix: "sessions" },
    { label: "Access Bundles", icon: Package, pathSuffix: "access-bundles" },
    {
      label: "Services",
      icon: Plug,
      pathSuffix: "services",
      alertVariant: needsSetup ? "warning" : undefined
    },
    { label: "Variables", icon: Braces, pathSuffix: "variables" },
    {
      label: "Skills",
      icon: BookOpenText,
      pathSuffix: "skills",
      hidden: !canManageAgentVaultSkills(permission)
    }
  ];

  const infrastructureItems: NavItem[] = [
    { label: "Proxies", icon: Server, pathSuffix: "proxies" }
  ];

  let settingsAlert: NavItem["alertVariant"];
  if (sessionLogHealth?.connectionError) settingsAlert = "danger";
  else if (
    (sessionLogSettings && !sessionLogSettings.enabled) ||
    isAgentVaultSessionLogBlockedByPlan(sessionLogSettings, subscription)
  )
    settingsAlert = "warning";

  const administrationItems: NavItem[] = [
    {
      label: "Access Control",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /\/access-management|\/groups\/|\/identities\/|\/members\/|\/roles\//,
      hidden: !canReadMembers
    },
    { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs", hidden: !canReadAuditLogs },
    {
      label: "Settings",
      icon: Settings,
      pathSuffix: "settings",
      alertVariant: canReadSessionLogSettings ? settingsAlert : undefined,
      // Without the session log settings only General is left, so the item goes straight to it instead of a submenu
      // with one entry.
      submenu: canReadSessionLogSettings ? AGENT_VAULT_SETTINGS_SUBMENU : undefined
    }
  ];

  return (
    <>
      <ProjectNavList items={accessItems} onSubmenuOpen={onSubmenuOpen} />
      <SidebarCollapsibleGroup label="Infrastructure">
        <ProjectNavList items={infrastructureItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
      <SidebarCollapsibleGroup label="Administration">
        <ProjectNavList items={administrationItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
      <div className="mt-auto" />
      <SetupChecklist progress={setupProgress} />
      <SidebarMenu>
        {setupProgress.canRestore && (
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Setup Steps"
              className="text-xs text-muted [&_svg]:size-3.5"
              onClick={setupProgress.restore}
            >
              <ListChecks className="mb-px" />
              <span>Setup Steps</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            closeOnMobile
            tooltip="About Agent Vault"
            className="text-xs text-muted [&_svg]:size-3.5"
            onClick={() => setIsIntroOpen(true)}
          >
            <Info className="mb-px" />
            <span>About Agent Vault</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
};
