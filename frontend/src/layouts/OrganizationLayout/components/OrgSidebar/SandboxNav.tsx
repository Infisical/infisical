import { useLocation } from "@tanstack/react-router";
import { Box, FileText, KeyRound, LayoutDashboard, Server, Shield } from "lucide-react";

import { SidebarCollapsibleGroup } from "@app/components/v3";

import { ProjectNavList } from "./ProjectNavLink";
import { PROJECT_ACCESS_CONTROL_SUBMENU } from "./submenus";
import type { NavItem, Submenu } from "./types";

const SANDBOX_ID_RE = /\/sandboxes\/([0-9a-f-]{36})/;

const PRODUCT_ITEMS: NavItem[] = [
  { label: "Sandboxes", icon: Box, pathSuffix: "", activeMatch: /\/sandboxes(\/|$)/ },
  {
    label: "Access Control",
    icon: Shield,
    pathSuffix: "access-management",
    activeMatch: /\/groups\/|\/identities\/|\/members\/|\/roles\//,
    submenu: PROJECT_ACCESS_CONTROL_SUBMENU
  },
  { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" }
];

/**
 * Inside a sandbox the sidebar becomes that sandbox's sections. They are tabs on one route rather
 * than separate routes, so every item links to the same path with a different `selectedTab`.
 */
const buildTab = (
  sandboxId: string,
  label: string,
  icon: NavItem["icon"],
  value: string,
  isDefault = false
): NavItem => ({
  label,
  icon,
  pathSuffix: sandboxId,
  search: { selectedTab: value },
  isDefaultSearch: isDefault
});

export const SandboxNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const { pathname } = useLocation();
  const sandboxId = pathname.match(SANDBOX_ID_RE)?.[1];

  if (!sandboxId) {
    return <ProjectNavList items={PRODUCT_ITEMS} onSubmenuOpen={onSubmenuOpen} />;
  }

  const overview = [buildTab(sandboxId, "Overview", LayoutDashboard, "overview", true)];
  const configureItems = [
    buildTab(sandboxId, "Integrations", KeyRound, "integrations"),
    buildTab(sandboxId, "PAM Accounts", Server, "pam"),
    buildTab(sandboxId, "Agent", Box, "agent")
  ];

  return (
    <>
      <ProjectNavList items={overview} onSubmenuOpen={onSubmenuOpen} />
      <SidebarCollapsibleGroup label="Configure">
        <ProjectNavList items={configureItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
    </>
  );
};
