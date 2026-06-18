import { ClipboardList, FileText, FolderOpen, KeyRound, Shield, Video } from "lucide-react";

import { SidebarCollapsibleGroup } from "@app/components/v3";
import { useGetPamAccessCapabilities } from "@app/hooks/api/pam";

import { ProjectNavList } from "./ProjectNavLink";
import type { NavItem, Submenu } from "./types";

export const PamNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const { data: capabilities } = useGetPamAccessCapabilities();
  const isProductAdmin = Boolean(capabilities?.isProductAdmin);
  const isResourceAdmin = Boolean(capabilities?.isResourceAdmin);

  const accessItems: NavItem[] = [
    { label: "My Access", icon: KeyRound, pathSuffix: "access", exactPath: true }
  ];

  const manageItems: NavItem[] = [
    ...(isProductAdmin || isResourceAdmin
      ? [{ label: "Accounts", icon: FolderOpen, pathSuffix: "accounts" }]
      : []),
    ...(isProductAdmin
      ? [{ label: "Account Templates", icon: ClipboardList, pathSuffix: "templates" }]
      : [])
  ];

  const monitorItems: NavItem[] = [
    { label: "Sessions", icon: Video, pathSuffix: "sessions" },
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
      <ProjectNavList items={accessItems} onSubmenuOpen={onSubmenuOpen} />
      {manageItems.length > 0 && (
        <SidebarCollapsibleGroup label="Manage">
          <ProjectNavList items={manageItems} onSubmenuOpen={onSubmenuOpen} />
        </SidebarCollapsibleGroup>
      )}
      <SidebarCollapsibleGroup label="Monitor">
        <ProjectNavList items={monitorItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
      <SidebarCollapsibleGroup label="Configure">
        <ProjectNavList items={configureItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
    </>
  );
};
