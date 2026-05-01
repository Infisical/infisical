import { ActivityIcon, BookCheck, FileText, Plug, Settings, Shield } from "lucide-react";

import { ProjectIcon } from "@app/components/v3";

import { ProjectNavList } from "./ProjectNavLink";
import {
  INTEGRATIONS_SUBMENU,
  SECRET_MANAGER_ACCESS_CONTROL_SUBMENU,
  SM_SETTINGS_SUBMENU
} from "./submenus";
import type { NavItem, Submenu } from "./types";
import { useApprovalSubmenu } from "./useApprovalSubmenu";

export const SecretManagerNav = ({
  onSubmenuOpen
}: {
  onSubmenuOpen: (submenu: Submenu) => void;
}) => {
  const { submenu: approvalsSubmenu, pendingRequestsCount } = useApprovalSubmenu();

  const items: NavItem[] = [
    {
      label: "Overview",
      icon: ProjectIcon,
      pathSuffix: "overview",
      activeMatch: /\/secrets\/|\/commits\//
    },
    {
      label: "Approvals",
      icon: BookCheck,
      pathSuffix: "approval",
      badgeCount: pendingRequestsCount || undefined,
      submenu: approvalsSubmenu
    },
    {
      label: "Integrations",
      icon: Plug,
      pathSuffix: "integrations",
      submenu: INTEGRATIONS_SUBMENU
    },
    {
      label: "Access Control",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /\/groups\/|\/identities\/|\/members\/|\/roles\//,
      submenu: SECRET_MANAGER_ACCESS_CONTROL_SUBMENU
    },
    {
      label: "Insights",
      icon: ActivityIcon,
      pathSuffix: "insights"
    },
    { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" },
    { label: "Settings", icon: Settings, pathSuffix: "settings", submenu: SM_SETTINGS_SUBMENU }
  ];

  return <ProjectNavList items={items} onSubmenuOpen={onSubmenuOpen} />;
};
