import { useLocation } from "@tanstack/react-router";
import { Box, KeyRound, LayoutDashboard, MessageSquare, ScrollText } from "lucide-react";

import { SidebarCollapsibleGroup } from "@app/components/v3";

import { ProjectNavList } from "./ProjectNavLink";
import type { NavItem, Submenu } from "./types";

const SANDBOX_ID_RE = /\/sandboxes\/([0-9a-f-]{36})/;

const PRODUCT_ITEMS: NavItem[] = [
  { label: "Sandboxes", icon: Box, pathSuffix: "", activeMatch: /\/sandboxes(\/|$)/ }
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

  const overview = [
    buildTab(sandboxId, "Overview", LayoutDashboard, "overview", true),
    buildTab(sandboxId, "Chat", MessageSquare, "chat"),
    buildTab(sandboxId, "Audit Log", ScrollText, "audit-log")
  ];
  const configureItems = [
    buildTab(sandboxId, "Access", KeyRound, "access"),
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
