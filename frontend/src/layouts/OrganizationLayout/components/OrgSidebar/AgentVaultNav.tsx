import {
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
import { useProjectPermission, useSubscription } from "@app/context";
import { isAgentVaultSessionLogBlockedByPlan } from "@app/helpers/agentVaultSessionLogs";
import {
  useGetAgentVaultSessionLogHealth,
  useGetAgentVaultSessionLogSettings,
  useListGrantedAgentVaultAccessBundlesRequiringSetup
} from "@app/hooks/api/agentVault";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProjectNavList } from "./ProjectNavLink";
import type { NavItem, Submenu } from "./types";

export const AgentVaultNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const { hasProjectRole } = useProjectPermission();
  const { setOpen: setIsIntroOpen } = useAgentVaultIntro();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);
  const { data: sessionLogState } = useGetAgentVaultSessionLogSettings(isAdmin);
  const sessionLogSettings = sessionLogState?.settings ?? null;
  const { data: sessionLogHealth } = useGetAgentVaultSessionLogHealth(isAdmin);
  const { subscription } = useSubscription();
  // An admin can use any bundle, but the nav only nags about the ones granted to them.
  const { data: grantedRequiringSetup } = useListGrantedAgentVaultAccessBundlesRequiringSetup();
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
    { label: "Variables", icon: Braces, pathSuffix: "variables" }
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

  const administrationItems: NavItem[] = isAdmin
    ? [
        {
          label: "Access Control",
          icon: Shield,
          pathSuffix: "access-management",
          activeMatch: /\/access-management|\/groups\/|\/identities\/|\/members\/|\/roles\//
        },
        { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" },
        { label: "Settings", icon: Settings, pathSuffix: "settings", alertVariant: settingsAlert }
      ]
    : [];

  return (
    <>
      <ProjectNavList items={accessItems} onSubmenuOpen={onSubmenuOpen} />
      <SidebarCollapsibleGroup label="Infrastructure">
        <ProjectNavList items={infrastructureItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
      {administrationItems.length > 0 && (
        <SidebarCollapsibleGroup label="Administration">
          <ProjectNavList items={administrationItems} onSubmenuOpen={onSubmenuOpen} />
        </SidebarCollapsibleGroup>
      )}
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
