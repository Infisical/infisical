import { ClipboardList, FolderOpen, KeyRound } from "lucide-react";

import { SidebarCollapsibleGroup } from "@app/components/v3";
import { useGetPamAccessCapabilities } from "@app/hooks/api/pam";

import { ProjectNavList } from "./ProjectNavLink";
import type { NavItem, Submenu } from "./types";

export const PamNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const { data: capabilities } = useGetPamAccessCapabilities();
  const isProductAdmin = Boolean(capabilities?.isProductAdmin);
  const isResourceAdmin = Boolean(capabilities?.isResourceAdmin);

  const accessItems: NavItem[] = [{ label: "Access", icon: KeyRound, pathSuffix: "access" }];

  const manageItems: NavItem[] = [
    ...(isProductAdmin || isResourceAdmin
      ? [{ label: "Accounts", icon: FolderOpen, pathSuffix: "accounts" }]
      : []),
    ...(isProductAdmin
      ? [{ label: "Account Templates", icon: ClipboardList, pathSuffix: "templates" }]
      : [])
  ];

  return (
    <>
      <ProjectNavList items={accessItems} onSubmenuOpen={onSubmenuOpen} />
      {manageItems.length > 0 && (
        <SidebarCollapsibleGroup label="Manage">
          <ProjectNavList items={manageItems} onSubmenuOpen={onSubmenuOpen} />
        </SidebarCollapsibleGroup>
      )}
    </>
  );
};
