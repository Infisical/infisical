import {
  ActivityIcon,
  BookCheck,
  Database,
  FileText,
  Globe,
  ScrollText,
  Search,
  Settings,
  Shield,
  Video
} from "lucide-react";

import { ProjectNavList } from "./ProjectNavLink";
import {
  PAM_APPROVALS_SUBMENU,
  PAM_SETTINGS_SUBMENU,
  PROJECT_ACCESS_CONTROL_SUBMENU
} from "./submenus";
import type { NavItem, Submenu } from "./types";

export const PamNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const items: NavItem[] = [
    { label: "Resources", icon: Database, pathSuffix: "resources" },
    { label: "Discovery", icon: Search, pathSuffix: "discovery", activeMatch: /\/discovery\// },
    { label: "Sessions", icon: Video, pathSuffix: "sessions" },
    { label: "Domains", icon: Globe, pathSuffix: "domains" },
    { label: "Account Policies", icon: ScrollText, pathSuffix: "account-policies" },
    {
      label: "Approvals",
      icon: BookCheck,
      pathSuffix: "approvals",
      activeMatch: /\/approvals\//,
      submenu: PAM_APPROVALS_SUBMENU
    },
    {
      label: "Access Control",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /\/groups\/|\/identities\/|\/members\/|\/roles\//,
      submenu: PROJECT_ACCESS_CONTROL_SUBMENU
    },
    { label: "Insights", icon: ActivityIcon, pathSuffix: "insights" },
    { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" },
    {
      label: "Settings",
      icon: Settings,
      pathSuffix: "settings",
      submenu: PAM_SETTINGS_SUBMENU
    }
  ];
  return <ProjectNavList items={items} onSubmenuOpen={onSubmenuOpen} />;
};
