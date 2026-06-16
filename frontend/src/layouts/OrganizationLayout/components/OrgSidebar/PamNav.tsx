import { FileText, KeyRound, Shield } from "lucide-react";

import { SidebarCollapsibleGroup } from "@app/components/v3";

import { ProjectNavList } from "./ProjectNavLink";
import type { NavItem, Submenu } from "./types";

export const PamNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const topItems: NavItem[] = [
    { label: "Access", icon: KeyRound, pathSuffix: "access" }
  ];

  const monitorItems: NavItem[] = [
    { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" }
  ];

  const configureItems: NavItem[] = [
    {
      label: "Access Control",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /\/access-management|\/groups\/|\/identities\/|\/members\/|\/roles\//
    }
  ];

  return (
    <>
      <ProjectNavList items={topItems} onSubmenuOpen={onSubmenuOpen} />
      <SidebarCollapsibleGroup label="Monitor">
        <ProjectNavList items={monitorItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
      <SidebarCollapsibleGroup label="Configure">
        <ProjectNavList items={configureItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
    </>
  );
};
