import { Blocks, FileText, IdCard, Info, Package, Server, Settings, Shield } from "lucide-react";

import { useAgentVaultIntro } from "@app/components/agent-vault/AgentVaultIntro";
import {
  SidebarCollapsibleGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProjectNavList } from "./ProjectNavLink";
import type { NavItem, Submenu } from "./types";

export const AgentVaultNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const { hasProjectRole } = useProjectPermission();
  const { setOpen: setIsIntroOpen } = useAgentVaultIntro();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const accessItems: NavItem[] = [
    { label: "Sessions", icon: IdCard, pathSuffix: "sessions" },
    { label: "Access Bundles", icon: Package, pathSuffix: "access-bundles" }
  ];

  const infrastructureItems: NavItem[] = [
    { label: "Proxies", icon: Server, pathSuffix: "proxies" }
  ];

  // The group is already behind isAdmin, so Integrations needs no guard of its own.
  const administrationItems: NavItem[] = isAdmin
    ? [
        {
          label: "Access Control",
          icon: Shield,
          pathSuffix: "access-management",
          activeMatch: /\/access-management|\/groups\/|\/identities\/|\/members\/|\/roles\//
        },
        { label: "Integrations", icon: Blocks, pathSuffix: "integrations" },
        { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" },
        { label: "Settings", icon: Settings, pathSuffix: "settings" }
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
