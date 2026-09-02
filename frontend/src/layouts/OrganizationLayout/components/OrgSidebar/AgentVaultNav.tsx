import { FileText, Package, Route, Shield, Ticket } from "lucide-react";

import { SidebarCollapsibleGroup } from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProjectNavList } from "./ProjectNavLink";
import type { NavItem, Submenu } from "./types";

export const AgentVaultNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const accessItems: NavItem[] = [
    { label: "Sessions", icon: Ticket, pathSuffix: "sessions" },
    { label: "Access Bundles", icon: Package, pathSuffix: "access-bundles" }
  ];

  const governanceItems: NavItem[] = isAdmin
    ? [
        { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" },
        {
          label: "Access Control",
          icon: Shield,
          pathSuffix: "access-management",
          activeMatch: /\/access-management|\/groups\/|\/identities\/|\/members\/|\/roles\//
        }
      ]
    : [];

  const infrastructureItems: NavItem[] = [
    { label: "Proxies", icon: Route, pathSuffix: "proxies" }
  ];

  return (
    <>
      <ProjectNavList items={accessItems} onSubmenuOpen={onSubmenuOpen} />
      {governanceItems.length > 0 && (
        <SidebarCollapsibleGroup label="Governance">
          <ProjectNavList items={governanceItems} onSubmenuOpen={onSubmenuOpen} />
        </SidebarCollapsibleGroup>
      )}
      <SidebarCollapsibleGroup label="Infrastructure">
        <ProjectNavList items={infrastructureItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
    </>
  );
};
