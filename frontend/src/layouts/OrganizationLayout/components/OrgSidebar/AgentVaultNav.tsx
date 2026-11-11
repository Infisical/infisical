import {
  BookOpenText,
  Braces,
  FileText,
  IdCard,
  Info,
  ListChecks,
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
import { useProjectPermission, useSubscription, useProject } from "@app/context";
import { isAgentVaultSessionLogBlockedByPlan } from "@app/helpers/agentVaultSessionLogs";
import {
  useGetAgentVaultSessionLogHealth,
  useGetAgentVaultSessionLogSettings,
  useListGrantedAgentVaultAccessBundlesRequiringSetup
} from "@app/hooks/api/agentVault";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProjectNavList } from "./ProjectNavLink";
import { AGENT_VAULT_SETTINGS_SUBMENU } from "./submenus";
import type { NavItem, Submenu } from "./types";

export const AgentVaultNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const { projectId } = useProject();
  const { hasProjectRole } = useProjectPermission();
  const { setOpen: setIsIntroOpen } = useAgentVaultIntro();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);
  const { data: sessionLogState } = useGetAgentVaultSessionLogSettings(projectId, isAdmin);
  const sessionLogSettings = sessionLogState?.settings ?? null;
  const { data: sessionLogHealth } = useGetAgentVaultSessionLogHealth(projectId, isAdmin);
  const { subscription } = useSubscription();
  // An admin can use any bundle, but the nav only nags about the ones granted to them.
  const { data: grantedRequiringSetup } =
    useListGrantedAgentVaultAccessBundlesRequiringSetup(projectId);
  const needsSetup = Boolean(grantedRequiringSetup?.totalCount);
  const setupProgress = useAgentVaultSetupProgress();

  const accessItems: NavItem[] = [
    { label: "Sessions", icon: IdCard, pathSuffix: "sessions" },
    {
      label: "Access Bundles",
      icon: Package,
      pathSuffix: "access-bundles",
      alertVariant: needsSetup ? "warning" : undefined
    },
    { label: "Variables", icon: Braces, pathSuffix: "variables" },
    { label: "Skills", icon: BookOpenText, pathSuffix: "skills", hidden: !isAdmin }
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
      hidden: !isAdmin
    },
    { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs", hidden: !isAdmin },
    {
      label: "Settings",
      icon: Settings,
      pathSuffix: "settings",
      alertVariant: isAdmin ? settingsAlert : undefined,
      // Members only see General, so they go straight to it instead of a submenu with one entry.
      submenu: isAdmin ? AGENT_VAULT_SETTINGS_SUBMENU : undefined
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
