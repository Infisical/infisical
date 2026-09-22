import { FileText, IdCard, Info, Package, Server, Shield, SquareMenu } from "lucide-react";

import { useAgentVaultIntro } from "@app/components/agent-vault/AgentVaultIntro";
import {
  SidebarCollapsibleGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import { useGetAgentVaultActivityConfig } from "@app/hooks/api/agentVault";
import { isAgentVaultRecording } from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProjectNavList } from "./ProjectNavLink";
import type { NavItem, Submenu } from "./types";

export const AgentVaultNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const { hasProjectRole } = useProjectPermission();
  const { setOpen: setIsIntroOpen } = useAgentVaultIntro();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);
  // Admin-only: the config endpoint answers a member with a 403, and a member cannot act on it anyway.
  const { data: activityConfig } = useGetAgentVaultActivityConfig(isAdmin);

  const accessItems: NavItem[] = [
    { label: "Sessions", icon: IdCard, pathSuffix: "sessions" },
    { label: "Access Bundles", icon: Package, pathSuffix: "access-bundles" }
  ];

  const infrastructureItems: NavItem[] = [
    { label: "Proxies", icon: Server, pathSuffix: "proxies" }
  ];

  // The group is already behind isAdmin, so nothing in it needs a guard of its own.
  const administrationItems: NavItem[] = isAdmin
    ? [
        {
          label: "Access Control",
          icon: Shield,
          pathSuffix: "access-management",
          activeMatch: /\/access-management|\/groups\/|\/identities\/|\/members\/|\/roles\//
        },
        {
          label: "Activity Logs",
          icon: SquareMenu,
          pathSuffix: "activity-logs",
          // Only once the config has loaded: an absent config reads as "not recording", so keying
          // the dot on the negation alone would flash it on every cold load of a healthy org.
          dotVariant:
            activityConfig && !isAgentVaultRecording(activityConfig.config) ? "warning" : undefined
        },
        { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" }
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
      <SidebarMenu className="mt-auto">
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
